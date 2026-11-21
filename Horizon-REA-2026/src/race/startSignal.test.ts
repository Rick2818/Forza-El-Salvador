import { expect, it } from "vitest";
import { startSignalPhase } from "./startSignal";

it("shares the race-state boundary instead of starting green from an independent timer", () => {
  expect(startSignalPhase("countdown", 5.2)).toBe("red");
  expect(startSignalPhase("countdown", 2.001)).toBe("red");
  expect(startSignalPhase("countdown", 2)).toBe("yellow");
  expect(startSignalPhase("countdown", .001)).toBe("yellow");
  expect(startSignalPhase("countdown", 0)).toBe("yellow");
  expect(startSignalPhase("racing", 0, true)).toBe("green");
  expect(startSignalPhase("racing", 0, false)).toBeNull();
  expect(startSignalPhase("idle", 5.2)).toBeNull();
  expect(startSignalPhase("finished", 0, true)).toBeNull();
});
