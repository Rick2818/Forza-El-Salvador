import { describe,expect,it } from "vitest";
import {MONZON_BURST_COUNT,MONZON_FIREWORK_DURATION,monzonCinematicCameraActive,monzonFireworkBurstTime} from "./monzonFireworks";
describe("night-only Monzon launch show",()=>{
  it("provides a safe cinematic shot before green light",()=>{
    expect(monzonCinematicCameraActive("monzon",2)).toBe(true);
    expect(monzonCinematicCameraActive("suzaka",2)).toBe(false);
    expect(monzonCinematicCameraActive("monzon",.5)).toBe(false);
    expect(monzonCinematicCameraActive("monzon",3)).toBe(false);
    expect(monzonCinematicCameraActive("monzon",2,false)).toBe(false);
  });
  it("launches sixteen multicolour bursts across the entire introduction",()=>{
    expect(MONZON_BURST_COUNT).toBe(16);
    expect(monzonFireworkBurstTime(0)).toBeGreaterThan(0);
    expect(monzonFireworkBurstTime(15)).toBeGreaterThan(5);
    expect(monzonFireworkBurstTime(15)).toBeLessThan(MONZON_FIREWORK_DURATION);
  });
});
