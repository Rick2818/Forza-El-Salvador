import {describe,it,expect} from "vitest";
import {balloonMotion} from "./goodyearBalloon";
describe("visible Goodyear air balloon animation",()=>{
  it("moves deterministically on x,y,z and slowly turns",()=>{
    const a=balloonMotion(0),b=balloonMotion(12);
    expect(Math.abs(b.x-a.x)).toBeGreaterThan(8);
    expect(Math.abs(b.z-a.z)).toBeGreaterThan(5);
    expect(Math.abs(b.y-a.y)).toBeGreaterThan(1);
    expect(b.yaw).not.toBe(a.yaw);
  });
});
