import type { Track } from "./track";

/** Two physically open entrances to a seven-bay pit lane on Suzaka's low branch.
 * All visual walls, Rapier barriers, rescue logic and camera use this transform.
 * Metres; local X follows the circuit, local +Z goes towards the garages. */
export const SUZAKA_PIT_BAY_X = [-63, -42, -21, 0, 21, 42, 63] as const;
export const SUZAKA_PIT_FRONT = 23;
export const SUZAKA_PIT_DEPTH = 14;
export const SUZAKA_PIT_BAY_WIDTH = 19;
export const SUZAKA_PIT_GATE_CENTERS = [-93, 93] as const;
export const SUZAKA_PIT_GATE_HALF_WIDTH = 12;

type PitTrack = Pick<Track, "samples" | "tangentAt" | "rightAt">;
const pitFrames = new WeakMap<object, PitFrame>();
export interface PitFrame {
  index: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  rx: number;
  rz: number;
  yaw: number;
}

export function suzakaPitFrame(track: PitTrack): PitFrame {
  if (!track.samples.length) throw Error("Suzaka pit lane needs a built track");
  const cached = pitFrames.get(track);
  if (cached) return cached;
  // The low, eastern straight, well away from the bridge and its double wall.
  let nearest = -1, dist = Infinity;
  for (let i = 0; i < track.samples.length; i++) {
    const p = track.samples[i];
    if (p.y > .75 || p.x < 150 || p.z > -200) continue;
    const d = (p.x - 500) ** 2 + (p.z + 510) ** 2;
    if (d < dist) { dist = d; nearest = i; }
  }
  if (nearest < 0) throw Error("Suzaka pit anchor was not found on the low road");
  const p = track.samples[nearest];
  const t = track.tangentAt(nearest);
  const norm = Math.hypot(t.x, t.z);
  const tx = t.x / norm, tz = t.z / norm;
  // Track.rightAt uses tangent × up, i.e. (-tz,tx).
  const rx = -tz, rz = tx;
  const frame={index:nearest,x:p.x,y:p.y,z:p.z,tx,tz,rx,rz,yaw:Math.atan2(rx,rz)};
  pitFrames.set(track,frame);
  return frame;
}

export function suzakaPitLocal(track: PitTrack, p: {x:number;z:number}): {x:number;z:number} {
  const f = suzakaPitFrame(track);
  const dx=p.x-f.x,dz=p.z-f.z;
  return {x:dx*f.tx+dz*f.tz,z:dx*f.rx+dz*f.rz};
}

export function suzakaPitBarrierGap(track: PitTrack, side: number, p: {x:number;y:number;z:number}): boolean {
  if (side !== 1 || p.y > 1) return false;
  const local=suzakaPitLocal(track,p);
  return SUZAKA_PIT_GATE_CENTERS.some(x=>Math.abs(local.x-x) < SUZAKA_PIT_GATE_HALF_WIDTH);
}

export function inSuzakaPitArea(track: PitTrack, p: {x:number;y?:number;z:number}): boolean {
  const local=suzakaPitLocal(track,p);
  return Math.abs(local.x) < 108 && local.z >= 8 && local.z <= 40 &&
    (p.y === undefined || Math.abs(p.y - suzakaPitFrame(track).y) < 7);
}

export function suzakaGarageAt(track: PitTrack, p: {x:number;z:number}): number {
  const local=suzakaPitLocal(track,p);
  if (local.z < SUZAKA_PIT_FRONT + 1 || local.z > SUZAKA_PIT_FRONT + SUZAKA_PIT_DEPTH - 1) return -1;
  return SUZAKA_PIT_BAY_X.findIndex(x=>Math.abs(local.x-x) < SUZAKA_PIT_BAY_WIDTH*.40);
}
