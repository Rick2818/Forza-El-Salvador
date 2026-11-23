import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ChaseCamera } from "./camera";
import { SETTINGS } from "../core/settings";
import type { Vehicle } from "../vehicle/vehicle";

function fakeCar(speed: number, vehicleId?: string): Vehicle {
  return {
    speed,
    vehicleId,
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

  it("keeps the final chase camera inside a trackside boundary", () => {
    const camera = new THREE.PerspectiveCamera();
    const chase = new ChaseCamera(camera);
    chase.update(1 / 60, fakeCar(25), 0, (position) => {
      position.x = Math.min(position.x, 101);
    });
    expect(camera.position.x).toBe(101);
    expect(camera.position.z).toBeLessThan(200);
  });

  it("offers a wider view on C while close-up is the default", () => {
    const camera = new THREE.PerspectiveCamera();
    const chase = new ChaseCamera(camera);
    expect(chase.mode).toBe("chase");
    expect(chase.toggle()).toBe("hood");
    expect(chase.toggle()).toBe("wide");
    expect(chase.toggle()).toBe("chase");
  });

  it("snaps first and third person to the same vehicle without old-camera lag", () => {
    const camera=new THREE.PerspectiveCamera();
    const chase=new ChaseCamera(camera);
    const car=fakeCar(0);
    chase.update(1/60,car,0);
    const third=camera.position.clone();
    expect(chase.toggle()).toBe("hood");
    chase.update(1/60,car,0);
    const driverEye=camera.position.clone();
    expect(driverEye.z).toBeCloseTo(199.89);
    expect(driverEye.x).toBeCloseTo(100 - 1.9 * .181);
    expect(driverEye.y).toBeCloseTo(1.88);
    expect(driverEye.distanceTo(third)).toBeGreaterThan(4);
    chase.setMode("chase");
    chase.update(1/60,car,0);
    expect(camera.position.distanceTo(third)).toBeLessThan(.001);
  });

  it("connects cockpit heading to vehicle yaw changes immediately", () => {
    const camera=new THREE.PerspectiveCamera();
    const chase=new ChaseCamera(camera);
    chase.setMode("hood");
    const turningCar={
      speed:0,
      body:{
        translation:()=>({x:0,y:1,z:0}),
        rotation:()=>({x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2})
      }
    } as unknown as Vehicle;
    chase.update(1/60,turningCar,0);
    const direction=new THREE.Vector3();
    camera.getWorldDirection(direction);
    expect(direction.x).toBeGreaterThan(.98);
    // The camera is seated left of centre and just behind the dash, not
    // placed outside the front bonnet as the previous fixed-offset view was.
    expect(camera.position.x).toBeLessThan(0);
    expect(camera.position.z).toBeGreaterThan(0);
  });

  it("adapts the driver's eye to each approved cabin instead of clipping low roofs", () => {
    const high = new THREE.PerspectiveCamera(), low = new THREE.PerspectiveCamera();
    const ferrari = new ChaseCamera(high), lamborghini = new ChaseCamera(low);
    ferrari.setMode("hood");
    lamborghini.setMode("hood");
    ferrari.update(1/60, fakeCar(0, "ferrari-california-t"), 0);
    lamborghini.update(1/60, fakeCar(0, "lamborghini-aventador-roadster"), 0);
    expect(high.position.y).toBeCloseTo(1.905);
    expect(low.position.y).toBeCloseTo(1.716);
    expect(low.position.y).toBeLessThan(high.position.y - .15);
    expect(high.position.x).toBeCloseTo(100 - 1.91 * .181);
    expect(low.position.x).toBeCloseTo(100 - 2.03 * .181);
  });

  it("keeps the cockpit locked to the chassis during hard cornering", () => {
    const camera = new THREE.PerspectiveCamera(), chase = new ChaseCamera(camera);
    chase.setMode("hood");
    const yaw = new THREE.Quaternion();
    const car = {
      speed: 95, vehicleId: "porsche-911",
      body: {
        translation: () => ({ x: 10, y: 1.4, z: 20 }),
        rotation: () => ({ x: yaw.x, y: yaw.y, z: yaw.z, w: yaw.w })
      }
    } as unknown as Vehicle;
    chase.update(1/60, car, 0);
    yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    chase.update(1/60, car, 1/60);
    const target = new THREE.Vector3(-1.9 * .181, .485, -.11)
      .applyQuaternion(yaw).add(new THREE.Vector3(10, 1.4, 20));
    expect(camera.position.distanceTo(target)).toBeLessThan(1e-6);
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    expect(direction.x).toBeGreaterThan(.98);
  });

  it("does not float above the seat on lower-elevation track sections", () => {
    const camera = new THREE.PerspectiveCamera(), chase = new ChaseCamera(camera);
    const car = {
      ...fakeCar(0, "ferrari-california-t"),
      body: {
        translation: () => ({ x: 0, y: -.5, z: 0 }),
        rotation: () => ({ x: 0, y: 0, z: 0, w: 1 })
      }
    } as unknown as Vehicle;
    chase.setMode("hood");
    chase.update(1/60, car, 0);
    expect(camera.position.y).toBeCloseTo(.005);
  });
});

it("anticipates a forward bend while retaining the close camera position",()=>{
 const camera=new THREE.PerspectiveCamera(),chase=new ChaseCamera(camera),car=fakeCar(40);
 chase.update(1/60,car,0,undefined,new THREE.Vector3(110,1.4,220));
 const towards=new THREE.Vector3();camera.getWorldDirection(towards);
 const straight=new THREE.PerspectiveCamera(),other=new ChaseCamera(straight);other.update(1/60,car,0);
 const baseline=new THREE.Vector3();straight.getWorldDirection(baseline);
 expect(towards.x).toBeGreaterThan(baseline.x);expect(camera.position.distanceTo(straight.position)).toBeLessThan(.08);
});
