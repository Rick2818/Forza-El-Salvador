import * as THREE from "three";
import type { Track } from "./track";
import { planRaceTunnels, type TunnelPlan } from "./raceTunnels";

/**
 * Three economical, shadow-free light pools illuminate the road and vehicles,
 * not merely the LED geometry. They follow nearby ceiling fixtures as the car
 * traverses a tunnel. There are never 100+ real-time lights in the scene.
 */
export class TunnelLighting {
  readonly lights: THREE.PointLight[] = [];
  private readonly intervals: readonly TunnelPlan[];
  private readonly track: Track;
  private refresh = 1;

  constructor(scene: THREE.Scene, track: Track) {
    this.track = track;
    this.intervals = planRaceTunnels(track);
    if (!this.intervals.length) return;

    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xf6f9ff, 0, 76, 2);
      light.name = `tunnel-driving-light-${i + 1}`;
      light.castShadow = false;
      // Always visible: changing the light count recompiles every lit shader.
      scene.add(light);
      this.lights.push(light);
    }
  }

  update(position: THREE.Vector3, dt: number): void {
    if (!this.lights.length) return;
    this.refresh += dt;
    if (this.refresh < .07) return;
    this.refresh = 0;
    // Compare in full 3D: the Suzaka flyover crosses the same X/Z coordinates.
    let index = 0, distanceSq = Infinity;
    for (let i = 0; i < this.track.samples.length; i++) {
      const d = this.track.samples[i].distanceToSquared(position);
      if (d < distanceSq) { distanceSq = d; index = i; }
    }
    const station = index * this.track.segmentLength;
    const active = this.intervals.find(p =>
      station >= p.startMeters - 36 && station <= p.endMeters + 36
    );
    if (!active || distanceSq > (this.track.halfWidth + 14) ** 2) {
      for (const light of this.lights) light.intensity = 0;
      return;
    }
    // Smoothly fade near portals so the open-air lighting is not abruptly cut.
    const fadeIn = Math.min(1, Math.max(0, (station - active.startMeters + 36) / 36));
    const fadeOut = Math.min(1, Math.max(0, (active.endMeters + 36 - station) / 36));
    const strength = 2300 * fadeIn * fadeOut;
    const N = this.track.samples.length;
    const offsets = [-17, 0, 17];
    this.lights.forEach((light, i) => {
      const d = station + offsets[i];
      const a = ((Math.round(d / this.track.segmentLength) % N) + N) % N;
      const anchor = this.track.samples[a];
      light.position.set(anchor.x, anchor.y + 7.5, anchor.z);
      light.intensity = strength;
      light.intensity = strength > 10 ? strength : 0;
    });
  }
}
