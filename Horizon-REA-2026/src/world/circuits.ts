/**
 * Circuit catalogue.
 *
 * A circuit is data: a list of straights and turns. The same builder in
 * `track.ts` turns any of them into asphalt, barriers, physics and minimap, so
 * adding a circuit never means duplicating engine code.
 *
 * Geometry contract (checked by `analyzeCircuit`, and by `track.load`):
 *   - the turns must net exactly 360°, or the loop twists where it closes;
 *   - the centreline must end where it started, or a gap is left in the road;
 *   - the smallest radius must stay driveable;
 *   - the ribbon must not cross itself.
 *
 * Flat circuits are solved numerically (360° net turn, no crossings);
 * Suzaka uses a graded figure-eight with a true 12m flyover and separate checks.
 */

import { auditSuzaka } from "./suzakaGeometry";

export interface Segment {
  straight?: number;
  turn?: number;
  radius?: number;
  dir?: 1 | -1;
}

export interface CircuitDefinition {
  id: string;
  name: string;
  /** Short label for the menu card. */
  discipline: string;
  /** One line of character, not a performance promise. */
  blurb: string;
  /** Menu accent colour. */
  accent: string;
  segments: Segment[];
  /** Grade-separated figure-eight layout, assembled from 3D centreline samples. */
  layout?: "figure-eight";
}

export interface CircuitBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CircuitMetrics {
  /** Designed length in metres: straights plus arc lengths. */
  length: number;
  netTurn: number;
  /** Distance between the last point the builder emits and the start. */
  closureGap: number;
  minRadius: number;
  corners: number;
  bounds: CircuitBounds;
  centerX: number;
  centerZ: number;
  selfIntersections: number;
  ok: boolean;
  issues: string[];
}

/* ------------------------------------------------------------------ */
/* Circuit data                                                        */
/* ------------------------------------------------------------------ */


/** Montaje original: recta larga, dos chicanas y curvas de velocidad. */
const MONZON: Segment[] = [
  { straight: 1050 },
  { turn: 37, radius: 58, dir: 1 },
  { turn: 74, radius: 58, dir: -1 },
  { turn: 37, radius: 58, dir: 1 },
  { straight: 145 },
  { turn: 90, radius: 115, dir: 1 },
  { straight: 700 },
  { turn: 36, radius: 72, dir: -1 },
  { turn: 72, radius: 72, dir: 1 },
  { turn: 36, radius: 72, dir: -1 },
  { straight: 120 },
  { turn: 90, radius: 130, dir: 1 },
  { straight: 1462.81043 },
  { turn: 42, radius: 110, dir: 1 },
  { straight: 110 },
  { turn: 48, radius: 110, dir: 1 },
  { straight: 885.584717 },
  { turn: 90, radius: 165, dir: 1 },
  { straight: 170 }
];

const LIBERTAD: Segment[] = [
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

const BALSAMO: Segment[] = [
  { straight: 300 },
  { turn: 90, radius: 60, dir: 1 },
  { straight: 76.3 },
  { turn: 30, radius: 55, dir: -1 },
  { turn: 30, radius: 55, dir: 1 },
  { straight: 120 },
  { turn: 90, radius: 78, dir: 1 },
  { straight: 200 },
  { turn: 45, radius: 50, dir: -1 },
  { turn: 45, radius: 50, dir: 1 },
  { straight: 150 },
  { turn: 90, radius: 66, dir: 1 },
  { straight: 80 },
  { turn: 25, radius: 48, dir: -1 },
  { turn: 25, radius: 48, dir: 1 },
  { straight: 160 },
  { turn: 90, radius: 72, dir: 1 },
  { straight: 127 }
];

const MIRADOR: Segment[] = [
  { straight: 340 },
  { turn: 90, radius: 56, dir: 1 },
  { straight: 144 },
  { turn: 35, radius: 60, dir: -1 },
  { turn: 35, radius: 60, dir: 1 },
  { straight: 170 },
  { turn: 90, radius: 80, dir: 1 },
  { straight: 247.1 },
  { turn: 50, radius: 46, dir: -1 },
  { turn: 50, radius: 46, dir: 1 },
  { straight: 140 },
  { turn: 90, radius: 62, dir: 1 },
  { straight: 60 },
  { turn: 40, radius: 90, dir: -1 },
  { turn: 40, radius: 90, dir: 1 },
  { straight: 240 },
  { turn: 90, radius: 74, dir: 1 },
  { straight: 150 }
];

export const CIRCUITS: readonly CircuitDefinition[] = [
  { id: "monzon", name: "Circuito Monzon", discipline: "Alta velocidad · Italia", blurb: "Trazado original de 5,79 km con dos chicanas, boxes y rectas de alta velocidad.", accent: "#f05d47", segments: MONZON },
  { id: "suzaka", name: "Circuito Suzaka", discipline: "Técnico · Japón",
    blurb: "Trazado original en ocho de 5,64 km, puente elevado y curvas enlazadas.",
    accent: "#df556a", segments: [], layout: "figure-eight" },
  {
    id: "libertad",
    name: "Circuito La Libertad",
    discipline: "Velocidad",
    blurb: "Recta principal larga y curvones rápidos junto a la costa.",
    accent: "#ff5a1f",
    segments: LIBERTAD
  },
  {
    id: "balsamo",
    name: "Sprint El Bálsamo",
    discipline: "Técnico",
    blurb: "Once curvas encadenadas: tracción y frenada, no potencia.",
    accent: "#43c59e",
    segments: BALSAMO
  },
  {
    id: "mirador",
    name: "Circuito Mirador",
    discipline: "Mixto",
    blurb: "Trazado largo con una recta de más de 340 m y sectores lentos.",
    accent: "#7aa2ff",
    segments: MIRADOR
  }
];

export const DEFAULT_CIRCUIT_ID = CIRCUITS[0].id;

export function getCircuit(id: string): CircuitDefinition | undefined {
  return CIRCUITS.find((circuit) => circuit.id === id);
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export interface CenterlinePoint {
  x: number;
  z: number;
}

/**
 * Walks the segment list and returns the raw centreline (before the smoothing
 * curve). Shared by the track builder and the validator so the numbers the menu
 * shows come from the exact geometry that gets built.
 */
export function buildCenterlinePoints(segments: Segment[]): CenterlinePoint[] {
  const points: CenterlinePoint[] = [];
  let x = 0;
  let z = 0;
  let heading = 0;

  const push = (px: number, pz: number): void => {
    const last = points[points.length - 1];
    if (!last || Math.hypot(last.x - px, last.z - pz) > 0.6) points.push({ x: px, z: pz });
  };

  push(x, z);
  for (const segment of segments) {
    if (segment.straight !== undefined) {
      const steps = Math.max(1, Math.ceil(segment.straight / 8));
      const dx = Math.cos(heading) * (segment.straight / steps);
      const dz = Math.sin(heading) * (segment.straight / steps);
      for (let i = 0; i < steps; i++) {
        x += dx;
        z += dz;
        push(x, z);
      }
      continue;
    }
    const angle = ((segment.turn ?? 0) * Math.PI) / 180;
    const radius = segment.radius ?? 60;
    const dir = segment.dir ?? 1;
    const steps = Math.max(2, Math.ceil((Math.abs(angle) * radius) / 3));
    const delta = (angle / steps) * dir;
    for (let i = 0; i < steps; i++) {
      heading += delta;
      x += Math.cos(heading) * radius * Math.abs(delta);
      z += Math.sin(heading) * radius * Math.abs(delta);
      push(x, z);
    }
  }
  return points;
}

const MIN_RADIUS = 35;

function crossing(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): boolean {
  const cross = (ox: number, oz: number, px: number, pz: number, qx: number, qz: number): number =>
    (px - ox) * (qz - oz) - (pz - oz) * (qx - ox);
  const d1 = cross(cx, cz, dx, dz, ax, az);
  const d2 = cross(cx, cz, dx, dz, bx, bz);
  const d3 = cross(ax, az, bx, bz, cx, cz);
  const d4 = cross(ax, az, bx, bz, dx, dz);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Measures a circuit and reports every way it can be wrong. A definition that
 * fails is not built: a twisted loop is worse than a clear warning.
 */
export function analyzeCircuit(segments: Segment[]): CircuitMetrics {
  const issues: string[] = [];
  let netTurn = 0;
  let length = 0;
  let minRadius = Infinity;
  let corners = 0;

  for (const segment of segments) {
    if (segment.straight !== undefined) {
      length += segment.straight;
      continue;
    }
    const turn = segment.turn ?? 0;
    const radius = segment.radius ?? 60;
    netTurn += turn * (segment.dir ?? 1);
    length += (Math.abs(turn) * Math.PI * radius) / 180;
    minRadius = Math.min(minRadius, radius);
    if (Math.abs(turn) >= 20) corners += 1;
  }

  const points = buildCenterlinePoints(segments);
  const last = points[points.length - 1];
  const closureGap = Math.hypot(last.x, last.z);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  // Self-intersection: sample the closed polyline and look for crossings that
  // are not neighbours. The road is 15 m wide, so a crossing is visible.
  let selfIntersections = 0;
  const n = points.length;
  const stride = Math.max(1, Math.floor(n / 420));
  const reduced: CenterlinePoint[] = [];
  for (let i = 0; i < n; i += stride) reduced.push(points[i]);
  const m = reduced.length;
  for (let i = 0; i < m; i++) {
    const a = reduced[i];
    const b = reduced[(i + 1) % m];
    for (let j = i + 4; j < m; j++) {
      if (i === 0 && j >= m - 4) continue;
      const c = reduced[j];
      const d = reduced[(j + 1) % m];
      if (crossing(a.x, a.z, b.x, b.z, c.x, c.z, d.x, d.z)) selfIntersections++;
    }
  }

  if (Math.abs(netTurn - 360) > 0.01) {
    issues.push(`giro neto ${netTurn.toFixed(1)}° (debe ser 360°)`);
  }
  if (closureGap > 8) issues.push(`el trazado no cierra: ${closureGap.toFixed(0)} m de hueco`);
  if (minRadius < MIN_RADIUS) issues.push(`radio mínimo ${minRadius} m`);
  if (selfIntersections > 0) issues.push(`el trazado se cruza (${selfIntersections} cruces)`);
  if (length < 600) issues.push(`longitud ${Math.round(length)} m`);

  return {
    length,
    netTurn,
    closureGap,
    minRadius: Number.isFinite(minRadius) ? minRadius : 0,
    corners,
    bounds: { minX, maxX, minZ, maxZ },
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    selfIntersections,
    ok: issues.length === 0,
    issues
  };
}

/**
 * Special validation for a grade-separated layout. Its single projected
 * crossing is safe because the upper surface is 12m above the underpass.
 * The ordinary flat layouts keep the strict 360° and no-crossing checks.
 */
export function analyzeCircuitDefinition(circuit: CircuitDefinition): CircuitMetrics {
  if (circuit.layout !== "figure-eight") return analyzeCircuit(circuit.segments);
  const a = auditSuzaka();
  return {
    length: a.length,
    netTurn: 0, // Opposite loops cancel, as expected for a figure-eight.
    closureGap: a.closureGap,
    minRadius: a.minRadius,
    corners: 12,
    bounds: a.bounds,
    centerX: (a.bounds.minX + a.bounds.maxX) / 2,
    centerZ: (a.bounds.minZ + a.bounds.maxZ) / 2,
    selfIntersections: 0, // No at-grade crossings (the flyover is 12m high).
    issues: a.issues,
    ok: a.ok
  };
}

/** All validated, playable circuits, including the grade-separated Suzaka. */
export function availableCircuits(): CircuitDefinition[] {
  return CIRCUITS.filter((circuit) => analyzeCircuitDefinition(circuit).ok);
}
