import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import designs from "./vehicle-designs.json";
import { BODY_CENTER_Y, type CarVisual } from "./carModel";

export type VehicleDesign = (typeof designs)[number];
export const VEHICLE_DESIGNS: readonly VehicleDesign[] = designs;
export const DEFAULT_SELECTED_ID = "ferrari-california-t";
const cache = new Map<string, THREE.Group>();
const pending = new Map<string, Promise<void>>();
export const WHEEL_NAMES = ["wheel_fr", "wheel_fl", "wheel_rr", "wheel_rl"] as const;

export function vehicleDesign(id: string): VehicleDesign {
  const result = designs.find((d) => d.id === id);
  if (!result) throw new Error(`Vehículo desconocido: ${id}`);
  return result;
}

export function hasSelectedAsset(id: string): boolean { return cache.has(id); }

/** Reject a missing/incomplete model rather than substituting the old generic car. */
export function loadSelectedVehicle(id: string, url?: string): Promise<void> {
  vehicleDesign(id);
  if (cache.has(id)) return Promise.resolve();
  const running = pending.get(id);
  if (running) return running;
  const task = new GLTFLoader().loadAsync(url ?? `${import.meta.env.BASE_URL}models/selected/${id}.glb`)
    .then(({ scene }) => {
      for (const name of WHEEL_NAMES) {
        if (!scene.getObjectByName(name)) throw new Error(`${id}: falta el pivote ${name}`);
      }
      scene.rotation.y = -Math.PI / 2;
      cache.set(id, scene);
    }).finally(() => { pending.delete(id); });
  pending.set(id, task);
  return task;
}

export function wheelConnections(id: string): { x: number; y: number; z: number; front: boolean }[] {
  const d = vehicleDesign(id);
  return [1, -1].flatMap((end) => [1, -1].map((side) => ({
    x: side * d.track / 2,
    y: d.wheelRadius - BODY_CENTER_Y + .235,
    z: end * d.wheelbase / 2,
    front: end === 1
  })));
}

export function createSelectedVisual(id: string): CarVisual {
  const source = cache.get(id);
  if (!source) throw new Error(`El modelo ${id} no está cargado`);
  const d = vehicleDesign(id);
  const root = new THREE.Group(); root.name = id;
  const bodyRoot = new THREE.Group(); bodyRoot.position.y = -BODY_CENTER_Y;
  root.add(bodyRoot);
  const imported = source.clone(true); bodyRoot.add(imported);
  const paint = new THREE.MeshPhysicalMaterial({ color: d.paint, metalness: .45,
    roughness: .22, clearcoat: 1, clearcoatRoughness: .10 });
  const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff1020, emissive: 0xff0010, emissiveIntensity: 2 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xe5f4ff, emissive: 0xaaccff, emissiveIntensity: 3 });
  const materials = new Map<THREE.Material, THREE.Material>();
  imported.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    const cloneMat = (mat: THREE.Material): THREE.Material => {
      const cached = materials.get(mat); if (cached) return cached;
      let result: THREE.Material;
      if (mat.name === "paint") {
        const authored = mat as THREE.MeshStandardMaterial;
        paint.map = authored.map; paint.color.copy(authored.color);
        paint.metalness = authored.metalness; paint.roughness = authored.roughness;
        result = paint;
      } else if (mat.name === "taillight") result = taillightMat;
      else if (mat.name === "headlight") result = headlightMat;
      else result = mat.clone();
      materials.set(mat, result);
      return result;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(cloneMat) : cloneMat(obj.material);
  });
  root.updateMatrixWorld(true);
  const wheels = WHEEL_NAMES.map((name, i) => {
    const authored = imported.getObjectByName(name)!;
    const steer = new THREE.Group(); const spin = new THREE.Group();
    const w = wheelConnections(id)[i];
    steer.position.set(w.x, d.wheelRadius - BODY_CENTER_Y, w.z);
    root.add(steer); steer.add(spin); root.updateMatrixWorld(true);
    // Preserve the Blender-authored orientation while moving to the live pivot.
    spin.attach(authored);
    authored.position.set(0, 0, 0);
    return { steer, spin };
  });
  return { root, bodyRoot, wheels, paint, taillightMat, headlightMat };
}

/** Geometries/textures belong to the model cache; only instance materials are freed. */
export function disposeSelectedVisual(visual: CarVisual): void {
  const materials = new Set<THREE.Material>([visual.paint, visual.taillightMat, visual.headlightMat]);
  visual.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat);
    }
  });
  for (const mat of materials) mat.dispose();
  visual.root.removeFromParent();
}
