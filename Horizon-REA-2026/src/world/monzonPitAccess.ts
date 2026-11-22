/** Monzón pits lie beside the +X straight, on its +Z side. Metre units. */
export const MONZON_PIT_ENTRANCE = { minX: 94, maxX: 115 } as const;
// Relocated beyond seven expanded service bays; must never intersect a garage.
export const MONZON_PIT_EXIT = { minX: 259, maxX: 281 } as const;
export const GARAGE_SCALE = 1.20;
export const GARAGE_WIDTH = 15.8 * GARAGE_SCALE;
export const GARAGE_DEPTH = 11 * GARAGE_SCALE;
export const GARAGE_HEIGHT = 4.7 * GARAGE_SCALE;
export const GARAGE_FRONT_Z = 30;
export const GARAGE_REAR_Z = GARAGE_FRONT_Z + GARAGE_DEPTH;

export const MONZON_PIT_GARAGES = [
  { name: "FERRARI", x: 118 },
  { name: "PORSCHE", x: 138.5 },
  { name: "BUGATTI", x: 159 },
  { name: "MERCEDES-BENZ", x: 179.5 },
  { name: "LAMBORGHINI", x: 200 },
  { name: "KOENIGSEGG", x: 220.5 },
  { name: "YANGWANG", x: 241 }
] as const;

/** Rendering and Rapier use the SAME barrier gap predicate. */
export function monzonPitBarrierGap(x: number, z: number, offset: number): boolean {
  return offset > 0 && Math.abs(z) < 3.5 &&
    ((x >= MONZON_PIT_ENTRANCE.minX && x <= MONZON_PIT_ENTRANCE.maxX) ||
     (x >= MONZON_PIT_EXIT.minX && x <= MONZON_PIT_EXIT.maxX));
}

/** The camera must follow the player throughout the expanded seven-garage paddock. */
export function inMonzonPitArea(x: number, z: number): boolean {
  return x > 91 && x < 291 && z >= 9 && z < GARAGE_REAR_Z + 1;
}

/** Trigger zone stays inside the actual open frontage, outside the service lane. */
export function monzonGarageAt(x: number, z: number): string | null {
  if (z < GARAGE_FRONT_Z + .6 || z > GARAGE_REAR_Z - 1.0) return null;
  for (const bay of MONZON_PIT_GARAGES) {
    if (Math.abs(x - bay.x) < GARAGE_WIDTH * .40) return bay.name;
  }
  return null;
}
