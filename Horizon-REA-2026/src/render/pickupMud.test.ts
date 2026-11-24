import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { accumulateMud, PickupMudCoating } from "./pickupMud";
import { OFFROAD_SECTORS } from "../world/offroadPrototype";
describe("Heavy offroad mud",()=>{
 it("does not replace the original material on a clean pickup and restores it after exposure",()=>{
  const root=new THREE.Group(), material=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);root.add(mesh);
  const mud=new PickupMudCoating();
  mud.update(root,0,1/60);
  expect(mesh.material).toBe(material);
  mud.update(root,.8,1/60);
  expect(mesh.material).not.toBe(material);
  const shader={uniforms:{},vertexShader:"#include <begin_vertex>",fragmentShader:"#include <map_fragment>"};
  (mesh.material as THREE.Material).onBeforeCompile(shader as never,null as never);
  expect(shader.fragmentShader).toContain("float mudPattern");
  expect(shader.fragmentShader).not.toMatch(/float\s+patch\b/);
  mud.dispose();expect(mesh.material).toBe(material);
  mesh.geometry.dispose();material.dispose();
 });
 it("covers 80 percent of the planned lap",()=>{
  expect(OFFROAD_SECTORS.filter(s=>s.surface!=="dirt").reduce((n,s)=>n+s.end-s.start,0)).toBeCloseTo(.8);
 });
 it("becomes very dirty after repeated mud exposure and stays dirty on dry ground",()=>{
  let c=0;
  for(let i=0;i<600;i++) c=accumulateMud(c,"mud",10,1/60,1);
  expect(c).toBeGreaterThan(.98);
  expect(accumulateMud(c,"dirt",0,1/60,1)).toBe(c);
  expect(accumulateMud(c,undefined,10,1/60,1)).toBe(c);
 });
 it("does not accumulate while airborne or stationary",()=>{
  expect(accumulateMud(.2,"puddle",10,.1,0)).toBe(.2);
  expect(accumulateMud(.2,"puddle",0,.1,1)).toBe(.2);
 });
});
