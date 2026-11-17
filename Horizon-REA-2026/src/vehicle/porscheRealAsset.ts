import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createPorsche911Visual } from "./porsche911";
import type { CarOptions, CarVisual } from "./carModel";

/**
 * High-fidelity licensed 911 C4S body prepared by tools/blender/porsche-911.py.
 * GLB is deliberately opt-in until screenshot inspection and on-device FPS QA.
 */
export const PORSCHE_911_GLB = "/models/porsche-911-real.glb";
let asset: THREE.Group | null = null;
let inFlight: Promise<boolean> | null = null;

export function hasRealPorsche911(): boolean {
  return asset !== null;
}

export async function preloadRealPorsche911(): Promise<boolean> {
  if (asset) return true;
  if (inFlight) return inFlight;
  inFlight = new GLTFLoader()
    .loadAsync(PORSCHE_911_GLB)
    .then((gltf) => {
      let count = 0;
      gltf.scene.traverse((obj) => { if ((obj as THREE.Mesh).isMesh) count++; });
      if (!count) throw new Error("Porsche 911 GLB sin mallas");
      asset = gltf.scene;
      return true;
    })
    .catch((error: unknown) => {
      console.warn("[Horizon] Porsche 911 real no disponible; se usa el prototipo", error);
      inFlight = null;
      return false;
    });
  return inFlight;
}

/** Full body mesh with current four steering/suspension wheels from Horizon. */
export function createRealPorsche911Visual(opts: CarOptions): CarVisual {
  const visual = createPorsche911Visual(opts);
  if (!asset) return visual; // Explicit safe fallback: no white screen on loading failure.
  // Avoid rendering both the wedge and real body.
  visual.bodyRoot.clear();
  const group = asset.clone(true);
  group.name = "Porsche_911_C4S_Blender_Real";
  // Blender export: +X is the nose, +Z up; glTF/Three: +X nose, +Y up.
  // The physics engine is forward +Z, hence a 90-degree yaw.
  group.rotation.y = -Math.PI / 2;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const refs = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = refs.map((raw) => {
      const material = raw.clone();
      const tag = material.name.toLowerCase();
      if (tag.includes("glass") || tag.includes("windshield") ||
          tag.includes("window") || tag.includes("windscreen")) {
        const glazing = material as THREE.MeshStandardMaterial;
        glazing.transparent = true;
        glazing.opacity = 0.35;
        glazing.depthWrite = false;
        glazing.side = THREE.DoubleSide;
        glazing.roughness = 0.06;
        glazing.needsUpdate = true;
      } else if (/bodypaint|carpaint|exteriorpaint|paintbody/.test(tag)) {
        const colored = material as THREE.MeshStandardMaterial;
        colored.color.setHex(0x414246);
        colored.metalness = 0.80;
        colored.roughness = 0.21;
        colored.needsUpdate = true;
      }
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  visual.bodyRoot.add(group);
  return visual;
}
