import { describe, expect, it } from "vitest";
import {
  stalledUnderThrottle,
  STALLED_THROTTLE_COOLDOWN_SECONDS,
  STALLED_THROTTLE_MAX_SPEED_MS,
  STALLED_THROTTLE_RECOVERY_SECONDS
} from "./stalledThrottleRecovery";

const stopped = { racing: true, throttle: 1, brake: 0, handbrake: false, planarSpeed: .4 };

describe("Recovery for a revving but immobilized car, on Monzon and Suzaka", () => {
  it("recognizes the user screenshot case: 1 MPH and accelerator pressed", () => {
    expect(stalledUnderThrottle(stopped)).toBe(true);
    expect(STALLED_THROTTLE_RECOVERY_SECONDS).toBe(3);
    expect(STALLED_THROTTLE_MAX_SPEED_MS).toBeGreaterThan(.44704);
    expect(STALLED_THROTTLE_COOLDOWN_SECONDS).toBeGreaterThan(STALLED_THROTTLE_RECOVERY_SECONDS);
  });
  it("does not rescue drivers waiting, braking, backing up, or in the countdown", () => {
    for (const probe of [
      { ...stopped, throttle: 0 },
      { ...stopped, throttle: .3 },
      { ...stopped, brake: 1 },
      { ...stopped, handbrake: true },
      { ...stopped, racing: false },
      { ...stopped, planarSpeed: 3 },
      { ...stopped, planarSpeed: Number.NaN },
    ]) expect(stalledUnderThrottle(probe)).toBe(false);
  });
  it("releases the stalled flag as soon as the car begins moving", () => {
    expect(stalledUnderThrottle({ ...stopped, planarSpeed: 0.8 })).toBe(true);
    expect(stalledUnderThrottle({ ...stopped, planarSpeed: 1.21 })).toBe(false);
    expect(stalledUnderThrottle({ ...stopped, throttle: .55 })).toBe(true);
  });
});
