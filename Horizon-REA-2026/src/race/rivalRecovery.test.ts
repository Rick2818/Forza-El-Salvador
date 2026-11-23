import { describe, expect, it } from "vitest";
import { AI_RECOVERY_COOLDOWN_SECONDS, AI_RECOVERY_STAGNANT_SECONDS,
  newRivalMotionWatch, resetRivalMotion, updateRivalMotion } from "./rivalRecovery";

const N = 1500, sampleMetres = 4;
const watch = (indices: readonly number[], direction: 1 | -1, dt = 1 / 60) => {
  const tracker = newRivalMotionWatch(indices[0]);
  let recoveries = 0;
  for (const index of indices) {
    if (updateRivalMotion(tracker, index, N, sampleMetres, direction, dt, true)) recoveries++;
  }
  return {tracker, recoveries};
};

describe("AI opponent deadlock watchdog", () => {
  it("rescues a rival repeating an infinite reverse/forward loop after six seconds", () => {
    const indices = Array.from({ length: 450 }, (_, i) => 300 + Math.round(Math.sin(i / 23) * 1.5));
    const {recoveries, tracker} = watch(indices, 1);
    expect(recoveries).toBe(1);
    expect(tracker.cooldownSeconds).toBeGreaterThan(0);
  });
  it("rescues a stationary opposing car and does not spam teleports", () => {
    const indices = Array(30 * 60).fill(320);
    const {recoveries} = watch(indices, 1);
    // At most two rescues in 30s; recovery is cooldown bounded.
    expect(recoveries).toBeGreaterThanOrEqual(1);
    expect(recoveries).toBeLessThanOrEqual(2);
  });
  it("does not rescue a car genuinely progressing down the circuit", () => {
    const indices = Array.from({ length: 11 * 60 }, (_, i) => 135 + Math.floor(i / 8));
    expect(watch(indices, 1).recoveries).toBe(0);
  });
  it("recognizes a lap wrap and correct reverse-direction progress", () => {
    const forward = Array.from({ length: 600 }, (_, i) => (1493 + Math.floor(i / 10)) % N);
    const reverse = Array.from({ length: 600 }, (_, i) => ((4 - Math.floor(i / 10)) % N + N) % N);
    expect(watch(forward, 1).recoveries).toBe(0);
    expect(watch(reverse, -1).recoveries).toBe(0);
  });
  it("never rescues on countdowns, pauses, finished state or invalid timestep", () => {
    const tracker = newRivalMotionWatch(10);
    for(let i=0;i<1000;i++)
      expect(updateRivalMotion(tracker,10,N,sampleMetres,1,1/60,false)).toBe(false);
    expect(tracker.withoutProgressSeconds).toBe(0);
    expect(updateRivalMotion(tracker,10,N,sampleMetres,1,Number.NaN,true)).toBe(false);
  });
  it("reinitializes guidance and cooldown when moved to safe track", () => {
    const tracker = newRivalMotionWatch(12);
    tracker.withoutProgressSeconds = AI_RECOVERY_STAGNANT_SECONDS;
    resetRivalMotion(tracker, 135);
    expect(tracker.index).toBe(135);
    expect(tracker.withoutProgressSeconds).toBe(0);
    expect(tracker.cooldownSeconds).toBe(AI_RECOVERY_COOLDOWN_SECONDS);
  });
});
