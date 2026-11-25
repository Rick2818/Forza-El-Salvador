import { describe, expect, it } from "vitest";
import { analyzeCircuitDefinition } from "./circuits";
import { OFFROAD_CIRCUIT, OFFROAD_SECTORS, OFFROAD_PICKUP_IDS, isOffroadEligible, offroadSectorAt, offroadElevation, offroadDriveMultiplier, offroadBrakeAcceleration, offroadSpeedLimit } from "./offroadPrototype";
describe("El Imposible 4x4 prototype", () => {
  it("closes the loop and meets the existing track geometry contract", () => {
    const a = analyzeCircuitDefinition(OFFROAD_CIRCUIT);
    expect(a.ok).toBe(true);
    expect(a.netTurn).toBeCloseTo(360);
    expect(a.closureGap).toBeLessThan(1);
    expect(a.selfIntersections).toBe(0);
    expect(a.corners).toBe(16);
    expect(OFFROAD_CIRCUIT.segments.filter(s=>s.dir===-1).length).toBe(4);
    expect(a.minRadius).toBeGreaterThanOrEqual(35);
  });
  it("covers the whole lap and wraps at the seam", () => {
    expect(OFFROAD_SECTORS[0].start).toBe(0);
    expect(OFFROAD_SECTORS.at(-1)?.end).toBe(1);
    OFFROAD_SECTORS.slice(1).forEach((s,i) => expect(s.start).toBe(OFFROAD_SECTORS[i].end));
    expect(offroadSectorAt(1)).toEqual(offroadSectorAt(0));
    expect(offroadSectorAt(.25).surface).toBe("mud");
    expect(offroadSectorAt(.4).surface).toBe("puddle");
    expect(offroadElevation(1)).toBeCloseTo(offroadElevation(0));
  });
  it("only accepts the three approved pickup identifiers", () => {
    OFFROAD_PICKUP_IDS.forEach(id => expect(isOffroadEligible(id)).toBe(true));
    expect(isOffroadEligible("ferrari")).toBe(false);
  });
  it("limits descent speed and brakes lateral drift only with contact",()=>{
    expect(offroadSpeedLimit("puddle")).toBeLessThan(offroadSpeedLimit("mud"));
    expect(offroadSpeedLimit("mud")).toBeLessThan(offroadSpeedLimit("dirt"));
    expect(offroadBrakeAcceleration(12,4,1,.44,0,"mud","4H")).toBe(0);
    expect(offroadBrakeAcceleration(0,0,1,.44,1,"mud","4H")).toBe(0);
    expect(offroadBrakeAcceleration(12,4,1,.44,1,"mud","4H")).toBeGreaterThan(4);
    expect(offroadBrakeAcceleration(12,4,1,.32,1,"puddle","4H")).toBeLessThan(5);
    expect(offroadBrakeAcceleration(3,0,0,.44,1,"mud","4H")).toBe(0);
  });
  it("models lower traction in mud and a contact-dependent 4H advantage", () => {
    const all = [true,true,true,true];
    expect(offroadDriveMultiplier("4H", all, .25)).toBeGreaterThan(offroadDriveMultiplier("2H", all, .25));
    expect(offroadDriveMultiplier("4H", all, .4)).toBeLessThan(offroadDriveMultiplier("4H", all, .1));
    expect(offroadDriveMultiplier("2H", [true,true,false,false], .25)).toBe(0);
    expect(offroadDriveMultiplier("4H", [true,true,false,false], .25)).toBeGreaterThan(0);
    expect(offroadDriveMultiplier("4H", [false,false,false,false], .25)).toBe(0);
  });
});
