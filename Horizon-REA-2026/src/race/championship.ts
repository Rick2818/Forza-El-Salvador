/**
 * Championship ("Serie 1 Costa y Volcán").
 *
 * Three events, one per circuit, with points carried between them. The scoring
 * is a plain table and every function here is pure, so the arithmetic can be
 * tested without a renderer or a physics world.
 */

import { CIRCUITS, getCircuit } from "../world/circuits";
import type { Difficulty, Standing } from "./race";

export interface ChampionshipEvent {
  circuitId: string;
  laps: number;
}

export interface ChampionshipDefinition {
  id: string;
  name: string;
  events: ChampionshipEvent[];
  /** Points for P1, P2, P3, ... in each event. */
  points: number[];
}

export interface ChampionshipState {
  id: string;
  carId: string;
  difficulty: Difficulty;
  eventIndex: number;
  points: Record<string, number>;
  events: number;
  finished: boolean;
}

export interface ChampionshipRow {
  name: string;
  points: number;
  isPlayer: boolean;
  position: number;
}

export const CHAMPIONSHIP: ChampionshipDefinition = {
  id: "serie-1",
  name: "Serie 1 · Costa y Volcán",
  events: CIRCUITS.map((circuit) => ({ circuitId: circuit.id, laps: 3 })),
  points: [25, 18, 15, 12]
};

export function createChampionship(
  carId: string,
  difficulty: Difficulty,
  definition: ChampionshipDefinition = CHAMPIONSHIP
): ChampionshipState {
  return {
    id: definition.id,
    carId,
    difficulty,
    eventIndex: 0,
    points: {},
    events: definition.events.length,
    finished: false
  };
}

export function eventOf(
  state: ChampionshipState,
  definition: ChampionshipDefinition = CHAMPIONSHIP
): ChampionshipEvent | null {
  if (state.finished) return null;
  return definition.events[state.eventIndex] ?? null;
}

/** Adds the points of a finished event. Pure: returns a new state. */
export function applyEventResult(
  state: ChampionshipState,
  standings: Standing[],
  definition: ChampionshipDefinition = CHAMPIONSHIP
): ChampionshipState {
  const points = { ...state.points };
  const table = definition.points;
  for (const entry of standings) {
    const gained = table[entry.position - 1] ?? 0;
    points[entry.name] = (points[entry.name] ?? 0) + gained;
  }
  const eventIndex = state.eventIndex + 1;
  return {
    ...state,
    points,
    eventIndex,
    finished: eventIndex >= definition.events.length
  };
}

/** Points table, highest first. Ties keep the order in which they appeared. */
export function championshipTable(state: ChampionshipState): ChampionshipRow[] {
  const rows = Object.entries(state.points).map(([name, points]) => ({
    name,
    points,
    isPlayer: name === "TÚ",
    position: 0
  }));
  rows.sort((a, b) => b.points - a.points);
  rows.forEach((row, index) => (row.position = index + 1));
  return rows;
}

export function playerPosition(state: ChampionshipState): number {
  return championshipTable(state).find((row) => row.isPlayer)?.position ?? 0;
}

export function playerWon(state: ChampionshipState): boolean {
  return state.finished && playerPosition(state) === 1;
}

/** Circuit of the event, resolved through the catalogue. */
export function eventCircuit(state: ChampionshipState, definition: ChampionshipDefinition = CHAMPIONSHIP) {
  const event = eventOf(state, definition);
  return event ? getCircuit(event.circuitId) : undefined;
}
