import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { batchStaticScenery } from "./staticBatch";

describe("spatial scenery batching", () => {
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
