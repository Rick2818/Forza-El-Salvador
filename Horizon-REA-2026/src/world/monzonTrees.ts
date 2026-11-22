import * as THREE from "three";
import { makeRng } from "../core/mathx";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";
import { buildBroadleaf, createBarkTexture, createBroadleafTexture } from "./vegetation";

/** Keep the original positions/density, but replace faceted blobs with actual
 * branching skeletons and hundreds of alpha-cut leaves per crown. Only four
 * instanced draw calls regardless of the number of trees. */
export const MONZON_TREE_BUDGET = 460;

export function monzonTreePlacementAllowed(x: number, z: number): boolean {
  // Preserve the clear approach to pit entrance, garages, grandstands and
  // finish gantry. The previous Monzon woodland used the same exclusion zone.
  return !(x > -60 && x < 700 && z > -155 && z < 102);
}

export function createMonzonOrganicTrees(track: Track, ground: TerrainField): THREE.Group {
  const root = new THREE.Group();
  root.name = "monzon-organic-tree-grove";
  const rng = makeRng(28182027);
  const variants = [buildBroadleaf(101), buildBroadleaf(202)];
  const barkMaterial = new THREE.MeshLambertMaterial({
    map: createBarkTexture(), color: 0xe0d6c6
  });
  const leafMaterial = new THREE.MeshLambertMaterial({
    map: createBroadleafTexture(),
    alphaTest: 0.34,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    transparent: false,
    color: 0xffffff
  });
  const matrices: THREE.Matrix4[][] = [[], []];
  const foliageColors: THREE.Color[][] = [[], []];
  const barkColors: THREE.Color[][] = [[], []];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const size = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const count = track.samples.length;

  for (let i = 0; i < MONZON_TREE_BUDGET; i++) {
    const idx = Math.floor(rng() * count);
    const road = track.sampleAt(idx);
    const right = track.rightAt(idx);
    const lateral = 34 + rng() * 120;
    const direction = i % 2 === 0 ? -1 : 1;
    const x = road.x + right.x * lateral * direction;
    const z = road.z + right.z * lateral * direction;
    if (!monzonTreePlacementAllowed(x, z)) continue;

    const variant = i % variants.length;
    const height = 11 + rng() * 10;
    const scale = height / variants[variant].height;
    rotation.setFromAxisAngle(up, rng() * Math.PI * 2);
    pos.set(x, ground.heightAt(x, z) - .04, z);
    size.set(scale * (.86 + rng() * .30), scale, scale * (.85 + rng() * .3));
    matrix.compose(pos, rotation, size);
    matrices[variant].push(matrix.clone());

    // Muted, realistic leaf variation rather than uniformly bright green
    // spheres. Instance color multiplies the authored leaf texture.
    foliageColors[variant].push(new THREE.Color().setHSL(
      0.27 + rng() * .075, .13 + rng() * .15, .74 + rng() * .17
    ));
    barkColors[variant].push(new THREE.Color().setHSL(
      .07 + rng() * .02, .055 + rng() * .08, .78 + rng() * .14
    ));
  }

  for (let variant = 0; variant < variants.length; variant++) {
    const entries = matrices[variant];
    if (entries.length === 0) continue;
    const source = variants[variant];
    const trunk = new THREE.InstancedMesh(source.bark, barkMaterial, entries.length);
    const foliage = new THREE.InstancedMesh(source.leaves, leafMaterial, entries.length);
    trunk.name = `monzon-tree-trunks-v${variant + 1}`;
    foliage.name = `monzon-tree-canopies-v${variant + 1}`;
    trunk.castShadow = false;
    foliage.castShadow = false;
    trunk.receiveShadow = false;
    foliage.receiveShadow = false;
    entries.forEach((transform, i) => {
      trunk.setMatrixAt(i, transform);
      foliage.setMatrixAt(i, transform);
      trunk.setColorAt(i, barkColors[variant][i]);
      foliage.setColorAt(i, foliageColors[variant][i]);
    });
    trunk.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    trunk.computeBoundingSphere();
    foliage.computeBoundingSphere();
    root.add(trunk, foliage);
  }
  root.userData.trees = matrices.reduce((sum, items) => sum + items.length, 0);
  root.userData.drawCalls = root.children.length;
  root.userData.leafCardsPerVariant = variants.map(asset => asset.leaves.index?.count ?? asset.leaves.getAttribute("position").count);
  return root;
}
