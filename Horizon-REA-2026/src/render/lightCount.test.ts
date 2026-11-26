import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Track } from "../world/track";
import { getCircuit } from "../world/circuits";
import { TunnelLighting } from "../world/tunnelLighting";

// Three.js recompiles every lit shader when the number of visible lights changes,
// which stalled the race for seconds at tunnel entrances.
describe("constant shader light count", () => {
  for (const id of ["monzon", "suzaka"] as const) {
    it(`keeps tunnel lights counted around a whole ${id} lap`, () => {
      const scene = new THREE.Scene();
      const track = new Track(getCircuit(id));
      track.buildVisuals = () => {};
      track.build();
      const lighting = new TunnelLighting(scene, track);
      const counts = new Set<number>();
      for (let i = 0; i < track.samples.length; i += 5) {
        lighting.update(track.samples[i], .2);
        counts.add(lighting.lights.filter(light => light.visible).length);
      }
      expect([...counts]).toEqual([3]);
    });
  }
});
