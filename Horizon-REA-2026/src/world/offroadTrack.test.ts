import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "./track";
import { OFFROAD_CIRCUIT } from "./offroadPrototype";
beforeAll(async()=>{await RAPIER.init()});
describe("Offroad engineering track",()=>{
 it("builds a graded closed mesh with matching physical support and differentiated grip",()=>{
  const t=new Track(OFFROAD_CIRCUIT);t.build();
  expect(t.samples.length).toBe(1500);
  expect(Math.max(...t.samples.map(p=>p.y))-Math.min(...t.samples.map(p=>p.y))).toBeGreaterThan(10);
  expect(t.group.getObjectByName("offroad-surface")).toBeInstanceOf(THREE.Mesh);
  expect(t.group.getObjectByName("offroad-solid-verges")).toBeInstanceOf(THREE.Mesh);
  expect(t.width).toBeCloseTo(6.8);
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
