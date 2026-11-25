import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "./track";
import { OFFROAD_CIRCUIT, offroadVergeHeight } from "./offroadPrototype";
beforeAll(async()=>{await RAPIER.init()});
describe("Offroad engineering track",()=>{
 it("builds a graded closed mesh with matching physical support and differentiated grip",()=>{
  const t=new Track(OFFROAD_CIRCUIT);t.build();
  expect(t.samples.length).toBe(1500);
  expect(Math.max(...t.samples.map(p=>p.y))-Math.min(...t.samples.map(p=>p.y))).toBeGreaterThan(10);
  expect(t.group.getObjectByName("offroad-surface")).toBeInstanceOf(THREE.Mesh);
  expect(t.group.getObjectByName("offroad-solid-verges")).toBeInstanceOf(THREE.Mesh);
  expect(t.width).toBeCloseTo(6.8);
  expect(offroadVergeHeight(20,0)).toBe(20);
  expect(offroadVergeHeight(20,7)).toBeGreaterThan(19.9);
  expect(offroadVergeHeight(20,36)).toBeCloseTo(-1);
  expect(offroadVergeHeight(20,18)).toBeGreaterThan(10);
  const relief=t.group.getObjectByName("offroad-surface")!.userData.reliefAudit;
  expect(relief.minRelief).toBeLessThan(-.40);
  expect(relief.maxUphill).toBeGreaterThan(.12);
  expect(relief.maxDownhill).toBeLessThan(-.18);
  expect(relief.maxUphill).toBeGreaterThan(.18);
  const spawn=t.samples[t.startIndex];
  const firstHill=t.samples[(t.startIndex+Math.round(22/t.segmentLength))%t.samples.length];
  expect(firstHill.y-spawn.y).toBeGreaterThan(1.5);
  const water=t.group.getObjectByName("offroad-muddy-puddles")!.userData.waterAudit;
  expect(water.basins).toBeGreaterThan(8);
  expect(water.waterArea).toBeGreaterThan(30);
  expect(water.maxWaterDepth).toBeGreaterThan(.22);
  expect(t.waterDepthAt(t.startIndex,10)).toBe(0);
  expect(t.group.getObjectByName("offroad-solid-rocks")?.userData.rockCount).toBeGreaterThan(80);
  const idx=(fraction:number)=>Math.round(t.startIndex+t.samples.length*fraction)%t.samples.length;
  expect(t.gripAt(idx(.4),0)).toBeLessThan(t.gripAt(idx(.25),0));
  expect(t.gripAt(idx(.25),0)).toBeLessThan(t.gripAt(idx(.05),0));
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  try {
   t.addPhysics(world);
   const p=t.samples[idx(.4)];
   const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y+2,p.z).setCcdEnabled(true));
   world.createCollider(RAPIER.ColliderDesc.ball(.25),b);
   for(let i=0;i<120;i++) world.step();
   expect(b.translation().y).toBeGreaterThan(p.y-.5);
  }finally{world.free()}
 });
});
