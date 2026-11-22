import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Vehicle } from "../vehicle/vehicle";
import { REVERSE_LIMIT_MS, REVERSE_ENGAGEMENT_MS, reverseDriveForce } from "./reverseGear";

describe("Fast, controlled reverse on all seven cars", () => {
  it("brakes forward first, then backs out with over 6x the old 2,200 N", () => {
    expect(reverseDriveForce(1, 12, 7400)).toBe(0);
    expect(reverseDriveForce(1, REVERSE_ENGAGEMENT_MS, 7400)).toBe(0);
    expect(reverseDriveForce(1, 0, 7400)).toBeGreaterThan(13200);
    expect(reverseDriveForce(1, -8, 7400)).toBeGreaterThan(13200);
    expect(reverseDriveForce(1, -15, 7400)).toBeGreaterThan(8000);
  });
  it("tapers before reverse speed cap and responds to the brake pedal", () => {
    expect(reverseDriveForce(1, -16, 7400)).toBeGreaterThan(0);
    expect(reverseDriveForce(1, -16, 7400)).toBeLessThan(6000);
    expect(reverseDriveForce(1, -REVERSE_LIMIT_MS, 7400)).toBe(0);
    expect(reverseDriveForce(1, -19, 7400)).toBe(0);
    expect(reverseDriveForce(0, -2, 7400)).toBe(0);
    expect(reverseDriveForce(.5, -4, 7400)).toBeCloseTo(reverseDriveForce(1, -4, 7400) / 2);
    expect(reverseDriveForce(1, NaN, 7400)).toBe(0);
  });
  it("governs real negative wheel-aligned velocity separately from forward speed", () => {
    let velocity = { x: 0, y: 0, z: -30 };
    const body = {
      linvel: () => velocity,
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      setLinvel: (v: typeof velocity) => { velocity = v; }
    };
    const car = Object.create(Vehicle.prototype) as Vehicle;
    Object.assign(car, {
      body, forceForward: new THREE.Vector3(),
      tuning: { topSpeed: 156.464 }, speed: 0
    });
    car.afterPhysicsStep();
    expect(velocity.z).toBeCloseTo(-REVERSE_LIMIT_MS, 5);
    expect(car.speed).toBeCloseTo(-REVERSE_LIMIT_MS, 5);
    velocity = { x: 0, y: 0, z: 35 };
    car.afterPhysicsStep();
    expect(velocity.z).toBeCloseTo(35, 5);
    expect(car.speed).toBeCloseTo(35, 5);
  });
});
