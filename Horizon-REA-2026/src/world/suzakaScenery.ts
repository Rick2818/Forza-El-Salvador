import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { batchStaticScenery } from "../render/staticBatch";
import { circuitAssetUrl } from "./circuitAssets";
import type { Track } from "./track";
import { createNaturalMountainRange } from "./naturalMountains";

/** Place the authored building groups along the LIVE track, not the old
 * rectangular Blender reference. Their original boxes cut across Suzaka. */
export function relocateSuzakaBuildings(group: THREE.Group, track: Track): void {
  for (const [prefix, metres, side] of [["Paddock", 360, -1], ["Tribuna", 1400, 1]] as const) {
    group.updateMatrixWorld(true);
    const objects: THREE.Mesh[] = [];
    group.traverse(object => {
      if (object instanceof THREE.Mesh && object.name.startsWith(prefix)) objects.push(object);
    });
    if (!objects.length) throw new Error(`Suzaka: missing approved ${prefix}`);
    const building = new THREE.Group(); building.name = `suzaka-relocated-${prefix.toLowerCase()}`;
    group.add(building);
    objects.forEach(object => building.attach(object));
    const bounds = new THREE.Box3().setFromObject(building);
    const center = bounds.getCenter(new THREE.Vector3()); center.y = bounds.min.y;
    objects.forEach(object => object.position.sub(center));
    const size = bounds.getSize(new THREE.Vector3());
    const index = Math.round(metres / track.segmentLength);
    const anchor = track.sampleAt(index), tangent = track.tangentAt(index), right = track.rightAt(index);
    const yaw = Math.atan2(-tangent.z, tangent.x), cosine = Math.cos(yaw), sine = Math.sin(yaw);
    building.rotation.y = yaw;
    let clearance = 0;
    for (let offset = track.barrierLateralOffset + size.z / 2 + 10; offset < 420; offset += 5) {
      building.position.set(anchor.x + right.x * offset * side, anchor.y,
        anchor.z + right.z * offset * side);
      clearance = Infinity;
      for (const point of track.samples) {
        const dx = point.x - building.position.x, dz = point.z - building.position.z;
        const x = cosine * dx - sine * dz, z = sine * dx + cosine * dz;
        const distance = Math.hypot(Math.max(0, Math.abs(x) - size.x / 2),
          Math.max(0, Math.abs(z) - size.z / 2));
        clearance = Math.min(clearance, distance);
      }
      if (clearance > track.halfWidth + 12) break;
    }
    if (clearance <= track.halfWidth + 12) throw new Error(`Suzaka: unsafe ${prefix} clearance`);
    building.userData.roadClearanceMetres = clearance;
    building.userData.authoredMeshes = objects.length;
    building.updateMatrixWorld(true);
  }
}

/**
 * Reuses the approved, Blender-exported Suzaka GLB without rendering a second
 * overlapping road or barriers: those must come from the live Rapier track.
 */
export async function installSuzakaScenery(scene: THREE.Scene, track: Track): Promise<void> {
  const source = await new GLTFLoader().loadAsync(circuitAssetUrl("suzaka"));
  const group = source.scene;
  group.name = "suzaka-blender-scenery";
  relocateSuzakaBuildings(group, track);
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const name = object.name.toLowerCase();
    if (/arbol|sakura|pino|tree|vegetaci/.test(name)) { object.visible=false; return; }
    // The GLB's road/kerbs/walls are an editable modelling reference only.
    // Displaying them over the physics road would introduce z-fighting.
    if (/^(asfalto|linea|piano|proteccion|terreno)-/.test(name)) {
      object.visible = false;
      return;
    }
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });
  batchStaticScenery(group);
  scene.add(group);
}

/** Natural asymmetric mountain ridge system kept outside the figure-eight.
 * Retained export name for older calls, but the live track must now be passed
 * so the terrain starts safely beyond ALL sections of the circuit. */
export function createSuzakaMountain(track: Track): THREE.Group {
  const mountains=createNaturalMountainRange(track);
  mountains.name="suzaka-natural-volcanic-mountains";
  return mountains;
}
