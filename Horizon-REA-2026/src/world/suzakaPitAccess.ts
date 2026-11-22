import type { Track } from "./track";

export const SUZAKA_PIT_SIDE = 1;
export const SUZAKA_PIT_START_M = 275;
export const SUZAKA_PIT_END_M = 610;
export const SUZAKA_PIT_ENTRY = [290, 320] as const;
export const SUZAKA_PIT_EXIT = [565, 595] as const;
export const SUZAKA_GARAGE_NAMES = [
  "FERRARI", "PORSCHE", "BUGATTI", "MERCEDES-BENZ",
  "LAMBORGHINI", "KOENIGSEGG", "YANGWANG"
] as const;
export const SUZAKA_GARAGE_METRES = SUZAKA_GARAGE_NAMES.map((_, i) => 345 + i * 30);
export const SUZAKA_GARAGE_WIDTH = 17;
export const SUZAKA_GARAGE_DEPTH = 13;
export const SUZAKA_GARAGE_HEIGHT = 5.6;

/** Identical opening coordinates for visible walls and Rapier colliders. */
export function suzakaPitBarrierGap(metres: number, side: number): boolean {
  return side === SUZAKA_PIT_SIDE &&
    ((metres >= SUZAKA_PIT_ENTRY[0] && metres <= SUZAKA_PIT_ENTRY[1]) ||
     (metres >= SUZAKA_PIT_EXIT[0] && metres <= SUZAKA_PIT_EXIT[1]));
}
export function inSuzakaPitArea(metres: number, lateral: number, barrierOffset: number): boolean {
  return metres >= SUZAKA_PIT_START_M && metres <= SUZAKA_PIT_END_M &&
    lateral >= barrierOffset - 1.5 && lateral <= barrierOffset + 34;
}
export function suzakaGarageAt(
  track: Pick<Track, "sampleAt"|"rightAt"|"tangentAt"|"segmentLength"|"barrierLateralOffset">,
  x: number, z: number
): string | null {
  for (let i = 0; i < SUZAKA_GARAGE_NAMES.length; i++) {
    const j = Math.round(SUZAKA_GARAGE_METRES[i] / track.segmentLength);
    const p = track.sampleAt(j), t = track.tangentAt(j), r = track.rightAt(j);
    const dx = x - p.x, dz = z - p.z;
    const along = dx * t.x + dz * t.z, outward = dx * r.x + dz * r.z;
    if (Math.abs(along) < SUZAKA_GARAGE_WIDTH * .45 &&
        outward > track.barrierLateralOffset + 10.5 &&
        outward < track.barrierLateralOffset + 23.5) return SUZAKA_GARAGE_NAMES[i];
  }
  return null;
}
