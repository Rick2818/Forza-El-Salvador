import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Track } from "./track";
import { createRaceTunnels, planRaceTunnels, TUNNEL_LENGTH_METERS, TUNNELS_PER_CIRCUIT } from "./raceTunnels";

function fixture(id: string, length = 5800): Track {
  const count = 1500, radius = length / (Math.PI * 2);
  const samples: THREE.Vector3[] = [], tangents: THREE.Vector3[] = [], rights: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2 * Math.PI / count;
    samples.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)));
    tangents.push(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)));
    rights.push(new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)));
  }
  return {
    circuit: { id }, samples, tangents, rights, length,
    segmentLength: length / count, halfWidth: 9, barrierLateralOffset: 9
  } as Track;
}

describe("350m race tunnel placements", () => {
  for (const circuit of ["monzon", "suzaka"]) {
    it(`plans precisely three separated tunnels for ${circuit}`, () => {
      const track = fixture(circuit);
      const plans = planRaceTunnels(track);
      expect(plans).toHaveLength(TUNNELS_PER_CIRCUIT);
      expect(plans.map(p => p.id)).toEqual([
        `${circuit}-tunnel-1`, `${circuit}-tunnel-2`, `${circuit}-tunnel-3`
      ]);
      for (const plan of plans) {
        expect(plan.circuit).toBe(circuit);
        expect(plan.lengthMeters).toBe(TUNNEL_LENGTH_METERS);
        expect(plan.endMeters - plan.startMeters).toBe(350);
        expect(plan.startMeters).toBeGreaterThan(500);
        expect(plan.endMeters).toBeLessThan(track.length);
      }
      for (let i = 1; i < plans.length; i++)
        expect(plans[i].startMeters - plans[i - 1].endMeters).toBeGreaterThan(450);
      if (circuit === "monzon") expect(plans[0].startMeters).toBeGreaterThan(1050);
    });
  }

  it("does not add tunnels to unapproved layouts or incomplete tracks", () => {
    expect(planRaceTunnels(fixture("sparda"))).toEqual([]);
    expect(planRaceTunnels(fixture("monzon", 2000))).toEqual([]);
    const track = fixture("suzaka");
    track.samples = [];
    expect(planRaceTunnels(track)).toEqual([]);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("runtime portal meshes are constructed for both races", () => {
  // The atlas only needs a harmless Canvas2D stub for scene-graph tests.
  // Three.js never enters WebGL or loads textures in this unit test.
  for (const circuit of ["monzon", "suzaka"]) {
    it(`creates six glowing portal arches and 36 visible partners in ${circuit}`, () => {
      const ctx = {
        fillRect: () => undefined,
        strokeText: () => undefined,
        fillText: () => undefined
      };
      vi.stubGlobal("document", { createElement: () => ({
        width: 1024, height: 1600, getContext: () => ctx
      }) });
      const root = createRaceTunnels(fixture(circuit));
      expect(root.children).toHaveLength(3);
      expect(root.userData.tunnelCount).toBe(3);
      expect(root.userData.portals).toBe(6);
      expect(root.userData.entriesMeters).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        const tunnel = root.children[i] as THREE.Group;
        expect(tunnel.userData.tunnel.lengthMeters).toBe(350);
        expect(tunnel.userData.tunnel.physicsCollidersAdded).toBe(0);
        expect(tunnel.userData.tunnel.partnerPanels).toBe(12);
        for (const edge of ["entry", "exit"]) {
          const fascia = tunnel.getObjectByName(`${circuit}-tunnel-${i + 1}-${edge}-solid-portal`);
          const illuminated = tunnel.getObjectByName(`${circuit}-tunnel-${i + 1}-${edge}-luminous-portal`);
          expect(fascia).toBeInstanceOf(THREE.Mesh);
          expect(illuminated).toBeInstanceOf(THREE.Mesh);
          expect((illuminated as THREE.Mesh).geometry.getAttribute("position").count).toBeGreaterThan(200);
        }
        const ads = tunnel.getObjectByName(`${circuit}-tunnel-${i + 1}-interior-partners`);
        expect(ads?.userData.brandNames).toHaveLength(12);
      }
    });
  }
});
