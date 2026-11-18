/**
 * Two original, non-official international-style circuits.
 * Parametric polar layouts cannot cross themselves at road level because
 * their radius remains positive. Sparda adds a smoothly graded elevation loop.
 *
 * World: X/Z horizontal, Y up. The same formula can be sampled in Blender.
 */
export type InternationalCircuitId = "sparda" | "sakhir-horizon";
export interface CircuitPoint3D { x: number; y: number; z: number }
export const INTERNATIONAL_SAMPLES = 2000;

export function internationalPoint(id: InternationalCircuitId, t: number): CircuitPoint3D {
  if (id === "sparda") {
    // Technical, forested mountain road; about 6.42 km with ~70 m relief.
    const r = 930 + 160 * Math.sin(3 * t + 0.45) + 75 * Math.cos(5 * t - 0.2);
    return {
      x: r * Math.cos(t),
      y: 30 * (1 - Math.cos(t)) + 5 * (1 - Math.cos(3 * t + 0.2)),
      z: r * Math.sin(t)
    };
  }
  // Desert night raceway: long acceleration zones and tighter corner clusters.
  const r = 780 + 110 * Math.sin(4 * t + 0.3) + 45 * Math.cos(6 * t)
    + 35 * Math.sin(9 * t + 0.6);
  return { x: r * Math.cos(t), y: 0, z: r * Math.sin(t) };
}

export function internationalCenterline(id: InternationalCircuitId, count = INTERNATIONAL_SAMPLES): CircuitPoint3D[] {
  if (!Number.isInteger(count) || count < 128) throw new Error("Se necesitan 128 puntos para construir el circuito");
  return Array.from({ length: count }, (_, i) => internationalPoint(id, i * 2 * Math.PI / count));
}

export interface InternationalCircuitAudit {
  length: number;
  closureGap: number;
  maxGrade: number;
  minRadius: number;
  relief: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  issues: string[];
  ok: boolean;
}

export function auditInternational(id: InternationalCircuitId): InternationalCircuitAudit {
  const points = internationalCenterline(id);
  let length = 0, minRadius = Infinity, maxGrade = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[(i + points.length - 1) % points.length];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    const dx = c.x - b.x, dz = c.z - b.z, dy = c.y - b.y;
    const planStep = Math.hypot(dx, dz);
    length += Math.hypot(planStep, dy);
    maxGrade = Math.max(maxGrade, Math.abs(dy) / Math.max(planStep, 1e-6));
    minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
    minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z);
    minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
    const aa = Math.hypot(b.x - a.x, b.z - a.z);
    const bb = planStep;
    const cc = Math.hypot(c.x - a.x, c.z - a.z);
    const cross = Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x));
    if (cross > 1e-8) minRadius = Math.min(minRadius, aa * bb * cc / (2 * cross));
  }
  const start = internationalPoint(id, 0), end = internationalPoint(id, 2 * Math.PI);
  const closureGap = Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z);
  const relief = maxY - minY;
  const issues: string[] = [];
  if (closureGap > 0.1) issues.push("la carretera no cierra");
  if (maxGrade > 0.08) issues.push("pendiente excesiva");
  if (minRadius < 35) issues.push("radio inferior a 35 metros");
  if (length < 5100 || length > 7500) issues.push("longitud fuera de límites");
  if (id === "sparda" && relief < 40) issues.push("falta desnivel montañoso");
  if (id === "sakhir-horizon" && relief > 2) issues.push("la pista desértica debería ser plana");
  // Radius is always > 0, so polar(t) has a single point per angle:
  // unlike Suzaka, no 2D crossing is possible along the loop.
  return { length, closureGap, maxGrade, minRadius, relief,
    bounds: { minX, maxX, minZ, maxZ }, issues, ok: issues.length === 0 };
}
