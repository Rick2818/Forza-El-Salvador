import {describe,expect,it} from "vitest";
import {MONZON_BURST_COUNT,MONZON_FIREWORK_DURATION,MONZON_SPARK_TRAILS,
fireworkVisibility,monzonCinematicCameraActive,monzonFireworkBurstTime} from "./monzonFireworks";
describe("V14 grand prix fireworks",()=>{
  it("keeps player in control at green light and does not run in Suzaka",()=>{
    expect(monzonCinematicCameraActive("monzon",2)).toBe(true);
    expect(monzonCinematicCameraActive("monzon",.3)).toBe(false);
    expect(monzonCinematicCameraActive("suzaka",2)).toBe(false);
    expect(monzonCinematicCameraActive("monzon",2,false)).toBe(false);
  });
  it("adds 28 bursts with long-lived multistage trails",()=>{
    expect(MONZON_BURST_COUNT).toBe(28);
    expect(MONZON_SPARK_TRAILS).toBe(3);
    expect(monzonFireworkBurstTime(0)).toBeGreaterThan(0);
    expect(monzonFireworkBurstTime(15)).toBeGreaterThan(5);
    expect(monzonFireworkBurstTime(27)).toBeLessThan(MONZON_FIREWORK_DURATION-1);
  });
  it("fades particle cores without a hard visual cut",()=>{
    expect(fireworkVisibility(-.5)).toBe(0);
    expect(fireworkVisibility(.25)).toBeGreaterThan(.4);
    expect(fireworkVisibility(3.5)).toBe(0);
  });
});
