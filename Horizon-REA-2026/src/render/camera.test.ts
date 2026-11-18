import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ChaseCamera } from "./camera";
import { SETTINGS } from "../core/settings";
import type { Vehicle } from "../vehicle/vehicle";

function fakeCar(speed: number): Vehicle {
  return {
    speed,
    body: {
      translation: () => ({ x: 100, y: 1.4, z: 200 }),
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 })
    }
  } as unknown as Vehicle;
}

describe("close-up chase camera for driver and vehicle details", () => {
  it("starts within four metres of the vehicle", () => {
    const camera = new THREE.PerspectiveCamera(SETTINGS.camera.fov, 16 / 9, .1, 2000);
    const chase = new ChaseCamera(camera);
    chase.update(1 / 60, fakeCar(0), 0);
    expect(camera.position.z).toBeCloseTo(200 - SETTINGS.camera.distance, 4);
    expect(camera.position.z).toBeGreaterThan(196);
    expect(camera.fov).toBeLessThanOrEqual(59);
  });

  it("does not move far away at racing speeds", () => {
    const camera = new THREE.PerspectiveCamera(SETTINGS.camera.fov, 16 / 9, .1, 2000);
    const chase = new ChaseCamera(camera);
    chase.update(1 / 60, fakeCar(95), 1);
    expect(camera.position.z).toBeGreaterThan(195.9);
    expect(camera.position.z).toBeLessThan(196.4);
    for (let i = 0; i < 120; i++) chase.update(1/60, fakeCar(95), i / 60);
    expect(camera.fov).toBeLessThanOrEqual(59.01);
  });

  it("offers a wider view on C while close-up is the default", () => {
    const camera = new THREE.PerspectiveCamera();
    const chase = new ChaseCamera(camera);
    expect(chase.mode).toBe("chase");
    expect(chase.toggle()).toBe("hood");
    expect(chase.toggle()).toBe("wide");
    expect(chase.toggle()).toBe("chase");
  });
});
