import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface MonzonTreeInstances {
  matrices: readonly THREE.Matrix4[];
  barkColors: readonly THREE.Color[];
  foliageColors: readonly THREE.Color[];
}

/**
 * Replace the always-available procedural trees only AFTER both Blender assets
 * have loaded successfully. A missing GLB never prevents the race from starting.
 * Both trunk and foliage remain instanced: four draw calls for the entire grove.
 */
export async function upgradeMonzonTreesFromBlender(
  root: THREE.Group, variants: readonly MonzonTreeInstances[]
): Promise<void> {
  const loader = new GLTFLoader();
  const models = await Promise.all(variants.map((_, i) =>
    loader.loadAsync(`${import.meta.env.BASE_URL}scenery/monzon-tree-v${i + 1}.glb`)
  ));
  const upgraded: THREE.InstancedMesh[] = [];
  for (let v = 0; v < models.length; v++) {
    const entries = variants[v];
    if (!entries.matrices.length) continue;
    const parts: THREE.Mesh[] = [];
    models[v].scene.updateMatrixWorld(true);
    models[v].scene.traverse(child => {
      if (child instanceof THREE.Mesh && !Array.isArray(child.material)) parts.push(child);
    });
    if (parts.length !== 2) throw new Error("Monzon Blender asset requires exactly bark and leaves meshes");
    for (const part of parts) {
      const leaves = /leaf|leaves|foliage/i.test(part.name);
      const authored = part.material as THREE.MeshStandardMaterial;
      const material = new THREE.MeshLambertMaterial({
        map: authored.map ?? null,
        color: 0xffffff,
        side: leaves ? THREE.DoubleSide : THREE.FrontSide,
        alphaTest: leaves ? .32 : 0,
        alphaToCoverage: leaves,
        depthWrite: true,
        transparent: false
      });
      if (material.map) {
        material.map.anisotropy = 8;
        material.map.minFilter = THREE.LinearMipmapLinearFilter;
        material.map.magFilter = THREE.LinearFilter;
      }
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
      const mesh = new THREE.InstancedMesh(geometry, material, entries.matrices.length);
      mesh.name = `monzon-blender-${leaves ? "foliage" : "bark"}-v${v + 1}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      entries.matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, (leaves ? entries.foliageColors : entries.barkColors)[i]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      upgraded.push(mesh);
    }
  }
  if (upgraded.length !== 4) throw new Error("Monzon Blender tree assets incomplete");
  const old = [...root.children];
  for (const mesh of upgraded) root.add(mesh);
  for (const child of old) root.remove(child);
  root.userData.source = "blender-three-pass";
  root.userData.drawCalls = upgraded.length;
}
