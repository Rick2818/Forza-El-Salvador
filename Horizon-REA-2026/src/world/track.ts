// Minimal Track class for Horizon El Salvador.
// Provides procedural circuit generation + MCP Pitstop integration.
// MCP data can be loaded via pitstop.getCircuits() from src/integrations/pitstop.ts.

import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { SETTINGS } from "../core/settings";
import { smoothstep } from "../core/mathx";
import { clamp } from "../core/mathx";

export interface Segment {
  straight?: number;
  turn?: number;
  radius?: number;
  dir?: 1 | -1;
}

export interface CircuitPoint {
  x: number;
  z: number;
  y: number;
  t?: number;
}

export interface TurnInfo {
  index: number;
  name: string;
  type: "right" | "left" | "hairpin";
  radius: number;
  apexIndex: number;
}

/** Minimal track class with procedural generation. */
export class Track {
  readonly group = new THREE.Group();
  curve: THREE.CatmullRomCurve3 = new THREE.CatmullRomCurve3([], true);
  samples: THREE.Vector3[] = [];
  tangents: THREE.Vector3[] = [];
  rights: THREE.Vector3[] = [];
  curvatures: number[] = [];
  targetSpeeds: number[] = [];
  length = 0;
  segmentLength = 0;
  startIndex = 0;
  width = SETTINGS.track.width;
  halfWidth = SETTINGS.track.width / 2;

  /** Build the track using procedural layout (original logic). */
  build(): void {
    const SEGMENTS: Segment[] = [
      { straight: 456.6 },
      { turn: 90, radius: 62, dir: 1 },
      { straight: 45.8 },
      { turn: 48, radius: 55, dir: -1 },
      { turn: 48, radius: 55, dir: 1 },
      { straight: 140 },
      { turn: 90, radius: 48, dir: 1 },
      { straight: 200 },
      { turn: 65, radius: 75, dir: -1 },
      { turn: 65, radius: 75, dir: 1 },
      { straight: 110 },
      { turn: 90, radius: 85, dir: 1 },
      { straight: 160 },
      { turn: 40, radius: 60, dir: -1 },
      { turn: 40, radius: 60, dir: 1 },
      { straight: 90 },
      { turn: 90, radius: 52, dir: 1 }
    ];

    function buildCenterline(): THREE.Vector3[] {
      const pts: THREE.Vector3[] = [];
      let x = 0;
      let z = 0;
      let heading = 0;
      const push = (px: number, pz: number): void => {
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(last.x - px, last.z - pz) > 0.6) {
          pts.push(new THREE.Vector3(px, 0, pz));
        }
      };
      push(x, z);

      for (const seg of SEGMENTS) {
        if (seg.straight !== undefined) {
          const steps = Math.max(1, Math.ceil(seg.straight / 8));
          const dx = Math.cos(heading) * (seg.straight / steps);
          const dz = Math.sin(heading) * (seg.straight / steps);
          for (let i = 0; i < steps; i++) {
            x += dx;
            z += dz;
            push(x, z);
          }
          continue;
        }
        const angle = ((seg.turn ?? 0) * Math.PI) / 180;
        const radius = seg.radius ?? 60;
        const dir = seg.dir ?? 1;
        const steps = Math.max(2, Math.ceil((Math.abs(angle) * radius) / 3));
        const dA = (angle / steps) * dir;
        for (let i = 0; i < steps; i++) {
          heading += dA;
          x += Math.cos(heading) * radius * Math.abs(dA);
          z += Math.sin(heading) * radius * Math.abs(dA);
          push(x, z);
        }
      }
      push(0, 0);
      return pts;
    }

    const centerline = buildCenterline();
    const N = 1500;
    this.curve = new THREE.CatmullRomCurve3(centerline, true, "catmullrom", 0.5);
    this.length = this.curve.getLength();
    const spaced = this.curve.getSpacedPoints(N);
    this.samples = spaced.slice(0, N);
    this.segmentLength = this.length / N;

    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const prev = this.samples[(i - 1 + N) % N];
      const next = this.samples[(i + 1) % N];
      const tangent = next.clone().sub(prev).normalize();
      this.tangents.push(tangent);
      this.rights.push(tangent.clone().cross(up).normalize());
    }

    for (let i = 0; i < N; i++) {
      const a = this.tangents[(i - 2 + N) % N];
      const b = this.tangents[(i + 2) % N];
      const angle = clamp(a.dot(b), -1, 1);
      this.curvatures.push(angle / (4 * this.segmentLength));
    }
    // Light smoothing
    const smoothed = this.curvatures.map((_, i) => {
      let sum = 0;
      let w = 0;
      for (let d = -4; d <= 4; d++) {
        const weight = 1 - Math.abs(d) / 5;
        sum += this.curvatures[(i + d + N) % N] * weight;
        w += weight;
      }
      return sum / w;
    });
    this.curvatures = smoothed;

    this.startIndex = Math.round(48 / this.segmentLength) % N;

    const rawSpeed = this.curvatures.map((k) =>
      clamp(Math.sqrt(13.5 / Math.max(k, 1e-4)), 20, SETTINGS.physics.topSpeed)
    );
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const next = rawSpeed[(i + 1) % N];
        const allowed = Math.sqrt(next * next + 2 * 9.5 * this.segmentLength);
        rawSpeed[i] = Math.min(rawSpeed[i], allowed);
      }
    }
    this.targetSpeeds = rawSpeed;
  }

  /** Add physics colliders to the track. */
  addPhysics(world: RAPIER.World): void {
    const ground = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -2.5, 0)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1400, 2.5, 1400).setFriction(1.05),
      ground
    );

    const offset = this.halfWidth + (SETTINGS.track.barrierOffset ?? 2) - 2;
    for (const side of [-1, 1]) {
      const geo = this.wallGeometry(side * offset, 1.35);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const idx = geo.index!;
      const vertices = new Float32Array(pos.array as Float32Array);
      const indices = new Uint32Array(idx.array as ArrayLike<number>);

      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.25).setRestitution(0.1),
        body
      );
    }
  }

  altitudeAt(): number {
    return 0.02;
  }

  gripAt(_index: number, lateral: number): number {
    const over = Math.abs(lateral) - this.halfWidth;
    if (over <= 0.35) return 1;
    return 1 - 0.42 * smoothstep(0.35, 4.5, over);
  }

  sampleAt(index: number): THREE.Vector3 {
    const N = this.samples.length;
    return this.samples[((index % N) + N) % N];
  }

  rightAt(index: number): THREE.Vector3 {
    const N = this.rights.length;
    return this.rights[((index % N) + N) % N];
  }

  tangentAt(index: number): THREE.Vector3 {
    const N = this.tangents.length;
    return this.tangents[((index % N) + N) % N];
  }

  nearestIndex(pos: THREE.Vector3, hint = -1): number {
    const N = this.samples.length;
    let best = 0;
    let bestDist = Infinity;
    if (hint >= 0) {
      for (let d = -45; d <= 45; d++) {
        const i = (hint + d + N) % N;
        const p = this.samples[i];
        const dist = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      if (bestDist < 900) return best;
    }
    for (let i = 0; i < N; i += 2) {
      const p = this.samples[i];
      const dist = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  progress(index: number): number {
    const N = this.samples.length;
    return ((index - this.startIndex + N) % N) / N;
  }

  locate(pos: THREE.Vector3, hint = -1): { index: number; lateral: number; distance: number } {
    const index = this.nearestIndex(pos, hint);
    const s = this.samples[index];
    const r = this.rights[index];
    const lateral = (pos.x - s.x) * r.x + (pos.z - s.z) * r.z;
    const dx = pos.x - s.x;
    const dz = pos.z - s.z;
    return { index, lateral, distance: Math.hypot(dx, dz) };
  }

  minimapPath(size = 168, pad = 12): { points: [number, number][]; bounds: THREE.Box2 } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of this.samples) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z);
    }
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const points: [number, number][] = this.samples.map((s) => [
      pad + (s.x - minX) * scale,
      size - (pad + (s.z - minZ) * scale)
    ]);
    return { points, bounds: new THREE.Box2(new THREE.Vector2(minX, minZ), new THREE.Vector2(maxX, maxZ)) };
  }

  wallGeometry(offset: number, height: number, baseY = 0): THREE.BufferGeometry {
    const N = this.samples.length;
    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < N; i++) {
      const s = this.samples[i];
      const r = this.rights[i];
      const px = s.x + r.x * offset;
      const pz = s.z + r.z * offset;
      positions.push(px, baseY, pz, px, baseY + height, pz);
    }

    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = ((i + 1) % N) * 2;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  createCheckerTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 32;
    const ctx = c.getContext("2d")!;
    const cell = 32;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#f2f4f7" : "#0d0f12";
        ctx.fillRect(x * cell, y * (c.height / 2), cell, c.height / 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  }

  createBannerTexture(main: string, sub: string, accent = "#ff5a1f"): THREE.CanvasTexture {
    const [canvas, ctx] = this.createTextCanvas(2048, 256);
    const grad = ctx.createLinearGradient(0, 0, 2048, 0);
    grad.addColorStop(0, "#0a0d12");
    grad.addColorStop(0.55, "#12161d");
    grad.addColorStop(1, "#0a0d12");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2048, 256);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 226, 2048, 10);
    ctx.font = "900 128px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f4f7fb";
    ctx.fillText(main, 1024, 110);
    ctx.font = "700 34px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = accent;
    ctx.fillText(sub, 1024, 188);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  private createTextCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return [c, c.getContext("2d")!];
  }
}