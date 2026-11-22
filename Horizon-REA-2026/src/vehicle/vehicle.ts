import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { createCarVisual, type CarVisual, BODY_CENTER_Y } from "./carModel";
import { SETTINGS } from "../core/settings";
import { damp, clamp } from "../core/mathx";
import { TurboFlames } from "../render/turboFlames";
import { createTurboState, stepTurbo, TURBO_FORCE_N } from "../sim/turbo";
import { turboTractionFactor } from "../sim/turboTraction";
import { nextWheelRoll, visibleWheelSteer } from "../sim/wheelMotion";
import { createSelectedVisual, disposeSelectedVisual, vehicleDesign, wheelConnections } from "./selectedAsset";
import {
  ENGINE_IDLE_RPM,
  ENGINE_REDLINE_RPM,
  dragForce,
  downforceN,
  gearForSpeed,
  rpmForSpeed,
  steeringAngleAt,
  straightOnlyDragAssist,
  highSpeedCornerDriveFactor,
  reverseDriveForce,
  wheelForce
} from "../sim/vehicleMath";

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

const WHEELS: { x: number; y: number; z: number; front: boolean }[] = [
  { x: 0.9, y: -0.02, z: 1.34, front: true },
  { x: -0.9, y: -0.02, z: 1.34, front: true },
  { x: 0.9, y: -0.02, z: -1.34, front: false },
  { x: -0.9, y: -0.02, z: -1.34, front: false }
];

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export interface VehicleOptions {
  paintColor: number;
  accentColor: number;
  number: number;
  isPlayer?: boolean;
  vehicleId?: string;
}

export class Vehicle {
  readonly visual: CarVisual;
  readonly body: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  gear = 0;
  rpm = ENGINE_IDLE_RPM;
  speed = 0;
  slip = 0;
  onTrack = true;
  steerAngle = 0;
  readonly isPlayer: boolean;
  controls: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private wheelFriction: number[] = [];
  private smoothedGrip = 1;
  readonly vehicleId: string | undefined;
  readonly electric: boolean;
  private readonly wheelMounts: typeof WHEELS;
  private readonly wheelRadius: number;
  private readonly wheelRoll = [0, 0, 0, 0];
  private turboState = createTurboState();
  private turboDelivery = 0;
  private readonly turboFlames: TurboFlames | null;
  private readonly tuning;
  private readonly forceForward = new THREE.Vector3();
  private readonly localVelocity = new THREE.Vector3();

  get turboActive(): boolean { return this.turboState.active > 0 && this.turboDelivery > .01; }
  get turboStrength(): number { return this.turboActive ? this.turboDelivery : 0; }
  get speedLimitMph(): number { return this.tuning.topSpeed / 0.44704; }

  get highSpeedPowerMultiplier(): number {
    const launch = this.vehicleId === "bugatti-chiron" ? 1.2 : this.vehicleId === "mercedes-amg-gt-black-series" ? 1.08 : this.vehicleId === "porsche-911" ? 1.02 : 1;
    return THREE.MathUtils.lerp(1, this.tuning.power / launch,
      THREE.MathUtils.smoothstep(Math.abs(this.speed), 40, 80));
  }

  constructor(world: RAPIER.World, scene: THREE.Scene, opts: VehicleOptions) {
    this.vehicleId = opts.vehicleId;
    const design = opts.vehicleId ? vehicleDesign(opts.vehicleId) : null;
    this.electric = design?.powertrain === "electric";
    this.tuning = design?.tuning ?? { power: 1, mass: 1, topSpeed: 92, grip: 1, steer: .52 };
    this.wheelMounts = opts.vehicleId ? wheelConnections(opts.vehicleId) : WHEELS;
    this.wheelRadius = design?.wheelRadius ?? .36;
    this.visual = opts.vehicleId ? createSelectedVisual(opts.vehicleId) : createCarVisual(opts);
    if (opts.vehicleId === "ferrari-california-t" && this.visual.paint instanceof THREE.MeshPhysicalMaterial &&
        scene.userData.vehicleReflectionEnvironment instanceof THREE.Texture) {
      this.visual.paint.envMap = scene.userData.vehicleReflectionEnvironment;
      this.visual.paint.envMapIntensity = .45;
      this.visual.paint.needsUpdate = true;
    }
    this.isPlayer = opts.isPlayer ?? false;
    this.turboFlames = this.isPlayer
      ? new TurboFlames(this.visual.root, design?.length ?? 4.5, design?.width ?? 1.9)
      : null;
    scene.add(this.visual.root);

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, BODY_CENTER_Y + 0.35, 0)
        .setLinearDamping(0.04)
        .setAngularDamping(0.9)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setAdditionalSolverIterations(4)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(design ? design.width / 2 - .04 : .95, .3, design ? design.length / 2 - .12 : 2.1)
        .setTranslation(0, 0.08, 0)
        .setDensity(SETTINGS.physics.chassisMassDensity * this.tuning.mass)
        .setFriction(0.35)
        .setRestitution(0.05),
      this.body
    );

    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;

    for (let i = 0; i < this.wheelMounts.length; i++) {
      const w = this.wheelMounts[i];
      this.controller.addWheel(
        { x: w.x, y: w.y, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        SETTINGS.physics.suspensionRest,
        this.wheelRadius
      );
      this.controller.setWheelSuspensionStiffness(i, SETTINGS.physics.suspensionStiffness);
      this.controller.setWheelSuspensionCompression(i, SETTINGS.physics.suspensionCompression);
      this.controller.setWheelSuspensionRelaxation(i, SETTINGS.physics.suspensionRelaxation);
      this.controller.setWheelMaxSuspensionTravel(i, SETTINGS.physics.maxSuspensionTravel);
      this.controller.setWheelMaxSuspensionForce(i, 15000);
      const slip = (w.front ? SETTINGS.physics.frictionSlipFront : SETTINGS.physics.frictionSlipRear) * this.tuning.grip;
      this.wheelFriction.push(slip);
      this.controller.setWheelFrictionSlip(i, slip);
      this.controller.setWheelSideFrictionStiffness(i, SETTINGS.physics.sideFrictionStiffness);
    }
  }

  get speedKph(): number {
    return Math.abs(this.speed) * 3.6;
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return _v.set(t.x, t.y, t.z);
  }

  place(position: THREE.Vector3, heading: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.body.setTranslation({ x: position.x, y: position.y + BODY_CENTER_Y - 0.1, z: position.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.slip = 0;
    this.gear = 0;
    this.rpm = ENGINE_IDLE_RPM;
    this.speed = 0;
    this.steerAngle = 0;
    this.turboState = createTurboState();
    this.turboDelivery = 0;
    this.wheelRoll.fill(0);
    this.syncVisual();
  }

  resetToTrack(track: { samples: THREE.Vector3[]; tangents: THREE.Vector3[]; startIndex: number }): void {
    const idx = track.startIndex;
    const p = track.samples[idx];
    const t = track.tangents[idx];
    this.place(new THREE.Vector3(p.x, p.y, p.z), Math.atan2(t.x, t.z));
  }

  private applyForces(dt: number, grip: number): void {
    // Falling velocity must never count as forward driving speed.
    const velocity = this.body.linvel();
    const rotation = this.body.rotation();
    const forward = this.forceForward.set(0, 0, 1).applyQuaternion(
      _q.set(rotation.x, rotation.y, rotation.z, rotation.w)
    );
    forward.y = 0;
    forward.normalize();
    const speed = velocity.x * forward.x + velocity.z * forward.z;
    this.speed = speed;
    const absSpeed = Math.abs(speed);

    // Automatic gearbox with hysteresis driven by the analytic torque curve.
    const targetGear = this.electric ? 0 : gearForSpeed(absSpeed);
    if (this.electric || absSpeed < .7) this.gear = 0;
    else if (targetGear > this.gear && this.rpm > 6800) this.gear++;
    else if (targetGear < this.gear && this.rpm < 2750) this.gear--;

    const targetRpm = rpmForSpeed(absSpeed, this.gear);
    const clutchRpm = ENGINE_IDLE_RPM + this.controls.throttle * 1400;
    this.rpm = damp(this.rpm, Math.max(targetRpm, clutchRpm), 9, dt);
    this.rpm = clamp(this.rpm, ENGINE_IDLE_RPM, ENGINE_REDLINE_RPM);

    const p = SETTINGS.physics;
    const throttle = this.controls.throttle;
    const brake = this.controls.brake;
    const lateralSpeed = velocity.x * forward.z - velocity.z * forward.x;
    const wheelbase = Math.abs(this.wheelMounts[0].z - this.wheelMounts[2].z);
    const requestedSteer = steeringAngleAt(speed, this.controls.steer, this.tuning.steer);
    const cornerSteer = Math.max(Math.abs(requestedSteer), Math.abs(this.steerAngle));
    const traction = turboTractionFactor(speed, cornerSteer, wheelbase,
      lateralSpeed, this.body.angvel().y, grip);
    // Auto-activate a brief, cooldown-limited arcade nitro burst at 100 mph.
    // No turbo in reverse, in countdown, or during off-track excursions.
    this.turboState = stepTurbo(this.turboState, dt, speed, throttle,
      this.onTrack, this.isPlayer && brake <= .05 && !this.controls.handbrake && traction > .01);
    // Ease boost in on a straight. Reduce it immediately when tyre capacity
    // is needed for a turn; never push through braking, countersteer or a slide.
    const delivery = this.turboState.active > 0 ? traction : 0;
    this.turboDelivery = delivery < this.turboDelivery ? delivery :
      damp(this.turboDelivery, delivery, 12, dt);

    let engineForce = 0;
    if (throttle > 0.01 && absSpeed < this.tuning.topSpeed) {
      // Preserve controllable launches; reserve the extra power for high-speed drag.
      const highway = THREE.MathUtils.smoothstep(absSpeed, 40, 80);
      const launchPower = this.vehicleId === "bugatti-chiron" ? 1.2 : this.vehicleId === "mercedes-amg-gt-black-series" ? 1.08 : this.vehicleId === "porsche-911" ? 1.02 : 1;
      const power = THREE.MathUtils.lerp(launchPower, this.tuning.power, highway);
      const total = this.electric
        ? throttle * p.maxEngineForce * power
        : wheelForce(absSpeed, throttle, this.gear, this.rpm) * .5 * power;
      // Preserve torque near the restored mph ceilings. The old .55 taper
      // stalled Ferrari/Porsche around 197 mph and Bugatti around 224 mph.
      // Absolute speed remains bounded by the post-step governor.
      const limiter = 1 - Math.pow(clamp(absSpeed / this.tuning.topSpeed, 0, 1), 3) * .36;
      engineForce = Math.min(total * limiter * grip, p.maxEngineForce * power);
      // On a straight, compensate aero drag near 350-504 MPH WITHOUT boosting
      // launches, continuous steering or a slide. Restore the previous stable
      // per-brand power levels for corners and AI-driving.
      // Electric U9 needs slightly stronger straight-only compensation at
      // 504 MPH; six combustion vehicles already met their tested ceilings.
      const straightAssist = straightOnlyDragAssist(absSpeed,throttle,this.controls.steer,
        lateralSpeed,this.body.angvel().y,grip);
      engineForce += straightAssist * (this.electric ? 1.65 : 1);
      engineForce *= highSpeedCornerDriveFactor(absSpeed,this.controls.steer);
    }
    let reverseForce = reverseDriveForce(speed, brake);

    if (this.controls.handbrake) {
      engineForce *= 0.2;
      reverseForce = 0;
    }

    // Rapier keeps added forces until reset, so clear last step's forces first.
    this.body.resetForces(true);

    // Propulsion is applied at the centre of mass instead of at the wheel
    // contact patch: feeding it through the raycast controller adds a huge
    // pitch moment that flips the car at low speed.
    const fwd = forward;
    const nitro = this.turboActive && !this.controls.handbrake &&
      speed < this.tuning.topSpeed ? TURBO_FORCE_N * this.turboDelivery : 0;
    const drive = engineForce + nitro - reverseForce;
    if (Math.abs(drive) > 0.5) {
      this.body.addForce({ x: fwd.x * drive, y: 0, z: fwd.z * drive }, true);
    }

    for (let i = 0; i < this.wheelMounts.length; i++) {
      const w = this.wheelMounts[i];
      this.controller.setWheelEngineForce(i, 0);

      let braking = 0;
      if (brake > 0.05 && speed > 0.4) {
        braking = brake * p.maxBrakeForce * (w.front ? 1.12 : 0.9);
      }
      if (this.controls.handbrake && !w.front) {
        braking = Math.max(braking, p.handbrakeForce);
      }
      this.controller.setWheelBrake(i, braking);

      if (w.front) {
        this.controller.setWheelSteering(i, this.steerAngle);
        this.controller.setWheelFrictionSlip(i, this.wheelFriction[i] * grip);
      } else {
        this.controller.setWheelFrictionSlip(
          i,
          this.wheelFriction[i] * grip * (this.controls.handbrake ? 0.52 : 1)
        );
      }
    }

    // Aerodynamics: quadratic drag plus speed-squared downforce.
    const vel = this.body.linvel();
    const planar = Math.hypot(vel.x, vel.z);
    if (planar > 0.5) {
      const d = dragForce(planar);
      this.body.addForce({ x: (-vel.x / planar) * d, y: 0, z: (-vel.z / planar) * d }, true);
    }
    // At 350–504 MPH the raw v² downforce exceeds suspension capacity
    // (four wheels × 15kN), crushing cars into the asphalt/kerbs.
    // Saturate the arcade aero load to retain physical wheel clearance.
    const df = Math.min(downforceN(planar), 24000);
    // Downforce must be a pure force at the centre of mass. addForceAtPoint
    // takes a WORLD-space point: passing {0, 0.1, 0} here applied the load at
    // the world origin and produced a huge pitch torque (the car took off).
    this.body.addForce({ x: 0, y: -df, z: 0 }, true);

    // Rapier does not apply suspension/engine/brake itself: the controller must
    // integrate the wheel forces for this step before world.step() runs.
    this.controller.updateVehicle(dt);
  }

  update(dt: number, input: DriveInput, grip: number): void {
    this.controls = input;
    this.smoothedGrip = damp(this.smoothedGrip, grip, 6, dt);
    this.onTrack = grip > 0.72;

    this.steerAngle = damp(this.steerAngle, steeringAngleAt(this.speed, input.steer, this.tuning.steer), 11, dt);
    this.applyForces(dt, this.smoothedGrip);

    // Render wheel rolling from travelled distance, not the raycast wheel
    // controller, which does not spin reliably with body-centre propulsion.
    const yawRate = this.body.angvel().y;
    for (let i = 0; i < this.wheelMounts.length; i++) {
      this.wheelRoll[i] = nextWheelRoll(this.wheelRoll[i], this.speed, yawRate,
        this.wheelMounts[i].x, this.wheelRadius, dt);
    }

    // Stability guard: a kerb strike or a hard landing must not send the car
    // spinning at 40 rad/s and then flying across the map.
    const av = this.body.angvel();
    const spin = Math.hypot(av.x, av.y, av.z);
    if (spin > 6.5) {
      const k = 6.5 / spin;
      this.body.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true);
    }

    // Lateral slip estimate for smoke, audio and HUD feedback.
    const vel = this.body.linvel();
    _q.set(
      this.body.rotation().x,
      this.body.rotation().y,
      this.body.rotation().z,
      this.body.rotation().w
    );
    const local = this.localVelocity.set(vel.x, vel.y, vel.z).applyQuaternion(_q.invert());
    this.slip = Math.max(0, Math.abs(local.x) - 0.6);
  }

  /** Must run after EVERY fixed world.step(), even when no frame is rendered. */
  afterPhysicsStep(): void {
    const vel = this.body.linvel();
    const rot = this.body.rotation();
    const q = _q.set(rot.x, rot.y, rot.z, rot.w);
    const fwd = this.forceForward.set(0, 0, 1).applyQuaternion(q);
    fwd.y = 0;
    if (fwd.lengthSq() < .5) return;
    fwd.normalize();
    const forwardSpeed = vel.x * fwd.x + vel.z * fwd.z;
    const planarSpeed = Math.hypot(vel.x, vel.z);
    // Reverse is a maneuvering gear, not another 350-504 MPH mode.
    if (forwardSpeed < -14 && planarSpeed > 14) {
      const scale = 14 / planarSpeed;
      this.body.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
      this.speed = forwardSpeed * scale;
      return;
    }
    if (planarSpeed > this.tuning.topSpeed) {
      const scale = this.tuning.topSpeed / planarSpeed;
      this.body.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
      this.speed = forwardSpeed * scale;
    } else {
      this.speed = forwardSpeed;
    }
  }

  syncVisual(dt = 0): void {
    // Governor acts AFTER each world step; an engine or nitro burst cannot
    // overshoot the selected 350 / 450 / 504 MPH ceiling.
    this.afterPhysicsStep();
    const t = this.body.translation();
    const r = this.body.rotation();
    this.visual.root.position.set(t.x, t.y, t.z);
    this.visual.root.quaternion.set(r.x, r.y, r.z, r.w);

    for (let i = 0; i < this.visual.wheels.length; i++) {
      const wheel = this.visual.wheels[i];
      const suspension = this.controller.wheelSuspensionLength(i);
      wheel.steer.position.y = this.wheelMounts[i].y - (suspension ?? SETTINGS.physics.suspensionRest);
      wheel.steer.rotation.y = visibleWheelSteer(this.steerAngle, this.wheelMounts[i].front);
      wheel.spin.rotation.x = this.wheelRoll[i];
    }
    this.turboFlames?.update(dt, this.turboActive);
  }

  wheelVisualDebug(): { steer: number; roll: number }[] {
    return this.visual.wheels.map(wheel => ({
      steer: wheel.steer.rotation.y, roll: wheel.spin.rotation.x
    }));
  }

  wheelDebug(): { contact: boolean; len: number; force: number; susp: number }[] {
    const out: { contact: boolean; len: number; force: number; susp: number }[] = [];
    for (let i = 0; i < 4; i++) {
      out.push({
        contact: this.controller.wheelIsInContact(i),
        len: Number((this.controller.wheelSuspensionLength(i) ?? -1).toFixed(3)),
        force: Math.round(this.controller.wheelSuspensionForce(i) ?? 0),
        susp: Number((this.controller.wheelSuspensionRestLength(i) ?? -1).toFixed(3))
      });
    }
    return out;
  }

  setBrakeLights(on: boolean): void {
    this.visual.taillightMat.emissiveIntensity = on ? 7.5 : 2.4;
  }

  get velocity(): THREE.Vector3 {
    const v = this.body.linvel();
    return _v.set(v.x, v.y, v.z);
  }

  dispose(world: RAPIER.World): void {
    this.turboFlames?.dispose();
    world.removeVehicleController(this.controller);
    world.removeRigidBody(this.body);
    if (this.vehicleId) disposeSelectedVisual(this.visual);
    else this.visual.root.removeFromParent();
  }
}
