import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Track } from "./track";
import { planRaceTunnels, TUNNEL_LENGTH_METERS, TUNNELS_PER_CIRCUIT } from "./raceTunnels";

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
