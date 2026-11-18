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
      if (scene.getObjectByName("Game_orientation") || scene.getObjectByName("Game orientation")) {
        scene.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(scene, true).getSize(new THREE.Vector3());
        const design = vehicleDesign(id);
        const lengthScale = design.length / size.z;
        const clearanceScale = design.height * 1.04 / size.y;
        scene.scale.setScalar(Math.min(lengthScale, clearanceScale));
      }
      scene.updateMatrixWorld(true);
      cache.set(id, scene);
    }).finally(() => { pending.delete(id); });
  pending.set(id, task);
  return task;
}

export function wheelConnections(id: string): { x: number; y: number; z: number; front: boolean }[] {
  const d = vehicleDesign(id);
  const scene = cache.get(id);
  if (scene) {
    return WHEEL_NAMES.map((name, index) => {
      const pivot = scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
      return { x: pivot.x, y: pivot.y - BODY_CENTER_Y + .235, z: pivot.z, front: index < 2 };
    });
  }
  return [1, -1].flatMap((end) => [1, -1].map((side) => ({
    x: side * d.track / 2,
    y: d.wheelRadius - BODY_CENTER_Y + .235,
    z: end * d.wheelbase / 2,
    front: end === 1
  })));
}

/**
 * The Ferrari California's approved race red must not be multiplied by the
 * Blender export's albedo tint. That multiplication was washing it out.
 * All other cars retain their authored paint colors and textures.
 */
export function applyVehiclePaint(
  id: string,
  authored: THREE.MeshStandardMaterial,
  paint: THREE.MeshPhysicalMaterial
): void {
  if (id === "ferrari-california-t") {
    paint.color.set("#d90818"); // deep, vivid Rosso Corsa-like red in sRGB
    paint.map = null;
    paint.metalness = 0.01;
    paint.roughness = 0.22;
    paint.clearcoat = 0.08;
    paint.clearcoatRoughness = 0.18;
    paint.envMapIntensity = 0;
    paint.opacity = 1;
    paint.transparent = false;
  } else {
    paint.map = authored.map;
    paint.color.copy(authored.color);
    paint.metalness = authored.metalness;
    paint.roughness = authored.roughness;
  }
  paint.needsUpdate = true;
}

/**
 * Some approved Blender shells were exported with inward-facing coachwork.
 * Standard front-face culling hides those panels from the chase camera,
 * making a solid car look transparent. Double-sided rendering restores the
 * outside without changing the mesh, physics, textures or approved paint.
 *
 * Bodywork and accessories are always solid; glass keeps its authored alpha.
 */
export function isVehicleGlass(name: string): boolean {
  // GLBs were authored in several languages: glass (Blender),
  // Cristal (Porsche), Vitrage (other selected supercars).
  return /glass|glazing|cristal|crystal|vitrage|vidrio|windshield|windscreen|window|parabrisas/i.test(name);
}

/**
 * The seven GLBs use different material names. Previously only the Ferrari
 * "paint" slot was recolored; most rival cars kept bright, reflective GLB
 * materials that looked white or pastel in the daylight sky.
 */
export function isVehicleBodyPaint(name: string): boolean {
  return /^(paint(?:[.][0-9]+)?|carrosserie|grafito metalizado|negro brillante)$/i.test(name);
}

export function isVehicleCabinMaterial(name: string): boolean {
  return /^(leather|cuero gris pizarra|cuir)$/i.test(name);
}

export function stabilizeVehicleFinish(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  // Every GLB material can otherwise reflect the bright blue PMREM sky.
  material.envMapIntensity = isVehicleBodyPaint(material.name) ? 0 : 0.14;
  if (isVehicleBodyPaint(material.name) && material instanceof THREE.MeshPhysicalMaterial) {
    // Direct sunlight also creates a white dielectric highlight, even without an env map.
    material.specularIntensity = 0.18;
    material.roughness = 0.34;
  }
  if (/^(rubber|caucho|pneu)$/i.test(material.name)) {
    material.color.set("#303238");
    material.map = null;
    material.metalness = 0;
    material.roughness = 0.8;
    material.emissive.set("#15171b");
    material.emissiveIntensity = 0.25;
  }
  if (isVehicleCabinMaterial(material.name)) {
    material.color.set("#222832");
    material.map = null;
    material.metalness = 0;
    material.roughness = 0.92;
  }
  material.needsUpdate = true;
}

/** No sky reflections on car glass: keep the cockpit legible even under bright sun.
 * A lightweight basic material also avoids expensive transparent PBR passes on Android.
 */
export function createVehicleGlassMaterial(authored: THREE.Material): THREE.MeshBasicMaterial {
  const glass = new THREE.MeshBasicMaterial({
    name: authored.name,
    color: 0x14181d, // neutral dark tint; clear view of cabin
    transparent: true,
    opacity: 0.06,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false
  });
  glass.forceSinglePass = true; // no double transparency pass for both sides
  return glass;
}

export function prepareSelectedMaterial(material: THREE.Material): void {
  material.side = THREE.DoubleSide;
  material.depthTest = true;
  material.blending = THREE.NormalBlending;
  material.alphaTest = 0;
  if (isVehicleGlass(material.name)) {
    // Some exported panes have alpha 0.038-0.26: almost invisible.
    // Give windows an intentional, readable tint without hiding the cockpit.
    material.transparent = true;
    material.opacity = 0.06;
    material.depthWrite = false;
    material.toneMapped = false;
    material.forceSinglePass = true;
    if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) {
      material.color.set("#14181d"); // nearly clear charcoal; no blue haze
      material.alphaMap = null;
    }
    if (material instanceof THREE.MeshStandardMaterial) {
      material.metalness = 0;
      material.roughness = 1;
      material.envMapIntensity = 0;
    }
    if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
  } else {
    // Never make paint, carbon, lights, cabin trim or body shells translucent.
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
  }
  material.needsUpdate = true;
}

export function createSelectedVisual(id: string): CarVisual {
  const source = cache.get(id);
  if (!source) throw new Error(`El modelo ${id} no está cargado`);
  const d = vehicleDesign(id);
  const root = new THREE.Group(); root.name = id;
  const bodyRoot = new THREE.Group(); bodyRoot.position.y = -BODY_CENTER_Y;
  root.add(bodyRoot);
  const imported = source.clone(true); bodyRoot.add(imported);
  // A saturated, low-reflection finish preserves each approved vehicle color.
  const paint = new THREE.MeshPhysicalMaterial({
    name: "paint",
    color: id === "ferrari-california-t" ? "#d90818" : d.paint,
    metalness: 0.01,
    roughness: 0.22,
    clearcoat: 0.08,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0,
    opacity: 1,
    transparent: false
  });
  const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff1020, emissive: 0xff0010, emissiveIntensity: 2 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xe5f4ff, emissive: 0xaaccff, emissiveIntensity: 3 });
  const materials = new Map<THREE.Material, THREE.Material>();
  imported.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    const cloneMat = (mat: THREE.Material): THREE.Material => {
      const cached = materials.get(mat); if (cached) return cached;
      let result: THREE.Material;
      if (isVehicleBodyPaint(mat.name)) {
        // Apply the curated body color to Carrosserie/Grafito/Negro as well,
        // not just English 'paint' meshes.
        if (id === "ferrari-california-t") {
          applyVehiclePaint(id, mat as THREE.MeshStandardMaterial, paint);
        } else {
          paint.map = null;
          paint.color.set(d.paint);
          paint.opacity = 1;
          paint.transparent = false;
        }
        result = paint;
      } else if (isVehicleGlass(mat.name)) {
        // Physical/glTF glass was reflecting the daylight sky like an opaque
        // blue sheet. Replace it with unlit, genuinely translucent smoked glass.
        result = createVehicleGlassMaterial(mat);
      } else if (mat.name === "taillight") result = taillightMat;
      else if (mat.name === "headlight") result = headlightMat;
      else result = mat.clone();
      stabilizeVehicleFinish(result);
      prepareSelectedMaterial(result);
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
    steer.position.set(w.x, w.y - .235, w.z);
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
