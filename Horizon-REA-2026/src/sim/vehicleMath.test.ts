import { describe, expect, it } from "vitest";
import {
  ENGINE_IDLE_RPM,
  ENGINE_PEAK_RPM,
  ENGINE_REDLINE_RPM,
  dragForce,
  downforceN,
  engineTorqueAt,
  gearForSpeed,
  rpmForSpeed,
  steeringAngleAt,
  wheelForce
} from "./vehicleMath";

describe("vehicleMath", () => {
  it("keeps torque inside the usable engine envelope", () => {
    expect(engineTorqueAt(0)).toBeGreaterThan(0);
    expect(engineTorqueAt(ENGINE_PEAK_RPM)).toBeGreaterThan(engineTorqueAt(ENGINE_REDLINE_RPM));
    expect(engineTorqueAt(99999)).toBe(engineTorqueAt(ENGINE_REDLINE_RPM));
  });

  it("never reports an rpm below idle", () => {
    expect(rpmForSpeed(0, 0)).toBe(ENGINE_IDLE_RPM);
    expect(rpmForSpeed(40, 5)).toBeGreaterThan(ENGINE_IDLE_RPM);
  });

  it("selects taller gears as speed grows", () => {
    expect(gearForSpeed(0)).toBe(0);
    expect(gearForSpeed(35)).toBeGreaterThanOrEqual(gearForSpeed(5));
    expect(gearForSpeed(90)).toBe(5);
  });

  it("scales drag and downforce with the square of speed", () => {
    expect(dragForce(40)).toBeCloseTo(dragForce(20) * 4, 4);
    expect(downforceN(40)).toBeCloseTo(downforceN(20) * 4, 4);
    expect(downforceN(0)).toBe(0);
  });

  it("reduces steering lock with speed and keeps it bounded", () => {
    expect(steeringAngleAt(0, 0)).toBe(0);
    expect(steeringAngleAt(0, 1)).toBeCloseTo(0.52, 5);
    expect(Math.abs(steeringAngleAt(60, 1))).toBeLessThan(0.52);
    expect(Math.abs(steeringAngleAt(60, -1))).toBeLessThanOrEqual(0.52);
  });

  it("produces forward force only with throttle", () => {
    expect(wheelForce(10, 0, 1, 3000)).toBe(0);
    expect(wheelForce(10, 1, 1, 3000)).toBeGreaterThan(0);
  });
});
