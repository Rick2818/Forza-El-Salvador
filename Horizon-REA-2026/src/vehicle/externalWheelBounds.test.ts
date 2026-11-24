import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { indexedWorldBounds } from "./externalDriving";
describe("wheel mesh bounds",()=>{
  it("ignores vertices belonging to the other axle or corner",()=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute([
      -1,0,1,-1,1,1,-1,0,2, 1,0,-2,1,1,-2,1,0,-1
    ],3));
    geometry.setIndex([0,1,2]);
    const mesh=new THREE.Mesh(geometry);
    mesh.position.set(0,2,0);
    const b=indexedWorldBounds(mesh);
    expect(b.min.toArray()).toEqual([-1,2,1]);
    expect(b.max.toArray()).toEqual([-1,3,2]);
    const compact=geometry.toNonIndexed();
    expect(compact.attributes.position.count).toBe(3);
    expect(indexedWorldBounds(new THREE.Mesh(compact)).max.toArray()).toEqual([-1,1,2]);
  });
});
