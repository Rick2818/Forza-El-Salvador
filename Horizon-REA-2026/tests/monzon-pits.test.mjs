import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track } from "../src/world/track";
import { MonzonGarages, GARAGE_LAYOUT } from "../src/world/monzonGarages";
import { GARAGE_WIDTH, GARAGE_DEPTH, GARAGE_SCALE } from "../src/world/monzonPitAccess";
import { createPitMechanics, mechanicStations, WORKSHOP_OBSTACLES, obstacleWorldBox } from "../src/world/monzonWorkshopContents";
import { getCircuit } from "../src/world/circuits";
import {
  MONZON_PIT_ENTRANCE, MONZON_PIT_EXIT, monzonPitBarrierGap,
  monzonGarageAt, inMonzonPitArea
} from "../src/world/monzonPitAccess";

beforeAll(async () => { await RAPIER.init(); });

function flatMonzon() {
  const track = new Track(getCircuit("monzon"));
  track.buildVisuals = () => {}; // no browser canvas needed for physics checks
  track.build();
  return track;
}

describe("Monzón: pits abiertos y talleres transitables", () => {
  it("keeps the guardrails closed except for the two marked service openings", () => {
    expect(monzonPitBarrierGap(102, 0, 15)).toBe(true);
    expect(monzonPitBarrierGap(270, 0, 15)).toBe(true);
    expect(monzonPitBarrierGap(198, 0, 15)).toBe(false);
    expect(monzonPitBarrierGap(102, 0, -15)).toBe(false);
    expect(monzonPitBarrierGap(102, 70, 15)).toBe(false);
    expect(MONZON_PIT_ENTRANCE.maxX).toBeLessThan(GARAGE_LAYOUT[0].x);
    expect(MONZON_PIT_EXIT.minX).toBeGreaterThan(GARAGE_LAYOUT.at(-1).x + GARAGE_WIDTH/2);
    const track = flatMonzon();
    const forward = track.wallGeometry(track.barrierLateralOffset, 1.35);
    const rear = track.wallGeometry(-track.barrierLateralOffset, 1.35);
    expect(forward.getIndex().count).toBeLessThan(rear.getIndex().count);
    forward.dispose(); rear.dispose();
  });

  it("finds each bay only after a vehicle crosses its open threshold", () => {
    expect(GARAGE_LAYOUT.map(b => monzonGarageAt(b.x, 35))).toEqual(
      ["FERRARI", "PORSCHE", "BUGATTI", "MERCEDES-BENZ", "LAMBORGHINI", "KOENIGSEGG", "YANGWANG"]);
    expect(monzonGarageAt(118, 27)).toBeNull();
    expect(monzonGarageAt(270, 36)).toBeNull();
    expect(inMonzonPitArea(118, 35)).toBe(true);
    expect(inMonzonPitArea(118, 0)).toBe(false);
  });

  it("offers a 20 percent wider and deeper service bay without overlaps", () => {
    expect(GARAGE_SCALE).toBeCloseTo(1.2);
    expect(GARAGE_WIDTH).toBeCloseTo(18.96);
    expect(GARAGE_DEPTH).toBeCloseTo(13.2);
    expect(GARAGE_LAYOUT).toHaveLength(7);
    for(let i=1;i<GARAGE_LAYOUT.length;i++){
      expect(GARAGE_LAYOUT[i].x-GARAGE_LAYOUT[i-1].x).toBeGreaterThan(GARAGE_WIDTH);
    }
    const workers=createPitMechanics(GARAGE_LAYOUT);
    expect(workers.userData.mechanics).toBe(14);
    expect(workers.userData.mechanicsPerGarage).toBe(2);
    expect(workers.children).toHaveLength(12);
    for(const bay of GARAGE_LAYOUT){
      expect(mechanicStations(bay.x)).toHaveLength(2);
      for(const worker of mechanicStations(bay.x)){
        expect(Math.abs(worker.x - bay.x)).toBeLessThan(GARAGE_WIDTH/2-1.2);
      }
      for(const prop of WORKSHOP_OBSTACLES){
        const b=obstacleWorldBox(bay.x,prop);
        expect(Math.abs(b.x-bay.x)+b.width/2).toBeLessThan(GARAGE_WIDTH/2);
      }
    }
  });

  it("permits a solid car to cross the pit entrance but blocks a closed barrier", () => {
    const track = flatMonzon();
    const world = new RAPIER.World({x:0,y:0,z:0});
    track.addPhysics(world);
    const car = (x) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 1, 4).setCcdEnabled(true).setLinearDamping(0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(.90, .35, 1.7), body);
      body.setLinvel({x:0,y:0,z:11},true);
      return body;
    };
    const entry = car(104);
    const blocked = car(152);
    for(let i=0;i<130;i++) world.step();
    expect(entry.translation().z).toBeGreaterThan(20);
    expect(blocked.translation().z).toBeLessThan(15);
    world.free();
  });

  it("lets a car enter an open garage while the rear wall stops it", () => {
    const world = new RAPIER.World({x:0,y:0,z:0});
    const garages = Object.create(MonzonGarages.prototype);
    garages.group = new THREE.Group();
    garages.physicsInstalled = false;
    garages.installPhysics(world);
    garages.installPhysics(world); // idempotent; no double collider
    expect(garages.group.userData.physicsInstalled).toBe(true);
    const car = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(134.5,1.1,27).setCcdEnabled(true).setLinearDamping(0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(.9,.35,1.45),car);
    car.setLinvel({x:0,y:0,z:7},true);
    for(let i=0;i<90;i++)world.step();
    expect(car.translation().z).toBeGreaterThan(31);
    expect(car.translation().z).toBeLessThan(43.0);
    world.free();
  });
});
