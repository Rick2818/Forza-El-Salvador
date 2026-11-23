/** Race-time watchdog for AI cars trapped by car-to-car collisions.
 * A car reversing repeatedly or turning in place does not advance along
 * the racing route; it must eventually be rescued instead of looping forever.
 */
export const AI_RECOVERY_STAGNANT_SECONDS = 6;
export const AI_RECOVERY_COOLDOWN_SECONDS = 12;
export const AI_RECOVERY_FORWARD_METRES = 18;

export interface RivalMotionWatch {
  index: number;
  forwardMetres: number;
  withoutProgressSeconds: number;
  cooldownSeconds: number;
}

export function newRivalMotionWatch(index: number): RivalMotionWatch {
  return {index, forwardMetres: 0, withoutProgressSeconds: 0, cooldownSeconds: 0};
}

/** Returns true ONLY when a real, ongoing racing car needs a safe-road rescue.
 * Works for forwards-moving rivals (direction=1) and wrong-way traffic (-1).
 * The wrapped delta avoids a false rescue at the start/finish line.
 */
export function updateRivalMotion(
  state: RivalMotionWatch, index: number, sampleCount: number,
  metresPerSample: number, direction: 1 | -1, dt: number,
  racing: boolean
): boolean {
  if (!Number.isFinite(dt) || dt <= 0 || !racing || sampleCount <= 0 ||
      !Number.isFinite(index) || !Number.isFinite(metresPerSample) || metresPerSample <= 0) return false;
  const elapsed = Math.min(dt, .25);
  state.cooldownSeconds = Math.max(0, state.cooldownSeconds - elapsed);
  const raw = ((index - state.index) % sampleCount + sampleCount) % sampleCount;
  const wrapped = raw > sampleCount / 2 ? raw - sampleCount : raw;
  state.index = index;
  const delta = wrapped * metresPerSample * direction;

  // A sudden jump (bridge ambiguity, manual car reset) starts a new window.
  if (Math.abs(delta) > 120) {
    state.forwardMetres = 0;
    state.withoutProgressSeconds = 0;
    return false;
  }
  // Reversing reduces progress; short oscillations never satisfy the watchdog.
  state.forwardMetres = Math.max(-AI_RECOVERY_FORWARD_METRES,
    Math.min(AI_RECOVERY_FORWARD_METRES, state.forwardMetres + delta));
  if (state.forwardMetres >= AI_RECOVERY_FORWARD_METRES) {
    state.forwardMetres = 0;
    state.withoutProgressSeconds = 0;
    return false;
  }
  // Do not count cooldown time toward the next incident: a failed rescue
  // must not cause another teleport immediately after the cooldown expires.
  if (state.cooldownSeconds > 0) {
    state.withoutProgressSeconds = 0;
    return false;
  }
  state.withoutProgressSeconds += elapsed;
  if (state.withoutProgressSeconds < AI_RECOVERY_STAGNANT_SECONDS) return false;
  // Caller must find clear track space before teleporting. No repeated
  // per-frame rescue attempts, even if nearby cars are temporarily packed.
  state.withoutProgressSeconds = 0;
  state.forwardMetres = 0;
  state.cooldownSeconds = AI_RECOVERY_COOLDOWN_SECONDS;
  return true;
}

export function resetRivalMotion(state: RivalMotionWatch, newIndex: number): void {
  state.index = newIndex;
  state.withoutProgressSeconds = 0;
  state.forwardMetres = 0;
  state.cooldownSeconds = AI_RECOVERY_COOLDOWN_SECONDS;
}
