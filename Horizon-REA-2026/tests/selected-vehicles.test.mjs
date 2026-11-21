import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { VEHICLE_DESIGNS, loadSelectedVehicle, createSelectedVisual, disposeSelectedVisual,
  wheelConnections } from "../src/vehicle/selectedAsset";
import { Vehicle } from "../src/vehicle/vehicle";
import { Race } from "../src/race/race";

beforeAll(async () => {
  vi.stubGlobal("self", globalThis);
  vi.stubGlobal("ProgressEvent", class extends Event {
    constructor(type, init) { super(type); Object.assign(this, init); }
  });
  // Node has no image decoder. Keep real GLB parsing, geometry and materials;
  // replace only bitmap decoding. This test does not certify rendered textures.
  vi.stubGlobal("createImageBitmap", async () => ({ width: 128, height: 128, close() {} }));
  await RAPIER.init();
  const incomplete = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "incomplete" }] };
  await expect(loadSelectedVehicle(VEHICLE_DESIGNS[0].id,
    `data:application/json;base64,${Buffer.from(JSON.stringify(incomplete)).toString("base64")}`
  )).rejects.toThrow("falta el pivote");
  for (const design of VEHICLE_DESIGNS) {
    const glb = readFileSync(new URL(`../public/models/selected/${design.id}.glb`, import.meta.url));
    await loadSelectedVehicle(design.id, `data:model/gltf-binary;base64,${glb.toString("base64")}`);
  }
}, 30000);

afterAll(() => { vi.unstubAllGlobals(); });

describe("seven actual GLBs and live Rapier vehicles", () => {
  it("changes all seven grids and resets races without accumulating bodies or scene nodes", () => {
    const world = new RAPIER.World({ x: 0, y: -13.5, z: 0 });
    const scene = new THREE.Scene();
    const track = { segmentLength: 5, startIndex: 0,
      sampleAt: (i) => new THREE.Vector3(0, 0, i * 5),
      rightAt: () => new THREE.Vector3(1, 0, 0),
      tangentAt: () => new THREE.Vector3(0, 0, 1), progress: (i) => i / 100 };
    for (const design of VEHICLE_DESIGNS) {
      const race = new Race(world, scene, track, design.id);
      expect(world.bodies.len()).toBe(VEHICLE_DESIGNS.length);
      expect(race.player.vehicle.vehicleId).toBe(design.id);
      expect(new Set(race.racers.map((r) => r.vehicle.vehicleId)).size).toBe(VEHICLE_DESIGNS.length);
      const rivals = race.racers.filter((racer) => !racer.isPlayer);
      expect(rivals).toHaveLength(VEHICLE_DESIGNS.length - 1);
      expect(rivals.every((racer) => racer.ai?.vehicle === racer.vehicle)).toBe(true);
      expect(race.elapsed).toBe(0);
      expect(race.player.lap).toBe(1);
      race.dispose();
      expect(world.bodies.len()).toBe(0);
      expect(scene.children).toHaveLength(0);
    }
    world.free();
  });
  it.each([
    ["ferrari-california-t", "Ferrari_rear_brake_ring", "Sculpted_rear_valance"],
    ["porsche-911", null, null]
  ])("%s uses its approved paint and has visible rear lighting attached to the body", (id, lamp, trim) => {
    const visual = createSelectedVisual(id);
    if (id === "ferrari-california-t") {
      expect(visual.paint.isMeshPhysicalMaterial).toBe(true);
      expect(visual.paint.color.r).toBeCloseTo(.3375, 5);
      expect(visual.paint.clearcoat).toBeCloseTo(.17, 5);
      expect(visual.paint.opacity).toBe(1);
    } else {
      expect(visual.paint.isMeshPhysicalMaterial).toBe(true);
    }
    expect(visual.paint.transparent).toBe(false);
    const lights = [];
    visual.bodyRoot.traverse((object) => {
      if ([object.material].flat().includes(visual.taillightMat)) lights.push(object);
    });
    expect(lights.length).toBeGreaterThan(0);
    if (lamp) expect(lights.some((light) => light.name.startsWith(lamp))).toBe(true);
    if (trim) expect(visual.bodyRoot.getObjectByName(trim).geometry.attributes.position.count).toBeGreaterThan(0);
    disposeSelectedVisual(visual);
  });

  for (const design of VEHICLE_DESIGNS) {
    it(`${design.id}: correct pivots, bounded geometry and independent brake materials`, () => {
      const a = createSelectedVisual(design.id), b = createSelectedVisual(design.id);
      expect(a.wheels).toHaveLength(4);
      expect(a.taillightMat).not.toBe(b.taillightMat);
      const mounts = wheelConnections(design.id);
      a.wheels.forEach((wheel, i) => {
        expect(wheel.steer.position.x).toBeCloseTo(mounts[i].x, 5);
        expect(wheel.steer.position.z).toBeCloseTo(mounts[i].z, 5);
        const pivot = wheel.spin.children[0];
        expect(pivot.position.length()).toBeLessThan(.00001);
      });
      const size = new THREE.Box3().setFromObject(a.root).getSize(new THREE.Vector3());
      expect(size.z).toBeGreaterThan(design.length * .98);
      expect(size.z).toBeLessThan(design.length * 1.04);
      expect(size.y).toBeLessThan(design.height * 1.05);
      expect(size.x).toBeLessThan(design.width + .4); // body width excludes mirrors
      disposeSelectedVisual(a); disposeSelectedVisual(b);
    });

    it(`${design.id}: steers, moves under throttle and disposes without leaking physics bodies`, () => {
      const world = new RAPIER.World({ x: 0, y: -13.5, z: 0 });
      world.timestep = 1 / 60;
      world.createCollider(RAPIER.ColliderDesc.cuboid(100, .1, 100).setTranslation(0, -.1, 0));
      const scene = new THREE.Scene();
      const car = new Vehicle(world, scene, { vehicleId: design.id, paintColor: 0, accentColor: 0, number: 7 });
      car.place(new THREE.Vector3(0, 0, 0), 0);
      for (let i = 0; i < 120; i++) { car.update(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: false }, 1); world.step(); car.syncVisual(); }
      for (let i = 0; i < 240; i++) { car.update(1 / 60, { throttle: 1, brake: 0, steer: i > 150 ? .12 : 0, handbrake: false }, 1); world.step(); car.syncVisual(); }
      expect(car.body.translation().z).toBeGreaterThan(1);
      expect(car.speedKph).toBeGreaterThan(5);
      expect(car.steerAngle).toBeGreaterThan(0);
      expect(car.visual.wheels[0].spin.rotation.x).not.toBe(0);
      expect(Number.isFinite(car.body.translation().y)).toBe(true);
      expect(car.body.translation().y).toBeGreaterThan(.25);
      expect(car.body.translation().y).toBeLessThan(1.5);
      const q = car.body.rotation();
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w)).y).toBeGreaterThan(.8);
      car.dispose(world);
      expect(world.bodies.len()).toBe(0);
      expect(scene.children).toHaveLength(0);
      world.free();
    });
  }
});
