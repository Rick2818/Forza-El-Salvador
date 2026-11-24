import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CarVisual, WheelVisual } from "./carModel";

let source: THREE.Group | null = null;
/** Assets use Vite's base path, including when served from a subdirectory. */
const assetUrl = import.meta.env.BASE_URL + "models/california-ruby-game.glb";

export async function preloadConvertible(): Promise<void> {
  try {
    const gltf = await new GLTFLoader().loadAsync(assetUrl);
    const names = ["wheel_front_L", "wheel_front_R", "wheel_rear_L", "wheel_rear_R"];
    for (const name of names) {
      if (!gltf.scene.getObjectByName(name)) throw new Error("Falta rueda: " + name);
    }
    source = gltf.scene;
  } catch (error) {
    source = null;
    console.warn("[Horizon] Convertible no disponible; se conserva el carro anterior.", error);
  }
}

/** The approved complete car replaces the player visual, without overlaying
 * procedural bodywork, wheels, decals or lamps on top of the imported model.
 * Physics stays with the existing Rapier vehicle controller.
 */
export function createConvertibleVisual(bodyCenterY: number): CarVisual | null {
  if (!source) return null;
  const raw = source.clone(true);
  // Blender +X nose, +Z up -> glTF +X nose, +Y up -> game +Z nose.
  raw.rotation.y = -Math.PI / 2;
  raw.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.name = "California Ruby";
  const bodyRoot = new THREE.Group();
  bodyRoot.position.y = -bodyCenterY;
  root.add(bodyRoot);
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xb41422, metalness: .25, roughness: .26,
    clearcoat: .45, clearcoatRoughness: .1
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x650305, emissive: 0xff1710, emissiveIntensity: 2.4,
    metalness: .15, roughness: .25
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xe8f3ff, emissive: 0xffeedb, emissiveIntensity: 2,
    roughness: .16
  });
  // Approximate thin automotive glass without a transmission render pass.
  const glass = new THREE.MeshStandardMaterial({
    color: 0xb4d1df, transparent: true, opacity: .22,
    metalness: .05, roughness: .12, depthWrite: false, side: THREE.DoubleSide
  });
  const materialCache = new Map<string, THREE.Material>();
  function runtimeMaterial(original: THREE.Material): THREE.Material {
    if (materialCache.has(original.uuid)) return materialCache.get(original.uuid)!;
    const name = original.name.toLowerCase();
    let result: THREE.Material;
    if (name.includes("paint_ruby")) result = paint;
    else if (name.includes("tail_lens")) result = taillightMat;
    else if (name === "headlamp") result = headlightMat;
    else if (name === "glass" || name.includes("clear_headlight") || name.includes("clear headlight")) result = glass;
    else result = original.clone();
    materialCache.set(original.uuid, result);
    return result;
  }
  const wheelNames = ["wheel_front_L", "wheel_front_R", "wheel_rear_L", "wheel_rear_R"];
  const wheelNodes = wheelNames.map((name) => raw.getObjectByName(name)!);
  function wheelIndex(node: THREE.Object3D): number {
    for (let p: THREE.Object3D | null = node; p; p = p.parent) {
      const index = wheelNodes.indexOf(p);
      if (index >= 0) return index;
    }
    return -1;
  }
  const centers = wheelNodes.map((node) => node.getWorldPosition(new THREE.Vector3()));
  // Front right, front left, rear right, rear left matches Vehicle.WHEELS.
  // Blender +Y becomes game +X, so named L is the positive game-X wheel.
  const wheels: WheelVisual[] = centers.map((center) => {
    const steer = new THREE.Group();
    steer.position.set(Math.sign(center.x) * .9, center.y - bodyCenterY, Math.sign(center.z) * 1.34);
    const spin = new THREE.Group();
    steer.add(spin);
    root.add(steer);
    return { steer, spin };
  });
  const batches = new Map<string, { target: THREE.Group; mat: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  raw.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.geometry) return;
    if (Array.isArray(node.material)) throw new Error("Exportador: se esperaba un material por malla.");
    const wi = wheelIndex(node);
    const target = wi < 0 ? bodyRoot : wheels[wi].spin;
    const mat = runtimeMaterial(node.material);
    const geo = node.geometry.clone();
    geo.applyMatrix4(node.matrixWorld);
    if (wi >= 0) geo.translate(-centers[wi].x, -centers[wi].y, -centers[wi].z);
    // A uniform position+normal layout permits material batching even when
    // some imported pieces have UVs and others do not.
    const plain = geo.index ? geo.toNonIndexed() : geo;
    for (const attr of Object.keys(plain.attributes)) {
      if (attr !== "position" && attr !== "normal") plain.deleteAttribute(attr);
    }
    if (!plain.getAttribute("normal")) plain.computeVertexNormals();
    if (plain !== geo) geo.dispose();
    const key = wi + ":" + mat.uuid;
    let batch = batches.get(key);
    if (!batch) {
      batch = { target, mat, geometries: [] };
      batches.set(key, batch);
    }
    batch.geometries.push(plain);
  });
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometries, false);
    if (!geometry) throw new Error("No se pudieron agrupar las piezas del convertible.");
    batch.geometries.forEach((part) => part.dispose());
    const mesh = new THREE.Mesh(geometry, batch.mat);
    mesh.castShadow = batch.mat !== glass;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    batch.target.add(mesh);
  }
  root.userData.carAsset = "california-ruby-game.glb";
  root.userData.drawMeshes = batches.size;
  return { root, bodyRoot, wheels, paint, taillightMat, headlightMat };
}
