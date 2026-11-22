import * as THREE from "three";
import { makeRng } from "../core/mathx";
import {
  GARAGE_FRONT_Z, GARAGE_HEIGHT, MONZON_PIT_GARAGES
} from "./monzonPitAccess";

/** Visible spectator feet, above the platform. Large enough to read
 * from the player chase camera, yet cost a fixed six instanced draw calls. */
export interface SpectatorPosition {
  x: number;
  y: number;
  z: number;
  yaw: number;
  shirt: number;
  skin: number;
}

const shirts = [0xffcf38, 0xea4a34, 0x3689cc, 0xf4f0df, 0x2dbb9a, 0xba63ba, 0x68b5c3];
const faces = [0xffdbb3, 0xd69b70, 0x9e684e, 0x694639];

/** Two crowded, unobstructed terrace rows IN FRONT of garage fascias.
 * Putting the public behind the original fascia made the fans invisible. */
export function monzonPitSpectatorPositions(): SpectatorPosition[] {
  const rng = makeRng(28182028);
  const result: SpectatorPosition[] = [];
  const first = MONZON_PIT_GARAGES[0].x - 7.5;
  const last = MONZON_PIT_GARAGES[MONZON_PIT_GARAGES.length - 1].x + 7.5;
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 69; column++) {
      const x = first + ((last - first) * (column + 0.5) / 69);
      result.push({
        x: x + (rng() - 0.5) * 0.24,
        y: GARAGE_HEIGHT + 0.64, // feet directly on the forward deck, not floating above it
        z: GARAGE_FRONT_Z - 2.9 + row * 1.38,
        yaw: Math.PI + (rng() - .5) * .36,
        shirt: shirts[Math.floor(rng() * shirts.length)],
        skin: faces[Math.floor(rng() * faces.length)]
      });
    }
  }
  return result;
}

/** All tiers stand in OPEN AIR, on top of risers rather than inside the
 * old opaque grandstand base. The canopy is moved behind this front terrace. */
export function monzonGrandstandSpectatorPositions(groundY: number): SpectatorPosition[] {
  const rng = makeRng(28182027);
  const crowd: SpectatorPosition[] = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 104; column++) {
      crowd.push({
        x: 105 + column * (405 / 103) + (rng() - 0.5) * 0.65,
        y: groundY + 5.60 + row * 1.06,
        z: -48.4 - row * 3.10,
        yaw: (rng() - .5) * .22, // stand faces +Z toward the racing straight
        shirt: shirts[Math.floor(rng() * shirts.length)],
        skin: faces[Math.floor(rng() * faces.length)]
      });
    }
  }
  return crowd;
}

/** Body parts are instanced separately for stable colors, silhouettes and
 * near-constant draw calls on mobile. No per-frame animation allocations. */
export function createVisibleSpectators(
  positions: readonly SpectatorPosition[], name: string, frustumCulled = false
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const meshes = [
    {
      name: "shirts",
      geometry: new THREE.CylinderGeometry(.29, .33, .89, 7),
      material: new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x141414}),
      offset: new THREE.Vector3(0, 1.16, 0),
      color: (p: SpectatorPosition) => p.shirt
    },
    {
      name: "heads",
      geometry: new THREE.SphereGeometry(.27, 8, 6),
      material: new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x111111}),
      offset: new THREE.Vector3(0, 1.89, 0),
      color: (p: SpectatorPosition) => p.skin
    },
    {
      name: "trousers",
      geometry: new THREE.CylinderGeometry(.255,.25,.72,7),
      material: new THREE.MeshLambertMaterial({color:0x303d51,emissive:0x070707}),
      offset: new THREE.Vector3(0,.39,0),
      color: () => 0xffffff
    },
    {
      name: "left-arms",
      geometry: new THREE.CylinderGeometry(.11, .115, .82, 6),
      material: new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x101010}),
      offset: new THREE.Vector3(-.36, 1.21, -.035),
      color: (p: SpectatorPosition) => p.shirt
    },
    {
      name: "right-arms",
      geometry: new THREE.CylinderGeometry(.11, .115, .82, 6),
      material: new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x101010}),
      offset: new THREE.Vector3(.36, 1.21, -.035),
      color: (p: SpectatorPosition) => p.shirt
    },
    {
      name: "caps",
      geometry: new THREE.CylinderGeometry(.26,.27,.15,8),
      material: new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x181818}),
      offset: new THREE.Vector3(0,2.13,0),
      color: (p: SpectatorPosition) => p.shirt
    }
  ] as const;
  const q = new THREE.Quaternion(), offset = new THREE.Vector3(), world = new THREE.Vector3();
  const mat = new THREE.Matrix4(), size = new THREE.Vector3(1,1,1);
  const axis = new THREE.Vector3(0,1,0), tint = new THREE.Color();
  for (const part of meshes) {
    const inst = new THREE.InstancedMesh(part.geometry, part.material, positions.length);
    inst.name = `${name}-${part.name}`;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = frustumCulled; // Suzaka uses short per-sector groups to cull distant stands
    positions.forEach((person, i) => {
      q.setFromAxisAngle(axis, person.yaw);
      offset.copy(part.offset).applyQuaternion(q);
      world.set(person.x + offset.x, person.y + offset.y, person.z + offset.z);
      mat.compose(world, q, size);
      inst.setMatrixAt(i, mat);
      inst.setColorAt(i, tint.setHex(part.color(person)));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  group.userData.people = positions.length;
  group.userData.drawCalls = meshes.length;
  group.userData.unobstructed = true;
  return group;
}
