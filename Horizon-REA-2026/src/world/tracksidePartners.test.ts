import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";
import { planTracksidePartners, TRACKSIDE_BRANDS } from "./tracksidePartners";

function circuitFixture(id: "monzon" | "suzaka"): Track {
  const samples: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const rights: THREE.Vector3[] = [];
  const count = 1500;
  const radius = 600;
  for (let i = 0; i < count; i++) {
    const a = i * 2 * Math.PI / count;
    const radialX = Math.cos(a);
    const radialZ = Math.sin(a);
    samples.push(new THREE.Vector3(radius * radialX, 0, radius * radialZ));
    tangents.push(new THREE.Vector3(-radialZ, 0, radialX));
    rights.push(new THREE.Vector3(-radialX, 0, -radialZ));
  }
  return { samples, tangents, rights, circuit: { id }, barrierLateralOffset: 10 } as Track;
}

const ground = { heightAt: (_x: number, _z: number) => 0 } as TerrainField;

describe("trackside partner billboards", () => {
  it("uses exactly the ten requested brand names", () => {
    expect(TRACKSIDE_BRANDS.map(brand => brand.name)).toEqual([
      "Aramco", "AWS", "DHL", "Heineken", "Lenovo", "LVMH",
      "MSC Cruises", "Pirelli", "Qatar Airways", "Salesforce"
    ]);
  });

  for (const circuit of ["monzon", "suzaka"] as const) {
    it(`places each partner twice on ${circuit}, outside all barriers`, () => {
      const track = circuitFixture(circuit);
      const placements = planTracksidePartners(track, ground);
      expect(placements).toHaveLength(20);
      for (let brandIndex = 0; brandIndex < TRACKSIDE_BRANDS.length; brandIndex++) {
        expect(placements.filter(item => item.brandIndex === brandIndex)).toHaveLength(2);
      }
      for (const item of placements) {
        const minDistance = Math.min(...track.samples.map(point =>
          Math.hypot(item.x - point.x, item.z - point.z)));
        expect(minDistance).toBeGreaterThan(track.barrierLateralOffset + 3);
      }
    });
  }

  it("omits signage if there is no built track", () => {
    const track = { ...circuitFixture("monzon"), samples: [] } as Track;
    expect(planTracksidePartners(track, ground)).toHaveLength(0);
  });
});
