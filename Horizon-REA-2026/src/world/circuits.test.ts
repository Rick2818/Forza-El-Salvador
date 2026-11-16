import { describe, expect, it } from "vitest";
import {
  CIRCUITS,
  analyzeCircuit,
  availableCircuits,
  buildCenterlinePoints,
  getCircuit,
  DEFAULT_CIRCUIT_ID
} from "./circuits";

describe("circuits", () => {
  it("ships at least three usable circuits", () => {
    expect(CIRCUITS.length).toBeGreaterThanOrEqual(3);
    expect(availableCircuits().length).toBe(CIRCUITS.length);
  });

  it.each(CIRCUITS.map((circuit) => [circuit.id, circuit] as const))(
    "%s closes its loop and reports no geometry problems",
    (_id, circuit) => {
      const metrics = analyzeCircuit(circuit.segments);
      expect(metrics.issues).toEqual([]);
      expect(metrics.ok).toBe(true);
      expect(metrics.netTurn).toBeCloseTo(360, 2);
      expect(metrics.closureGap).toBeLessThan(8);
      expect(metrics.minRadius).toBeGreaterThanOrEqual(35);
      expect(metrics.selfIntersections).toBe(0);
      expect(metrics.length).toBeGreaterThan(600);
    }
  );

  it("measures the length that the builder actually walks", () => {
    for (const circuit of CIRCUITS) {
      const metrics = analyzeCircuit(circuit.segments);
      // Straights plus arcs, computed from the definition itself.
      let expected = 0;
      for (const segment of circuit.segments) {
        if (segment.straight !== undefined) expected += segment.straight;
        else expected += (Math.abs(segment.turn ?? 0) * Math.PI * (segment.radius ?? 60)) / 180;
      }
      expect(metrics.length).toBeCloseTo(expected, 6);
    }
  });

  it("returns to the origin so the road has no last-metre jump", () => {
    for (const circuit of CIRCUITS) {
      const points = buildCenterlinePoints(circuit.segments);
      const last = points[points.length - 1];
      expect(Math.hypot(last.x, last.z)).toBeLessThan(1);
    }
  });

  it("resolves circuits by id and always has a valid default", () => {
    expect(getCircuit("libertad")?.name).toContain("La Libertad");
    expect(getCircuit("no-existe")).toBeUndefined();
    expect(getCircuit(DEFAULT_CIRCUIT_ID)).toBeDefined();
  });

  it("gives each circuit a distinct centre so terrain can follow it", () => {
    const centres = CIRCUITS.map((circuit) => {
      const metrics = analyzeCircuit(circuit.segments);
      return `${Math.round(metrics.centerX)}:${Math.round(metrics.centerZ)}`;
    });
    expect(new Set(centres).size).toBe(centres.length);
  });
});
