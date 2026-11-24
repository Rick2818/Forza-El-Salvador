import type { CircuitDefinition } from "./circuits";
import type { FourWheelDriveMode } from "../sim/fourWheelDrive";
import { pickupContactTraction } from "../sim/fourWheelDrive";

/** Prototype only: not exposed in the production circuit rotation. */
export const OFFROAD_CIRCUIT: CircuitDefinition = {
  id: "el-imposible-4x4",
  name: "El Imposible 4x4",
  discipline: "Todoterreno · El Salvador",
  blurb: "Tierra, lodo y pendientes; diseño preliminar sujeto a pruebas.",
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
  { start: 0, end: .18, surface: "dirt", grip: .78, resistance: .08 },
  { start: .18, end: .35, surface: "mud", grip: .44, resistance: .28 },
  { start: .35, end: .44, surface: "puddle", grip: .32, resistance: .38 },
  { start: .44, end: .68, surface: "dirt", grip: .78, resistance: .08 },
  { start: .68, end: .85, surface: "mud", grip: .44, resistance: .28 },
  { start: .85, end: 1, surface: "dirt", grip: .78, resistance: .08 },
];
export const OFFROAD_PICKUP_IDS = [
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
  return 6 * (1 - Math.cos(t)) + 2 * (1 - Math.cos(3 * t));
}
/** Arcade force multiplier only, not a validated mud/tire physics simulation. */
export function offroadDriveMultiplier(mode: FourWheelDriveMode, contacts: readonly boolean[], progress: number): number {
  const s = offroadSectorAt(progress);
  return pickupContactTraction(mode, contacts, s.grip) * s.grip * (1 - s.resistance);
}
