import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { batchStaticScenery } from "./staticBatch";

describe("spatial scenery batching", () => {
  it("merges equivalent opaque materials but preserves different colors", () => {
    const root = new THREE.Group();
    const a = new THREE.MeshStandardMaterial({color: 0x335522, roughness: .8});
    const b = a.clone();
    const c = a.clone(); c.color.setHex(0x884422);
    for (const material of [a,b,c]) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    batchStaticScenery(root);
    const meshes = root.children.filter(o => o instanceof THREE.Mesh) as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    expect(meshes.some(m => m.material === c)).toBe(true);
    expect(meshes.find(m => m.material === a)?.geometry.index?.count).toBe(72);
  });
  it("preserves transformed bounds, transparency and distant culling cells", () => {
    const root = new THREE.Group(); root.position.set(13, 0, 20);
    const group = new THREE.Group(); group.position.set(5, 2, 0); root.add(group);
    const material = new THREE.MeshStandardMaterial();
    for (const x of [0, 10, 900]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), material);
      mesh.position.x = x; group.add(mesh);
    }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({transparent:true}));
    root.add(glass);
    const before = new THREE.Box3().setFromObject(root);
    batchStaticScenery(root);
    const after = new THREE.Box3().setFromObject(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(.0001);
    expect(after.max.distanceTo(before.max)).toBeLessThan(.0001);
    expect(glass.parent).toBe(root);
    let opaque = 0;
    root.traverse(object => { if (object instanceof THREE.Mesh && object.material === material) opaque++; });
    expect(opaque).toBe(2);
  });
});
