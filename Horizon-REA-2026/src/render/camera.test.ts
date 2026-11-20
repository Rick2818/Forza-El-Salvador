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
  it("frames the rear tire contact points from the close camera", () => {
    const camera = new THREE.PerspectiveCamera(SETTINGS.camera.fov, 16 / 9, .1, 2000);
    const chase = new ChaseCamera(camera);
    chase.update(1 / 60, fakeCar(0), 0);
    expect(camera.position.z).toBeCloseTo(200 - SETTINGS.camera.distance, 4);
    expect(camera.position.x).toBeCloseTo(100 + SETTINGS.camera.lateralOffset, 4);
    camera.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const contact = new THREE.Vector3(100 + side * .95, 1.4 - .62, 200 - 1.35).project(camera);
      expect(Math.abs(contact.x)).toBeLessThan(.9);
      expect(contact.y).toBeGreaterThan(-.95);
    }
    expect(camera.fov).toBeLessThanOrEqual(59);
  });

  it("does not move far away at racing speeds", () => {
    const camera = new THREE.PerspectiveCamera(SETTINGS.camera.fov, 16 / 9, .1, 2000);
    const chase = new ChaseCamera(camera);
    chase.update(1 / 60, fakeCar(95), 1);
    expect(camera.position.z).toBeGreaterThan(194.95);
    expect(camera.position.z).toBeLessThan(195.3);
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
