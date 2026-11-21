import * as THREE from "three";
import { Vehicle, type DriveInput } from "./vehicle";
import { Track } from "../world/track";
import { angleDelta, clamp } from "../core/mathx";

export type RaceDifficulty = "facil" | "medio" | "normal" | "dificil";
export type RivalPersonality = "defensor" | "atacante" | "estratega";

export interface TrafficCar {
  position: THREE.Vector3;
  speed: number;
  isPlayer: boolean;
  racerId?: number;
}

export const DIFFICULTY_TUNING = {
  facil:   { pace: 0.79, reaction: 0.78, pressure: 0.05 },
  medio:   { pace: 0.97, reaction: 1.00, pressure: 0.55 },
  // Backward compatibility with existing championship saves and reward tables.
  normal:  { pace: 0.97, reaction: 1.00, pressure: 0.55 },
  dificil: { pace: 1.08, reaction: 1.14, pressure: 1.00 }
} as const;

export function rivalTargetMultiplier(skill: number, difficulty: RaceDifficulty, personality: RivalPersonality): number {
  const personalityPace = personality === "atacante" ? 1.025 : personality === "estratega" ? 1.01 : 1;
  return skill * DIFFICULTY_TUNING[difficulty].pace * personalityPace;
}

const _forward = new THREE.Vector3();
const _target = new THREE.Vector3();
const _quat = new THREE.Quaternion();

type Nearby = { gap: number; lane: number; speed: number; racerId?: number };

/**
 * Competidores físicos con estrategia, no coches guiados por una animación:
 * - Defensor cubre una línea cuando se acerca cualquier rival.
 * - Atacante busca huecos y pasa por el exterior/interior.
 * - Estratega cambia de trazada y conserva velocidad antes de las curvas.
 * Reaccionan a otros coches, mantienen espacio y nunca reciben teletransporte.
 */
export class AIDriver {
  private hint = -1;
  private stuckTime = 0;
  private reverseTime = 0;
  private currentLane: number;
  private pass: { lane: number; racerId?: number; remaining: number } | null = null;
  private readonly baseLane: number;
  private readonly skill: number;
  private readonly phase: number;
  readonly personality: RivalPersonality;
  readonly difficulty: RaceDifficulty;

  constructor(
    readonly vehicle: Vehicle,
    private readonly track: Track,
    lane: number,
    skill: number,
    phase: number,
    personality: RivalPersonality = "estratega",
    difficulty: RaceDifficulty = "medio"
  ) {
    this.baseLane = lane;
    this.currentLane = lane;
    this.skill = skill;
    this.phase = phase;
    this.personality = personality;
    this.difficulty = difficulty;
  }

  update(dt: number, time: number, traffic: readonly TrafficCar[] = [], grip = 1): void {
    const driving = this.plan(dt, time, traffic);
    this.vehicle.update(dt, driving, grip);
    this.vehicle.setBrakeLights(driving.brake > 0.05);
  }

  /** El mismo plan sirve para carreras reales y capturas automáticas. */
  plan(dt: number, time: number, traffic: readonly TrafficCar[] = []): DriveInput {
    const v = this.vehicle;
    const pos = v.position;
    this.hint = this.track.nearestIndex(pos, this.hint);
    const speed = Math.abs(v.speed);
    const tuning = DIFFICULTY_TUNING[this.difficulty];
    const road = this.track.sampleAt(this.hint);
    const tangent = this.track.tangentAt(this.hint);
    const right = this.track.rightAt(this.hint);
    const ownLane = (pos.x - road.x) * right.x + (pos.z - road.z) * right.z;
    // Reacquire the racing surface instead of continuing a high-speed
    // overtaking maneuver while sideways/outside the road on Suzaka.
    const recovering = !v.onTrack || Math.abs(ownLane) > this.track.halfWidth * .82;

    // Only local projections are needed; no expensive global pathfinding at 60 FPS.
    const nearby: Nearby[] = traffic.filter(other =>
      Math.abs(other.position.y - pos.y) < 5).map(other => {
      const dx = other.position.x - pos.x;
      const dz = other.position.z - pos.z;
      return {
        gap: dx * tangent.x + dz * tangent.z,
        lane: ownLane + dx * right.x + dz * right.z,
        speed: Math.abs(other.speed),
        racerId: other.racerId
      };
    });

    const multiplier = rivalTargetMultiplier(this.skill, this.difficulty, this.personality);
    // Drivers are quicker in different parts of the lap, so the same car
    // does not automatically set the pace in every sector.
    const sector = this.hint / this.track.samples.length * Math.PI * 4;
    const pace = multiplier * (1 + Math.sin(sector + this.phase + time * .012) * (0.028 + tuning.pressure * 0.065));
    // A driver within striking distance can use a short push on a straight.
    // It applies to any opponent, never just the player, and uses the same
    // engine, top speed and braking envelope as normal driving.
    const straight=(this.track.curvatures?.[this.hint]??0)<.0012;
    const chasing=nearby.some(other=>other.gap>6 && other.gap<85);
    const push=straight && chasing ? 1+tuning.pressure*.06 : 1;
    const profileSpeed = this.track.targetSpeeds[this.hint] * pace * push;
    const cornerAhead = this.track.targetSpeeds[(this.hint + 12) % this.track.samples.length] * pace * push;
    let targetSpeed = Math.min(profileSpeed, Math.max(cornerAhead, 17));
    const onBridge = this.track.circuit?.layout === "figure-eight" && road.y > 1;
    if (onBridge) targetSpeed = Math.min(targetSpeed, 45);
    // Difficulty changes pace, never the available braking distance or grip.
    // Multiplying the precomputed braking envelope by pace also multiplied
    // its required deceleration by pace². With V9 highway power that sent
    // the hard Bugatti into Suzaka's barrier after the start straight.
    const brakingDeceleration = 8;
    const previewMetres = Math.max(60, speed * speed / (2 * brakingDeceleration) + speed * .4);
    const previewSteps = Math.min(this.track.samples.length - 1,
      Math.ceil(previewMetres / this.track.segmentLength));
    for (let step = 0; step <= previewSteps; step += 3) {
      const index = (this.hint + step) % this.track.samples.length;
      const curvature = this.track.curvatures?.[index] ?? 0;
      if (curvature <= .001) continue;
      // A defender leaves more corner margin; an attacker uses the full
      // grip envelope. These are physical differences in driving style.
      const cornerPace = this.personality === "defensor" ? .96
        : this.personality === "atacante" ? 1 : .98;
      const cornerSpeed = Math.sqrt(13.5 / curvature) * Math.min(pace, cornerPace);
      const reachable = Math.sqrt(cornerSpeed * cornerSpeed +
        2 * brakingDeceleration * Math.max(0, step * this.track.segmentLength - speed * .25));
      targetSpeed = Math.min(targetSpeed, reachable);
    }
    const front = nearby
      .filter(o => o.gap > 1.5 && o.gap < 24 + tuning.pressure * 22 && Math.abs(o.lane - ownLane) < 3.3)
      .sort((a, b) => a.gap - b.gap)[0];
    const chaser = nearby.find(o => o.gap < -9 && o.gap > -25 &&
      Math.abs(o.lane - ownLane) > 1.3 && o.speed > speed + 1);
    const wander = Math.sin(time * 0.27 + this.phase) * 0.35;
    let desiredLane = this.baseLane + wander;

    if (this.pass) {
      const target = nearby.find(o => o.racerId === this.pass?.racerId);
      this.pass.remaining -= dt;
      if (this.pass.remaining <= 0 || (this.pass.racerId !== undefined && (!target || target.gap < -9))) {
        this.pass = null;
      }
    }
    if (!onBridge && !this.pass && front && targetSpeed > front.speed + (1 - tuning.pressure) * 2.4 + 0.65) {
      const firstSide = Math.sin(this.phase) > 0 ? -1 : 1;
      for (const side of [firstSide, -firstSide]) {
        const candidate = clamp(front.lane + side * 3.35, -4.55, 4.55);
        if (Math.abs(candidate - front.lane) < 3) continue;
        const occupied = nearby.some(o => o.gap > -11 && o.gap < Math.min(22, front.gap + 6) &&
          Math.abs(o.lane - candidate) < 2.8);
        if (!occupied) {
          this.pass = { lane: candidate, racerId: front.racerId, remaining: 4.5 + tuning.pressure * 2 };
          break;
        }
      }
    }
    if (recovering || onBridge) {
      this.pass = null;
      desiredLane = 0;
    } else if (this.pass) {
      desiredLane = this.pass.lane;
    } else if (chaser && tuning.pressure > 0.2 &&
               (this.personality === "defensor" || this.difficulty === "dificil")) {
      const candidate = clamp(chaser.lane, -3.8, 3.8);
      if (nearby.every(o => o.gap < -8 || o.gap > 10 || Math.abs(o.lane - candidate) > 3)) {
        desiredLane = candidate;
      }
    }
    // Hold the current line if a car is already alongside on the intended line.
    if (nearby.some(o => Math.abs(o.gap) < 6 && Math.abs(o.lane - ownLane) > 2.1 &&
          Math.abs(o.lane - desiredLane) < 2.6)) {
      desiredLane = ownLane;
    }

    // Opponents drive within the asphalt; gradual lateral transitions avoid swerves.
    desiredLane = clamp(desiredLane, -4.55, 4.55);
    const maxLaneStep = (1.4 + tuning.pressure * 0.8) * dt;
    this.currentLane += clamp(desiredLane - this.currentLane, -maxLaneStep, maxLaneStep);

    const lookAhead = recovering
      ? clamp(7 + speed * .25, 7, 24)
      : clamp((7 + speed * 0.62) * tuning.reaction, 7, 46);
    const aheadIndex = this.hint + Math.round(lookAhead / this.track.segmentLength);
    const base = this.track.sampleAt(aheadIndex);
    const aimRight = this.track.rightAt(aheadIndex);
    _target.set(base.x + aimRight.x * this.currentLane, 0.4, base.z + aimRight.z * this.currentLane);

    const rot = v.body.rotation();
    _quat.set(rot.x, rot.y, rot.z, rot.w);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    const heading = Math.atan2(_forward.x, _forward.z);
    const desired = Math.atan2(_target.x - pos.x, _target.z - pos.z);
    const headingError = angleDelta(heading, desired);
    let steer = clamp(headingError *
      (recovering ? 3.1 : 2.5) * tuning.reaction, -1, 1);

    // A nearby slower car forces braking until the pass is physically clear.
    for (const other of nearby) {
      if (other.gap > 0 && other.gap < 19 && Math.abs(other.lane - ownLane) < 2.75) {
        const safeSpeed = Math.max(3, other.speed + Math.max(0, other.gap - 6) * (0.40 + 0.14 * tuning.pressure));
        targetSpeed = Math.min(targetSpeed, safeSpeed);
      }
    }

    if (recovering) targetSpeed = Math.min(targetSpeed, 12);
    else if (Math.abs(headingError) > .3 || v.slip > 3) {
      // Regain alignment before asking the highway engine to accelerate.
      targetSpeed = Math.min(targetSpeed, 25);
    }
    const error = targetSpeed - speed;
    // The speed controller must account for the stronger highway engine;
    // Large gaps allow full acceleration; taper small errors by the square
    // root of available power rather than cancelling all highway power.
    let throttle = clamp(error / (5.5 / tuning.reaction) / Math.sqrt(v.highSpeedPowerMultiplier ?? 1), 0, 1);
    let brake = clamp(-error / (7.0 / tuning.reaction), 0, 1);
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      throttle = 0;
      brake = 1;
      // Reversing changes yaw response. Keeping the forward steering lock
      // made a stuck driver repeatedly drive back into the same guardrail.
      steer = -steer;
    }

    if (speed < 1.4 && time > 2) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.8) {
        this.reverseTime = 2.2;
        this.stuckTime = 0;
      }
    } else {
      this.stuckTime = 0;
    }
    return { throttle, brake, steer, handbrake: false };
  }
}
