import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { createCarVisual, type CarVisual, BODY_CENTER_Y } from "./carModel";
import { SETTINGS } from "../core/settings";
import { damp, clamp } from "../core/mathx";
import { createSelectedVisual, disposeSelectedVisual, vehicleDesign, wheelConnections } from "./selectedAsset";
import {
  ENGINE_IDLE_RPM,
  ENGINE_REDLINE_RPM,
  dragForce,
  downforceN,
  gearForSpeed,
  rpmForSpeed,
  steeringAngleAt,
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
  private readonly tuning;

  constructor(world: RAPIER.World, scene: THREE.Scene, opts: VehicleOptions) {
    this.vehicleId = opts.vehicleId;
    const design = opts.vehicleId ? vehicleDesign(opts.vehicleId) : null;
    this.electric = design?.powertrain === "electric";
    this.tuning = design?.tuning ?? { power: 1, mass: 1, topSpeed: 92, grip: 1, steer: .52 };
    this.wheelMounts = opts.vehicleId ? wheelConnections(opts.vehicleId) : WHEELS;
    this.visual = opts.vehicleId ? createSelectedVisual(opts.vehicleId) : createCarVisual(opts);
    this.isPlayer = opts.isPlayer ?? false;
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
        design?.wheelRadius ?? .36
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
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
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

    let engineForce = 0;
    if (throttle > 0.01 && absSpeed < this.tuning.topSpeed) {
      const total = this.electric
        ? throttle * p.maxEngineForce * this.tuning.power
        : wheelForce(absSpeed, throttle, this.gear, this.rpm) * .5 * this.tuning.power;
      const limiter = 1 - Math.pow(clamp(absSpeed / this.tuning.topSpeed, 0, 1), 3) * .55;
      engineForce = Math.min(total * limiter * grip, p.maxEngineForce * this.tuning.power);
    }
    let reverseForce = 0;
    if (brake > 0.05 && speed < 0.6) {
      reverseForce = brake * 2200;
    }

    if (this.controls.handbrake) {
      engineForce *= 0.2;
      reverseForce = 0;
    }

    // Rapier keeps added forces until reset, so clear last step's forces first.
    this.body.resetForces(true);

    // Propulsion is applied at the centre of mass instead of at the wheel
    // contact patch: feeding it through the raycast controller adds a huge
    // pitch moment that flips the car at low speed.
    const rot = this.body.rotation();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-4) fwd.normalize();
    const drive = engineForce - reverseForce;
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
    const df = downforceN(planar);
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
    const local = new THREE.Vector3(vel.x, vel.y, vel.z).applyQuaternion(_q.clone().invert());
    this.slip = Math.max(0, Math.abs(local.x) - 0.6);
  }

  syncVisual(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.visual.root.position.set(t.x, t.y, t.z);
    this.visual.root.quaternion.set(r.x, r.y, r.z, r.w);

    for (let i = 0; i < this.visual.wheels.length; i++) {
      const wheel = this.visual.wheels[i];
      const suspension = this.controller.wheelSuspensionLength(i);
      const rotation = this.controller.wheelRotation(i);
      const steering = this.controller.wheelSteering(i);
      wheel.steer.position.y = this.wheelMounts[i].y - (suspension ?? SETTINGS.physics.suspensionRest);
      wheel.steer.rotation.y = steering ?? 0;
      wheel.spin.rotation.x = rotation ?? 0;
    }
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
    world.removeVehicleController(this.controller);
    world.removeRigidBody(this.body);
    if (this.vehicleId) disposeSelectedVisual(this.visual);
    else this.visual.root.removeFromParent();
  }
}
