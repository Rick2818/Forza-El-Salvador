import * as THREE from "three";
import { accumulateMud, PickupMudCoating } from "../render/pickupMud";
import { offroadBrakeAcceleration, offroadSpeedLimit, type OffroadSector } from "../world/offroadPrototype";
import RAPIER from "@dimforge/rapier3d-compat";
import { createCarVisual, type CarVisual, BODY_CENTER_Y } from "./carModel";
import { SETTINGS } from "../core/settings";
import { damp, clamp } from "../core/mathx";
import { TurboFlames } from "../render/turboFlames";
import { createTurboState, stepTurbo, createCrossingTurboState, stepCrossingTurbo, TURBO_FORCE_N } from "../sim/turbo";
import { turboTractionFactor } from "../sim/turboTraction";
import { reverseDriveForce, REVERSE_LIMIT_MS } from "../sim/reverseGear";
import { nextWheelRoll, visibleWheelSteer } from "../sim/wheelMotion";
import { isFourWheelDrivePickup, defaultFourWheelDriveMode, nextFourWheelDriveMode, pickupContactTraction, nextManualTrailMode, trailDriveLimit, trailExtractionForce, trailHillForce, type FourWheelDriveMode } from "../sim/fourWheelDrive";
import { createSelectedVisual, disposeSelectedVisual, vehicleDesign, wheelConnections, wheelRadiiForVehicle } from "./selectedAsset";
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
  wheelForce
} from "../sim/vehicleMath";

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  reverse?: boolean;
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
  turboTriggerKph?: number;
  webgpuMud?: boolean;
  manualTrailDrive?: boolean;
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
  private mudCoverage = 0;
  private waterDepth = 0;
  get trailMudCoverage():number{return this.mudCoverage;}
  private mudCoating?: PickupMudCoating;
  private readonly webgpuMud:boolean;
  readonly manualTrailDrive:boolean;
  trailTractionLimited=false;
  trailHillAssist=0;
  private trailGrade=0;
  private offroadSector?: OffroadSector;
  private smoothedGrip = 1;
  readonly vehicleId: string | undefined;
  readonly electric: boolean;
  readonly supportsFourWheelDrive: boolean;
  fourWheelDriveMode: FourWheelDriveMode = "2H";
  private readonly wheelMounts: typeof WHEELS;
  private readonly wheelRadius: number;
  private readonly wheelRadii: readonly number[];
  private readonly wheelRoll = [0, 0, 0, 0];
  private readonly surfaceGrip = [1, 1, 1, 1];
  private readonly contactScratch = [false, false, false, false];
  private readonly wheelProbes = Array.from({length:4},()=>new THREE.Vector3());
  private turboState = createTurboState();
  private crossingTurboState = createCrossingTurboState();
  private readonly turboTriggerKph?: number;
  private turboDelivery = 0;
  private readonly turboFlames: TurboFlames | null;
  private readonly tuning;
  private readonly suspension: { stiffness:number; compression:number; relaxation:number; travel:number; maxForce:number; lateral:number };
  private readonly forceForward = new THREE.Vector3();
  private readonly localVelocity = new THREE.Vector3();

  get fourWheelDriveActive(): boolean { return this.supportsFourWheelDrive && this.fourWheelDriveMode !== "2H"; }

  /** Transfer switch is disabled above 30 km/h; existing sportscars are untouched. */
  toggleFourWheelDrive(): boolean {
    if (!this.supportsFourWheelDrive) return false;
    const next = this.manualTrailDrive?nextManualTrailMode(this.fourWheelDriveMode,this.speedKph):nextFourWheelDriveMode(this.fourWheelDriveMode, this.speedKph, this.vehicleId);
    if (next === this.fourWheelDriveMode) return false;
    this.fourWheelDriveMode = next;
    return true;
  }

  get turboActive(): boolean { return this.turboState.active > 0 && this.turboDelivery > .01; }
  get turboArmed(): boolean { return this.turboTriggerKph !== undefined ? this.crossingTurboState.armed : this.turboState.cooldown <= 0; }
  get turboStrength(): number { return this.turboActive ? this.turboDelivery : 0; }
  get speedLimitMph(): number { return this.tuning.topSpeed / 0.44704; }

  get highSpeedPowerMultiplier(): number {
    const launch = this.vehicleId === "bugatti-chiron" ? 1.2 : this.vehicleId === "mercedes-amg-gt-black-series" ? 1.08 : this.vehicleId === "porsche-911" ? 1.02 : 1;
    return THREE.MathUtils.lerp(1, this.tuning.power / launch,
      THREE.MathUtils.smoothstep(Math.abs(this.speed), 40, 80));
  }

  constructor(world: RAPIER.World, scene: THREE.Scene, opts: VehicleOptions) {
    this.vehicleId = opts.vehicleId;
    this.turboTriggerKph = opts.turboTriggerKph;
    this.webgpuMud=opts.webgpuMud??false;
    const design = opts.vehicleId ? vehicleDesign(opts.vehicleId) : null;
    this.electric = design?.powertrain === "electric";
    this.supportsFourWheelDrive = isFourWheelDrivePickup(opts.vehicleId);
    this.manualTrailDrive=!!opts.manualTrailDrive&&this.supportsFourWheelDrive;
    this.fourWheelDriveMode = this.manualTrailDrive?"2H":defaultFourWheelDriveMode(opts.vehicleId);
    this.tuning = design?.tuning ?? { power: 1, mass: 1, topSpeed: 92, grip: 1, steer: .52 };
    // Candidate arcade calibration; keep authored wheel mounts and rest length.
    const profiles:Record<string,[number,number,number,number,number,number]>={
      "ferrari-f430":[42,3.6,3.2,.23,16000,1.18],
      "porsche-911-c4s":[41,3.7,3.3,.24,16000,1.18],
      "bugatti-chiron-profilee":[46,4.0,3.6,.24,19000,1.20],
      "lamborghini-aventador":[44,3.8,3.4,.23,17000,1.19],
      "koenigsegg-jesko":[43,3.7,3.3,.22,16500,1.18],
      "mercedes-amg-gt-alternative":[41,3.8,3.4,.25,17000,1.17],
      "tesla-roadster-electric-alternative":[43,3.9,3.5,.25,18000,1.17],
      "ford-f150-raptor-police":[34,4.1,3.7,.36,22000,1.08],
      "ram-3500-alternative":[39,4.4,4.0,.35,26000,1.06],
      "chevrolet-silverado-ev-alternative":[37,4.3,3.9,.34,25000,1.07]
    };
    const [stiffness,compression,relaxation,travel,maxForce,lateral]=profiles[opts.vehicleId??""]??[SETTINGS.physics.suspensionStiffness,SETTINGS.physics.suspensionCompression,SETTINGS.physics.suspensionRelaxation,SETTINGS.physics.maxSuspensionTravel,15000,SETTINGS.physics.sideFrictionStiffness];
    this.suspension={stiffness,compression,relaxation,travel,maxForce,lateral};
    this.wheelMounts = opts.vehicleId ? wheelConnections(opts.vehicleId) : WHEELS;
    this.wheelRadius = design?.wheelRadius ?? .36;
    this.wheelRadii = opts.vehicleId ? wheelRadiiForVehicle(opts.vehicleId) : [.36,.36,.36,.36];
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
        this.wheelRadii[i]
      );
      this.controller.setWheelSuspensionStiffness(i, this.suspension.stiffness);
      this.controller.setWheelSuspensionCompression(i, this.suspension.compression);
      this.controller.setWheelSuspensionRelaxation(i, this.suspension.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, this.suspension.travel);
      this.controller.setWheelMaxSuspensionForce(i, this.suspension.maxForce);
      const slip = (w.front ? SETTINGS.physics.frictionSlipFront : SETTINGS.physics.frictionSlipRear) * this.tuning.grip;
      this.wheelFriction.push(slip);
      this.controller.setWheelFrictionSlip(i, slip);
      this.controller.setWheelSideFrictionStiffness(i, this.suspension.lateral);
    }
  }

  get speedKph(): number {
    return Math.abs(this.speed) * 3.6;
  }

  // Each vehicle owns its own position buffer. Traffic calculations must
  // never overwrite another vehicle's position while reading this one.
  private readonly positionView = new THREE.Vector3();
  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return this.positionView.set(t.x, t.y, t.z);
  }

  /** Four world-space tyre contact estimates, based on the ACTUAL body pose and
   * wheel locations. At Suzaka the Y coordinate identifies the overpass deck
   * independently from the road running below it.
   * Reuses vectors to avoid allocations during fixed-step championship races.
   */
  /** Mutable scratch buffer shared with Track.gripAtFootprints. Each vehicle
   * owns a separate four-tyre buffer to avoid allocating on every physics step.
   */
  wheelGripBuffer(): number[] { return this.surfaceGrip; }

  wheelContactPoints(): readonly THREE.Vector3[] {
    const t = this.body.translation();
    const r = this.body.rotation();
    const quat = _q.set(r.x, r.y, r.z, r.w);
    for (let i=0;i<this.wheelMounts.length;i++) {
      const w = this.wheelMounts[i];
      const suspension = this.controller.wheelSuspensionLength(i);
      const length = typeof suspension === "number" && Number.isFinite(suspension)
        ? clamp(suspension, 0, SETTINGS.physics.suspensionRest + (this.suspension?.travel ?? SETTINGS.physics.maxSuspensionTravel))
        : SETTINGS.physics.suspensionRest;
      const point = this.wheelProbes[i].set(w.x, w.y - length - (this.wheelRadii?.[i] ?? this.wheelRadius), w.z).applyQuaternion(quat);
      point.x += t.x; point.y += t.y; point.z += t.z;
    }
    return this.wheelProbes;
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
    this.crossingTurboState = createCrossingTurboState();
    this.turboDelivery = 0;
    this.wheelRoll.fill(0);
    this.surfaceGrip.fill(1);
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
    const explicitReverse=this.manualTrailDrive&&!!this.controls.reverse;
    const brake = Math.max(this.controls.brake,explicitReverse&&speed>.6?1:0);
    const throttle = brake > .05 || explicitReverse ? 0 : this.controls.throttle;
    const lateralSpeed = velocity.x * forward.z - velocity.z * forward.x;
    const wheelbase = Math.abs(this.wheelMounts[0].z - this.wheelMounts[2].z);
    const requestedSteer = steeringAngleAt(speed, this.controls.steer, this.tuning.steer);
    const cornerSteer = Math.max(Math.abs(requestedSteer), Math.abs(this.steerAngle));
    const traction = turboTractionFactor(speed, cornerSteer, wheelbase,
      lateralSpeed, this.body.angvel().y, grip);
    // Auto-activate a brief, cooldown-limited arcade nitro burst at 100 mph.
    // No turbo in reverse, in countdown, or during off-track excursions.
    const turboAllowed = !this.offroadSector && this.isPlayer && brake <= .05 && !this.controls.handbrake && traction > .01;
    if(this.turboTriggerKph !== undefined){
      this.crossingTurboState=stepCrossingTurbo(this.crossingTurboState,dt,speed,throttle,this.onTrack,turboAllowed,this.turboTriggerKph);
      this.turboState=this.crossingTurboState;
    }else this.turboState=stepTurbo(this.turboState,dt,speed,throttle,this.onTrack,turboAllowed);
    // Ease boost in on a straight. Reduce it immediately when tyre capacity
    // is needed for a turn; never push through braking, countersteer or a slide.
    const delivery = this.turboState.active > 0 && brake <= .05 && throttle > .05 && !this.controls.handbrake ? traction : 0;
    this.turboDelivery = delivery < this.turboDelivery ? delivery :
      damp(this.turboDelivery, delivery, 12, dt);

    let engineForce = 0;
    if (throttle > 0.01 && absSpeed < this.tuning.topSpeed) {
      // Preserve controllable launches; reserve the extra power for high-speed drag.
      // Pickups have a heavier chassis and lower gearing. Begin the arcade
      // torque ramp earlier, otherwise drag can balance drive below the ramp.
      const highway = this.supportsFourWheelDrive
        ? THREE.MathUtils.smoothstep(absSpeed, 12, 50)
        : THREE.MathUtils.smoothstep(absSpeed, 40, 80);
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
      // Arcade pickup high-speed assist: compensate the chassis's linear
      // damping only on a straight with sound grip. The governor still
      // enforces the configured 200 MPH cap; no assistance through bends.
      if(this.supportsFourWheelDrive && speed>0 && grip>.85 &&
        Math.abs(this.controls.steer)<.025 && Math.abs(lateralSpeed)<.8 &&
        Math.abs(this.body.angvel().y)<.12){
        const fade=THREE.MathUtils.smoothstep(absSpeed,18,48);
        engineForce+=fade*throttle*(dragForce(absSpeed)*.65+this.body.mass()*.04*absSpeed);
      }
      engineForce *= highSpeedCornerDriveFactor(absSpeed,this.controls.steer);
      // Low-range offroad torque, bounded by surface grip and wheel contacts.
      // No launch boost or power change on Monzón/Suzaka.
      if(this.offroadSector&&this.supportsFourWheelDrive){
        const crawl=1-THREE.MathUtils.smoothstep(absSpeed,4,11);
        const lowGear=this.fourWheelDriveMode==="4H"?.88:.58;
        engineForce=Math.max(engineForce,this.body.mass()*9.81*grip*throttle*lowGear*crawl);
      }
    }
    // S / FRENO becomes a powerful reverse gear after stopping.
    // Propulsion continues throughout reverse instead of creeping at 2.2 kN.
    let reverseForce = reverseDriveForce(brake, speed, p.maxEngineForce);
    const trail=this.supportsFourWheelDrive?this.offroadSector:undefined;
    const planarBefore=Math.hypot(velocity.x,velocity.z);
    if(trail&&planarBefore>1.2&&speed>-.6)reverseForce=0;
    if(this.manualTrailDrive){
      reverseForce=explicitReverse&&speed<.6&&this.controls.brake<.05?reverseDriveForce(1,speed,p.maxEngineForce):0;
      // The dedicated reverse pedal brakes forward movement first; Freno never reverses.
      if(explicitReverse&&planarBefore>1.2&&speed>-.6)reverseForce=0;
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
    const fwd = forward;
    const nitro = this.turboActive && !this.controls.handbrake &&
      speed < this.tuning.topSpeed ? TURBO_FORCE_N * this.turboDelivery : 0;
    // The 4x4 mode only affects future pickups; no alteration to the seven
    // racecar force curves or Rapier raycast stabilisation.
    // Pickup 4x4: reuse boolean wheel contacts instead of creating an array
    // on every 60 Hz substep of every simulated race car.
    let contactTraction = 1;
    if (this.supportsFourWheelDrive) {
      for (let i = 0; i < 4; i++) this.contactScratch[i] = this.controller.wheelIsInContact(i);
      contactTraction = pickupContactTraction(this.fourWheelDriveMode, this.contactScratch, grip);
    }
    this.trailTractionLimited=false;
    this.trailHillAssist=0;
    if(trail&&this.manualTrailDrive){
      const limit=trailDriveLimit(this.body.mass(),grip,this.fourWheelDriveMode);
      this.trailTractionLimited=throttle>.45&&engineForce>limit&&Math.abs(speed)<1.8;
      engineForce=Math.min(engineForce,limit);reverseForce=Math.min(reverseForce,limit);
    }
    let drive = (engineForce + (this.offroadSector ? 0 : nitro) - reverseForce) * contactTraction;
    // 4H low-range extraction: overcome wet rolling resistance and a steep
    // grade without turbo or automatic transfer-case engagement.
    if(trail&&this.manualTrailDrive&&!this.controls.handbrake){
      const wet=trail.surface!=="dirt"||this.waterDepth>.04;
      const forwardDemand=brake<=.05?throttle:0;
      const reverseDemand=explicitReverse&&speed<.6&&this.controls.brake<.05&&!(planarBefore>1.2&&speed>-.6)?1:0;
      const hill=trailHillForce(this.body.mass(),this.contactScratch,this.fourWheelDriveMode,reverseDemand>0?-this.trailGrade:this.trailGrade,trail.resistance,this.waterDepth,planarBefore,Math.max(forwardDemand,reverseDemand));
      this.trailHillAssist=hill;
      const assist=Math.max(hill,trailExtractionForce(this.body.mass(),this.contactScratch,this.fourWheelDriveMode,wet,planarBefore,Math.max(forwardDemand,reverseDemand)));
      if(forwardDemand>0)drive=Math.max(drive,assist);
      else if(reverseDemand>0)drive=Math.min(drive,-assist);
      if(assist>0)this.trailTractionLimited=false;
    }
    if (Math.abs(drive) > 0.5) {
      this.body.addForce({ x: fwd.x * drive, y: 0, z: fwd.z * drive }, true);
    }

    for (let i = 0; i < this.wheelMounts.length; i++) {
      const w = this.wheelMounts[i];
      this.controller.setWheelEngineForce(i, 0);

      let braking = 0;
      if (brake > 0.05 && (this.manualTrailDrive ? Math.abs(speed) >= 0.6 : speed >= 0.6)) {
        braking = brake * p.maxBrakeForce * (w.front ? 1.12 : 0.9);
      }
      if (this.controls.handbrake && !w.front) {
        braking = Math.max(braking, p.handbrakeForce);
      }
      this.controller.setWheelBrake(i, braking);

      if (w.front) {
        this.controller.setWheelSteering(i, this.steerAngle);
        this.controller.setWheelFrictionSlip(i, this.wheelFriction[i] * this.surfaceGrip[i]);
      } else {
        this.controller.setWheelFrictionSlip(
          i,
          this.wheelFriction[i] * this.surfaceGrip[i] * (this.controls.handbrake ? 0.52 : 1)
        );
      }
    }

    // Aerodynamics: quadratic drag plus speed-squared downforce.
    const vel = this.body.linvel();
    const planar = Math.hypot(vel.x, vel.z);
    if (planar > 0.5) {
      const terrainDrag = this.offroadSector && this.supportsFourWheelDrive ? this.body.mass() * 9.81 * (this.offroadSector.resistance*.22 + this.waterDepth*.14) * Math.min(1,planar/3) : 0;
      const d = dragForce(planar) + terrainDrag;
      if(trail){
        const contacts=this.contactScratch.reduce((sum,c)=>sum+Number(c),0)/4;
        const decel=offroadBrakeAcceleration(planar,lateralSpeed,reverseForce>0?0:brake,grip,contacts,trail.surface,this.fourWheelDriveMode);
        const force=this.body.mass()*decel;
        this.body.addForce({x:-vel.x/planar*force,y:0,z:-vel.z/planar*force},true);
      }
      this.body.addForce({ x: (-vel.x / planar) * d, y: 0, z: (-vel.z / planar) * d }, true);
    }
    // At 350–504 MPH the raw v² downforce exceeds suspension capacity
    // (four wheels × 15kN), crushing cars into the asphalt/kerbs.
    // Saturate the arcade aero load to retain physical wheel clearance.
    // Trucks do not have race-car wings; avoid crushing the suspension
    // under a simulated supercar aero load.
    const df = this.supportsFourWheelDrive
      ? Math.min(downforceN(planar, .42), 4500)
      : Math.min(downforceN(planar), 24000);
    // Downforce must be a pure force at the centre of mass. addForceAtPoint
    // takes a WORLD-space point: passing {0, 0.1, 0} here applied the load at
    // the world origin and produced a huge pitch torque (the car took off).
    this.body.addForce({ x: 0, y: -df, z: 0 }, true);

    // Rapier does not apply suspension/engine/brake itself: the controller must
    // integrate the wheel forces for this step before world.step() runs.
    this.controller.updateVehicle(dt);
  }

  update(dt: number, input: DriveInput, grip: number, wheelGrips?: readonly number[], offroadSector?: OffroadSector, offroadOnTrack?: boolean, waterDepth=0, trailGrade=0): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    input = { throttle: Number.isFinite(input.throttle) ? clamp(input.throttle,0,1) : 0, brake: Number.isFinite(input.brake) ? clamp(input.brake,0,1) : 0, steer: Number.isFinite(input.steer) ? clamp(input.steer,-1,1) : 0, handbrake: !!input.handbrake, reverse: !!input.reverse };
    this.controls = input;
    this.offroadSector = offroadSector;
    this.trailGrade=offroadSector&&Number.isFinite(trailGrade)?trailGrade:0;
    this.waterDepth=offroadSector&&Number.isFinite(waterDepth)?clamp(waterDepth,0,.55):0;
    if (offroadSector && this.supportsFourWheelDrive) {
      let contacts = 0;
      for(let i=0;i<4;i++) contacts += Number(this.controller.wheelIsInContact(i));
      this.mudCoverage = accumulateMud(this.mudCoverage,this.waterDepth>.06?"puddle":offroadSector.surface,this.speed,dt,contacts/4);
      this.mudCoating ??= new PickupMudCoating(this.webgpuMud);
    }
    // The chassis may still be on asphalt while one outside wheel is on
    // Suzaka's kerb or Monzon's gravel: calculate grip per contact patch.
    let meanGrip = 0;
    for (let i=0;i<4;i++) {
      const sampled = wheelGrips?.[i] ?? grip;
      this.surfaceGrip[i] = Number.isFinite(sampled) ? clamp(sampled, .15, 1.2) : 1;
      meanGrip += this.surfaceGrip[i] / 4;
    }
    this.smoothedGrip = damp(this.smoothedGrip, meanGrip, 6, dt);
    this.onTrack = offroadSector && offroadOnTrack !== undefined ? offroadOnTrack : this.surfaceGrip.every(tyre => tyre > 0.72);

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
    const local = this.localVelocity.set(vel.x, vel.y, vel.z).applyQuaternion(_q.invert());
    this.slip = Math.max(0, Math.abs(local.x) - 0.6);
  }

  /** Keep wheel rotations, speed governor and contact state on the SAME
   * Rapier 60Hz fixed timestep, independently of rendering frame rate.
   */
  afterPhysicsStep(dt = 0): void {
    const vel = this.body.linvel();
    const rot = this.body.rotation();
    const q = _q.set(rot.x, rot.y, rot.z, rot.w);
    const fwd = this.forceForward.set(0, 0, 1).applyQuaternion(q);
    fwd.y = 0;
    if (fwd.lengthSq() < .5) return;
    fwd.normalize();
    const forwardSpeed = vel.x * fwd.x + vel.z * fwd.z;
    const planarSpeed = Math.hypot(vel.x, vel.z);
    const reverseLimit=this.manualTrailDrive?4:REVERSE_LIMIT_MS;
    if (forwardSpeed < -reverseLimit) {
      const scale = reverseLimit / Math.abs(forwardSpeed);
      this.body.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
      this.speed = -reverseLimit;
    } else if (planarSpeed > (this.offroadSector&&this.supportsFourWheelDrive?offroadSpeedLimit(this.offroadSector.surface):this.tuning.topSpeed)) {
      // Explicit arcade low-range speed governor; preserve height/orientation.
      const cap=this.offroadSector&&this.supportsFourWheelDrive?offroadSpeedLimit(this.offroadSector.surface):this.tuning.topSpeed;
      const scale = cap / planarSpeed;
      this.body.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
      this.speed = forwardSpeed * scale;
    } else {
      this.speed = forwardSpeed;
    }
    // The old wheel animation ran before world.step() and could rotate tyres
    // mid-air, while stationary, or multiple times on a slow 30FPS frame.
    // Contact is available only AFTER controller.updateVehicle + world.step.
    if (dt > 0 && this.controller && this.wheelMounts && this.wheelRoll) {
      const yawRate = this.body.angvel().y;
      for (let i=0;i<this.wheelMounts.length;i++) {
        const wheel = this.wheelMounts[i];
        this.wheelRoll[i] = nextWheelRoll(
          this.wheelRoll[i], this.speed, yawRate, wheel.x, this.wheelRadii?.[i] ?? this.wheelRadius,
          dt, this.controller.wheelIsInContact(i),
          this.controls.handbrake && !wheel.front
        );
      }
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
      wheel.steer.position.y = this.wheelMounts[i].y - (typeof suspension === "number" && Number.isFinite(suspension) ? clamp(suspension, 0, SETTINGS.physics.suspensionRest + (this.suspension?.travel ?? SETTINGS.physics.maxSuspensionTravel)) : SETTINGS.physics.suspensionRest);
      wheel.steer.rotation.y = visibleWheelSteer(this.steerAngle, this.wheelMounts[i].front);
      wheel.spin.rotation.x = this.wheelRoll[i];
    }
    this.mudCoating?.update(this.visual.root,this.mudCoverage,dt);
    this.turboFlames?.update(dt, this.turboActive && !this.offroadSector);
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
    this.mudCoating?.dispose();
    this.turboFlames?.dispose();
    world.removeVehicleController(this.controller);
    world.removeRigidBody(this.body);
    if (this.vehicleId) disposeSelectedVisual(this.visual);
    else this.visual.root.removeFromParent();
  }
}
