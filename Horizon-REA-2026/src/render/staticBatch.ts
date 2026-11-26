import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Keep spatial batches small enough for frustum culling. Transparent paint,
 * moving vehicles and instanced vegetation must never enter this function. */
export function batchStaticScenery(root: THREE.Group, cellSize = 160): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const bins = new Map<string, THREE.Mesh[]>();
  const center = new THREE.Vector3();
  // Compare serialized render properties, not material identity. Texture UUIDs
  // remain part of the signature; custom shader hooks are never deduplicated.
  const signatures = new Map<THREE.Material, string>();
  const signature = (m: THREE.Material): string => {
    const cached = signatures.get(m);
    if (cached !== undefined) return cached;
    let key = m.uuid;
    if ((m.type === "MeshStandardMaterial" || m.type === "MeshBasicMaterial" ||
         m.type === "MeshLambertMaterial") &&
        m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile &&
        m.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey) {
      const data = m.toJSON();
      delete data.uuid;
      delete data.name;
      key = JSON.stringify(data);
    }
    signatures.set(m, key);
    return key;
  };
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh ||
        object instanceof THREE.BatchedMesh || object.children.length ||
        object.matrixWorld.determinant() <= 0 || Object.keys(object.geometry.morphAttributes).length ||
        object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
        object.onAfterRender !== THREE.Object3D.prototype.onAfterRender ||
        !object.visible || Array.isArray(object.material) || object.material.transparent) return;
    for (let parent = object.parent; parent && parent !== root; parent = parent.parent) {
      if (!parent.visible) return;
    }
    object.getWorldPosition(center).applyMatrix4(inverse);
    const key = `${signature(object.material)}/${object.layers.mask}/${object.renderOrder}/${object.frustumCulled}/${Math.floor(center.x / cellSize)}/${Math.floor(center.z / cellSize)}/${object.receiveShadow}/${object.castShadow}`;
    const bin = bins.get(key) ?? [];
    bin.push(object);
    bins.set(key, bin);
  });
  for (const meshes of bins.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const batch = new THREE.Mesh(merged, meshes[0].material);
    batch.name = "static-batch";
    batch.layers.mask = meshes[0].layers.mask;
    batch.renderOrder = meshes[0].renderOrder;
    batch.frustumCulled = meshes[0].frustumCulled;
    batch.receiveShadow = meshes[0].receiveShadow;
    batch.castShadow = meshes[0].castShadow;
    meshes.forEach(mesh => mesh.removeFromParent());
    root.add(batch);
  }
}
