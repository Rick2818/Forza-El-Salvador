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
 it("classifies only the RAM shell candidate and never recolors trim or wheels",()=>{
  const root=new THREE.Group(),body=new THREE.Group();
  body.name="dodge_ramobjcleanermaterialmergergles";root.add(body);
  const shell=new THREE.MeshStandardMaterial({name:"1___Default",color:0xc2bebe});
  const coach=new THREE.Mesh(new THREE.BoxGeometry(2,1.3,5.5),shell);coach.name="Object_2";body.add(coach);
  const trim=new THREE.MeshStandardMaterial({name:"1___Default0",color:0x3d3d3d});
  const bumper=new THREE.Mesh(new THREE.BoxGeometry(2,.2,.3),trim);bumper.name="Object_3";body.add(bumper);
  const rim=new THREE.MeshStandardMaterial({name:"1___Default2",color:0xc2c2c2});
  const wheel=new THREE.Mesh(new THREE.BoxGeometry(.3,.8,.8),rim);wheel.name="Object_5";root.add(wheel);
  applyOffroadPickupFinish(root,new THREE.Color(0x111820),"ram-3500-alternative");
  expect(root.userData.offroadOpaquePaintMaterials).toBe(1);
  expect(shell.color.getHex()).toBe(0x111820);
  expect(shell.transparent).toBe(false);expect(shell.opacity).toBe(1);
  expect(trim.color.getHex()).toBe(0x3d3d3d);expect(rim.color.getHex()).toBe(0xc2c2c2);
 });
 it("does not assume a small generic RAM part is body paint",()=>{
  const root=new THREE.Group(),body=new THREE.Group();body.name="dodge_ramobjcleanermaterialmergergles";root.add(body);
  const mat=new THREE.MeshStandardMaterial({name:"1___Default",color:0xc2bebe});
  const part=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),mat);part.name="Object_2";body.add(part);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(2,1.5,5),new THREE.MeshStandardMaterial({name:"trim"})));
  applyOffroadPickupFinish(root,new THREE.Color(0x111820),"ram-3500-alternative");
  expect(root.userData.offroadOpaquePaintMaterials).toBe(0);expect(mat.color.getHex()).toBe(0xc2bebe);
 });
});
