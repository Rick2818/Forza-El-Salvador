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

type Nearby = { gap: number; lane: number; speed: number; isPlayer: boolean };

/**
 * Competidores físicos con estrategia, no coches guiados por una animación:
 * - Defensor cubre una línea cuando ve llegar al jugador.
 * - Atacante busca huecos y pasa por el exterior/interior.
 * - Estratega cambia de trazada y conserva velocidad antes de las curvas.
 * Reaccionan a otros coches, mantienen espacio y nunca reciben teletransporte.
 */
export class AIDriver {
  private hint = -1;
  private stuckTime = 0;
  private reverseTime = 0;
  private currentLane: number;
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

  update(dt: number, time: number, traffic: readonly TrafficCar[] = []): void {
    this.vehicle.update(dt, this.plan(dt, time, traffic), 1);
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

    // Only local projections are needed; no expensive global pathfinding at 60 FPS.
    const nearby: Nearby[] = traffic.map(other => {
      const dx = other.position.x - pos.x;
      const dz = other.position.z - pos.z;
      return {
        gap: dx * tangent.x + dz * tangent.z,
        lane: ownLane + dx * right.x + dz * right.z,
        speed: Math.abs(other.speed),
        isPlayer: other.isPlayer
      };
    });

    const front = nearby
      .filter(o => o.gap > 1.5 && o.gap < 32 && Math.abs(o.lane - ownLane) < 3.6)
      .sort((a, b) => a.gap - b.gap)[0];
    const playerBehind = nearby.find(o => o.isPlayer && o.gap < -7 && o.gap > -23);
    const wander = Math.sin(time * (this.personality === "estratega" ? 0.23 : 0.31) + this.phase) * 0.55;
    let desiredLane = this.baseLane + wander;

    // Seek an unoccupied passing corridor. The attacker attempts more passes,
    // while easy rivals mostly hold a predictable line.
    if (front && (this.personality === "atacante" || tuning.pressure > 0.35)) {
      const firstSide = this.personality === "atacante" ? 1 : Math.sin(this.phase) > 0 ? -1 : 1;
      for (const side of [firstSide, -firstSide]) {
        const candidate = clamp(front.lane + side * 3.45, -4.55, 4.55);
        if (Math.abs(candidate - front.lane) < 3.0) continue;
        const occupied = nearby.some(o =>
          Math.abs(o.gap) < 10 && Math.abs(o.lane - candidate) < 2.7
        );
        if (!occupied) { desiredLane = candidate; break; }
      }
    } else if (playerBehind && tuning.pressure > 0.2 &&
               (this.personality === "defensor" || this.difficulty === "dificil")) {
      // Defend once, with space to react; no sudden weave into a parallel car.
      const candidate = clamp(playerBehind.lane, -3.8, 3.8);
      if (nearby.every(o => o.gap < -8 || o.gap > 9 || Math.abs(o.lane - candidate) > 3)) {
        desiredLane = candidate;
      }
    }

    // Opponents drive within the asphalt; gradual lateral transitions avoid swerves.
    desiredLane = clamp(desiredLane, -4.55, 4.55);
    const maxLaneStep = (1.4 + tuning.pressure * 0.8) * dt;
    this.currentLane += clamp(desiredLane - this.currentLane, -maxLaneStep, maxLaneStep);

    const lookAhead = clamp((7 + speed * 0.62) * tuning.reaction, 7, 46);
    const aheadIndex = this.hint + Math.round(lookAhead / this.track.segmentLength);
    const base = this.track.sampleAt(aheadIndex);
    const aimRight = this.track.rightAt(aheadIndex);
    _target.set(base.x + aimRight.x * this.currentLane, 0.4, base.z + aimRight.z * this.currentLane);

    const rot = v.body.rotation();
    _quat.set(rot.x, rot.y, rot.z, rot.w);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    const heading = Math.atan2(_forward.x, _forward.z);
    const desired = Math.atan2(_target.x - pos.x, _target.z - pos.z);
    const steer = clamp(angleDelta(heading, desired) * (2.5 * tuning.reaction), -1, 1);

    const multiplier = rivalTargetMultiplier(this.skill, this.difficulty, this.personality);
    const profileSpeed = this.track.targetSpeeds[this.hint] * multiplier;
    const cornerAhead = this.track.targetSpeeds[(this.hint + 12) % this.track.samples.length];
    let targetSpeed = Math.min(profileSpeed, Math.max(cornerAhead * multiplier, 17));

    // A nearby slower car forces braking until the pass is physically clear.
    for (const other of nearby) {
      if (other.gap > 0 && other.gap < 19 && Math.abs(other.lane - ownLane) < 2.75) {
        const safeSpeed = Math.max(3, other.speed + Math.max(0, other.gap - 6) * (0.40 + 0.14 * tuning.pressure));
        targetSpeed = Math.min(targetSpeed, safeSpeed);
      }
    }

    const error = targetSpeed - speed;
    let throttle = clamp(error / (5.5 / tuning.reaction), 0, 1);
    let brake = clamp(-error / (7.0 / tuning.reaction), 0, 1);
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      throttle = 0;
      brake = 1;
    }

    if (speed < 1.4 && time > 2) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.8) {
        this.reverseTime = 1.1;
        this.stuckTime = 0;
      }
    } else {
      this.stuckTime = 0;
    }
    return { throttle, brake, steer, handbrake: false };
  }
}
