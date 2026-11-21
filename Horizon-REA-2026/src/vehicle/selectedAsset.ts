import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import designs from "./vehicle-designs.json";
import { SELECTED_VEHICLES } from "./roster";
import { BODY_CENTER_Y, createSolidPaintMaterial, type CarVisual } from "./carModel";

export type VehicleDesign = (typeof designs)[number];
export const VEHICLE_DESIGNS: readonly VehicleDesign[] = SELECTED_VEHICLES.map((car) => designs.find((design) => design.id === car.id)!);
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
  const revision = id === DEFAULT_SELECTED_ID ? "?rev=cherry" : "";
  const task = new GLTFLoader().loadAsync(url ?? `${import.meta.env.BASE_URL}models/selected/${id}.glb${revision}`)
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
  return /^(leather|cuero gris pizarra|cuir|interior_charcoal)$/i.test(name);
}

export function stabilizeVehicleFinish(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  // Every GLB material can otherwise reflect the bright blue PMREM sky.
  material.envMapIntensity = 0.14;
  if (/^(rubber|tire rubber|caucho|pneu)$/i.test(material.name)) {
    material.color.set("#3a3c42");
    material.map = null;
    material.metalness = 0;
    material.roughness = 0.72;
    // Lift the darkest parts of the sidewall against the unlit asphalt.
    material.emissive.set("#404249");
    material.emissiveIntensity = 0.52;
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
  const isFerrari = id === DEFAULT_SELECTED_ID;
  const isPorsche = id === "porsche-911";
  const hasRevisedFinish = isFerrari || isPorsche;
  // Keep the Cherry base color and soft coat authored in Blender.
  const ferrariPaint = isFerrari ? source.getObjectsByProperty("isMesh", true)
    .flatMap((object) => (object as THREE.Mesh).material)
    .find((material): material is THREE.MeshPhysicalMaterial =>
      material instanceof THREE.MeshPhysicalMaterial && isVehicleBodyPaint(material.name)) : undefined;
  const paint = isFerrari && ferrariPaint ? ferrariPaint.clone() : isPorsche ? new THREE.MeshPhysicalMaterial({
    name: "paint", color: 0x15171c,
    metalness: .12, roughness: .28,
    clearcoat: .55, clearcoatRoughness: .23, specularIntensity: .36
  }) : createSolidPaintMaterial(d.paint);
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff1020, emissive: 0xff0010, emissiveIntensity: 2,
    toneMapped: !hasRevisedFinish
  });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xe5f4ff, emissive: 0xaaccff, emissiveIntensity: 3 });
  const materials = new Map<THREE.Material, THREE.Material>();
  imported.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    const cloneMat = (mat: THREE.Material): THREE.Material => {
      const cached = materials.get(mat); if (cached) return cached;
      let result: THREE.Material;
      if (isVehicleBodyPaint(mat.name)) {
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
      if (hasRevisedFinish && isVehicleGlass(mat.name)) result.opacity = .13;
      if (isFerrari && mat.name === "rim" && result instanceof THREE.MeshStandardMaterial) {
        result.color.set(0x85878a);
        result.metalness = .55;
        result.roughness = .38;
      }
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
  // A rigid body and each wheel spin independently. Batch only within those
  // parts, preserving every vertex, normal, UV, material and live wheel pivot.
  const owned: THREE.BufferGeometry[] = [];
  for (const part of [bodyRoot, ...wheels.map(wheel => wheel.spin)]) {
    part.updateWorldMatrix(true, true);
    const inverse = part.matrixWorld.clone().invert();
    const bins = new Map<string, THREE.Mesh[]>();
    part.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) ||
          object.material.transparent || object instanceof THREE.SkinnedMesh) return;
      // Keep the named, approved Ferrari rear details individually inspectable.
      if (/^(Ferrari_rear_brake_ring|Sculpted_rear_valance)/.test(object.name)) return;
      const attributes = Object.keys(object.geometry.attributes).sort().map(name => {
        const a = object.geometry.getAttribute(name);
        return `${name}:${a.itemSize}:${a.normalized}`;
      }).join("/");
      const key = `${object.material.uuid}/${!!object.geometry.index}/${attributes}/${object.castShadow}/${object.receiveShadow}`;
      const bin = bins.get(key) ?? []; bin.push(object); bins.set(key, bin);
    });
    for (const meshes of bins.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (!geometry) continue;
      geometry.computeBoundingSphere(); owned.push(geometry);
      const merged = new THREE.Mesh(geometry, meshes[0].material);
      merged.name = "rigid-vehicle-batch";
      merged.castShadow = meshes[0].castShadow; merged.receiveShadow = meshes[0].receiveShadow;
      for (const mesh of meshes) {
        for (const child of [...mesh.children]) part.attach(child);
        mesh.removeFromParent();
      }
      part.add(merged);
    }
  }
  root.userData.ownedBatchGeometry = owned;
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
  for (const geometry of visual.root.userData.ownedBatchGeometry ?? []) geometry.dispose();
  visual.root.removeFromParent();
}
