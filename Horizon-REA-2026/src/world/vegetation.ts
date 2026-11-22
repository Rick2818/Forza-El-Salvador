import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeRng } from "../core/mathx";
import { distanceToTrack, fbm, TerrainField } from "./terrain";
import type { Track } from "./track";

/**
 * Procedural forest, built from branch skeletons and alpha-cut leaf cards.
 *
 * Two levels of detail are created once and drawn with InstancedMesh:
 *  - near (within 105 m of the centreline): trunk + 3D branches + ~60 leaf
 *    cards, so the silhouette has real gaps and the crown is not a blob.
 *  - far: three crossed billboards carrying a painted tree silhouette.
 *
 * No imported art. The leaf/needle atlases are painted with Canvas2D.
 */

const UP = new THREE.Vector3(0, 1, 0);
const TREE_TOTAL = 700;
const NEAR_DISTANCE = 105;

interface Bucket {
  matrix: THREE.Matrix4;
  color: THREE.Color;
}

export interface SpeciesAssets {
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  height: number;
}

export interface ForestStats {
  total: number;
  near: number;
  far: number;
  triangles: number;
}

export class Forest {
  readonly group = new THREE.Group();
  readonly stats: ForestStats;

  constructor(track: Track, field: TerrainField) {
    this.group.name = "forest";
    const rng = makeRng(20261114);
    const N = track.samples.length;
    const broadAssets = [buildBroadleaf(101), buildBroadleaf(202)];
    const coniferAssets = [buildConifer(303), buildConifer(404)];

    const buckets = new Map<string, Bucket[]>();
    for (const kind of ["broad", "conifer"]) {
      for (let variant = 0; variant < 2; variant++) {
        for (const lod of ["near", "far"]) {
          buckets.set(`${kind}:${variant}:${lod}`, []);
        }
      }
    }

    let placed = 0;
    let nearCount = 0;
    let guard = 0;
    while (placed < TREE_TOTAL && guard < TREE_TOTAL * 60) {
      guard++;
      const f = rng() * N;
      const i = Math.floor(f);
      const j = (i + 1) % N;
      const t = f - i;
      const a = track.samples[i];
      const b = track.samples[j];
      const right = track.rights[i];
      const tangent = track.tangents[i];
      const side = rng() < 0.5 ? -1 : 1;
      const outerBand = rng();
      const lateral =
        outerBand < 0.62 ? 22 + rng() * 96 : 118 + rng() * 300;
      const jitter = (rng() - 0.5) * 22;
      const sx = a.x + (b.x - a.x) * t;
      const sz = a.z + (b.z - a.z) * t;
      const x = sx + right.x * lateral * side + tangent.x * jitter;
      const z = sz + right.z * lateral * side + tangent.z * jitter;

      if (Math.abs(x - field.centerX) > field.size * 0.5 - 50) continue;
      if (Math.abs(z - field.centerZ) > field.size * 0.5 - 50) continue;
      const trackDistance = distanceToTrack(x, z, track, 6);
      if (trackDistance < 20) continue;

      const ground = field.heightAt(x, z);
      if (ground - -2.4 > 30) continue;

      // Patchy density: clearings and thick stands instead of an even grid.
      const clump = fbm(x * 0.007 + 3.1, z * 0.007 - 7.4, 3);
      if (clump < 0.43 && rng() > 0.22) continue;

      const conifer = rng() < 0.55;
      const variant = rng() < 0.5 ? 0 : 1;
      const scale = 0.78 + rng() * 0.5;
      const rotation = rng() * Math.PI * 2;
      const near = trackDistance < NEAR_DISTANCE;
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x, ground - 0.06, z),
        new THREE.Quaternion().setFromAxisAngle(UP, rotation),
        new THREE.Vector3(scale, scale * (0.92 + rng() * 0.22), scale)
      );
      const key = `${conifer ? "conifer" : "broad"}:${variant}:${near ? "near" : "far"}`;
      const color = conifer
        ? new THREE.Color().setHSL(
            0.36 + rng() * 0.09,
            0.18 + rng() * 0.16,
            0.52 + rng() * 0.22
          )
        : new THREE.Color().setHSL(
            0.24 + rng() * 0.13,
            0.14 + rng() * 0.2,
            0.58 + rng() * 0.24
          );
      buckets.get(key)!.push({ matrix, color });
      placed++;
      if (near) nearCount++;
    }

    const barkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const leafMat = new THREE.MeshLambertMaterial({
      map: createBroadleafTexture(),
      alphaTest: 0.36,
      side: THREE.DoubleSide
    });
    const needleMat = new THREE.MeshLambertMaterial({
      map: createNeedleTexture(),
      alphaTest: 0.34,
      side: THREE.DoubleSide
    });
    const crownMat = new THREE.MeshLambertMaterial({
      map: createCrownTexture(),
      alphaTest: 0.38,
      side: THREE.DoubleSide
    });

    const barkColor = (rng2: () => number): THREE.Color =>
      new THREE.Color().setHSL(0.07, 0.18 + rng2() * 0.1, 0.12 + rng2() * 0.08);

    let triangles = 0;
    for (let variant = 0; variant < 2; variant++) {
      for (const species of ["broad", "conifer"] as const) {
        const assets = species === "broad" ? broadAssets[variant] : coniferAssets[variant];
        const nearBucket = buckets.get(`${species}:${variant}:near`)!;
        const farBucket = buckets.get(`${species}:${variant}:far`)!;

        if (nearBucket.length > 0) {
          const bark = new THREE.InstancedMesh(assets.bark, barkMat, nearBucket.length);
          const leaves = new THREE.InstancedMesh(
            assets.leaves,
            species === "broad" ? leafMat : needleMat,
            nearBucket.length
          );
          nearBucket.forEach((item, index) => {
            bark.setMatrixAt(index, item.matrix);
            leaves.setMatrixAt(index, item.matrix);
            bark.setColorAt(index, barkColor(rng));
            leaves.setColorAt(index, item.color);
          });
          bark.castShadow = true;
          leaves.castShadow = true;
          bark.receiveShadow = false;
          leaves.receiveShadow = false;
          bark.instanceMatrix.needsUpdate = true;
          leaves.instanceMatrix.needsUpdate = true;
          if (bark.instanceColor) bark.instanceColor.needsUpdate = true;
          if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
          this.group.add(bark, leaves);
          triangles += nearBucket.length * (assets.bark.attributes.position.count / 3);
          triangles += nearBucket.length * (assets.leaves.attributes.position.count / 3);
        }

        if (farBucket.length > 0) {
          const crowns = new THREE.InstancedMesh(assets.crown, crownMat, farBucket.length);
          farBucket.forEach((item, index) => {
            crowns.setMatrixAt(index, item.matrix);
            crowns.setColorAt(index, item.color);
          });
          crowns.castShadow = false;
          crowns.receiveShadow = false;
          crowns.instanceMatrix.needsUpdate = true;
          if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
          this.group.add(crowns);
          triangles += farBucket.length * (assets.crown.attributes.position.count / 3);
        }
      }
    }

    this.stats = {
      total: placed,
      near: nearCount,
      far: placed - nearCount,
      triangles: Math.round(triangles)
    };
  }
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function tube(points: THREE.Vector3[], radii: number[], sides: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ref = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  let length = 0;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    tangent.subVectors(next, prev).normalize();
    if (Math.abs(tangent.y) > 0.92) ref.set(1, 0, 0);
    else ref.set(0, 1, 0);
    normal.crossVectors(ref, tangent).normalize();
    binormal.crossVectors(tangent, normal).normalize();
    if (i > 0) length += points[i].distanceTo(points[i - 1]);

    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = radii[i];
      positions.push(
        points[i].x + normal.x * ca * r + binormal.x * sa * r,
        points[i].y + normal.y * ca * r + binormal.y * sa * r,
        points[i].z + normal.z * ca * r + binormal.z * sa * r
      );
      normals.push(
        normal.x * ca + binormal.x * sa,
        normal.y * ca + binormal.y * sa,
        normal.z * ca + binormal.z * sa
      );
      uvs.push(k / sides, length / 2);
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const row = sides + 1;
    for (let k = 0; k < sides; k++) {
      const a = i * row + k;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * One textured quad. `u` and `v` are the half-axes; `uvRect` selects one
 * quadrant of the 2x2 atlas so every card can show a different spray.
 */
function card(
  center: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  halfU: number,
  halfV: number,
  uvRect: [number, number, number, number]
): THREE.BufferGeometry {
  const ux = u.x * halfU;
  const uy = u.y * halfU;
  const uz = u.z * halfU;
  const vx = v.x * halfV;
  const vy = v.y * halfV;
  const vz = v.z * halfV;
  const nx = u.y * v.z - u.z * v.y;
  const ny = u.z * v.x - u.x * v.z;
  const nz = u.x * v.y - u.y * v.x;
  const [u0, v0, u1, v1] = uvRect;
  const positions = [
    center.x - ux - vx,
    center.y - uy - vy,
    center.z - uz - vz,
    center.x + ux - vx,
    center.y + uy - vy,
    center.z + uz - vz,
    center.x - ux + vx,
    center.y - uy + vy,
    center.z - uz + vz,
    center.x + ux + vx,
    center.y + uy + vy,
    center.z + uz + vz
  ];
  const normals = [nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz];
  const uvs = [u0, v0, u1, v0, u0, v1, u1, v1];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  return geo;
}

const ATLAS_INSET = 0.0035;
function quadrantRect(index: number): [number, number, number, number] {
  const qx = index % 2;
  const qy = Math.floor(index / 2);
  return [
    qx * 0.5 + ATLAS_INSET,
    qy * 0.5 + ATLAS_INSET,
    (qx + 1) * 0.5 - ATLAS_INSET,
    (qy + 1) * 0.5 - ATLAS_INSET
  ];
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(
    parts.map((g) => (g.index ? g.toNonIndexed() : g)),
    false
  );
  if (!merged) throw new Error("vegetation: geometry merge failed");
  return merged;
}

/* ------------------------------------------------------------------ */
/* Broadleaf tree                                                      */
/* ------------------------------------------------------------------ */

export function buildBroadleaf(seed: number): SpeciesAssets {
  const rng = makeRng(seed);
  const height = 9.6 + rng() * 3.2;
  const barkParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];
  const leanX = (rng() - 0.5) * 1.1;
  const leanZ = (rng() - 0.5) * 1.1;

  const trunkPoints: THREE.Vector3[] = [];
  const trunkRadii: number[] = [];
  const trunkSegments = 5;
  const trunkTop = height * 0.66;
  const baseRadius = 0.3 + rng() * 0.09;
  for (let i = 0; i <= trunkSegments; i++) {
    const t = i / trunkSegments;
    trunkPoints.push(
      new THREE.Vector3(
        leanX * t * t + Math.sin(t * 5 + seed) * 0.05,
        t * trunkTop,
        leanZ * t * t + Math.cos(t * 4.1 + seed) * 0.05
      )
    );
    trunkRadii.push(baseRadius * (1 - t * 0.82) + 0.03);
  }
  barkParts.push(tube(trunkPoints, trunkRadii, 8));

  const crownY = height * 0.74;
  const crownRX = 2.8 + rng() * 0.85;
  const crownRY = 2.0 + rng() * 0.65;
  const crownRZ = 2.7 + rng() * 0.9;
  const tips: THREE.Vector3[] = [];

  const primaries = 4 + Math.floor(rng() * 2);
  for (let b = 0; b < primaries; b++) {
    const angle = (b / primaries) * Math.PI * 2 + rng() * 0.65;
    const startT = 0.52 + rng() * 0.16;
    const start = new THREE.Vector3(
      leanX * startT * startT,
      startT * trunkTop,
      leanZ * startT * startT
    );
    const length = 2.0 + rng() * 1.15;
    const elevation = 0.55 + rng() * 0.35;
    const dir = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(angle) * Math.cos(elevation)
    );
    const mid = start
      .clone()
      .addScaledVector(dir, length * 0.55)
      .add(new THREE.Vector3(0, length * 0.12, 0));
    const end = start
      .clone()
      .addScaledVector(dir, length)
      .add(new THREE.Vector3(0, length * 0.22, 0));
    barkParts.push(
      tube([start, mid, end], [0.105 + rng() * 0.025, 0.065, 0.032], 5)
    );
    tips.push(end);

    const twigs = 2;
    for (let tw = 0; tw < twigs; tw++) {
      const twT = 0.45 + rng() * 0.4;
      const twStart = start.clone().lerp(end, twT);
      const twAngle = angle + (rng() - 0.5) * 1.5;
      const twLen = 1.0 + rng() * 1.0;
      const twEnd = twStart
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(twAngle) * twLen,
            twLen * (0.35 + rng() * 0.35),
            Math.sin(twAngle) * twLen
          )
        );
      barkParts.push(tube([twStart, twEnd], [0.035, 0.014], 4));
      tips.push(twEnd);
    }
  }

  const addLeafPair = (
    center: THREE.Vector3,
    size: number,
    yaw: number,
    pitch: number
  ): void => {
    const normal = new THREE.Vector3(
      Math.cos(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.sin(yaw) * Math.cos(pitch)
    ).normalize();
    const u = new THREE.Vector3().crossVectors(UP, normal);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    leafParts.push(card(center, u, v, size * 0.62, size * 0.52, quadrantRect(Math.floor(rng() * 4))));
    const normal2 = new THREE.Vector3(
      Math.cos(yaw + 1.72) * Math.cos(pitch + 0.25),
      Math.sin(pitch - 0.2),
      Math.sin(yaw + 1.72) * Math.cos(pitch + 0.25)
    ).normalize();
    const u2 = new THREE.Vector3().crossVectors(UP, normal2).normalize();
    const v2 = new THREE.Vector3().crossVectors(normal2, u2).normalize();
    leafParts.push(
      card(center, u2, v2, size * 0.58, size * 0.5, quadrantRect(Math.floor(rng() * 4)))
    );
  };

  // Cards at real branch tips.
  for (const tip of tips) {
    addLeafPair(tip, 1.35 + rng() * 0.55, Math.atan2(tip.z, tip.x), (rng() - 0.5) * 0.8);
  }

  // Cards inside the ellipsoid crown, biased towards the shell so the canopy
  // keeps holes instead of becoming a solid ball.
  const anchors = 30;
  for (let i = 0; i < anchors; i++) {
    const yaw = rng() * Math.PI * 2;
    const elevation = Math.acos(2 * rng() - 1);
    const shell = 0.55 + Math.pow(rng(), 0.45) * 0.45;
    const dir = new THREE.Vector3(
      Math.sin(elevation) * Math.cos(yaw),
      Math.cos(elevation),
      Math.sin(elevation) * Math.sin(yaw)
    );
    const center = new THREE.Vector3(
      dir.x * crownRX * shell,
      crownY + dir.y * crownRY * shell,
      dir.z * crownRZ * shell
    );
    const size = 1.25 + rng() * 0.8;
    addLeafPair(center, size, Math.atan2(center.z, center.x) + (rng() - 0.5) * 1.2, (rng() - 0.5) * 1.0);
  }

  const bark = merge(barkParts);
  const leaves = merge(leafParts);
  return { bark, leaves, crown: buildCrown("broad", height, seed), height };
}

/* ------------------------------------------------------------------ */
/* Conifer                                                             */
/* ------------------------------------------------------------------ */

export function buildConifer(seed: number): SpeciesAssets {
  const rng = makeRng(seed);
  const height = 12.0 + rng() * 4.2;
  const barkParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];
  const leanX = (rng() - 0.5) * 0.7;
  const leanZ = (rng() - 0.5) * 0.7;

  const trunkPoints: THREE.Vector3[] = [];
  const trunkRadii: number[] = [];
  const trunkSegments = 5;
  for (let i = 0; i <= trunkSegments; i++) {
    const t = i / trunkSegments;
    trunkPoints.push(
      new THREE.Vector3(
        leanX * t * t + Math.sin(t * 4.6 + seed) * 0.04,
        t * height * 0.97,
        leanZ * t * t + Math.cos(t * 3.9 + seed) * 0.04
      )
    );
    trunkRadii.push(0.26 * (1 - t * 0.9) + 0.02);
  }
  barkParts.push(tube(trunkPoints, trunkRadii, 7));

  const whorls = 10;
  const branches = 5;
  for (let level = 0; level < whorls; level++) {
    const t = level / (whorls - 1);
    const y = 1.15 + t * height * 0.85;
    const branchLength = (1 - t * 0.9) * (3.0 + rng() * 0.35) + 0.2;
    for (let b = 0; b < branches; b++) {
      const angle = (b / branches) * Math.PI * 2 + level * 1.13 + seed * 0.01;
      const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const droop = 0.16 + rng() * 0.14;
      const center = new THREE.Vector3(
        radial.x * branchLength * 0.52 + leanX * t * t,
        y - branchLength * droop * 0.5,
        radial.z * branchLength * 0.52 + leanZ * t * t
      );
      const along = radial.clone().add(new THREE.Vector3(0, -droop, 0)).normalize();
      const up = new THREE.Vector3(0, 1, 0)
        .addScaledVector(along, -along.y)
        .normalize();
      const side = new THREE.Vector3().crossVectors(along, up).normalize();
      const halfU = branchLength * 0.52;
      const halfV = branchLength * 0.24;
      const q1 = quadrantRect(Math.floor(rng() * 4));
      leafParts.push(card(center, along, up, halfU, halfV, q1));
      const tilt = 0.9 + rng() * 0.5;
      const up2 = up
        .clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(side, Math.sin(tilt))
        .normalize();
      const q2 = quadrantRect(Math.floor(rng() * 4));
      leafParts.push(card(center.clone().addScaledVector(up, -0.05), along, up2, halfU * 0.92, halfV * 0.9, q2));
    }
  }

  // Top leader: a tight cluster of needle cards.
  for (let i = 0; i < 4; i++) {
    const y = height * (0.92 + i * 0.018);
    const angle = rng() * Math.PI * 2;
    const along = new THREE.Vector3(Math.cos(angle), 0.4, Math.sin(angle)).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(along, -along.y).normalize();
    leafParts.push(
      card(new THREE.Vector3(leanX, y, leanZ), along, up, 0.55, 0.32, quadrantRect(Math.floor(rng() * 4)))
    );
  }

  const bark = merge(barkParts);
  const leaves = merge(leafParts);
  return { bark, leaves, crown: buildCrown("conifer", height, seed), height };
}

/* ------------------------------------------------------------------ */
/* Far LOD billboard                                                   */
/* ------------------------------------------------------------------ */

function buildCrown(kind: "broad" | "conifer", height: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const width = height * (kind === "broad" ? 0.64 : 0.4);
  const variant = seed % 2 === 0 ? 0 : 1;
  // Two columns (variants) x two rows (broadleaf on top, conifer below).
  const rowBottom = kind === "broad" ? 0.5 : 0;
  const rowTop = kind === "broad" ? 1 : 0.5;
  const rect: [number, number, number, number] = [
    variant * 0.5 + ATLAS_INSET,
    rowBottom + ATLAS_INSET,
    (variant + 1) * 0.5 - ATLAS_INSET,
    rowTop - ATLAS_INSET
  ];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.35;
    const u = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const v = new THREE.Vector3(0, 1, 0);
    parts.push(
      card(
        new THREE.Vector3(0, height * 0.5, 0),
        u,
        v,
        width * 0.5,
        height * 0.5,
        rect
      )
    );
  }
  return merge(parts);
}

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext("2d")!];
}

function leafShape(
  ctx: CanvasRenderingContext2D,
  length: number,
  width: number,
  fill: string
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(length * 0.25, -width, length * 0.72, -width * 0.9, length, 0);
  ctx.bezierCurveTo(length * 0.72, width * 0.9, length * 0.25, width, 0, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,150,90,0.28)";
  ctx.lineWidth = Math.max(0.7, length * 0.045);
  ctx.beginPath();
  ctx.moveTo(length * 0.06, 0);
  ctx.lineTo(length * 0.86, 0);
  ctx.stroke();
}

function broadleafSpray(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  length: number,
  angle: number,
  rng: () => number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(58,48,30,0.95)";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.45, length * 0.03, length, 0);
  ctx.stroke();

  const count = 22;
  for (let i = 0; i < count; i++) {
    const t = 0.06 + (i / count) * 0.92;
    const side = i % 2 === 0 ? 1 : -1;
    const hue = 92 + rng() * 34;
    const sat = 28 + rng() * 24;
    const light = 16 + rng() * 16;
    const size = (26 + rng() * 20) * (1 - t * 0.42);
    const off = 5 + rng() * 12;
    ctx.save();
    ctx.translate(t * length, side * off);
    ctx.rotate(side * (0.5 + rng() * 0.55));
    leafShape(ctx, size, size * (0.34 + rng() * 0.1), `hsl(${hue} ${sat}% ${light}%)`);
    ctx.restore();
  }
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(length * (0.95 + rng() * 0.08), (rng() - 0.5) * 12);
    ctx.rotate((rng() - 0.5) * 2.2);
    const size = 20 + rng() * 14;
    leafShape(
      ctx,
      size,
      size * 0.4,
      `hsl(${92 + rng() * 30} ${30 + rng() * 20}% ${18 + rng() * 12}%)`
    );
    ctx.restore();
  }
  ctx.restore();
}

/** Fine vertical bark ridges with muted albedo variations; shared by instanced trunks.
 * Purely procedural and small: no additional runtime downloads. */
export function createBarkTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  const rng = makeRng(221127);
  ctx.fillStyle = "#77716a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12500; i++) {
    const x = rng() * 512, y = rng() * 512;
    ctx.strokeStyle = rng() > .48 ? "rgba(38,31,27,.15)" : "rgba(218,204,180,.11)";
    ctx.lineWidth = .4 + rng() * 2.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + (rng()-.5) * 4, y + 9,
      x + (rng()-.5) * 6, y + 20,
      x + (rng()-.5) * 5, y + 29 + rng() * 35);
    ctx.stroke();
  }
  const map = makeTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  return map;
}

export function createBroadleafTexture(): THREE.CanvasTexture {
  const S = 1024;
  const half = S / 2;
  const [canvas, ctx] = makeCanvas(S);
  ctx.clearRect(0, 0, S, S);
  const rng = makeRng(99117);
  for (let q = 0; q < 4; q++) {
    const qx = (q % 2) * half;
    const qy = Math.floor(q / 2) * half;
    ctx.save();
    ctx.beginPath();
    ctx.rect(qx + 2, qy + 2, half - 4, half - 4);
    ctx.clip();
    for (let s = 0; s < 3; s++) {
      const cx = qx + half * 0.5 + (rng() - 0.5) * half * 0.62;
      const cy = qy + half * 0.5 + (rng() - 0.5) * half * 0.62;
      broadleafSpray(ctx, cx, cy, half * (0.3 + rng() * 0.2), rng() * Math.PI * 2, rng);
    }
    ctx.restore();
  }
  return makeTexture(canvas);
}

function needleSpray(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  length: number,
  angle: number,
  rng: () => number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(60,58,34,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();

  const needles = 42;
  for (let i = 0; i < needles; i++) {
    const t = 0.04 + (i / needles) * 0.94;
    const side = i % 2 === 0 ? 1 : -1;
    const len = (24 + rng() * 18) * (1 - t * 0.55);
    const spread = 0.85 + rng() * 0.45;
    const x = t * length;
    const light = 15 + rng() * 14;
    ctx.strokeStyle = `hsl(${128 + rng() * 26} ${26 + rng() * 18}% ${light}%)`;
    ctx.lineWidth = 2.1 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + Math.cos(side * spread) * len * 0.55, Math.sin(side * spread) * len);
    ctx.stroke();
  }
  ctx.restore();
}

export function createNeedleTexture(): THREE.CanvasTexture {
  const S = 1024;
  const half = S / 2;
  const [canvas, ctx] = makeCanvas(S);
  ctx.clearRect(0, 0, S, S);
  const rng = makeRng(44771);
  for (let q = 0; q < 4; q++) {
    const qx = (q % 2) * half;
    const qy = Math.floor(q / 2) * half;
    ctx.save();
    ctx.beginPath();
    ctx.rect(qx + 2, qy + 2, half - 4, half - 4);
    ctx.clip();
    for (let s = 0; s < 3; s++) {
      const cx = qx + half * 0.5 + (rng() - 0.5) * half * 0.55;
      const cy = qy + half * 0.5 + (rng() - 0.5) * half * 0.55;
      needleSpray(ctx, cx, cy, half * (0.34 + rng() * 0.2), rng() * Math.PI * 2, rng);
    }
    ctx.restore();
  }
  return makeTexture(canvas);
}

function crownBroad(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  rng: () => number
): void {
  const cx = ox + 256;
  const baseY = oy + 498;
  // Trunk.
  ctx.strokeStyle = "rgba(48,38,26,1)";
  ctx.lineWidth = 17;
  ctx.beginPath();
  ctx.moveTo(cx + 2, baseY);
  ctx.quadraticCurveTo(cx - 4, oy + 330, cx + 2, oy + 240);
  ctx.stroke();

  // Branches behind the crown.
  ctx.lineWidth = 8;
  for (let i = 0; i < 7; i++) {
    const y = oy + 250 + i * 32;
    const dir = i % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo(cx + dir * 70, y - 14, cx + dir * (120 + rng() * 70), y - 45 - rng() * 40);
    ctx.stroke();
  }

  // Crown clusters: many small blobs with gaps, not one ellipse.
  const clusters = 130;
  for (let i = 0; i < clusters; i++) {
    const angle = rng() * Math.PI * 2;
    const rad = Math.pow(rng(), 0.55);
    const x = cx + Math.cos(angle) * rad * 205;
    const y = oy + 225 + Math.sin(angle) * rad * 185;
    if (y > baseY - 45) continue;
    const size = 18 + rng() * 26;
    const light = 13 + rng() * 16 + (y < oy + 190 ? 6 : 0);
    ctx.fillStyle = `hsl(${96 + rng() * 30} ${28 + rng() * 20}% ${light}%)`;
    for (let b = 0; b < 4; b++) {
      ctx.beginPath();
      ctx.ellipse(
        x + (rng() - 0.5) * size * 1.5,
        y + (rng() - 0.5) * size * 1.2,
        size * (0.5 + rng() * 0.5),
        size * (0.32 + rng() * 0.3),
        rng() * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
  // Moonlit rim on the upper-left edge.
  ctx.fillStyle = "rgba(92,126,84,0.5)";
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (1.02 + rng() * 0.85);
    const x = cx + Math.cos(a) * (145 + rng() * 55);
    const y = oy + 210 + Math.sin(a) * (130 + rng() * 45);
    ctx.beginPath();
    ctx.ellipse(x, y, 12 + rng() * 16, 7 + rng() * 9, rng(), 0, Math.PI * 2);
    ctx.fill();
  }
}

function crownConifer(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  rng: () => number
): void {
  const cx = ox + 256;
  const baseY = oy + 500;
  const topY = oy + 26;
  ctx.strokeStyle = "rgba(48,38,26,1)";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx, topY + 40);
  ctx.stroke();

  const tiers = 15;
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const y = baseY - 26 - t * (baseY - topY - 70);
    const halfWidth = (1 - t * 0.92) * 205 + 10;
    for (let i = 0; i < 22; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spread = 0.08 + (i / 22) * 0.9;
      const len = halfWidth * (0.75 + rng() * 0.3);
      const light = 12 + rng() * 15 + (t < 0.35 ? 4 : 0);
      ctx.strokeStyle = `hsl(${122 + rng() * 22} ${26 + rng() * 18}% ${light}%)`;
      ctx.lineWidth = 2.4 + rng() * 2.2;
      ctx.beginPath();
      ctx.moveTo(cx, y + rng() * 10);
      ctx.lineTo(
        cx + side * len * spread,
        y + 18 + rng() * 26 - len * 0.1
      );
      ctx.stroke();
    }
  }
  // Lighter moonlit tips.
  ctx.fillStyle = "rgba(86,116,78,0.45)";
  for (let i = 0; i < 30; i++) {
    const t = rng();
    const y = topY + t * 160;
    const x = cx + (rng() - 0.5) * (1 - t) * 110;
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + rng() * 8, 4 + rng() * 6, rng(), 0, Math.PI * 2);
    ctx.fill();
  }
}

function createCrownTexture(): THREE.CanvasTexture {
  const S = 1024;
  const half = S / 2;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  const rng = makeRng(80331);
  // Row 0 (canvas top): broadleaf variants. Row 1: conifer variants.
  crownBroad(ctx, 0, 0, rng);
  crownBroad(ctx, half, 0, rng);
  crownConifer(ctx, 0, half, rng);
  crownConifer(ctx, half, half, rng);
  return makeTexture(canvas);
}

export function vegetationSummary(stats: ForestStats): string {
  return `bosque: ${stats.total} árboles (${stats.near} cerca / ${stats.far} lejos), ${stats.triangles} triángulos`;
}
