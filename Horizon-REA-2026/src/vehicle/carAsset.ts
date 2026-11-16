import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Blender-authored car shells (option B: player + rival).
 *
 * The GLB only carries the outside of the car (body, greenhouse, carbon aero).
 * Wheels, lights, decals and the physics body stay procedural, so a new model
 * can be dropped in without touching the driving code.
 *
 * Blender exports +X as the nose and +Z as up; glTF is Y-up, so the loaded
 * scene is rotated to make +Z the nose (the convention used by the vehicle).
 * The origin sits on the ground plane, which is where bodyRoot expects it.
 */

export type CarVariant = "player" | "rival";

/**
 * Master switch for the Blender shells. They are loaded and wired, but the
 * procedural body still reads better on track: the imported shell has no
 * fender masses or character lines yet, so it shows as a flat slab from the
 * chase camera. Flip to true once the modeling pass is finished.
 */
export const USE_BLENDER_SHELL = false;

export const CAR_ASSETS: Record<CarVariant, string> = {
  player: "/models/car-body.glb",
  rival: "/models/car-body-rival.glb"
};

const cache = new Map<CarVariant, THREE.Group>();
const pending = new Map<CarVariant, Promise<THREE.Group | null>>();

function prepare(root: THREE.Group): THREE.Group {
  root.rotation.y = -Math.PI / 2;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
  });
  return root;
}

/** Loads once per variant; later calls reuse the result (including failures). */
export function preloadCarAsset(
  variant: CarVariant,
  url: string = CAR_ASSETS[variant]
): Promise<THREE.Group | null> {
  const cached = cache.get(variant);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(variant);
  if (inFlight) return inFlight;

  const promise = new GLTFLoader()
    .loadAsync(url)
    .then((gltf) => {
      const scene = prepare(gltf.scene);
      cache.set(variant, scene);
      return scene;
    })
    .catch((error: unknown) => {
      console.warn(`[Horizon] no se pudo cargar el coche ${variant}`, error);
      return null;
    });
  pending.set(variant, promise);
  return promise;
}

export function getCarAsset(variant: CarVariant): THREE.Group | null {
  return cache.get(variant) ?? null;
}

/**
 * Deep clone with per-mesh material replacement, keyed by the material name
 * exported from Blender ("paint", "glass", "carbon", "trim").
 */
export function cloneCarAsset(
  variant: CarVariant,
  materials: Record<string, THREE.Material>
): THREE.Group | null {
  const source = cache.get(variant);
  if (!source) return null;

  const clone = source.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material;
    const list = Array.isArray(original) ? original : [original];
    const mapped = list.map((mat) => {
      const name = mat.name.toLowerCase();
      if (name.includes("paint")) return materials.paint ?? mat;
      if (name.includes("glass")) return materials.glass ?? mat;
      if (name.includes("carbon")) return materials.carbon ?? mat;
      if (name.includes("trim")) return materials.trim ?? mat;
      return materials.trim ?? mat;
    });
    mesh.material = Array.isArray(original) ? mapped : mapped[0];
  });
  return clone;
}
