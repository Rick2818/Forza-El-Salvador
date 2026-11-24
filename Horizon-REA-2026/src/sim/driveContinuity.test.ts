import { describe, expect, it } from "vitest";
import designs from "../vehicle/vehicle-designs.json";
import {
  dragForce, gearForSpeed, highSpeedCornerDriveFactor,
  rpmForSpeed, wheelForce
} from "./vehicleMath";

const EIGHTY_MPH_MS = 80 * 0.44704;

describe("Anti-estancamiento de aceleración para los diecisiete vehículos", () => {
  it.each(designs.map(d => [d.id, d.tuning.topSpeed, d.tuning.power, d.tuning.grip, d.powertrain] as const))(
    "%s: no hay techo mecánico a 80 MPH en una recta",
    (id, topSpeed, power, grip, powertrain) => {
      // Las pickups mantienen límites propios: el techo debe superar 80 MPH sin exigir 160 MPH.
      expect(topSpeed).toBeGreaterThan(EIGHTY_MPH_MS * 1.5);
      const rpm = rpmForSpeed(EIGHTY_MPH_MS, gearForSpeed(EIGHTY_MPH_MS));
      const force = powertrain === "electric"
        ? 7400 * power
        : wheelForce(EIGHTY_MPH_MS, 1, gearForSpeed(EIGHTY_MPH_MS), rpm) * .5 * power;
      const limiter = 1 - Math.pow(EIGHTY_MPH_MS / topSpeed, 3) * .36;
      expect(force * limiter * grip, id).toBeGreaterThan(dragForce(EIGHTY_MPH_MS) * 2);
    }
  );

  it("ningún motor se queda sin tracción a alta velocidad al girar", () => {
    for (const speed of [80, 90, 130, 200]) {
      for (const steer of [-1, -.35, .35, 1]) {
        const factor = highSpeedCornerDriveFactor(speed, steer);
        expect(factor).toBeGreaterThanOrEqual(.3 - 1e-9);
        expect(factor).toBeLessThanOrEqual(1);
      }
    }
    expect(highSpeedCornerDriveFactor(45, .35)).toBe(1);
    expect(highSpeedCornerDriveFactor(90, 0)).toBe(1);
  });
});
