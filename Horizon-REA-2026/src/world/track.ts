// Minimal Track class for Horizon El Salvador.
// Provides procedural circuit generation + MCP Pitstop integration.
// MCP data can be loaded via pitstop.getCircuits() from src/integrations/pitstop.ts.

import * as THREE from "three";
import { addMonzonRoadDetails } from "./monzonRoadDetails";
import { monzonPitBarrierGap } from "./monzonPitAccess";
import RAPIER from "@dimforge/rapier3d-compat";
import { SETTINGS } from "../core/settings";
import { smoothstep } from "../core/mathx";
import { clamp } from "../core/mathx";
import { createAsphaltMaps, createBannerTexture, createCheckerTexture } from "./textures";
import { DEFAULT_CIRCUIT_ID, getCircuit, type CircuitDefinition, analyzeCircuitDefinition } from "./circuits";
import { suzakaCenterline } from "./suzakaGeometry";
import { createSuzakaSuspensionBridge, installSuzakaBridgePhysics } from "./suzakaSuspensionBridge";
import { installSuzakaRoadsideProtection, SUZAKA_OUTER_BARRIER_HEIGHT } from "./suzakaRoadsideSafety";
import { internationalCenterline, type InternationalCircuitId } from "./internationalGeometry";

/** Near-black racing asphalt independent of daylight tint and exposure.
 * Reuses the aggregate albedo texture without expensive lighting on mobile.
 */
export function createDarkAsphaltMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color: 0x646464,
    toneMapped: false
  });
}

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
  readonly lampPositions: THREE.Vector3[] = [];
  curve: THREE.CatmullRomCurve3 = new THREE.CatmullRomCurve3([], true);
  samples: THREE.Vector3[] = [];
  tangents: THREE.Vector3[] = [];
  rights: THREE.Vector3[] = [];
  curvatures: number[] = [];
  targetSpeeds: number[] = [];
  length = 0;
  segmentLength = 0;
  startIndex = 0;
  width: number;
  halfWidth: number;

  get barrierLateralOffset(): number {
    // Suzaka's old wall left 7.5m of unprotected grass after the red/white
    // kerb. Keep its visual AND physical wall just outside the 1.2m kerb.
    if (this.circuit.id === "suzaka") return this.halfWidth + 1.75;
    return this.halfWidth + (SETTINGS.track.barrierOffset ?? 2) - 2;
  }

  constructor(readonly circuit: CircuitDefinition = getCircuit(DEFAULT_CIRCUIT_ID)!) {
    this.width = this.circuit.layout === "figure-eight" || this.circuit.layout === "mountain" ? 14
      : this.circuit.layout === "desert" ? 16 : SETTINGS.track.width;
    this.halfWidth = this.width / 2;
  }

  /** Build the track using procedural layout (original logic). */
  build(): void {
    const report = analyzeCircuitDefinition(this.circuit);
    if (!report.ok) throw new Error(`Circuito ${this.circuit.name}: ${report.issues.join(", ")}`);
    const SEGMENTS = this.circuit.segments;

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

    const centerline = this.circuit.layout === "figure-eight"
      ? suzakaCenterline().map(p => new THREE.Vector3(p.x, p.y, p.z))
      : this.circuit.layout === "mountain" || this.circuit.layout === "desert"
        ? internationalCenterline(this.circuit.id as InternationalCircuitId)
          .map(p => new THREE.Vector3(p.x, p.y, p.z))
        : buildCenterline();
    const N = 1500;
    this.curve = new THREE.CatmullRomCurve3(centerline, true, "catmullrom", 0.5);
    if (this.circuit.layout) this.curve.arcLengthDivisions = 4000;
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
      // Angular curvature provides meaningful braking targets for Monzon and 3D layouts.
      const bend = this.circuit.layout || this.circuit.id === "monzon" ? Math.acos(angle) : angle;
      this.curvatures.push(bend / (4 * this.segmentLength));
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

    this.startIndex = Math.round((this.circuit.layout ? 100 : 48) / this.segmentLength) % N;

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

    this.buildVisuals();
  }

  /**
   * Build the visible circuit: asphalt ribbon, kerbs, edge lines, barriers,
   * start/finish gantry and trackside lamps. Without this the track exists
   * only as a mathematical curve and the world reads as empty ground.
   */
  buildVisuals(): void {
    const N = this.samples.length;
    if (N === 0) return;
    this.group.name = "track-visuals";
    const halfW = this.halfWidth;
    const barrierOffset = this.barrierLateralOffset;
    const surfaceY = 0.02;

    // ---- Asphalt surface.
    const asphalt = createAsphaltMaps();
    for (const tex of [asphalt.map, asphalt.normalMap, asphalt.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2.2, 1);
    }
    // Absolute dark asphalt rather than blue-gray PBR under the very bright
    // daylight lighting/sky environment. Unlit black charcoal retains the
    // subtle aggregate map and ensures the white lines stay high-contrast.
    const roadMat = this.circuit.id === "monzon"
      ? new THREE.MeshStandardMaterial({
          map: asphalt.map, normalMap: asphalt.normalMap,
          normalScale: new THREE.Vector2(.18, .18),
          roughnessMap: asphalt.roughnessMap, color: 0x898989,
          roughness: .95, metalness: 0, envMapIntensity: .12
        })
      : createDarkAsphaltMaterial(asphalt.map);
    const road = new THREE.Mesh(this.ribbonGeometry(-halfW, halfW, surfaceY, 12), roadMat);
    road.name = "asphalt";
    road.receiveShadow = true;
    this.group.add(road);

    // ---- White edge lines just inside the kerbs.
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xf4f6fa,
      emissive: 0x8d949e,
      emissiveIntensity: 0.5,
      roughness: 0.7
    });
    for (const side of [-1, 1]) {
      const inner = side * (halfW - 0.55);
      const outer = side * (halfW - 0.12);
      const line = new THREE.Mesh(
        this.ribbonGeometry(Math.min(inner, outer), Math.max(inner, outer), surfaceY + 0.012, 12),
        lineMat
      );
      line.name = `edge-line-${side}`;
      this.group.add(line);
    }

    // ---- Kerbs: red/white striped strip outside the tarmac.
    const kerbTex = this.kerbTexture();
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.65, metalness: 0.04 });
    for (const side of [-1, 1]) {
      const a = side * halfW;
      const b = side * (halfW + 1.2);
      const kerb = new THREE.Mesh(
        this.ribbonGeometry(Math.min(a, b), Math.max(a, b), surfaceY + 0.006, 6),
        kerbMat
      );
      kerb.name = `kerb-${side}`;
      this.group.add(kerb);
    }

    if (this.circuit.id === "monzon") {
      const gravel = new THREE.MeshStandardMaterial({ color: 0x605647, roughness: 1, envMapIntensity: .1 });
      for (const side of [-1, 1]) {
        const a = side * (halfW + 1.3);
        const b = side * (barrierOffset - .3);
        const shoulder = new THREE.Mesh(
          this.ribbonGeometry(Math.min(a, b), Math.max(a, b), surfaceY - .006, 4), gravel);
        shoulder.name = "monzon-gravel-shoulder";
        shoulder.receiveShadow = true;
        this.group.add(shoulder);
      }
    }

    // ---- Barriers. Same offset as the physics colliders so the car stops
    // exactly where the wall is drawn.
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0x39404c,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xd9dde4,
      emissive: 0x5c636d,
      emissiveIntensity: 0.45,
      roughness: 0.55,
      side: THREE.DoubleSide
    });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        this.wallGeometry(side * barrierOffset,
          this.circuit.id === "suzaka" ? SUZAKA_OUTER_BARRIER_HEIGHT : SETTINGS.track.barrierHeight ?? 1.05,
          surfaceY),
        barrierMat
      );
      wall.name = `barrier-${side}`;
      wall.receiveShadow = true;
      this.group.add(wall);

      const rail = new THREE.Mesh(
        this.railGeometry(side * barrierOffset,
          this.circuit.id === "suzaka" ? SUZAKA_OUTER_BARRIER_HEIGHT : SETTINGS.track.barrierHeight ?? 1.05,
          surfaceY),
        railMat
      );
      rail.name = `barrier-rail-${side}`;
      this.group.add(rail);
    }

    // ---- Start/finish chequered line + gantry.
    const checker = createCheckerTexture();
    checker.repeat.set(3, 1);
    const startLine = new THREE.Mesh(
      this.startLineGeometry(3.2),
      new THREE.MeshStandardMaterial({
        map: checker,
        emissive: 0x6f747c,
        emissiveIntensity: 0.55,
        roughness: 0.6
      })
    );
    startLine.name = "start-line";
    this.group.add(startLine);
    this.buildGantry();
    if (this.circuit.id === "monzon") addMonzonRoadDetails(this);
    if (this.circuit.id === "suzaka") this.group.add(createSuzakaSuspensionBridge(this));

    // ---- Trackside lamps: instanced poles with glowing heads.
    if (this.circuit.id !== "suzaka" && this.circuit.id !== "sparda") this.buildLamps(barrierOffset);
  }

  /** Ribbon that follows the centreline between two lateral offsets. */
  private ribbonGeometry(from: number, to: number, y: number, vScale: number): THREE.BufferGeometry {
    const N = this.samples.length;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < N; i++) {
      const s = this.samples[i];
      const r = this.rights[i];
      positions.push(s.x + r.x * from, s.y + y, s.z + r.z * from);
      positions.push(s.x + r.x * to, s.y + y, s.z + r.z * to);
      const v = (i * this.segmentLength) / vScale;
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = ((i + 1) % N) * 2;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /** Thin horizontal cap on top of the barrier walls. */
  private railGeometry(offset: number, height: number, baseY: number): THREE.BufferGeometry {
    const N = this.samples.length;
    const positions: number[] = [];
    const indices: number[] = [];
    const half = 0.14;

    for (let i = 0; i < N; i++) {
      const s = this.samples[i];
      const r = this.rights[i];
      const y = s.y + baseY + height;
      positions.push(s.x + r.x * (offset - half), y, s.z + r.z * (offset - half));
      positions.push(s.x + r.x * (offset + half), y, s.z + r.z * (offset + half));
    }
    for (let i = 0; i < N; i++) {
      const from = this.samples[i];
      const to = this.samples[(i + 1) % N];
      // The same physical gap is used in the rendered guardrail.
      if (this.circuit.id === "monzon" &&
          monzonPitBarrierGap((from.x + to.x) / 2, (from.z + to.z) / 2, offset)) continue;
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

  private startLineGeometry(depth: number): THREE.BufferGeometry {
    const i = this.startIndex % this.samples.length;
    const s = this.samples[i];
    const t = this.tangents[i];
    const r = this.rights[i];
    const half = this.halfWidth;
    const halfD = depth / 2;
    const y = s.y + 0.035;

    const corners = [
      new THREE.Vector3(s.x - r.x * half - t.x * halfD, y, s.z - r.z * half - t.z * halfD),
      new THREE.Vector3(s.x + r.x * half - t.x * halfD, y, s.z + r.z * half - t.z * halfD),
      new THREE.Vector3(s.x - r.x * half + t.x * halfD, y, s.z - r.z * half + t.z * halfD),
      new THREE.Vector3(s.x + r.x * half + t.x * halfD, y, s.z + r.z * half + t.z * halfD)
    ];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(corners.flatMap((c) => [c.x, c.y, c.z]), 3)
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    geo.computeVertexNormals();
    return geo;
  }

  private kerbTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#c8372a" : "#eef0f4";
      ctx.fillRect(0, i * 16, 16, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /** Start/finish gantry with a lit banner over the track. */
  private buildGantry(): void {
    const i = this.startIndex % this.samples.length;
    const s = this.samples[i];
    const t = this.tangents[i];
    const r = this.rights[i];
    const half = this.halfWidth + 2.4;
    const height = 7.2;

    const postMat = new THREE.MeshStandardMaterial({ color: 0x2c333d, roughness: 0.7, metalness: 0.35 });
    const postGeo = new THREE.BoxGeometry(0.45, height, 0.45);

    const circuitBanner = this.circuit.id === "monzon" ? "CIRCUITO MONZON"
      : this.circuit.id === "sparda" ? "CIRCUITO SPARDA"
      : this.circuit.id === "sakhir-horizon" ? "SAKHIR HORIZON"
      : this.circuit.id === "suzaka" ? "CIRCUITO SUZAKA"
      : "HORIZON EL SALVADOR";
    const bannerTex = createBannerTexture(circuitBanner, "HORIZON EL SALVADOR");
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bannerTex,
      emissive: 0xffffff,
      emissiveMap: bannerTex,
      emissiveIntensity: 0.75,
      roughness: 0.5,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 2.1), beamMat);
    beam.position.set(s.x, s.y + height - 1.3, s.z);
    beam.rotation.y = Math.atan2(t.x, t.z) + Math.PI;
    beam.name = "start-banner";
    this.group.add(beam);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(s.x + r.x * half * side, s.y + height / 2, s.z + r.z * half * side);
      post.castShadow = false;
      this.group.add(post);
    }
  }

  /** Instanced trackside lamps so the asphalt stays readable at night. */
  private buildLamps(barrierOffset: number): void {
    const N = this.samples.length;
    const stride = this.circuit.id === "monzon" ? Math.max(1, Math.round(48 / this.segmentLength)) : 55;
    const perSide = Math.floor(N / stride);
    if (perSide < 2) return;

    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.4, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a303a, roughness: 0.8 });
    const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d0,
      emissive: 0xffe9b0,
      emissiveIntensity: 2.4,
      roughness: 0.4
    });

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, perSide * 2);
    const heads = new THREE.InstancedMesh(headGeo, headMat, perSide * 2);
    poles.frustumCulled = false;
    heads.frustumCulled = false;

    const m = new THREE.Matrix4();
    let n = 0;
    for (const side of [-1, 1]) {
      for (let k = 0; k < perSide; k++) {
        const i = (k * stride + (side > 0 ? Math.floor(stride / 2) : 0)) % N;
        const s = this.samples[i];
        const r = this.rights[i];
        const x = s.x + r.x * barrierOffset * side * 1.12;
        const z = s.z + r.z * barrierOffset * side * 1.12;
        m.makeTranslation(x, s.y + 3.2, z);
        poles.setMatrixAt(n, m);
        m.makeTranslation(x, s.y + 6.5, z);
        heads.setMatrixAt(n, m);
        this.lampPositions.push(new THREE.Vector3(x, s.y + 6.5, z));
        n++;
      }
    }
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    poles.name = "lamp-poles";
    heads.name = "lamp-heads";
    this.group.add(poles);
    this.group.add(heads);
  }

  /** Add physics colliders to the track. */
  addPhysics(world: RAPIER.World): void {
    // Fit the safety floor to the entire circuit, including long straights.
    const bounds = new THREE.Box3().setFromPoints(this.samples);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const ground = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, -2.5, center.z)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2 + 300, 2.5, size.z / 2 + 300).setFriction(1.05),
      ground
    );

    // Rapier's raycast-vehicle wheels need a solid drivable bridge surface,
    // not a visual-only mesh. Preserve the existing flat ground beneath the
    // flyover so vehicles on the lower branch have physical support too.
    if (this.circuit.layout === "figure-eight" || this.circuit.layout === "mountain") {
      const road = this.group.getObjectByName("asphalt") as THREE.Mesh<THREE.BufferGeometry> | undefined;
      if (!road || !road.geometry.index) throw new Error("Suzaka bridge collider: road mesh missing");
      const pos = road.geometry.getAttribute("position") as THREE.BufferAttribute;
      const vertexArray = new Float32Array(pos.array as ArrayLike<number>);
      const triangleArray = new Uint32Array(road.geometry.index.array as ArrayLike<number>);
      const deck = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(vertexArray, triangleArray).setFriction(1.05),
        deck
      );
    }

    if (this.circuit.id === "suzaka") {
      // Thick, overlapping CCD-compatible walls on the ENTIRE circuit.
      // The earlier zero-thickness trimesh could be crossed at high velocity,
      // leaving the player stuck in the grass behind the red-white kerb.
      installSuzakaRoadsideProtection(world, this);
    } else {
      const offset = this.barrierLateralOffset;
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
    if (this.circuit.id === "suzaka") installSuzakaBridgePhysics(world, this);
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
        const dist = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 +
        (this.circuit.layout === "figure-eight" ? (p.y - pos.y) ** 2 * 4 :
          this.circuit.layout === "mountain" ? (p.y - pos.y) ** 2 : 0);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      if (bestDist < 900) return best;
    }
    for (let i = 0; i < N; i += 2) {
      const p = this.samples[i];
      // Global reacquisition must distinguish the flyover from the road below,
      // just as the local hint search does after the first physics step.
      const dist = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 +
        (this.circuit.layout === "figure-eight" ? (p.y - pos.y) ** 2 * 4 :
          this.circuit.layout === "mountain" ? (p.y - pos.y) ** 2 : 0);
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
      positions.push(px, s.y + baseY, pz, px, s.y + baseY + height, pz);
    }

    for (let i = 0; i < N; i++) {
      const from = this.samples[i];
      const to = this.samples[(i + 1) % N];
      // The same physical gap is used in the rendered guardrail.
      if (this.circuit.id === "monzon" &&
          monzonPitBarrierGap((from.x + to.x) / 2, (from.z + to.z) / 2, offset)) continue;
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
