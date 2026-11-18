/**
 * The original Suzaka figure-eight geometry shared by rendering, physics and
 * Blender's editable source model. Metres, world X/Z horizontal and Y vertical.
 * At the projected centreline crossover the bridge is 12 m above the low lane.
 */
export interface SuzakaPoint { x: number; y: number; z: number }
export const SUZAKA_BRIDGE_HEIGHT = 12;
export const SUZAKA_SAMPLES = 1800;

export function suzakaPoint(t: number): SuzakaPoint {
  const x = 900 * Math.sin(t) + 20 * Math.sin(3 * t + 0.1) - 20 * Math.sin(0.1);
  // Blender exports Z-up / Y-forward to a Y-up glTF world: -Blender Y => world Z.
  const z = -(490 * Math.sin(2 * t) + 28 * Math.sin(6 * t));
  const bridgeDelta = Math.atan2(Math.sin(t - Math.PI), Math.cos(t - Math.PI));
  const y = SUZAKA_BRIDGE_HEIGHT * Math.exp(-0.5 * (bridgeDelta / 0.34) ** 2);
  return { x, y, z };
}

export function suzakaCenterline(count = SUZAKA_SAMPLES): SuzakaPoint[] {
  if (!Number.isInteger(count) || count < 64) throw new Error("Suzaka requires at least 64 samples");
  return Array.from({ length: count }, (_, i) => suzakaPoint((i * 2 * Math.PI) / count));
}

const distance = (a: SuzakaPoint, b: SuzakaPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const planar = (a: SuzakaPoint, b: SuzakaPoint): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

export interface SuzakaGeometryAudit {
  length: number;
  closureGap: number;
  bridgeClearance: number;
  maxGrade: number;
  minRadius: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  issues: string[];
  ok: boolean;
}

export function auditSuzaka(): SuzakaGeometryAudit {
  const points = suzakaCenterline();
  let length = 0;
  let maxGrade = 0;
  let minRadius = Infinity;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const p = points[i];
    const next = points[(i + 1) % points.length];
    length += distance(p, next);
    maxGrade = Math.max(maxGrade, Math.abs(next.y - p.y) / Math.max(0.001, planar(p, next)));
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    const a = planar(prev, p), b = planar(p, next), c = planar(prev, next);
    const cross = Math.abs((p.x - prev.x) * (next.z - p.z) - (p.z - prev.z) * (next.x - p.x));
    if (cross > 1e-7) minRadius = Math.min(minRadius, a * b * c / (2 * cross));
  }
  const closureGap = distance(suzakaPoint(0), suzakaPoint(2 * Math.PI));
  // The two branches overlap in X/Z near the origin, not at road height.
  const bridgeClearance = points[points.length / 2].y - points[0].y;
  const issues: string[] = [];
  if (closureGap > 0.5) issues.push("la pista no cierra");
  if (bridgeClearance < 9) issues.push("separación vertical insuficiente");
  if (maxGrade > 0.08) issues.push("rampa demasiado inclinada");
  if (minRadius < 35) issues.push("curva excesivamente cerrada");
  if (length < 5000 || length > 6500) issues.push("longitud inesperada");
  return {
    length, closureGap, bridgeClearance, maxGrade, minRadius,
    bounds: { minX, maxX, minZ, maxZ },
    issues, ok: issues.length === 0
  };
}
