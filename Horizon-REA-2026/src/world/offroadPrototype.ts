import type { CircuitDefinition } from "./circuits";
import type { FourWheelDriveMode } from "../sim/fourWheelDrive";
import { pickupContactTraction } from "../sim/fourWheelDrive";

/** Prototype only: not exposed in the production circuit rotation. */
export const OFFROAD_CIRCUIT: CircuitDefinition = {
  id: "el-imposible-4x4",
  name: "El Imposible 4x4",
  discipline: "Todoterreno · El Salvador",
  blurb: "Exploración libre por tierra, lodo, piedras y pendientes; sin competición.",
  accent: "#8d7249",
  segments: [
    { straight: 280 }, { turn: 90, radius: 45, dir: 1 },
    { straight: 180 }, { turn: 90, radius: 65, dir: 1 },
    { straight: 280 }, { turn: 90, radius: 45, dir: 1 },
    { straight: 180 }, { turn: 90, radius: 65, dir: 1 },
  ],
};

export type OffroadSurface = "dirt" | "mud" | "puddle";
export interface OffroadSector {
  start: number;
  end: number;
  surface: OffroadSurface;
  grip: number;
  resistance: number;
}
export const OFFROAD_SECTORS: readonly OffroadSector[] = [
  { start: 0, end: .10, surface: "dirt", grip: .78, resistance: .08 },
  { start: .10, end: .35, surface: "mud", grip: .44, resistance: .28 },
  { start: .35, end: .52, surface: "puddle", grip: .32, resistance: .38 },
  { start: .52, end: .62, surface: "dirt", grip: .78, resistance: .08 },
  { start: .62, end: .94, surface: "mud", grip: .44, resistance: .28 },
  { start: .94, end: 1, surface: "puddle", grip: .32, resistance: .38 },
];
export const OFFROAD_PICKUP_IDS = [
  "chevrolet-silverado-ev-alternative", "ram-3500-alternative", "ford-f150-raptor-police",
  "chevrolet-silverado-z71", "ram-1500-trx", "ford-f150-raptor",
] as const;

export function isOffroadEligible(id: string): boolean {
  return OFFROAD_PICKUP_IDS.some(candidate => candidate === id);
}
export function offroadSectorAt(progress: number): OffroadSector {
  if (!Number.isFinite(progress)) throw new Error("Invalid lap progress");
  const t = ((progress % 1) + 1) % 1;
  return OFFROAD_SECTORS.find(s => t >= s.start && t < s.end) ?? OFFROAD_SECTORS[0];
}
/** Continuous grade profile; actual terrain collision geometry not yet installed. */
export function offroadElevation(progress: number): number {
  if (!Number.isFinite(progress)) throw new Error("Invalid lap progress");
  const t = 2 * Math.PI * (((progress % 1) + 1) % 1);
  return 6 * (1 - Math.cos(t)) + 2 * (1 - Math.cos(3 * t)) +
    2.0 * (1 - Math.cos(12 * t)) + .85 * (1 - Math.cos(19 * t));
}
/** Arcade force multiplier only, not a validated mud/tire physics simulation. */
export function offroadDriveMultiplier(mode: FourWheelDriveMode, contacts: readonly boolean[], progress: number): number {
  const s = offroadSectorAt(progress);
  return pickupContactTraction(mode, contacts, s.grip) * s.grip * (1 - s.resistance);
}

// Geometric obstacles are measured in metres, not a shader or a colour patch.
// Circularly repeat over each lap with a clear launch and an optional bypass.
export function offroadRelief(distance: number, lateral: number, length: number): number {
  const d=((distance%length)+length)%length;
  const fade=Math.min(1,d/16,(length-d)/16);
  const local=((d+8)%26)-13;
  const side=Math.floor((d+8)/26)%2===0?1:-1;
  const basin=-.48*Math.exp(-(local*local)/5.2-((lateral-side*.86)**2)/.63);
  const rut=-.22*Math.exp(-((Math.abs(lateral)-.98)**2)/.23);
  const mound=.20*Math.exp(-(((d+11)%17-8.5)**2)/4.5-((lateral+side*.75)**2)/1.15);
  const washboard=.06*Math.sin(d*1.65+lateral*.7)+.04*Math.sin(d*.88-lateral*2);
  return fade*(basin+rut+mound+washboard);
}

/** Stable shoulder shelf followed by an earth bank, never a vertical drop. */
export function offroadVergeHeight(edgeY: number, offset: number): number {
  const t=Math.max(0,Math.min(1,(offset-7)/29));
  return edgeY+(-1-edgeY)*t*t*(3-2*t)-.04*Math.min(1,offset/7)*(1-t);
}
