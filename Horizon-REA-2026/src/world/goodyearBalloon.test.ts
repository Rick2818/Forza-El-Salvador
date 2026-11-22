import {describe,it,expect} from "vitest";
import {
  balloonMotion,footballHullGeometry,GOODYEAR_ROUTE_RADIUS,GOODYEAR_ROUTE_PERIOD
} from "./goodyearBalloon";

describe("V18 bounded side-to-side flight",()=>{
  it("stays visible in a bounded corridor for a full race without wrapping",()=>{
    for(let t=0;t<1200;t+=.5) {
      const a=balloonMotion(t),b=balloonMotion(t+.01);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(GOODYEAR_ROUTE_RADIUS);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(10);
      expect(Math.hypot(b.x-a.x,b.z-a.z)).toBeLessThan(.04);
      expect(Number.isFinite(a.yaw)).toBe(true);
    }
  });
  it("reverses smoothly and repeats its position after one period",()=>{
    expect(balloonMotion(GOODYEAR_ROUTE_PERIOD/4).x).toBeCloseTo(GOODYEAR_ROUTE_RADIUS);
    expect(balloonMotion(GOODYEAR_ROUTE_PERIOD*3/4).x).toBeCloseTo(-GOODYEAR_ROUTE_RADIUS);
    expect(balloonMotion(GOODYEAR_ROUTE_PERIOD).x).toBeCloseTo(balloonMotion(0).x);
  });
});
describe("Goodyear football geometry", () => {
  it("has pointed ends, a wider middle section, normals and UVs for branding", () => {
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
