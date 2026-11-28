import * as THREE from "three";
import { makeRng } from "../core/mathx";
import { fbm } from "./terrain";
import type { Track } from "./track";

/** Mountain shoulders and loose stones for El Imposible 4x4. The raised road
 * sits on solid earth slopes instead of floating above the flat world. */
const SHOULDER = 9;
const FOOT_Y = -0.7;
const slopeWidth = (roadY: number) => THREE.MathUtils.clamp(roadY * 1.7 + 3, 3, 32);

/** Surface height at a given distance from a road point of height roadY. */
export function offroadBankHeight(roadY: number, distance: number): number {
  if (distance <= SHOULDER) return roadY - .12;
  const t = Math.min(1, (distance - SHOULDER) / slopeWidth(roadY));
  return THREE.MathUtils.lerp(roadY - .12, FOOT_Y, t);
}

/** Ground for trees: the flat terrain, or the mountain slope above it. */
export function offroadGround(track: Pick<Track, "samples">, terrain: { heightAt(x: number, z: number): number }) {
  return {
    heightAt(x: number, z: number): number {
      let y = terrain.heightAt(x, z);
      for (let i = 0; i < track.samples.length; i += 6) {
        const p = track.samples[i], d = Math.hypot(p.x - x, p.z - z);
        if (d < SHOULDER + 32) y = Math.max(y, offroadBankHeight(p.y, d));
      }
      return y;
    }
  };
}

export function offroadBankGeometry(track: Pick<Track, "samples" | "rights" | "halfWidth">): THREE.BufferGeometry {
  const n = track.samples.length;
  const pos: number[] = [], colors: number[] = [], indices: number[] = [];
  const earth = new THREE.Color(0x6e5539), grass = new THREE.Color(0x3f5a33), rock = new THREE.Color(0x77706a);
  const tint = new THREE.Color();
  const rows = 5;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = track.samples[i], r = track.rights[i], w = slopeWidth(p.y);
      const laterals = [track.halfWidth, SHOULDER, SHOULDER + w * .35, SHOULDER + w * .7, SHOULDER + w];
      laterals.forEach((lateral, row) => {
        const x = p.x + r.x * lateral * side, z = p.z + r.z * lateral * side;
        const rough = row === 2 || row === 3 ? (fbm(x * .09, z * .09, 3) - .5) * Math.min(3, p.y * .35) : 0;
        pos.push(x, row === 0 ? p.y + .01 : offroadBankHeight(p.y, lateral) + rough, z);
        tint.copy(earth).lerp(grass, row < 2 ? 0 : .35 + .65 * fbm(x * .05, z * .05, 2));
        if (row === 2 || row === 3) tint.lerp(rock, Math.max(0, fbm(x * .11 + 9, z * .11, 3) - .5) * 2.2);
        tint.multiplyScalar(.75 + .5 * fbm(x * .35, z * .35, 2));
        colors.push(tint.r, tint.g, tint.b);
      });
    }
    for (let i = 0; i < n; i++) for (let row = 0; row < rows - 1; row++) {
      const a = base + i * rows + row, b = base + ((i + 1) % n) * rows + row;
      if (side > 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Two instanced draws: boulders along the shoulders and small stones on the
 * road. Visual only, so they never snag the raycast wheels. */
export function createOffroadStones(track: Pick<Track, "samples" | "rights" | "halfWidth">): THREE.Group {
  const group = new THREE.Group();
  group.name = "offroad-stones";
  const random = makeRng(4041);
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), euler = new THREE.Euler(), color = new THREE.Color();
  for (const [name, count, small] of [["offroad-boulders", 420, false], ["offroad-pebbles", 520, true]] as const) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    for (let i = 0; i < count; i++) {
      const index = Math.floor(random() * track.samples.length);
      const p = track.samples[index], r = track.rights[index];
      const side = random() < .5 ? -1 : 1;
      const size = small ? .07 + random() * .13 : .3 + random() * random() * 1.1;
      const lateral = small ? random() * (track.halfWidth - .2) : track.halfWidth + size + .2 + random() * 3.5;
      position.set(p.x + r.x * lateral * side, p.y + (small ? size * .25 : size * .2 - .12), p.z + r.z * lateral * side);
      scale.set(size * (.8 + random() * .5), size * (.5 + random() * .4), size * (.8 + random() * .5));
      rotation.setFromEuler(euler.set(random() * .6, random() * Math.PI * 2, random() * .6));
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
      mesh.setColorAt(i, color.setHSL(.06 + random() * .05, .12 + random() * .14, .07 + random() * .11));
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
