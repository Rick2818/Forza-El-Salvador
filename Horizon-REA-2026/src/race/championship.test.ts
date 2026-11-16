import { describe, expect, it } from "vitest";
import type { Standing } from "./race";
import { getCircuit } from "../world/circuits";
import {
  CHAMPIONSHIP,
  applyEventResult,
  championshipTable,
  createChampionship,
  eventOf,
  playerPosition,
  playerWon
} from "./championship";

function standing(position: number, name: string, isPlayer = false): Standing {
  return {
    position,
    name,
    lap: 3,
    isPlayer,
    finished: true,
    finishTime: 60 + position,
    bestLap: 20 + position
  };
}

function event(playerPositionValue: number): Standing[] {
  const others = ["K. VOSS", "A. MIRAI", "R. SANTOS"];
  const rows: Standing[] = [];
  let next = 0;
  for (let position = 1; position <= 4; position++) {
    if (position === playerPositionValue) {
      rows.push(standing(position, "TÚ", true));
    } else {
      rows.push(standing(position, others[next++]));
    }
  }
  return rows;
}

describe("championship", () => {
  it("defines one event per circuit with the published points table", () => {
    expect(CHAMPIONSHIP.events.length).toBeGreaterThanOrEqual(3);
    expect(CHAMPIONSHIP.points).toEqual([25, 18, 15, 12]);
    for (const event of CHAMPIONSHIP.events) {
      expect(getCircuit(event.circuitId)).toBeDefined();
    }
  });

  it("starts empty and advances one event at a time", () => {
    const start = createChampionship("halcon", "normal");
    expect(start.eventIndex).toBe(0);
    expect(start.points).toEqual({});
    expect(start.finished).toBe(false);
    expect(eventOf(start)?.circuitId).toBe(CHAMPIONSHIP.events[0].circuitId);

    const after = applyEventResult(start, event(1));
    expect(after.eventIndex).toBe(1);
    expect(after.points["TÚ"]).toBe(25);
    expect(after.finished).toBe(false);
    // Pure: the input state is untouched.
    expect(start.eventIndex).toBe(0);
    expect(start.points).toEqual({});
  });

  it("awards the whole table in finishing order", () => {
    const state = applyEventResult(createChampionship("halcon", "normal"), event(2));
    expect(state.points["TÚ"]).toBe(18);
    const table = championshipTable(state);
    expect(table.map((row) => row.points)).toEqual([25, 18, 15, 12]);
    expect(table[0].name).toBe("K. VOSS");
    expect(table.find((row) => row.isPlayer)?.position).toBe(2);
  });

  it("closes after the last event and knows whether the player won", () => {
    let state = createChampionship("halcon", "dificil");
    for (let i = 0; i < CHAMPIONSHIP.events.length; i++) {
      state = applyEventResult(state, event(1));
    }
    expect(state.finished).toBe(true);
    expect(eventOf(state)).toBeNull();
    expect(playerPosition(state)).toBe(1);
    expect(playerWon(state)).toBe(true);
  });

  it("does not claim a title when the player loses", () => {
    let state = createChampionship("halcon", "normal");
    for (let i = 0; i < CHAMPIONSHIP.events.length; i++) {
      state = applyEventResult(state, event(4));
    }
    expect(state.finished).toBe(true);
    expect(playerPosition(state)).toBe(4);
    expect(playerWon(state)).toBe(false);
  });

  it("accumulates points across events", () => {
    const full = CHAMPIONSHIP.events.length;
    let state = createChampionship("halcon", "normal");
    // Win every event except the last, which is a fourth place.
    for (let i = 0; i < full; i++) {
      state = applyEventResult(state, event(i === full - 1 ? 4 : 1));
    }
    expect(state.points["TÚ"]).toBe(25 * (full - 1) + 12);
  });
});
