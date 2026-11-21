import { expect, it, vi } from "vitest";
import { Track } from "./track";
import { getCircuit } from "./circuits";

it("lets Monzon AI accelerate on straights and brake before corners", () => {
  const track = new Track(getCircuit("monzon")!);
  vi.spyOn(track, "buildVisuals").mockImplementation(() => {});
  track.build();
  const speeds = track.targetSpeeds;
  expect(speeds.every(Number.isFinite)).toBe(true);
  expect(Math.max(...speeds)).toBeGreaterThan(75);
  expect(Math.min(...speeds)).toBeLessThan(40);
  const brakingLimit = 2 * 9.5 * track.segmentLength;
  for (let i = 0; i < speeds.length; i++) {
    expect(speeds[i] ** 2 - speeds[(i + 1) % speeds.length] ** 2)
      .toBeLessThanOrEqual(brakingLimit + .001);
  }
});
