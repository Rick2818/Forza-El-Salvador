import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Track } from "./track";
import { planRaceTunnels } from "./raceTunnels";
import { TunnelLighting } from "./tunnelLighting";

function fixture(id: string): Track {
  const count = 1500, length = 5800, radius = length / (2 * Math.PI);
  const samples = Array.from({length:count},(_,i)=>{
    const a = (i * Math.PI * 2) / count;
    return new THREE.Vector3(radius * Math.cos(a),0,radius * Math.sin(a));
  });
  return {
    circuit: {id}, samples, length, segmentLength:length/count, halfWidth:9
  } as Track;
}

describe("tunnel roadway illumination", () => {
  for (const circuit of ["monzon", "suzaka"]) {
    it(`lights the roadway with three shadow-free sources in ${circuit}`, () => {
      const scene = new THREE.Scene();
      const track = fixture(circuit);
      const controller = new TunnelLighting(scene, track);
      expect(controller.lights).toHaveLength(3);
      expect(scene.children.filter(obj => obj instanceof THREE.PointLight)).toHaveLength(3);
      const plan = planRaceTunnels(track)[0];
      const index = Math.floor((plan.startMeters + 140) / track.segmentLength);
      const center = track.samples[index].clone();
      controller.update(center, .2);
      for (const light of controller.lights) {
        expect(light.visible).toBe(true);
        expect(light.castShadow).toBe(false);
        expect(light.intensity).toBeGreaterThan(2000);
        expect(light.distance).toBeGreaterThanOrEqual(65);
        expect(light.position.y).toBeGreaterThan(7);
      }
      // Exiting a tunnel extinguishes intensity but preserves the shader light count.
      controller.update(track.samples[0].clone(), .2);
      expect(controller.lights.every(light => light.visible && light.intensity === 0)).toBe(true);
      // At an elevated crossing/bridge, do not illuminate the wrong road deck.
      controller.update(center.clone().add(new THREE.Vector3(0,80,0)), .2);
      expect(controller.lights.every(light => light.visible && light.intensity === 0)).toBe(true);
    });
  }
  it("does not install extra lights on other circuits", () => {
    const scene = new THREE.Scene();
    const controller = new TunnelLighting(scene, fixture("sparda"));
    expect(controller.lights).toHaveLength(0);
    controller.update(new THREE.Vector3(), .2);
  });
});
