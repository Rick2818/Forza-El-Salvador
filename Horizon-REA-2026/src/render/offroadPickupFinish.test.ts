import * as THREE from "three";
import {describe,it,expect} from "vitest";
import {applyOffroadPickupFinish} from "./offroadPickupFinish";
describe("offroad paint",()=>{
 it("makes coachwork opaque while preserving glass, light and geometry",()=>{
  const root=new THREE.Group(),geo=new THREE.BoxGeometry();
  const paint=new THREE.MeshPhysicalMaterial({name:"body_paint",color:0x223344,transparent:true,opacity:.5,transmission:.5,metalness:1});
  const glass=new THREE.MeshPhysicalMaterial({name:"windshield",transmission:1});
  const light=new THREE.MeshStandardMaterial({name:"headlight",emissive:0xffffff});
  root.add(new THREE.Mesh(geo,paint),new THREE.Mesh(geo,glass),new THREE.Mesh(geo,light));
  applyOffroadPickupFinish(root);
  expect(paint.opacity).toBe(1);expect(paint.transparent).toBe(false);expect(paint.transmission).toBe(0);expect(paint.color.getHex()).toBe(0x223344);
  expect(glass.transparent).toBe(true);expect(glass.depthWrite).toBe(false);expect(light.emissive.getHex()).toBe(0xffffff);
 });
});
