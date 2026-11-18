import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { makeRng } from "../core/mathx";
import { createBannerTexture } from "./textures";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";

type InternationalId = "sparda" | "sakhir-horizon";

/** Paint a lightweight mountain backdrop or low desert hills without heavy mesh textures. */
function backdrop(scene: THREE.Scene, track: Track, mountain: boolean): void {
  const centerX = (Math.min(...track.samples.map(p => p.x)) + Math.max(...track.samples.map(p => p.x))) / 2;
  const centerZ = (Math.min(...track.samples.map(p => p.z)) + Math.max(...track.samples.map(p => p.z))) / 2;
  const parts = 96, verts: number[] = [], indices: number[] = [];
  const radius = mountain ? 1750 : 1450;
  for (let i = 0; i <= parts; i++) {
    const phase = i * 2 * Math.PI / parts;
    const r = radius + 65 * Math.sin(phase * 4) + 40 * Math.sin(phase * 11);
    const elevation = mountain
      ? 125 + 135 * Math.abs(Math.sin(phase * 3.5 + 0.2)) + 55 * Math.sin(phase * 13)
      : 15 + 30 * Math.abs(Math.sin(phase * 6.5)) + 13 * Math.sin(phase * 11);
    const x = centerX + Math.cos(phase) * r;
    const z = centerZ + Math.sin(phase) * r;
    verts.push(x, -10, z, x, elevation, z);
    if (i < parts) {
      const a = 2 * i, b = 2 * (i + 1);
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: mountain ? 0x54706c : 0x826a59, side: THREE.DoubleSide
  }));
  mesh.name = mountain ? "sparda-mountain-ridges" : "sakhir-desert-ridges";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  scene.add(mesh);
}

function roadsideInstancing(scene: THREE.Scene, track: Track, ground: TerrainField, mountain: boolean): void {
  const rng = makeRng(mountain ? 746802 : 280812);
  const number = mountain ? 450 : 180;
  const trunk = mountain ? new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.36, .54, 1, 5),
    new THREE.MeshLambertMaterial({ color: 0x514132 }),
    number) : null;
  const foliage = new THREE.InstancedMesh(
    mountain ? new THREE.ConeGeometry(3, 11, 7) : new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: mountain ? 0x456f4d : 0x887358, roughness: 1 }),
    number
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), shade = new THREE.Color();
  let emitted = 0;
  for (let i = 0; i < number * 3 && emitted < number; i++) {
    const index = Math.floor(rng() * track.samples.length);
    const p = track.sampleAt(index), r = track.rightAt(index);
    const side = i % 2 ? -1 : 1;
    const offset = 48 + rng() * (mountain ? 125 : 230);
    const x = p.x + r.x * offset * side;
    const z = p.z + r.z * offset * side;
    const y = ground.heightAt(x, z);
    const height = mountain ? 11 + rng() * 18 : 1.1 + rng() * 3.1;
    if (mountain && trunk) {
      position.set(x, y + height * .24, z);
      scale.set(1, height * .48, 1);
      matrix.compose(position, rotation, scale);
      trunk.setMatrixAt(emitted, matrix);
    }
    position.set(x, y + (mountain ? height * .63 : height * .35), z);
    scale.set(mountain ? 1.3 + height * .09 : 3 + rng() * 5,
      mountain ? height / 11 : height,
      mountain ? 1.3 + height * .09 : 3 + rng() * 5);
    matrix.compose(position, rotation, scale);
    foliage.setMatrixAt(emitted, matrix);
    shade.setHSL(mountain ? .26 + rng() * .12 : .08 + rng() * .04,
      mountain ? .27 + rng() * .18 : .22, mountain ? .23 + rng() * .13 : .37 + rng() * .12);
    foliage.setColorAt(emitted, shade);
    emitted++;
  }
  foliage.count = emitted;
  foliage.instanceMatrix.needsUpdate = true;
  foliage.instanceColor!.needsUpdate = true;
  foliage.name = mountain ? "sparda-fir-forest" : "sakhir-desert-stones";
  foliage.castShadow = false;
  foliage.receiveShadow = true;
  scene.add(foliage);
  if (trunk) {
    trunk.count = emitted;
    trunk.name = "sparda-fir-trunks";
    trunk.instanceMatrix.needsUpdate = true;
    scene.add(trunk);
  }
}

function basicBuildings(scene: THREE.Scene, track: Track, mountain: boolean): void {
  const solids = new THREE.Group();
  solids.name = mountain ? "sparda-basic-paddock" : "sakhir-basic-paddock";
  const concrete = new THREE.MeshStandardMaterial({ color: mountain ? 0xb6c0c2 : 0xa7a49d, roughness: .82 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x527e9e, metalness: .35, roughness: .28 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xd5d8dd, metalness: .26, roughness: .52 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const index = Math.max(5, Math.round(110 / track.segmentLength));
  const sample = track.sampleAt(index), right = track.rightAt(index), tangent = track.tangentAt(index);
  const yaw = Math.atan2(tangent.x, tangent.z);
  function add(name: string, side: number, along: number, h: number, width: number, length: number, height: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(boxGeo, material);
    mesh.name = name;
    mesh.position.set(sample.x + right.x * side + tangent.x * along, sample.y + h, sample.z + right.z * side + tangent.z * along);
    mesh.scale.set(width, height, length);
    mesh.rotation.y = yaw;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    solids.add(mesh);
  }
  add("pit-building", 48, 0, 8, 26, mountain ? 120 : 185, 16, concrete);
  add("pit-glass", 33, 0, 11, 1, mountain ? 118 : 182, 6, glass);
  add("pit-roof", 48, 0, 16.5, 31, mountain ? 132 : 195, 1, roof);
  add("grandstand", -56, 0, 6, 36, mountain ? 150 : 240, 12, concrete);
  add("grandstand-roof", -56, 0, 16, 45, mountain ? 157 : 248, 1, roof);
  add("race-control", 87, 65, 18, 24, 28, 36, concrete);
  add("race-control-glass", 87, 65, 29, 27, 30, 9, glass);
  scene.add(solids);
}

function brandSign(scene: THREE.Scene, track: Track): void {
  const idx = Math.round(280 / track.segmentLength);
  const p = track.sampleAt(idx), t = track.tangentAt(idx);
  const tex = createBannerTexture(
    track.circuit.id === "sparda" ? "CIRCUITO SPARDA" : "SAKHIR HORIZON",
    "HORIZON EL SALVADOR"
  );
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(23, 3.6),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  banner.position.set(p.x, p.y + 8.8, p.z);
  banner.rotation.y = Math.atan2(t.x, t.z) + Math.PI;
  banner.name = "international-race-banner";
  scene.add(banner);
}

/** Actual Blender models contain editable structures and road reference meshes.
 * The runtime hides reference roads so the Rapier road stays authoritative. */
async function addBlenderScenery(scene: THREE.Scene, id: InternationalId): Promise<void> {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + "/";
  const asset = id === "sparda" ? "sparda.glb" : "sakhir-horizon.glb";
  const gltf = await new GLTFLoader().loadAsync(base + "circuits/" + asset);
  gltf.scene.name = id + "-blender-landmarks";
  gltf.scene.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const name = obj.name.toLowerCase();
    if (/^(asfalto|linea|piano|proteccion|terreno)-/.test(name)) {
      obj.visible = false;
      return;
    }
    obj.castShadow = false;
    obj.receiveShadow = true;
  });
  // Remove the procedural placeholder once the Blender landmarks arrive.
  scene.getObjectByName(id === "sparda" ? "sparda-basic-paddock" : "sakhir-basic-paddock")?.removeFromParent();
  scene.add(gltf.scene);
}

/** Installs geometry before racing; Blender structures are loaded asynchronously. */
export function installInternationalScenery(scene: THREE.Scene, track: Track, ground: TerrainField): void {
  const id = track.circuit.id as InternationalId;
  const mountain = id === "sparda";
  backdrop(scene, track, mountain);
  roadsideInstancing(scene, track, ground, mountain);
  basicBuildings(scene, track, mountain);
  brandSign(scene, track);
  void addBlenderScenery(scene, id).catch(error => {
    console.warn("[Horizon] 3D Blender landmarks not available; fallback paddock retained", error);
  });
}
