import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { chooseVehicleLod, pressureLodDistance, VehicleBodyLod } from "./vehicleBodyLod";
describe("V28 vehicle body LOD",()=>{
  it("keeps a hysteresis band at each distance transition",()=>{
    expect(chooseVehicleLod(31,0)).toBe(0);
    expect(chooseVehicleLod(35,0)).toBe(1);
    expect(chooseVehicleLod(29,1)).toBe(1);
    expect(chooseVehicleLod(25,1)).toBe(0);
    expect(chooseVehicleLod(200,0)).toBe(3);
    expect(chooseVehicleLod(10,3)).toBe(0);
  });
  it("preserves close rivals and increases LOD distance only under pressure",()=>{
    expect(pressureLodDistance(10,true)).toBe(10);
    expect(pressureLodDistance(40,false)).toBe(40);
    expect(chooseVehicleLod(pressureLodDistance(25,true),0)).toBe(1);
    expect(chooseVehicleLod(pressureLodDistance(25,false),1)).toBe(0);
  });
  it("simplifies eligible opaque geometry and restores the original",async()=>{
    const root=new THREE.Group(),body=new THREE.Group(),wheel=new THREE.Group();
    root.add(body,wheel);
    const original=new THREE.SphereGeometry(1,64,32);
    const mesh=new THREE.Mesh(original,new THREE.MeshStandardMaterial());
    const glass=new THREE.Mesh(original,new THREE.MeshStandardMaterial({transparent:true}));
    const tyre=new THREE.Mesh(original,new THREE.MeshStandardMaterial());
    body.add(mesh,glass);wheel.add(tyre);
    const lod=new VehicleBodyLod();await lod.prepare(body);
    expect(lod.triangleCounts[3]).toBeLessThan(lod.triangleCounts[0]);
    lod.update(200);
    expect(mesh.geometry.index!.count).toBeLessThan(original.index!.count);
    expect(glass.geometry).toBe(original);expect(tyre.geometry).toBe(original);
    lod.update(10);expect(mesh.geometry).toBe(original);
    lod.dispose();expect(mesh.geometry).toBe(original);
  });
});
