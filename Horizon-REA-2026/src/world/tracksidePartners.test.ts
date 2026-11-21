import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";
import { planTracksidePartners, TRACKSIDE_BRANDS, TARGET_TRACKSIDE_SIGNS } from "./tracksidePartners";

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
  const length = 2 * Math.PI * radius;
  return { samples, tangents, rights, length, segmentLength: length / count,
    circuit: { id }, barrierLateralOffset: 10 } as Track;
}

const ground = { heightAt: (_x: number, _z: number) => 0 } as TerrainField;

describe("trackside partner billboards", () => {
  it("uses exactly the ten requested brand names", () => {
    expect(TRACKSIDE_BRANDS.map(brand => brand.name)).toEqual([
      "Aramco", "AWS", "DHL", "Heineken", "Lenovo", "LVMH",
      "MSC Cruises", "Pirelli", "Qatar Airways", "Salesforce"
    ]);
  });

  it("retains the approved V7 sRGB color triplets exactly", () => {
    expect(TRACKSIDE_BRANDS).toEqual([
      { name: "Aramco", background: "#00A19B", foreground: "#FFFFFF", accent: "#7CE0C3" },
      { name: "AWS", background: "#1A2A44", foreground: "#FFFFFF", accent: "#FF9900" },
      { name: "DHL", background: "#FFCC00", foreground: "#D40511", accent: "#D40511" },
      { name: "Heineken", background: "#006B3F", foreground: "#FFFFFF", accent: "#E1251B" },
      { name: "Lenovo", background: "#E2231A", foreground: "#FFFFFF", accent: "#B51E17" },
      { name: "LVMH", background: "#111111", foreground: "#F4F1EA", accent: "#C7A86D" },
      { name: "MSC Cruises", background: "#003B70", foreground: "#FFFFFF", accent: "#D9E4F2" },
      { name: "Pirelli", background: "#FFD100", foreground: "#C8102E", accent: "#C8102E" },
      { name: "Qatar Airways", background: "#5C1635", foreground: "#FFFFFF", accent: "#D8C3CB" },
      { name: "Salesforce", background: "#00A1E0", foreground: "#FFFFFF", accent: "#BFEFFF" }
    ]);
    for (const brand of TRACKSIDE_BRANDS) {
      expect(brand.background).toMatch(/^#[0-9A-F]{6}$/);
      expect(brand.foreground).toMatch(/^#[0-9A-F]{6}$/);
      expect(brand.accent).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  for (const circuit of ["monzon", "suzaka"] as const) {
    it(`distributes every partner throughout the complete ${circuit} lap, safely`, () => {
      const track = circuitFixture(circuit);
      const placements = planTracksidePartners(track, ground);
      expect(TARGET_TRACKSIDE_SIGNS).toBe(80);
      // Pit/bridge clearance may legitimately skip slots but never cluster
      // displaced signs at the start or remove brands from the back of lap.
      expect(placements.length).toBeGreaterThanOrEqual(65);
      for (let brandIndex = 0; brandIndex < TRACKSIDE_BRANDS.length; brandIndex++) {
        expect(placements.filter(item => item.brandIndex === brandIndex).length).toBeGreaterThanOrEqual(5);
      }
      const sectors = Array.from({length: 8}, () => 0);
      for (const item of placements) {
        sectors[Math.floor(item.sampleIndex / track.samples.length * 8)]++;
        const minDistance = Math.min(...track.samples.map(point =>
          Math.hypot(item.x - point.x, item.z - point.z)));
        expect(minDistance).toBeGreaterThan(track.barrierLateralOffset + 3);
      }
      // Includes middle and last portions, rather than only the first sector.
      expect(sectors.filter(n => n > 0).length).toBeGreaterThanOrEqual(7);
      expect(sectors.slice(4).reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
    });
  }

  it("omits signage if there is no built track", () => {
    const track = circuitFixture("monzon");
    track.samples = [];
    expect(planTracksidePartners(track, ground)).toHaveLength(0);
  });
});
