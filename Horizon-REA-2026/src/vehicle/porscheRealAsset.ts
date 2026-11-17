import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
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
    .setMeshoptDecoder(MeshoptDecoder)
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
  // Hide placeholder brake-caliper cubes from the procedural prototype. The
  // imported mesh already contains wheel hardware; these cubes visibly poke
  // outside its wheel arches in the Blender 911 screenshot.
  visual.root.traverse((object) => {
    if (object.name === "Porsche_ProceduralCaliper") object.visible = false;
  });
  const group = asset.clone(true);
  group.name = "Porsche_911_C4S_Blender_Real";
  // Blender export: +X is the nose, +Z up; glTF/Three: +X nose, +Y up.
  // The physics engine is forward +Z, hence a 90-degree yaw.
  const rawBounds = new THREE.Box3().setFromObject(group);
  const rawSize = rawBounds.getSize(new THREE.Vector3());
  // Both source and Blender GLBs are normalized at runtime to the existing
  // 2.68m wheelbase envelope; this also protects previews during pipeline QA.
  group.rotation.y = rawSize.x > rawSize.z ? -Math.PI / 2 : 0;
  group.updateMatrixWorld(true);
  const aligned = new THREE.Box3().setFromObject(group);
  const alignedSize = aligned.getSize(new THREE.Vector3());
  const scale = Math.min(4.64 / alignedSize.z, 2.02 / alignedSize.x);
  if (Number.isFinite(scale) && scale > 0) group.scale.multiplyScalar(scale);
  group.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(group);
  const center = fitted.getCenter(new THREE.Vector3());
  group.position.set(-center.x, -fitted.min.y, -center.z);
  group.updateMatrixWorld(true);
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

  // The licensed Blender GLB already includes four tyre assemblies. Reusing
  // the procedural tyres as well made the car look like it had eight wheels.
  // Split the source tyre mesh by wheel quadrant and attach each quarter to
  // Horizon's existing steer + spin hierarchy (Rapier suspension is unchanged).
  const tyreSource = group.getObjectByName("Object_10") as THREE.Mesh | undefined;
  if (tyreSource?.isMesh) {
    visual.root.updateMatrixWorld(true);
    const bodyInverse = visual.bodyRoot.matrixWorld.clone().invert();
    const toBody = bodyInverse.multiply(tyreSource.matrixWorld);
    const original = tyreSource.geometry;
    const positions = original.getAttribute("position") as THREE.BufferAttribute;
    const srcIndex = original.index;
    const counts = [0, 0, 0, 0];
    const triangles: number[][] = [[], [], [], []];
    const low = Array.from({length: 4}, () => new THREE.Vector3(Infinity,Infinity,Infinity));
    const high = Array.from({length: 4}, () => new THREE.Vector3(-Infinity,-Infinity,-Infinity));
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    const count = srcIndex ? srcIndex.count : positions.count;
    const getVertex = (i: number, p: THREE.Vector3) =>
      p.fromBufferAttribute(positions, i).applyMatrix4(toBody);
    for (let t = 0; t + 2 < count; t += 3) {
      const i0 = srcIndex ? srcIndex.getX(t) : t;
      const i1 = srcIndex ? srcIndex.getX(t+1) : t+1;
      const i2 = srcIndex ? srcIndex.getX(t+2) : t+2;
      getVertex(i0, a); getVertex(i1, b); getVertex(i2, d);
      const side = (a.x+b.x+d.x) > 0 ? 0 : 1;
      const axle = (a.z+b.z+d.z) > 0 ? 0 : 1;
      const k = axle * 2 + side;
      triangles[k].push(i0,i1,i2);
      counts[k]++;
      low[k].min(a).min(b).min(d);
      high[k].max(a).max(b).max(d);
    }
    // An unexpected source-model topology should never hide the wheels.
    if (counts.every(n => n > 500)) {
      tyreSource.visible = false;
      for (let k = 0; k < 4; k++) {
        const wheel = visual.wheels[k];
        // Remove the old chunky procedural rim and tyre from this 911 only.
        wheel.spin.clear();
        const center = low[k].clone().add(high[k]).multiplyScalar(0.5);
        wheel.steer.position.x = center.x;
        wheel.steer.position.z = center.z;
        const geo = original.clone();
        geo.setIndex(triangles[k]);
        geo.applyMatrix4(toBody);
        // bodyRoot has a -0.62m offset, while the wheel controller places
        // each steering pivot around -0.255m from the physical chassis.
        geo.translate(-center.x, -0.62 - wheel.steer.position.y, -center.z);
        geo.computeBoundingSphere();
        const part = new THREE.Mesh(geo,tyreSource.material);
        part.name = `Blender_Porsche_Tyre_${k}`;
        part.castShadow = true;
        wheel.spin.add(part);
      }
    } else {
      // The original source wheels remain visible; suppress duplicate tyres.
      for (const wheel of visual.wheels) wheel.spin.visible = false;
    }
  } else {
    // Future GLB variants may name their tyre mesh differently.
    for (const wheel of visual.wheels) wheel.spin.visible = false;
  }
  return visual;
}
