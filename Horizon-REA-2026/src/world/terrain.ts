import * as THREE from "three";
import { createGrassTexture } from "./textures";
import { clamp, smoothstep } from "../core/mathx";

/**
 * Shared ground field. The terrain mesh, the trees and the trackside props all
 * sample this one function, so nothing floats above or sinks into the ground.
 *
 * The circuit sits in the +X/+Z quadrant (bounds roughly x[-53..554],
 * z[0..464]), so the hills are centred on the track centre instead of the
 * world origin. With the old origin-centred rings the mountains started inside
 * the far side of the lap.
 */
export const TERRAIN_SIZE = 2800;
export const TERRAIN_SEGMENTS = 150;
export const TERRAIN_CENTER_X = 250;
export const TERRAIN_CENTER_Z = 232;
export const TERRAIN_BASE_Y = -2.4;
export const TERRAIN_NEAR_Y = -0.14;

export const hash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

export const noise2 = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};

export const fbm = (x: number, y: number, octaves = 4): number => {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
};

export interface TrackLike {
  samples: THREE.Vector3[];
  circuit?: { id: string };
}

/** Distance from (x,z) to the nearest centreline sample, in metres. */
export function distanceToTrack(x: number, z: number, track: TrackLike, stride = 4): number {
  let best = Infinity;
  const samples = track.samples;
  for (let i = 0; i < samples.length; i += stride) {
    const s = samples[i];
    const dx = s.x - x;
    const dz = s.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export class TerrainField {
  readonly size: number;
  readonly segments = TERRAIN_SEGMENTS;
  readonly step: number;
  readonly centerX: number;
  readonly centerZ: number;
  private readonly heights: Float32Array;
  private readonly isSparda: boolean;
  private readonly isOffroad: boolean;
  private readonly isDesert: boolean;
  private readonly isSuzaka: boolean;
  private readonly isMonzon: boolean;
  private readonly roadSamples: readonly THREE.Vector3[];
  private readonly count = TERRAIN_SEGMENTS + 1;

  constructor(track: TrackLike) {
    this.isSuzaka = track.circuit?.id === "suzaka";
    this.isSparda = track.circuit?.id === "sparda";
    this.isOffroad = track.circuit?.id === "el-imposible-4x4";
    this.isDesert = track.circuit?.id === "sakhir-horizon";
    this.isMonzon = track.circuit?.id === "monzon";
    this.roadSamples = track.samples;
    // Centre the terrain on the currently selected layout. Monzon is much
    // larger than the original coastal circuits and must not run off the mesh.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of track.samples) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    this.centerX = Number.isFinite(minX) ? (minX + maxX) / 2 : TERRAIN_CENTER_X;
    this.centerZ = Number.isFinite(minZ) ? (minZ + maxZ) / 2 : TERRAIN_CENTER_Z;
    this.size = Math.max(TERRAIN_SIZE, Math.ceil((Math.max(maxX - minX, maxZ - minZ) + 600) / 100) * 100);
    this.step = this.size / this.segments;
    const count = this.count;
    const heights = new Float32Array(count * count);
    for (let iz = 0; iz < count; iz++) {
      const z = this.centerZ - this.size / 2 + iz * this.step;
      for (let ix = 0; ix < count; ix++) {
        const x = this.centerX - this.size / 2 + ix * this.step;
        const d = distanceToTrack(x, z, track, 4);
        heights[iz * count + ix] = this.computeHeight(x, z, d);
      }
    }
    this.heights = heights;
  }

  private computeHeight(x: number, z: number, trackDistance: number): number {
    if (this.isSparda || this.isOffroad) {
      // Terrain follows the graded mountain road, always below the tyre
      // surface. A separate static collider supplies off-track support.
      let closest = 0;
      let minDistance = Infinity;
      for (let i = 0; i < this.roadSamples.length; i += 4) {
        const p = this.roadSamples[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < minDistance) { minDistance = d; closest = p.y; }
      }
      const valley = this.isOffroad ? 2.5 + 2.5 * smoothstep(10, 65, trackDistance) : 1.5 + 2.0 * smoothstep(9, 85, trackDistance);
      const ripple = (fbm(x * 0.012, z * 0.012, 2) - .5) *
        1.2 * smoothstep(40, 220, trackDistance);
      return closest - valley + ripple;
    }
    if (this.isDesert) {
      const outskirts = smoothstep(18, 90, trackDistance);
      return TERRAIN_NEAR_Y - 1.5 * outskirts +
        (fbm(x * 0.003, z * 0.003, 3) - .5) * 6 * outskirts;
    }
    if (this.isSuzaka) {
      const outside=smoothstep(24,160,trackDistance);
      return TERRAIN_NEAR_Y+(fbm(x*.002,z*.002,3)-.5)*18*outside;
    }
    if (this.isMonzon) {
      // A low park landscape keeps corner sightlines open.
      const outskirts = smoothstep(24, 140, trackDistance);
      const service = smoothstep(-100, -35, x) * (1-smoothstep(650, 740, x)) *
        smoothstep(-45, -5, z) * (1-smoothstep(110, 190, z));
      return TERRAIN_NEAR_Y + (fbm(x * .003, z * .003, 3) - .5) * 9 * outskirts * (1-service);
    }
    // Flat and just below the road next to the circuit; the bank then falls
    // away to the valley floor before the hills start.
    const flat = smoothstep(15, 88, trackDistance);
    const r = Math.hypot(x - this.centerX, z - this.centerZ);
    const rise = smoothstep(440, 1020, r);
    const ridge = Math.pow(fbm(x * 0.0019 + 4.2, z * 0.0019 - 8.1, 4), 1.35);
    const hills = rise * (ridge * 112 + 18);
    const bumps = fbm(x * 0.012, z * 0.012, 3) * 4.2 * smoothstep(300, 600, r);
    return (
      TERRAIN_NEAR_Y +
      (TERRAIN_BASE_Y - TERRAIN_NEAR_Y) * flat +
      (hills + bumps) * flat
    );

  }

  /** Bilinear sample. Used by trees, rocks and the camera-side props. */
  heightAt(x: number, z: number): number {
    const half = this.size / 2;
    const gx = clamp((x - (this.centerX - half)) / this.step, 0, this.segments - 1e-4);
    const gz = clamp((z - (this.centerZ - half)) / this.step, 0, this.segments - 1e-4);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const count = this.count;
    const h = this.heights;
    const h00 = h[iz * count + ix];
    const h10 = h[iz * count + ix + 1];
    const h01 = h[(iz + 1) * count + ix];
    const h11 = h[(iz + 1) * count + ix + 1];
    const a = h00 + (h10 - h00) * fx;
    const b = h01 + (h11 - h01) * fx;
    return a + (b - a) * fz;
  }

  /** Height above the valley floor, for rock/snow tinting. */
  elevationAt(x: number, z: number): number {
    return this.heightAt(x, z) - TERRAIN_BASE_Y;
  }

  buildMesh(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(
      this.size,
      this.size,
      this.segments,
      this.segments
    );
    geo.rotateX(-Math.PI / 2);
    geo.translate(this.centerX, 0, this.centerZ);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(this.isMonzon ? 0x304b30 : (this.isSparda || this.isOffroad) ? 0x315e3a : this.isDesert ? 0x947958 : 0x395837);
    const dryGrass = new THREE.Color(this.isMonzon ? 0x526044 : (this.isSparda || this.isOffroad) ? 0x4a7048 : this.isDesert ? 0xae8c62 : 0x68704e);
    const rock = new THREE.Color(this.isSparda ? 0x737a6c : this.isDesert ? 0x766450 : 0x6d717a);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);

      const height = y - TERRAIN_BASE_Y;
      const rocky = smoothstep(26, 55, height) * 0.72;
      const dryness = fbm(x * 0.003, z * 0.003, 2);
      tmp.copy(grass).lerp(dryGrass, dryness * 0.55).lerp(rock, rocky);
      const shade = 0.72 + fbm(x * 0.05, z * 0.05, 2) * 0.34;
      colors[i * 3] = tmp.r * shade;
      colors[i * 3 + 1] = tmp.g * shade;
      colors[i * 3 + 2] = tmp.b * shade;
    }
    pos.needsUpdate = true;
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const grassTex = createGrassTexture();
    grassTex.repeat.set(160, 160);
    const material = new THREE.MeshLambertMaterial({
      map: grassTex,
      vertexColors: true
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = "terrain";
    mesh.receiveShadow = true;
    return mesh;
  }
}
