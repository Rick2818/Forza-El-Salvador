/** A revving motor must not leave the car permanently stranded after a kerb
 * or terrain collision. Only count deliberate acceleration while practically
 * motionless; do not interrupt pit stops, braking, reversing or countdowns. */
export const STALLED_THROTTLE_RECOVERY_SECONDS = 3.0;
export const STALLED_THROTTLE_COOLDOWN_SECONDS = 5.0;
export const STALLED_THROTTLE_MAX_SPEED_MS = 1.2;

export interface StallProbe {
  racing: boolean;
  throttle: number;
  brake: number;
  handbrake: boolean;
  planarSpeed: number;
}

export function stalledUnderThrottle(probe: StallProbe): boolean {
  return probe.racing &&
    Number.isFinite(probe.planarSpeed) && probe.planarSpeed < STALLED_THROTTLE_MAX_SPEED_MS &&
    Number.isFinite(probe.throttle) && probe.throttle >= 0.55 &&
    Number.isFinite(probe.brake) && probe.brake <= 0.08 &&
    !probe.handbrake;
}
