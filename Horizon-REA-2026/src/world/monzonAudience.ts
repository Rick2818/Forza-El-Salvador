import * as THREE from "three";
import { makeRng } from "../core/mathx";
import {
  GARAGE_FRONT_Z, GARAGE_HEIGHT, GARAGE_REAR_Z,
  MONZON_PIT_GARAGES
} from "./monzonPitAccess";

export const MONZON_PIT_VISIBLE_FANS = 160;
export const MONZON_STAND_VISIBLE_FANS = 420;
export const MONZON_ROOF_TOP = GARAGE_HEIGHT + .24;

/** Two open viewing tiers ABOVE the garage fascias, facing the pit lane.
 * No fan stands on the pit apron and nothing blocks the garage entrances. */
export function planMonzonPitAudience(): THREE.Vector3[] {
  const audience: THREE.Vector3[] = [];
  const startX = MONZON_PIT_GARAGES[0].x - 7.3;
  const endX = MONZON_PIT_GARAGES[MONZON_PIT_GARAGES.length - 1].x + 7.3;
  const columns = MONZON_PIT_VISIBLE_FANS / 2;
  const rng = makeRng(28182029);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < columns; col++) {
      const x = startX + (col + .5) / columns * (endX - startX);
      const z = GARAGE_FRONT_Z + 1.0 + row * 3.4;
      const footY = MONZON_ROOF_TOP + .9 + row * .66;
      audience.push(new THREE.Vector3(
        x + (rng() - .5) * .25, footY, z + (rng() - .5) * .22
      ));
    }
  }
  return audience;
}

/** Rear seating rises visibly above the now OPEN (lower) front foundation. */
export function planMonzonGrandstandAudience(standY: number): THREE.Vector3[] {
  const rng = makeRng(28182027);
  const audience: THREE.Vector3[] = [];
  for (let i = 0; i < MONZON_STAND_VISIBLE_FANS; i++) {
    const tier = Math.floor(rng() * 8);
    audience.push(new THREE.Vector3(
      106 + rng() * 404, standY + 5.56 + tier * 1.06, -48.4 - tier * 3.1
    ));
  }
  return audience;
}

/** Legible human-shaped figures with shirts, skin, legs and cheering arms.
 * All parts are instanced; no expensive per-spectator meshes or shadows.
 * Basic material keeps the audience visible at Monzón's night setting. */
export function createMonzonAudience(
  positions: readonly THREE.Vector3[],
  prefix: string
): THREE.Group {
  const group = new THREE.Group();
  group.name = prefix;
  const count = positions.length;
  const bright = new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  const dark = new THREE.MeshBasicMaterial({color:0x303945,toneMapped:false});
  const parts = [
    ["heads",new THREE.SphereGeometry(.235,10,8),bright],
    ["shirts",new THREE.CylinderGeometry(.31,.26,.79,8),bright],
    ["left-arms",new THREE.CylinderGeometry(.095,.12,.69,6),bright],
    ["right-arms",new THREE.CylinderGeometry(.095,.12,.69,6),bright],
    ["left-legs",new THREE.CylinderGeometry(.105,.12,.66,6),dark],
    ["right-legs",new THREE.CylinderGeometry(.105,.12,.66,6),dark]
  ] as const;
  const meshes = parts.map(([name,geometry,material]) => {
    const mesh = new THREE.InstancedMesh(geometry,material,count);
    mesh.name = `${prefix}-${name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // positions span multiple garage bays
    group.add(mesh);
    return mesh;
  });
  const uniforms = [0xff653b,0xf5dc48,0x53adf6,0xefefec,0x30c7a4,0xe17ece,0xc4fa56];
  const skinTones = [0xf9d6b4,0xe5b184,0xb97a53,0x88533e];
  const transform = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const tilt = new THREE.Quaternion(), v = new THREE.Vector3();
  const size = new THREE.Vector3(1,1,1);
  const rng = makeRng(28182031);
  for (let i = 0; i < count; i++) {
    const p = positions[i];
    const yaw = (rng() - .5) * .45; // facing the circuit, with natural variation
    rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
    const shirt = new THREE.Color(uniforms[i % uniforms.length]);
    const skin = new THREE.Color(skinTones[i % skinTones.length]);
    const props: [number,number,number,number][] = [
      [0,1.68,0,0], [0,1.12,0,0],
      [-.38,1.25,0,-.45], [.38,1.25,0,.45],
      [-.15,.40,0,0],[.15,.40,0,0]
    ];
    for (let k = 0; k < meshes.length; k++) {
      const [x,y,z,armAngle] = props[k];
      v.set(x,y,z).applyQuaternion(rotation).add(p);
      tilt.copy(rotation);
      if (k===2 || k===3) tilt.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0,0,1),armAngle
      ));
      transform.compose(v,tilt,size);
      meshes[k].setMatrixAt(i,transform);
      if(k===0) meshes[k].setColorAt(i,skin);
      if(k>=1 && k<=3)meshes[k].setColorAt(i,shirt);
    }
  }
  for(const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    if(mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  group.userData.people = count;
  group.userData.openViewingArea = true;
  group.userData.meshes = meshes.length;
  group.userData.rooftop = prefix.includes("pit");
  group.userData.nearestToPitZ = GARAGE_FRONT_Z;
  group.userData.garageRearZ = GARAGE_REAR_Z;
  return group;
}
