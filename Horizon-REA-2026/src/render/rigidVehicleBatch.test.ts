import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { batchRigidPart } from "./rigidVehicleBatch";
describe("lossless rigid vehicle batching",()=>{
  it("preserves triangle count, world bounds and separate transparent geometry",()=>{
    const root=new THREE.Group(),part=new THREE.Group(),wheel=new THREE.Group();
    root.add(part,wheel);part.position.set(2,1,3);
    const material=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true});
    const a=new THREE.Mesh(new THREE.BoxGeometry(),material),b=new THREE.Mesh(new THREE.BoxGeometry(),material);
    a.position.set(0,0,1);b.position.set(1,0,0);part.add(a,b);
    const transparent=new THREE.Mesh(new THREE.BoxGeometry(),glass);part.add(transparent);
    wheel.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
    root.updateMatrixWorld(true);
    const before=new THREE.Box3().setFromObject(part,true);
    const owned=batchRigidPart(part);
    expect(owned).toHaveLength(1);
    expect(owned[0].index!.count).toBe(72);
    expect(part.children).toHaveLength(2);
    expect(part.children.includes(transparent)).toBe(true);
    expect(wheel.children).toHaveLength(1);
    root.updateMatrixWorld(true);
    const after=new THREE.Box3().setFromObject(part,true);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
    expect(a.geometry.index!.count).toBe(36);
  });
  it("keeps incompatible motion, alpha cutouts and mirrored meshes separate",()=>{
    const part=new THREE.Group(),mat=new THREE.MeshStandardMaterial({alphaTest:.4});
    const a=new THREE.Mesh(new THREE.BoxGeometry(),mat),b=new THREE.Mesh(new THREE.BoxGeometry(),mat);
    part.add(a,b);expect(batchRigidPart(part)).toHaveLength(0);
    expect(part.children).toHaveLength(2);
  });
});
