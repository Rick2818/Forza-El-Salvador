/**
 * Save file.
 *
 * One versioned record in localStorage. REA's audit found zero storage in the
 * previous build, so this is the first persistence in the game. Everything is
 * plain JSON and every read is defensive: a corrupted or older save must never
 * stop the game from starting.
 *
 * Private-mode browsers throw on localStorage access; in that case the profile
 * lives in memory for the session and the game keeps working, it just forgets.
 */

import type { Difficulty } from "../race/race";

export const STORAGE_KEY = "horizon.sv.profile.v1";
export const SAVE_VERSION = 1;

export interface SavedChampionship {
  id: string;
  carId: string;
  difficulty: Difficulty;
  /** Index of the next event to race; equals events.length when finished. */
  eventIndex: number;
  points: Record<string, number>;
  events: number;
  finished: boolean;
}

export interface Profile {
  version: number;
  credits: number;
  unlockedCars: string[];
  /** Best lap in seconds, keyed by circuit id. */
  bestLaps: Record<string, number>;
  championship: SavedChampionship | null;
  lastCircuit: string;
  lastCar: string;
  races: number;
  wins: number;
}

export function defaultProfile(): Profile {
  return {
    version: SAVE_VERSION,
    credits: 0,
    unlockedCars: [],
    bestLaps: {},
    championship: null,
    lastCircuit: "",
    lastCar: "",
    races: 0,
    wins: 0
  };
}

let memoryFallback: Profile | null = null;
let storageAvailable = true;

function readRaw(): string | null {
  if (!storageAvailable) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    storageAvailable = false;
    return null;
  }
}

/** Coerces whatever was stored into a usable profile. */
export function parseProfile(raw: string | null): Profile {
  const base = defaultProfile();
  if (!raw) return base;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!data || typeof data !== "object") return base;
  const source = data as Partial<Profile>;

  const profile: Profile = {
    ...base,
    credits: typeof source.credits === "number" && Number.isFinite(source.credits) ? Math.max(0, source.credits) : 0,
    unlockedCars: Array.isArray(source.unlockedCars)
      ? source.unlockedCars.filter((id): id is string => typeof id === "string")
      : [],
    bestLaps: {},
    championship: null,
    lastCircuit: typeof source.lastCircuit === "string" ? source.lastCircuit : "",
    lastCar: typeof source.lastCar === "string" ? source.lastCar : "",
    races: typeof source.races === "number" ? Math.max(0, Math.floor(source.races)) : 0,
    wins: typeof source.wins === "number" ? Math.max(0, Math.floor(source.wins)) : 0
  };

  if (source.bestLaps && typeof source.bestLaps === "object") {
    for (const [circuit, time] of Object.entries(source.bestLaps)) {
      if (typeof time === "number" && Number.isFinite(time) && time > 0) {
        profile.bestLaps[circuit] = time;
      }
    }
  }

  const championship = source.championship;
  if (championship && typeof championship === "object") {
    const saved = championship as Partial<SavedChampionship>;
    if (
      typeof saved.id === "string" &&
      typeof saved.carId === "string" &&
      typeof saved.eventIndex === "number" &&
      typeof saved.events === "number" &&
      saved.points &&
      typeof saved.points === "object"
    ) {
      const points: Record<string, number> = {};
      for (const [driver, value] of Object.entries(saved.points)) {
        if (typeof value === "number" && Number.isFinite(value)) points[driver] = value;
      }
      profile.championship = {
        id: saved.id,
        carId: saved.carId,
        difficulty: saved.difficulty === "facil" || saved.difficulty === "dificil" ? saved.difficulty : "normal",
        eventIndex: Math.max(0, Math.floor(saved.eventIndex)),
        points,
        events: Math.max(0, Math.floor(saved.events)),
        finished: Boolean(saved.finished)
      };
    }
  }

  return profile;
}

export function loadProfile(): Profile {
  const raw = readRaw();
  if (raw === null && !storageAvailable) {
    return memoryFallback ?? (memoryFallback = defaultProfile());
  }
  const profile = parseProfile(raw);
  memoryFallback = profile;
  return profile;
}

export function saveProfile(profile: Profile): void {
  memoryFallback = profile;
  if (!storageAvailable) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    storageAvailable = false;
  }
}

/** True when the browser is actually persisting between sessions. */
export function isPersistent(): boolean {
  return storageAvailable;
}

export function resetProfile(): Profile {
  const profile = defaultProfile();
  saveProfile(profile);
  return profile;
}

/** Records a lap and returns true when it beat the stored best. */
export function recordBestLap(profile: Profile, circuitId: string, lapTime: number): boolean {
  if (!(lapTime > 0)) return false;
  const current = profile.bestLaps[circuitId];
  if (current !== undefined && current <= lapTime) return false;
  profile.bestLaps[circuitId] = lapTime;
  return true;
}

export function ownsCar(profile: Profile, carId: string, freeCars: string[]): boolean {
  return freeCars.includes(carId) || profile.unlockedCars.includes(carId);
}
