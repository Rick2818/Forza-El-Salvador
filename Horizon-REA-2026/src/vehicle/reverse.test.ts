import { describe, expect, it } from "vitest";
import { reverseDriveForce } from "../sim/vehicleMath";
describe("Reversa aprovechable",()=>{
  it("brakes at speed before selecting reverse",()=>{
    expect(reverseDriveForce(5,1)).toBe(0);
    expect(reverseDriveForce(0.6,1)).toBe(0);
    expect(reverseDriveForce(0,1)).toBeGreaterThan(9000);
  });
  it("allows powerful reverse and limits its maximum gently",()=>{
    expect(reverseDriveForce(-5,1)).toBeGreaterThan(9000);
    expect(reverseDriveForce(-12,1)).toBeGreaterThan(0);
    expect(reverseDriveForce(-14,1)).toBe(0);
    expect(reverseDriveForce(-15,1)).toBe(0);
    expect(reverseDriveForce(0,0)).toBe(0);
  });
});
