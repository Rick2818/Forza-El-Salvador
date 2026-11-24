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
  const coated=mesh.material as THREE.MeshStandardMaterial;
  expect(coated.color.equals(material.color)).toBe(false);
  expect(coated.map).toBe(material.map);
  expect(coated.opacity).toBe(material.opacity);
  expect(coated.onBeforeCompile).toBe(material.onBeforeCompile);
  const geom=mesh.geometry;
  for(let i=0;i<7200;i++)mud.update(root,.8+.2*i/7200,1/60);
  expect(mesh.material).toBe(coated);
  expect(mesh.geometry).toBe(geom);
  expect(coated.opacity).toBe(1);
  expect(coated.transparent).toBe(false);
  mud.dispose();expect(mesh.material).toBe(material);
  mesh.geometry.dispose();material.dispose();
 });
 it("applies heavier mud below the cabin with bounded material variants",()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({color:0xffffff});
  const lower=new THREE.Mesh(geometry,material),upper=new THREE.Mesh(geometry,material);
  lower.position.y=0;upper.position.y=2;root.add(lower,upper);
  const coating=new PickupMudCoating();coating.update(root,1,1/60);
  const low=lower.material as THREE.MeshStandardMaterial,high=upper.material as THREE.MeshStandardMaterial;
  expect(low).not.toBe(high);
  expect(low.color.r).toBeLessThan(high.color.r);
  expect(low.opacity).toBe(1);expect(high.opacity).toBe(1);
  for(let i=0;i<7200;i++)coating.update(root,1,1/60);
  expect(lower.material).toBe(low);expect(upper.material).toBe(high);
  coating.dispose();expect(lower.material).toBe(material);expect(upper.material).toBe(material);
  geometry.dispose();material.dispose();
 });
 it("never coats glass, lamps or alpha masked surfaces",()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry();
  const materials=[new THREE.MeshPhysicalMaterial({name:"windscreen",transmission:.9}),new THREE.MeshStandardMaterial({name:"taillight",emissive:0xff0000}),new THREE.MeshStandardMaterial({transparent:true,opacity:.2}),new THREE.MeshStandardMaterial({alphaTest:.5})];
  const meshes=materials.map(m=>new THREE.Mesh(geometry,m));root.add(...meshes);
  const mud=new PickupMudCoating();mud.update(root,1,1/60);
  meshes.forEach((m,i)=>expect(m.material).toBe(materials[i]));
  mud.dispose();geometry.dispose();materials.forEach(m=>m.dispose());
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
