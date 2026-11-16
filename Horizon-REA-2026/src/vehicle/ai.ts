import * as THREE from "three";
import { Vehicle } from "./vehicle";
import { Track } from "../world/track";
import { angleDelta, clamp } from "../core/mathx";

const _forward = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _target = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/**
 * Pure-pursuit racing AI: it aims at a look-ahead point on its lane and
 * respects a precomputed curvature speed profile, so it brakes before corners
 * instead of hugging the rails.
 */
export class AIDriver {
  private hint = -1;
  private stuckTime = 0;
  private reverseTime = 0;
  private lane: number;
  private skill: number;
  private phase: number;

  constructor(
    readonly vehicle: Vehicle,
    private readonly track: Track,
    lane: number,
    skill: number,
    phase: number
  ) {
    this.lane = lane;
    this.skill = skill;
    this.phase = phase;
  }

  update(dt: number, time: number): void {
    const v = this.vehicle;
    v.update(dt, this.plan(dt, time), 1);
  }

  /**
   * Same pure-pursuit logic, but returns the pedal inputs instead of applying
   * them. The capture renderer uses it to drive the player car through the
   * recorded laps while keeping the vehicle code path identical.
   */
  plan(dt: number, time: number): { throttle: number; brake: number; steer: number; handbrake: boolean } {
    const v = this.vehicle;
    const pos = v.position;
    this.hint = this.track.nearestIndex(pos, this.hint);
    const speed = Math.abs(v.speed);

    // Human-like lane wander keeps the pack from looking like a train.
    const wander = Math.sin(time * 0.32 + this.phase) * 1.15;
    const lane = clamp(this.lane + wander, -5.4, 5.4);

    const lookAhead = clamp(7 + speed * 0.62, 7, 46);
    const aheadIndex = this.hint + Math.round(lookAhead / this.track.segmentLength);
    const base = this.track.sampleAt(aheadIndex);
    const right = this.track.rightAt(aheadIndex);
    _target.set(base.x + right.x * lane, 0.4, base.z + right.z * lane);

    _quat.set(v.body.rotation().x, v.body.rotation().y, v.body.rotation().z, v.body.rotation().w);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    const heading = Math.atan2(_forward.x, _forward.z);
    _pos.copy(pos);
    const desired = Math.atan2(_target.x - _pos.x, _target.z - _pos.z);
    const steer = clamp(angleDelta(heading, desired) * 2.6, -1, 1);

    // Speed target from the curvature profile, softened for stability.
    const profileSpeed = this.track.targetSpeeds[this.hint] * this.skill;
    const cornerAhead = this.track.targetSpeeds[(this.hint + 12) % this.track.samples.length];
    const targetSpeed = Math.min(profileSpeed, Math.max(cornerAhead * this.skill, 18));

    const error = targetSpeed - speed;
    let throttle = clamp(error / 5.5, 0, 1);
    let brake = clamp(-error / 7, 0, 1);
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
