import * as THREE from "three";
import { angleDelta, clamp } from "../core/mathx";
import { Track } from "../world/track";
import { Vehicle, type DriveInput } from "../vehicle/vehicle";
import type { TrafficCar } from "../vehicle/ai";

/** Up to five physical cars use approved GLBs and the same Rapier world. */
export const ONCOMING_CAR_COUNT = 5;
export const ONCOMING_SPAWN_INTERVAL_SEC = 30;

/** Deterministic spawn schedule: one immediate, another every 30 seconds up to five. */
export function expectedOncomingCount(elapsedSeconds: number): number {
  return Math.min(ONCOMING_CAR_COUNT, 1 + Math.floor(Math.max(0, elapsedSeconds) / ONCOMING_SPAWN_INTERVAL_SEC));
}
export const ONCOMING_LANE = 2.9;

/** Keep new cars well away from the grid during the red-light countdown. */
export function oncomingSpawnIndex(startIndex: number, slot: number, segments: number): number {
  return (startIndex + Math.floor(segments * (slot + 1) / (ONCOMING_CAR_COUNT + 1))) % segments;
}

export function oncomingPose(track: Pick<Track, "sampleAt" | "rightAt" | "tangentAt">, index: number, lane = ONCOMING_LANE):
  { position: THREE.Vector3; heading: number } {
  const base = track.sampleAt(index);
  const right = track.rightAt(index);
  const forward = track.tangentAt(index);
  return {
    position: new THREE.Vector3(base.x + right.x * lane, base.y, base.z + right.z * lane),
    heading: Math.atan2(-forward.x, -forward.z)
  };
}

/**
 * Drives the actual rigid body against the normal circuit direction.
 * No animation-only traffic, no teleports, and no independent physics engine.
 */
export class OncomingDriver {
  private hint = -1;
  constructor(readonly vehicle: Vehicle, private readonly track: Track, readonly lane = ONCOMING_LANE) {}

  plan(traffic: readonly TrafficCar[] = []): DriveInput {
    const vehicle = this.vehicle;
    const pos = vehicle.position.clone();
    this.hint = this.track.nearestIndex(pos, this.hint);
    const speed = Math.abs(vehicle.speed);
    const lookAhead = clamp(10 + speed * 0.65, 12, 38);
    const index = this.hint - Math.max(3, Math.round(lookAhead / this.track.segmentLength));
    const { position: target } = oncomingPose(this.track, index, this.lane);
    const rot = vehicle.body.rotation();
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
    );
    const heading = Math.atan2(facing.x, facing.z);
    const desired = Math.atan2(target.x - pos.x, target.z - pos.z);
    const error = angleDelta(heading, desired);
    const steer = clamp(error * 2.4 - vehicle.body.angvel().y * 0.12, -1, 1);

    // Braking before bends keeps the wrong-way traffic predictable, but the
    // car can still be struck or pushed aside by a racing vehicle.
    let targetSpeed = clamp(
      Math.sqrt(11 / Math.max(0.0006, this.track.curvatures[this.hint] ?? 0.0006)),
      12, 28
    );
    const ahead = (this.hint - 12 + this.track.samples.length) % this.track.samples.length;
    targetSpeed = Math.min(targetSpeed, clamp(
      Math.sqrt(11 / Math.max(0.0006, this.track.curvatures[ahead] ?? 0.0006)),
      12, 28
    ));
    const tangent = this.track.tangentAt(this.hint);
    const right = this.track.rightAt(this.hint);
    for (const other of traffic) {
      if (Math.abs(other.position.y - pos.y) > 4) continue; // flyovers
      const dx = other.position.x - pos.x;
      const dz = other.position.z - pos.z;
      const gap = -dx * tangent.x - dz * tangent.z; // backwards around the lap
      const lateral = dx * right.x + dz * right.z;
      if (gap > 0 && gap < 30 && Math.abs(lateral) < 2.8) {
        targetSpeed = Math.min(targetSpeed, Math.max(4, (gap - 4) * 0.7));
      }
    }
    if (Math.abs(error) > 0.4 || !vehicle.onTrack) targetSpeed = Math.min(targetSpeed, 13);
    return {
      throttle: clamp((targetSpeed - speed) / 5, 0, 1),
      brake: clamp((speed - targetSpeed) / 6, 0, 1),
      steer,
      handbrake: false
    };
  }

  update(dt: number, traffic: readonly TrafficCar[] = []): void {
    const input = this.plan(traffic);
    const location = this.track.locate(this.vehicle.position, this.hint);
    this.vehicle.update(dt, input, this.track.gripAt(location.index, location.lateral));
    this.vehicle.setBrakeLights(input.brake > 0.05);
  }
}
