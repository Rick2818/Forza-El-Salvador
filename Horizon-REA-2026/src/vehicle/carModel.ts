import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  createCarbonTexture,
  createGlowTexture,
  createHeadlightPoolTexture,
  createNumberDecal
} from "../world/textures";
import { cloneCarAsset, USE_BLENDER_SHELL, type CarVariant } from "./carAsset";

/**
 * Fully procedural GT car. The body is a lofted hull (a stack of rounded
 * sections) instead of an extruded plate, so the nose, the haunches and the
 * wheel arches have real volume. Detail parts are merged per material.
 *
 * Forward is +Z, right is +X, up is +Y. The body group sits on y = 0 (ground)
 * and the chassis origin is BODY_CENTER_Y above it.
 */

export const BODY_CENTER_Y = 0.62;
export const WHEEL_VIS_RADIUS = 0.36;
export const WHEEL_X = 0.9;
export const WHEEL_Z = 1.34;
const WHEEL_CONNECTION_Y = -0.02;

export interface WheelVisual {
  steer: THREE.Group;
  spin: THREE.Group;
}

export interface CarVisual {
  root: THREE.Group;
  bodyRoot: THREE.Group;
  wheels: WheelVisual[];
  paint: THREE.MeshPhysicalMaterial;
  taillightMat: THREE.MeshStandardMaterial;
  headlightMat: THREE.MeshStandardMaterial;
}

type Vec3 = [number, number, number];
type CurvePoint = [number, number];

/* ------------------------------------------------------------------ */
/* Shared assets                                                       */
/* ------------------------------------------------------------------ */

const tireMat = new THREE.MeshStandardMaterial({
  color: 0x0b0b0d,
  roughness: 0.95,
  metalness: 0.03,
  side: THREE.DoubleSide
});

let carbonTexture: THREE.CanvasTexture | null = null;
function carbonMap(): THREE.CanvasTexture {
  if (!carbonTexture) {
    carbonTexture = createCarbonTexture();
    carbonTexture.repeat.set(5, 5);
  }
  return carbonTexture;
}

let wheelAssets: {
  tire: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
} | null = null;

function buildWheelAssets() {
  if (wheelAssets) return wheelAssets;

  const R = WHEEL_VIS_RADIUS;
  const halfW = 0.16;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.232, -halfW * 0.92),
    new THREE.Vector2(0.292, -halfW * 1.02),
    new THREE.Vector2(0.338, -halfW * 0.88),
    new THREE.Vector2(R - 0.012, -halfW * 0.55),
    new THREE.Vector2(R, 0),
    new THREE.Vector2(R - 0.012, halfW * 0.55),
    new THREE.Vector2(0.338, halfW * 0.88),
    new THREE.Vector2(0.292, halfW * 1.02),
    new THREE.Vector2(0.232, halfW * 0.92)
  ];
  const tire = new THREE.LatheGeometry(profile, 48);
  tire.rotateZ(Math.PI / 2);

  const rimParts: THREE.BufferGeometry[] = [];
  const rimColor = new THREE.Color(0xd7dce4);
  const discColor = new THREE.Color(0x6d747e);
  const caliperColor = new THREE.Color(0xc4211a);

  const barrel = new THREE.CylinderGeometry(0.245, 0.245, 0.30, 40, 1, true);
  barrel.rotateZ(Math.PI / 2);
  rimParts.push(colored(barrel, rimColor));

  for (const side of [-1, 1]) {
    const lip = new THREE.TorusGeometry(0.247, 0.018, 8, 44);
    lip.rotateY(Math.PI / 2);
    lip.translate(side * 0.148, 0, 0);
    rimParts.push(colored(lip, rimColor));

    for (let i = 0; i < 5; i++) {
      for (const twin of [-0.085, 0.085]) {
        const spoke = new THREE.BoxGeometry(0.036, 0.175, 0.052);
        spoke.translate(side * 0.096, 0.135, 0);
        spoke.rotateX((i / 5) * Math.PI * 2 + twin);
        rimParts.push(colored(spoke, rimColor));
      }
    }

    const lock = new THREE.CylinderGeometry(0.052, 0.052, 0.035, 24);
    lock.rotateZ(Math.PI / 2);
    lock.translate(side * 0.118, 0, 0);
    rimParts.push(colored(lock, new THREE.Color(0x9aa2ad)));
  }

  const hub = new THREE.CylinderGeometry(0.068, 0.068, 0.24, 24);
  hub.rotateZ(Math.PI / 2);
  rimParts.push(colored(hub, rimColor));

  const disc = new THREE.CylinderGeometry(0.187, 0.187, 0.028, 40);
  disc.rotateZ(Math.PI / 2);
  rimParts.push(colored(disc, discColor));

  const caliper = new THREE.BoxGeometry(0.075, 0.10, 0.16);
  caliper.translate(0, 0.135, 0);
  rimParts.push(colored(caliper, caliperColor));

  const metal = mergeIndexed(rimParts, true);
  wheelAssets = { tire, metal };
  return wheelAssets;
}

function colored(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function clean(geo: THREE.BufferGeometry, keepColor = false): THREE.BufferGeometry {
  for (const key of Object.keys(geo.attributes)) {
    if (key !== "position" && key !== "normal" && key !== "uv" && !(keepColor && key === "color")) {
      geo.deleteAttribute(key);
    }
  }
  geo.clearGroups();
  return geo;
}

function mergeIndexed(parts: THREE.BufferGeometry[], keepColor = false): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => clean(g, keepColor)), false);
  if (!merged) throw new Error("carModel: geometry merge failed");
  return merged;
}

/* ------------------------------------------------------------------ */
/* Loft helpers                                                        */
/* ------------------------------------------------------------------ */

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function curveValue(points: CurvePoint[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  let i = 0;
  while (i < points.length - 2 && x > points[i + 1][0]) i++;
  const p1 = points[i];
  const p2 = points[i + 1];
  const p0 = points[Math.max(0, i - 1)];
  const p3 = points[Math.min(points.length - 1, i + 2)];
  const t = (x - p1[0]) / (p2[0] - p1[0]);
  return catmull(p0[1], p1[1], p2[1], p3[1], t);
}

interface LoftSection {
  z: number;
  points: THREE.Vector2[];
}

function loftSections(sections: LoftSection[]): THREE.BufferGeometry {
  const n = sections[0].points.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const zMin = sections[0].z;
  const zMax = sections[sections.length - 1].z;

  for (const section of sections) {
    for (let k = 0; k < n; k++) {
      const p = section.points[k];
      positions.push(p.x, p.y, section.z);
      uvs.push(k / n, (section.z - zMin) / (zMax - zMin));
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const a = i * n + k;
      const b = i * n + k2;
      const c = (i + 1) * n + k;
      const d = (i + 1) * n + k2;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function capGeometry(section: LoftSection, front: boolean): THREE.BufferGeometry {
  const points = section.points;
  const n = points.length;
  const center = new THREE.Vector2();
  for (const p of points) center.add(p);
  center.multiplyScalar(1 / n);

  const positions: number[] = [center.x, center.y, section.z];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = points[k];
    positions.push(p.x, p.y, section.z);
    uvs.push(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  }
  for (let k = 0; k < n; k++) {
    const a = 1 + k;
    const b = 1 + ((k + 1) % n);
    if (front) indices.push(0, a, b);
    else indices.push(0, b, a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function bodySection(w: number, bottom: number, top: number): THREE.Vector2[] {
  const N = 18;
  const mid = (top + bottom) * 0.5;
  const half = (top - bottom) * 0.5;
  const out: THREE.Vector2[] = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.62);
    const ey = Math.sign(sa) * Math.pow(Math.abs(sa), 0.72);
    let x = w * ex;
    const y = mid + half * ey;
    if (y < bottom + half * 0.42) x *= 0.88;
    out.push(new THREE.Vector2(x, y));
  }
  return out;
}

function cabinSection(
  belt: number,
  roof: number,
  widthBase: number,
  widthRoof: number
): THREE.Vector2[] {
  const h = Math.max(0.02, roof - belt);
  return [
    new THREE.Vector2(-widthBase, belt),
    new THREE.Vector2(widthBase, belt),
    new THREE.Vector2(widthBase * 0.99, belt + h * 0.62),
    new THREE.Vector2(widthRoof, belt + h),
    new THREE.Vector2(widthRoof * 0.5, belt + h + 0.014),
    new THREE.Vector2(-widthRoof * 0.5, belt + h + 0.014),
    new THREE.Vector2(-widthRoof, belt + h),
    new THREE.Vector2(-widthBase * 0.99, belt + h * 0.62)
  ];
}

/* ------------------------------------------------------------------ */
/* Body profiles                                                       */
/* ------------------------------------------------------------------ */

const BODY_Z_MIN = -2.32;
const BODY_Z_MAX = 2.32;

// Half width, metres. Fender bulges are baked into the curve.
const widthCurve: CurvePoint[] = [
  [-2.32, 0.78],
  [-2.2, 0.9],
  [-2.0, 0.975],
  [-1.7, 1.005],
  [-1.34, 1.045],
  [-1.0, 0.995],
  [-0.5, 0.955],
  [0.0, 0.95],
  [0.5, 0.955],
  [1.0, 0.995],
  [1.34, 1.045],
  [1.7, 1.005],
  [2.0, 0.96],
  [2.18, 0.895],
  [2.32, 0.76]
];

// Beltline / hood / deck height.
const topCurve: CurvePoint[] = [
  [-2.32, 0.79],
  [-2.2, 0.84],
  [-2.0, 0.875],
  [-1.7, 0.9],
  [-1.34, 0.91],
  [-0.9, 0.885],
  [-0.4, 0.858],
  [0.0, 0.852],
  [0.5, 0.856],
  [0.95, 0.868],
  [1.34, 0.868],
  [1.7, 0.85],
  [2.0, 0.775],
  [2.18, 0.665],
  [2.32, 0.53]
];

// Floor, before the wheel arch cut.
const floorCurve: CurvePoint[] = [
  [-2.32, 0.3],
  [-2.1, 0.22],
  [-1.8, 0.15],
  [0.0, 0.13],
  [1.8, 0.15],
  [2.1, 0.2],
  [2.32, 0.3]
];

const cabinRoof: CurvePoint[] = [
  [-1.52, 0.9],
  [-1.42, 0.95],
  [-1.25, 1.03],
  [-1.0, 1.1],
  [-0.7, 1.135],
  [-0.2, 1.145],
  [0.25, 1.14],
  [0.55, 1.07],
  [0.75, 0.98],
  [0.94, 0.87]
];

const cabinBase: CurvePoint[] = [
  [-1.52, 0.6],
  [-1.2, 0.68],
  [-0.6, 0.74],
  [0.2, 0.75],
  [0.7, 0.72],
  [0.94, 0.66]
];

const cabinTop: CurvePoint[] = [
  [-1.52, 0.38],
  [-1.2, 0.46],
  [-0.6, 0.54],
  [0.2, 0.55],
  [0.7, 0.5],
  [0.94, 0.38]
];

function archLift(z: number): number {
  let lift = 0;
  for (const zw of [WHEEL_Z, -WHEEL_Z]) {
    const d = Math.abs(z - zw);
    if (d < 0.5) {
      lift = Math.max(lift, 0.66 * Math.pow(1 - (d / 0.5) ** 2, 0.6));
    }
  }
  return lift;
}

/* ------------------------------------------------------------------ */
/* Silhouette variants (option B: player + rival)                      */
/* ------------------------------------------------------------------ */

/**
 * Per-variant modifiers applied on top of the shared curves. Keeping one set
 * of curves means the two bodies share their architecture (same arches, same
 * wheelbase, same aero mounts) and only the attitude changes.
 */
interface BodyShape {
  /** Half-width multiplier along z. */
  width: (z: number) => number;
  /** Extra belt / deck height, metres. */
  deck: (z: number) => number;
  /** Extra roof height, metres. */
  roof: (z: number) => number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const ramp = (from: number, to: number, x: number): number => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};

const gauss = (z: number, centre: number, spread: number): number =>
  Math.exp(-((z - centre) ** 2) / (spread * spread));

const PLAYER_SHAPE: BodyShape = { width: () => 1, deck: () => 0, roof: () => 0 };

// Rival: wider haunches, squarer and taller rear deck, higher greenhouse.
const RIVAL_SHAPE: BodyShape = {
  width: (z) => 1 + 0.042 * gauss(z, -1.24, 0.9) + 0.018 * gauss(z, 1.3, 0.8),
  deck: (z) => 0.026 * ramp(0.75, -1.4, z),
  roof: (z) => 0.022 * ramp(0.6, -0.4, z)
};

const bodyHalfWidth = (z: number, shape: BodyShape): number =>
  curveValue(widthCurve, z) * shape.width(z);

function buildBody(shape: BodyShape): THREE.BufferGeometry {
  const sections: LoftSection[] = [];
  const step = 0.08;
  for (let z = BODY_Z_MIN; z <= BODY_Z_MAX + 1e-6; z += step) {
    const zz = Math.min(BODY_Z_MAX, z);
    const w = bodyHalfWidth(zz, shape);
    const top = curveValue(topCurve, zz) + shape.deck(zz);
    const floor = curveValue(floorCurve, zz);
    const bottom = Math.max(floor, floor + archLift(zz));
    sections.push({ z: zz, points: bodySection(w, bottom, top) });
  }
  const geo = loftSections(sections);
  const parts = [geo, capGeometry(sections[0], false), capGeometry(sections[sections.length - 1], true)];
  return mergeIndexed(parts);
}

function buildCabin(shape: BodyShape): THREE.BufferGeometry {
  const sections: LoftSection[] = [];
  const step = 0.075;
  for (let z = -1.52; z <= 0.94 + 1e-6; z += step) {
    const zz = Math.min(0.94, z);
    const belt = curveValue(topCurve, zz) + shape.deck(zz) + 0.004;
    const roof = Math.max(belt + 0.02, curveValue(cabinRoof, zz) + shape.roof(zz));
    const wb = curveValue(cabinBase, zz) * shape.width(zz);
    const wt = curveValue(cabinTop, zz) * shape.width(zz);
    sections.push({ z: zz, points: cabinSection(belt, roof, wb, wt) });
  }
  const parts = [
    loftSections(sections),
    capGeometry(sections[0], false),
    capGeometry(sections[sections.length - 1], true)
  ];
  return mergeIndexed(parts);
}

/**
 * Opaque roof shell that follows the crown. Without it the transparent
 * greenhouse showed the black cockpit through the top, which read as a
 * couple of loose panels floating over the car.
 */
function buildRoof(shape: BodyShape): THREE.BufferGeometry {
  const sections: LoftSection[] = [];
  const step = 0.07;
  for (let z = -1.4; z <= 0.82 + 1e-6; z += step) {
    const zz = Math.min(0.82, z);
    const belt = curveValue(topCurve, zz) + shape.deck(zz) + 0.004;
    const roofY = Math.max(belt + 0.02, curveValue(cabinRoof, zz) + shape.roof(zz));
    const h = roofY - belt;
    const wt = curveValue(cabinTop, zz) * shape.width(zz);
    const wb = curveValue(cabinBase, zz) * shape.width(zz);
    const yAt = (k: number): number => belt + h * k;
    sections.push({
      z: zz,
      points: [
        new THREE.Vector2(-wb * 0.985, yAt(0.9)),
        new THREE.Vector2(-wt * 0.87, yAt(0.982)),
        new THREE.Vector2(-wt * 0.43, yAt(1)),
        new THREE.Vector2(wt * 0.43, yAt(1)),
        new THREE.Vector2(wt * 0.87, yAt(0.982)),
        new THREE.Vector2(wb * 0.985, yAt(0.9))
      ]
    });
  }
  return loftSections(sections);
}

/* ------------------------------------------------------------------ */
/* Small part helpers                                                  */
/* ------------------------------------------------------------------ */

function transform(
  geo: THREE.BufferGeometry,
  pos: Vec3 = [0, 0, 0],
  rot: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1]
): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  m.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale));
  geo.applyMatrix4(m);
  return geo;
}

function beam(
  from: THREE.Vector3,
  to: THREE.Vector3,
  width: number,
  depth: number
): THREE.BufferGeometry {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const geo = new THREE.BoxGeometry(width, len, depth);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const m = new THREE.Matrix4().compose(
    from.clone().add(to).multiplyScalar(0.5),
    q,
    new THREE.Vector3(1, 1, 1)
  );
  geo.applyMatrix4(m);
  return geo;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rot: Vec3 = [0, 0, 0]
): THREE.BufferGeometry {
  return transform(new THREE.BoxGeometry(w, h, d), [x, y, z], rot);
}

function applyRimLight(material: THREE.MeshPhysicalMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <tonemapping_fragment>",
      `
      float hzRim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
      gl_FragColor.rgb += vec3(0.052, 0.078, 0.125) * hzRim;
      #include <tonemapping_fragment>
      `
    );
  };
  material.customProgramCacheKey = () => "horizon-gt-rim";
}

/* ------------------------------------------------------------------ */
/* Car                                                                 */
/* ------------------------------------------------------------------ */

export interface CarOptions {
  paintColor: number;
  accentColor: number;
  number: number;
  isPlayer?: boolean;
  /** Blender shell to use; falls back to the procedural body if not loaded. */
  variant?: CarVariant;
}

export function createCarVisual(opts: CarOptions): CarVisual {
  const root = new THREE.Group();
  const bodyRoot = new THREE.Group();
  bodyRoot.position.y = -BODY_CENTER_Y;
  root.add(bodyRoot);

  const paint = new THREE.MeshPhysicalMaterial({
    color: opts.paintColor,
    metalness: 0.42,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.055,
    envMapIntensity: 1.35
  });
  applyRimLight(paint);

  const carbon = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: carbonMap(),
    roughness: 0.4,
    metalness: 0.55,
    envMapIntensity: 1.1
  });
  // The Blender shell carries no UVs, so the textured carbon above would sample
  // a single texel and read as a white plate. Solid carbon for imported meshes.
  const carbonSolid = new THREE.MeshStandardMaterial({
    color: 0x11141a,
    roughness: 0.42,
    metalness: 0.5,
    envMapIntensity: 0.85
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xd3d9e2,
    roughness: 0.16,
    metalness: 1
  });
  // Matte trim for vent slats and other apertures: no glossy streak.
  const vent = new THREE.MeshStandardMaterial({
    color: 0x0b0d11,
    roughness: 0.92,
    metalness: 0.05,
    envMapIntensity: 0.25
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a1822,
    roughness: 0.055,
    metalness: 0.35,
    transparent: true,
    opacity: 0.62,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.3,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff4dc,
    emissiveIntensity: 4.4,
    roughness: 0.14,
    metalness: 0.1
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x1a0303,
    emissive: 0xff1a12,
    emissiveIntensity: 2.6,
    roughness: 0.26,
    metalness: 0.1
  });
  const interiorMat = new THREE.MeshLambertMaterial({ color: 0x08090b });
  const wellMat = new THREE.MeshLambertMaterial({ color: 0x050607 });
  const wheelMetal = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.86,
    roughness: 0.3,
    envMapIntensity: 1.2
  });

  const paintParts: THREE.BufferGeometry[] = [];
  const roofParts: THREE.BufferGeometry[] = [];
  const carbonParts: THREE.BufferGeometry[] = [];
  const ventParts: THREE.BufferGeometry[] = [];
  const chromeParts: THREE.BufferGeometry[] = [];
  const glassParts: THREE.BufferGeometry[] = [];
  const headParts: THREE.BufferGeometry[] = [];
  const tailParts: THREE.BufferGeometry[] = [];
  const interiorParts: THREE.BufferGeometry[] = [];
  const wellParts: THREE.BufferGeometry[] = [];

  // Body shell: the Blender GLB when it is loaded, otherwise the procedural
  // loft. Everything below (lights, mirrors, wheels, decals) is shared.
  const variant: CarVariant = opts.variant ?? (opts.isPlayer ? "player" : "rival");
  const shape: BodyShape = variant === "rival" ? RIVAL_SHAPE : PLAYER_SHAPE;
  const shell = USE_BLENDER_SHELL
    ? cloneCarAsset(variant, { paint, glass, carbon: carbonSolid, trim: vent })
    : null;
  if (shell) {
    shell.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    });
    bodyRoot.add(shell);
  } else {
    paintParts.push(buildBody(shape));
    glassParts.push(buildCabin(shape));

    // Roof: one opaque curved shell over the glass (see buildRoof). It shares
    // the paint colour but skips the rim shader so it can be double sided
    // without clashing with the body's cached shader variant.
    roofParts.push(buildRoof(shape));
  }

  // Pillars and the aero kit only exist in the procedural body: the shell
  // already carries its own greenhouse, splitter, skirts, intake and wing.
  if (!shell) {
    // Pillars: thin dark trim laid on the glass, not painted tubes.
  for (const s of [-1, 1]) {
    carbonParts.push(
      beam(
        new THREE.Vector3(s * 0.7, 0.874, 0.888),
        new THREE.Vector3(s * 0.545, 1.116, 0.3),
        0.034,
        0.03
      )
    );
    carbonParts.push(
      beam(
        new THREE.Vector3(s * 0.728, 0.866, -0.14),
        new THREE.Vector3(s * 0.566, 1.128, -0.24),
        0.03,
        0.028
      )
    );
    carbonParts.push(
      beam(
        new THREE.Vector3(s * 0.694, 0.894, -0.9),
        new THREE.Vector3(s * 0.484, 1.086, -1.34),
        0.032,
        0.03
      )
    );
  }

  // Wheel arch lips (real half-torus, not a flat plate).
  for (const z of [WHEEL_Z, -WHEEL_Z]) {
    for (const x of [WHEEL_X, -WHEEL_X]) {
      const lip = new THREE.TorusGeometry(0.448, 0.043, 7, 22, Math.PI);
      lip.rotateY(Math.PI / 2);
      paintParts.push(transform(lip, [Math.sign(x) * 1.03, WHEEL_VIS_RADIUS, z]));
    }
  }

  // Dark wheel wells block the view through the arch.
  for (const z of [WHEEL_Z, -WHEEL_Z]) {
    for (const x of [0.78, -0.78]) {
      wellParts.push(box(0.32, 0.52, 0.92, x, 0.55, z));
    }
  }

  // Side skirts, splitter, canards and diffuser.
  for (const s of [-1, 1]) {
    carbonParts.push(box(0.075, 0.095, 1.72, s * 0.935, 0.17, 0));
  }
  carbonParts.push(box(1.86, 0.035, 0.4, 0, 0.115, 2.16));
  carbonParts.push(box(1.9, 0.09, 0.03, 0, 0.16, 2.355));
  for (const s of [-1, 1]) {
    carbonParts.push(box(0.2, 0.014, 0.28, s * 0.78, 0.245, 2.04, [0, 0, s * 0.14]));
    carbonParts.push(box(0.03, 0.15, 0.62, s * 0.935, 0.53, -0.72, [0, 0, s * 0.05]));
  }
  carbonParts.push(box(1.55, 0.045, 0.46, 0, 0.17, -2.13, [0.16, 0, 0]));
  for (let i = 0; i < 5; i++) {
    carbonParts.push(box(0.03, 0.16, 0.42, -0.56 + i * 0.28, 0.17, -2.14, [0.16, 0, 0]));
  }
  carbonParts.push(box(1.62, 0.03, 3.05, 0, 0.112, 0.1));

  // Front grille + slats.
  carbonParts.push(box(0.96, 0.16, 0.07, 0, 0.39, 2.3, [-0.12, 0, 0]));
  for (let i = 0; i < 2; i++) {
    chromeParts.push(box(0.86, 0.012, 0.02, 0, 0.352 + i * 0.052, 2.34, [-0.12, 0, 0]));
  }

  // Hood vents + louvres. The slats go into a matte group: the glossy carbon
  // shader turned them into bright streaks under the moon.
  for (const s of [-1, 1]) {
    carbonParts.push(box(0.32, 0.014, 0.44, s * 0.33, 0.856, 1.24));
    for (let i = 0; i < 3; i++) {
      ventParts.push(box(0.27, 0.008, 0.035, s * 0.33, 0.861, 1.08 + i * 0.13, [0.2, 0, 0]));
    }
  }

  // Rear wing: swan-neck plates, a straight main plane, a gurney flap and
  // vertical endplates. The old angled trio read as an "M" from behind.
  for (const s of [-1, 1]) {
    carbonParts.push(box(0.075, 0.045, 0.24, s * 0.52, 0.8, -1.98));
    carbonParts.push(box(0.028, 0.31, 0.15, s * 0.52, 0.955, -1.99, [-0.09, 0, 0]));
  }
  carbonParts.push(box(1.5, 0.032, 0.34, 0, 1.1, -2.0, [-0.1, 0, 0]));
  carbonParts.push(box(1.44, 0.055, 0.016, 0, 1.116, -2.163, [-0.1, 0, 0]));
  for (const s of [-1, 1]) {
    carbonParts.push(box(0.02, 0.19, 0.4, s * 0.752, 1.095, -2.0, [-0.02, 0, 0]));
  }
  }

  // Mirrors.
  for (const s of [-1, 1]) {
    paintParts.push(
      beam(
        new THREE.Vector3(s * 0.925, 0.858, 0.63),
        new THREE.Vector3(s * 1.055, 0.92, 0.585),
        0.035,
        0.035
      )
    );
    paintParts.push(box(0.17, 0.085, 0.11, s * 1.065, 0.928, 0.575, [0, s * 0.1, 0]));
    interiorParts.push(box(0.008, 0.058, 0.08, s * 1.152, 0.928, 0.575, [0, s * 0.1, 0]));
  }

  // Headlights: housing + DRL blade at each corner of the nose.
  for (const s of [-1, 1]) {
    carbonParts.push(box(0.36, 0.105, 0.17, s * 0.575, 0.635, 2.14, [-0.14, s * 0.08, 0]));
    headParts.push(box(0.31, 0.028, 0.045, s * 0.575, 0.588, 2.215, [0, s * 0.08, 0]));
    headParts.push(box(0.045, 0.07, 0.04, s * 0.72, 0.6, 2.2, [0, s * 0.08, 0]));
  }

  // Tail: a recessed carbon fascia with two lamp clusters, a slim LED strip
  // and low reflectors, instead of one full-width bar across a flat wall.
  carbonParts.push(box(1.24, 0.36, 0.05, 0, 0.585, -2.298));
  for (const s of [-1, 1]) {
    tailParts.push(box(0.33, 0.07, 0.035, s * 0.52, 0.735, -2.325));
    tailParts.push(box(0.3, 0.028, 0.03, s * 0.52, 0.688, -2.325));
    tailParts.push(box(0.085, 0.05, 0.025, s * 0.47, 0.365, -2.31));
    carbonParts.push(box(0.2, 0.09, 0.07, s * 0.56, 0.5, -2.29));
  }
  tailParts.push(box(0.92, 0.016, 0.028, 0, 0.775, -2.322));

  // Exhausts.
  for (const s of [-1, 1]) {
    chromeParts.push(
      transform(
        new THREE.CylinderGeometry(0.062, 0.062, 0.2, 18, 1, true),
        [s * 0.32, 0.32, -2.3],
        [Math.PI / 2, 0, 0]
      )
    );
  }

  // Cockpit: tub, seats, dash, wheel, roll bars.
  interiorParts.push(box(1.24, 0.24, 1.55, 0, 0.78, -0.2));
  interiorParts.push(box(1.18, 0.17, 0.28, 0, 0.83, 0.63));
  interiorParts.push(box(0.4, 0.46, 0.18, 0.3, 0.95, -0.42, [-0.14, 0, 0]));
  interiorParts.push(box(0.4, 0.46, 0.18, -0.3, 0.95, -0.42, [-0.14, 0, 0]));
  interiorParts.push(box(0.22, 0.16, 0.12, 0.3, 1.09, -0.5));
  interiorParts.push(box(0.22, 0.16, 0.12, -0.3, 1.09, -0.5));
  interiorParts.push(
    transform(new THREE.TorusGeometry(0.11, 0.017, 8, 20), [-0.3, 0.88, 0.56], [1.25, 0, 0])
  );
  for (const s of [-1, 1]) {
    chromeParts.push(
      beam(
        new THREE.Vector3(s * 0.4, 0.8, -0.82),
        new THREE.Vector3(s * 0.28, 1.09, -0.44),
        0.028,
        0.028
      )
    );
  }

  const addMerged = (
    parts: THREE.BufferGeometry[],
    material: THREE.Material,
    shadows = true
  ): THREE.Mesh | null => {
    if (parts.length === 0) return null;
    const merged = mergeIndexed(parts);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    bodyRoot.add(mesh);
    return mesh;
  };

  addMerged(paintParts, paint);
  addMerged(carbonParts, carbon);
  addMerged(ventParts, vent);
  addMerged(chromeParts, chrome);
  addMerged(glassParts, glass, false);
  addMerged(headParts, headlightMat, false);
  addMerged(tailParts, taillightMat, false);
  addMerged(interiorParts, interiorMat, false);
  addMerged(wellParts, wellMat, false);

  // Additive lens halos, oriented away from the body.
  const glowTex = createGlowTexture();
  const glowMat = (color: number, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });

  const headGlowGeo = new THREE.PlaneGeometry(0.72, 0.34);
  for (const s of [-1, 1]) {
    const halo = new THREE.Mesh(headGlowGeo, glowMat(0xfff0c4, 0.55));
    halo.position.set(s * 0.58, 0.61, 2.235);
    bodyRoot.add(halo);
  }
  const tailGlowGeo = new THREE.PlaneGeometry(0.52, 0.2);
  for (const s of [-1, 1]) {
    const halo = new THREE.Mesh(tailGlowGeo, glowMat(0xff2a18, 0.38));
    halo.position.set(s * 0.52, 0.73, -2.34);
    halo.rotation.y = Math.PI;
    bodyRoot.add(halo);
  }

  // Underside fill light for the body: two real headlight cones for the
  // player, a cheap projected pool for the rivals.
  if (opts.isPlayer) {
    for (const s of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff0cc, 470, 92, 0.5, 0.6, 1.65);
      spot.position.set(s * 0.56, 0.0, 2.12);
      spot.castShadow = false;
      spot.target.position.set(s * 0.95, -0.85, 30);
      root.add(spot);
      root.add(spot.target);
    }
  } else {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 15),
      new THREE.MeshBasicMaterial({
        map: createHeadlightPoolTexture(),
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, -0.5, 8);
    root.add(pool);
  }

  // Door roundels.
  const decalTex = createNumberDecal(opts.number, `#${new THREE.Color(opts.accentColor).getHexString()}`);
  const decalMat = new THREE.MeshStandardMaterial({
    map: decalTex,
    transparent: true,
    roughness: 0.5,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  for (const s of [-1, 1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), decalMat);
    decal.position.set(s * (bodyHalfWidth(-0.02, shape) + 0.006), 0.56, -0.02);
    decal.rotation.y = s * (Math.PI / 2);
    bodyRoot.add(decal);
  }

  // Wheels.
  const assets = buildWheelAssets();
  const wheels: WheelVisual[] = [];
  for (const z of [WHEEL_Z, -WHEEL_Z]) {
    for (const x of [WHEEL_X, -WHEEL_X]) {
      const steer = new THREE.Group();
      steer.position.set(x, WHEEL_CONNECTION_Y - 0.235, z);
      const spin = new THREE.Group();
      steer.add(spin);

      const tire = new THREE.Mesh(assets.tire, tireMat);
      tire.castShadow = true;
      spin.add(tire);

      const metal = new THREE.Mesh(assets.metal, wheelMetal);
      metal.castShadow = true;
      spin.add(metal);

      root.add(steer);
      wheels.push({ steer, spin });
    }
  }

  return { root, bodyRoot, wheels, paint, taillightMat, headlightMat };
}
