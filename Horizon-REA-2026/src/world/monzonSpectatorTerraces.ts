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
  for (let row = 0; row < 10; row++) {
    for (let column = 0; column < 260; column++) {
      crowd.push({
        x: 105 + column * (405 / 259) + (rng() - 0.5) * 0.65,
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

/** Shared GPU crowd clock. Each arm animates in the vertex shader, so thousands
 * of fans can cheer without uploading instance matrices every frame. */
const audienceTime = {value: 0};
export function advanceAudienceAnimation(dt: number): void {
  audienceTime.value = (audienceTime.value + Math.max(0, Math.min(dt, .05))) % 1000;
}

/** Body parts are instanced separately for stable colors, silhouettes and
 * near-constant draw calls on mobile. No per-frame animation allocations. */
export function createVisibleSpectators(
  positions: readonly SpectatorPosition[], name: string, frustumCulled = false, night = false
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const meshes = [
    {
      name: "shirts",
      geometry: new THREE.CylinderGeometry(.29, .33, .89, 7),
      material: new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x141414,roughness:.92}),
      offset: new THREE.Vector3(0, 1.16, 0),
      color: (p: SpectatorPosition) => p.shirt
    },
    {
      name: "heads",
      geometry: new THREE.SphereGeometry(.27, 8, 6),
      material: new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x111111,roughness:.94}),
      offset: new THREE.Vector3(0, 1.89, 0),
      color: (p: SpectatorPosition) => p.skin
    },
    {
      name: "trousers",
      geometry: new THREE.CylinderGeometry(.255,.25,.72,7),
      material: new THREE.MeshStandardMaterial({color:0x303d51,emissive:0x070707,roughness:.98}),
      offset: new THREE.Vector3(0,.39,0),
      color: () => 0xffffff
    },
    {
      name: "left-arms",
      geometry: new THREE.CylinderGeometry(.11, .115, .82, 6),
      material: new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x101010,roughness:.91}),
      offset: new THREE.Vector3(-.36, 1.21, -.035),
      color: (p: SpectatorPosition) => p.shirt
    },
    {
      name: "right-arms",
      geometry: new THREE.CylinderGeometry(.11, .115, .82, 6),
      material: new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x101010,roughness:.91}),
      offset: new THREE.Vector3(.36, 1.21, -.035),
      color: (p: SpectatorPosition) => p.shirt
    },
    {
      name: "caps",
      geometry: new THREE.CylinderGeometry(.26,.27,.15,8),
      material: new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x181818,roughness:.95}),
      offset: new THREE.Vector3(0,2.13,0),
      color: (p: SpectatorPosition) => p.shirt
    }
  ] as const;
  const q = new THREE.Quaternion(), offset = new THREE.Vector3(), world = new THREE.Vector3();
  const mat = new THREE.Matrix4(), size = new THREE.Vector3(1,1,1);
  const axis = new THREE.Vector3(0,1,0), tint = new THREE.Color();
  for (const part of meshes) {
    if (part.name === "left-arms" || part.name === "right-arms") {
      const sign = part.name === "left-arms" ? -1 : 1;
      part.material.onBeforeCompile = shader => {
        shader.uniforms.horizonAudienceTime = audienceTime;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>", "#include <common>\nuniform float horizonAudienceTime;");
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float fan = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          float excitement = step(0.25, fan);
          float wave = sin(horizonAudienceTime * (2.0 + fan) + fan * 6.28318);
          transformed.x += ${sign.toFixed(1)} * (0.41 - position.y) * excitement * (0.42 + wave * 0.22);
          transformed.y += (0.41 - position.y) * excitement * (0.14 + 0.12 * wave);`);
      };
      part.material.customProgramCacheKey = () => `horizon-v15-audience-${sign}`;
    }
    const inst = new THREE.InstancedMesh(part.geometry, part.material, positions.length);
    inst.name = `${name}-${part.name}`;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = frustumCulled; // Suzaka uses short per-sector groups to cull distant stands
    positions.forEach((person, i) => {
      q.setFromAxisAngle(axis, person.yaw);
      offset.copy(part.offset).applyQuaternion(q);
      world.set(person.x + offset.x, person.y + offset.y, person.z + offset.z);
      size.set(1, 1, 1);
      if (part.name === "caps" && i % 4 !== 0) size.setScalar(.001);
      mat.compose(world, q, size);
      inst.setMatrixAt(i, mat);
      inst.setColorAt(i, tint.setHex(part.color(person)));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  if (night && positions.length) {
    // One draw call for all phone screens, not one light source per phone.
    const count = Math.ceil(positions.length / 13);
    const phones = new THREE.InstancedMesh(
      new THREE.BoxGeometry(.11, .18, .03),
      new THREE.MeshBasicMaterial({color:0xb7dbff,toneMapped:false}),count);
    phones.name = name + "-phone-screens";
    phones.frustumCulled = frustumCulled;
    for (let i = 0; i < count; i++) {
      const person = positions[(i * 13) % positions.length];
      q.setFromAxisAngle(axis, person.yaw);
      mat.compose(new THREE.Vector3(person.x + .38,person.y + 1.8,
        person.z - .20),q,size.set(1,1,1));
      phones.setMatrixAt(i,mat);
    }
    phones.instanceMatrix.needsUpdate = true;
    phones.computeBoundingSphere();
    group.add(phones);
  }
  group.userData.people = positions.length;
  group.userData.animated = true;
  group.userData.drawCalls = meshes.length + (night ? 1 : 0);
  group.userData.unobstructed = true;
  return group;
}
