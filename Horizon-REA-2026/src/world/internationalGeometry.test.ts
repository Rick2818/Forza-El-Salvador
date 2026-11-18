import { describe, expect, it } from "vitest";
import { auditInternational, internationalCenterline, internationalPoint } from "./internationalGeometry";

describe("Sparda and Sakhir Horizon circuits", () => {
  it("creates two closed original layouts with safe curves", () => {
    for (const id of ["sparda", "sakhir-horizon"] as const) {
      const a = auditInternational(id);
      expect(a.issues).toEqual([]);
      expect(a.ok).toBe(true);
      expect(a.closureGap).toBeLessThan(0.1);
      expect(a.minRadius).toBeGreaterThan(45);
      const samples = internationalCenterline(id);
      expect(samples.length).toBe(2000);
      const first = internationalPoint(id, 0);
      const last = internationalPoint(id, Math.PI * 2);
      expect(Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z)).toBeLessThan(.1);
    }
  });

  it("Sparda has a driveable, gradually sloped mountain surface", () => {
    const a = auditInternational("sparda");
    expect(a.length).toBeGreaterThan(6350);
    expect(a.length).toBeLessThan(6500);
    expect(a.relief).toBeGreaterThan(60);
    expect(a.maxGrade).toBeLessThan(.08);
    const points = internationalCenterline("sparda");
    for (let i=0;i<points.length;i++) {
      const p=points[i], q=points[(i+1)%points.length];
      expect(Math.abs(q.y-p.y)).toBeLessThan(1);
    }
  });

  it("Sakhir Horizon stays flat while preserving technical corners", () => {
    const a = auditInternational("sakhir-horizon");
    expect(a.length).toBeGreaterThan(5450);
    expect(a.length).toBeLessThan(5650);
    expect(a.maxGrade).toBe(0);
    expect(a.relief).toBe(0);
    expect(a.minRadius).toBeGreaterThanOrEqual(35);
  });
});
