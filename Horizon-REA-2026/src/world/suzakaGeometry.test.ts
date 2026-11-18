import { describe, expect, it } from "vitest";
import { auditSuzaka, suzakaCenterline, suzakaPoint, SUZAKA_BRIDGE_HEIGHT } from "./suzakaGeometry";

describe("Suzaka 3D bridge and racing layout", () => {
  it("forms a seamless closed figure-eight of approximately 5.64 km", () => {
    const audit = auditSuzaka();
    expect(audit.ok).toBe(true);
    expect(audit.issues).toEqual([]);
    expect(audit.closureGap).toBeLessThan(0.5);
    expect(audit.length).toBeGreaterThan(5600);
    expect(audit.length).toBeLessThan(5700);
    expect(suzakaCenterline().length).toBe(1800);
  });

  it("separates the crossed lanes by 12 metres in world height", () => {
    const low = suzakaPoint(0);
    const elevated = suzakaPoint(Math.PI);
    expect(low.x).toBeCloseTo(elevated.x, 6);
    expect(low.z).toBeCloseTo(elevated.z, 6);
    expect(elevated.y - low.y).toBeCloseTo(SUZAKA_BRIDGE_HEIGHT, 6);
  });

  it("keeps gradients driveable and curve radii safe", () => {
    const audit = auditSuzaka();
    expect(audit.maxGrade).toBeLessThan(0.08);
    expect(audit.minRadius).toBeGreaterThan(35);
  });

  it("never creates discontinuities or extreme changes in deck height", () => {
    const points = suzakaCenterline();
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      expect(Math.abs(b.y - a.y)).toBeLessThan(1);
    }
  });
});
