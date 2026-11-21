/**
 * Automatic arcade turbo. "100 m/hr" is interpreted as 100 mph (160.9344 km/h).
 * This is a fantasy driving effect, not a claim about a real car's hardware.
 * A timed burst and re-arm cooldown prevent permanent acceleration.
 */
export const TURBO_TRIGGER_KPH = 160.9344;
export const TURBO_TRIGGER_MS = TURBO_TRIGGER_KPH / 3.6;
export const TURBO_DURATION = 2.2;
export const TURBO_COOLDOWN = 6;
export const TURBO_FORCE_N = 5900;
export interface TurboState {
  active: number;
  cooldown: number;
}
export const createTurboState = (): TurboState => ({ active: 0, cooldown: 0 });

export function stepTurbo(
  state: TurboState, dt: number, forwardSpeedMs: number,
  throttle: number, onTrack: boolean, enabled: boolean
): TurboState {
  if (!Number.isFinite(dt) || dt <= 0) return { ...state };
  const active = Math.max(0, state.active - dt);
  const cooldown = Math.max(0, state.cooldown - dt);
  if (!enabled || !onTrack || throttle < 0.12 || forwardSpeedMs < TURBO_TRIGGER_MS * 0.78) {
    return { active: 0, cooldown };
  }
  if (active > 0) return { active, cooldown };
  if (cooldown > 0 || forwardSpeedMs < TURBO_TRIGGER_MS) return { active: 0, cooldown };
  return { active: TURBO_DURATION, cooldown: TURBO_DURATION + TURBO_COOLDOWN };
}
