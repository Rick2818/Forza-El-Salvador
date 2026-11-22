import {describe,it,expect} from "vitest";
import {balloonMotion,footballHullGeometry,GOODYEAR_WESTBOUND_SPEED,GOdescribe("V16 strict east-to-west flight",()=>{
  it("travels only towards world -X on a level fixed-Z corridor",()=>{
    expect(GOODYEAR_WESTBOUND_SPEED).toBeGreaterThan(0);
    expect(GOODYEAR_ROUTE_LENGTH).toBeGreaterThan(1600);
    for(let t=0;t<180;t+=10){
      const a=balloonMotion(t),b=balloonMotion(t+1);
      expect(b.x).toBeLessThan(a.x);
      expect(b.x-a.x).toBeCloseTo(-GOODYEAR_WESTBOUND_SPEED);
      expect(b.z).toBe(0);
      expect(Math.abs(b.y)).toBeLessThan(1);
      expect(Math.abs(b.yaw)).toBeLessThan(.02);
    }
  });
  it("resets only at distant off-camera extremes",()=>{
    const wrap=(GOODYEAR_ROUTE_LENGTH-640)/GOODYEAR_WESTBOUND_SPEED;
    const before=balloonMotion(wrap-.01),after=balloonMotion(wrap+.01);
    expect(before.x).toBeLessThan(-900);
    expect(after.x).toBeGreaterThan(810);
  });
});
;
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
