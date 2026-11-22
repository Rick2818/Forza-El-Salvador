import {describe,it,expect} from "vitest";
import {balloonMotion,footballHullGeometry} from "./goodyearBalloon";
describe("visible Goodyear air balloon animation",()=>{
  it("moves deterministically on x,y,z and slowly turns",()=>{
    const a=balloonMotion(0),b=balloonMotion(12);
    expect(Math.abs(b.x-a.x)).toBeGreaterThan(8);
    expect(Math.abs(b.z-a.z)).toBeGreaterThan(5);
    expect(Math.abs(b.y-a.y)).toBeGreaterThan(1);
    expect(b.yaw).not.toBe(a.yaw);
  });
});

describe("Goodyear V15 football silhouette", () => {
  it("has sharp tips, a wider middle section, normals and UVs for 2026 wrap", () => {
    const hull = footballHullGeometry(48,9.5);
    const pos = hull.getAttribute("position");
    const uv = hull.getAttribute("uv");
    expect(pos.count).toBeGreaterThan(2500);
    expect(uv.count).toBe(pos.count);
    const step = 41;
    const first = 0, middle = 36 * step, last = 72 * step;
    expect(Math.abs(pos.getY(first))).toBeLessThan(.001);
    expect(Math.abs(pos.getZ(last))).toBeLessThan(.001);
    expect(Math.abs(pos.getZ(middle))).toBeGreaterThan(7);
    expect(hull.getAttribute("normal").count).toBe(pos.count);
    hull.dispose();
  });
});
