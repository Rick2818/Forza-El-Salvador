/** Monzón pits are beside the +X starting straight. All dimensions in metres. */
export const MONZON_PIT_ENTRANCE = { minX: 94, maxX: 115 } as const;
export const MONZON_PIT_EXIT = { minX: 186, maxX: 207 } as const;
export const MONZON_PIT_GARAGES = [
  { name: "FERRARI", x: 118 },
  { name: "PORSCHE", x: 134.5 },
  { name: "BUGATTI", x: 151 },
  { name: "MERCEDES-BENZ", x: 167.5 }
] as const;

/** Use exactly the same gap predicate for the visible guardrail and Rapier collider. */
export function monzonPitBarrierGap(x: number, z: number, offset: number): boolean {
  return offset > 0 && Math.abs(z) < 3.5 &&
    ((x >= MONZON_PIT_ENTRANCE.minX && x <= MONZON_PIT_ENTRANCE.maxX) ||
     (x >= MONZON_PIT_EXIT.minX && x <= MONZON_PIT_EXIT.maxX));
}

/** Allows the chase camera to follow a car past the guardrail into the pit paddock. */
export function inMonzonPitArea(x: number, z: number): boolean {
  return x > 91 && x < 211 && z >= 9 && z < 43;
}

/** Trigger zone stays safely inside each open bay (not in the pit lane). */
export function monzonGarageAt(x: number, z: number): string | null {
  if (z < 30.6 || z > 39.6) return null;
  for (const bay of MONZON_PIT_GARAGES) {
    if (Math.abs(x - bay.x) < 5.6) return bay.name;
  }
  return null;
}
