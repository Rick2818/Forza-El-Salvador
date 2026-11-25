/**
 * Automatic arcade turbo. "100 m/hr" is interpreted as 100 mph (160.9344 km/h).
 * This is a fantasy driving effect, not a claim about a real car's hardware.
 * A timed burst and re-arm cooldown prevent permanent acceleration.
 */
export const TURBO_TRIGGER_KPH = 160.9344;
export const TURBO_TRIGGER_MS = TURBO_TRIGGER_KPH / 3.6;
export const TURBO_DURATION = 2.2;
export const TURBO_COOLDOWN = 6;
export const TURBO_FORCE_N = 11200;
export interface TurboState {
  active: number;
  cooldown: number;
}
export const createTurboState = (): TurboState => ({ active: 0, cooldown: 0 });

export function stepTurbo(
  state: TurboState, dt: number, forwardSpeedMs: number,
  throttle: number, onTrack: boolean, enabled: boolean, triggerKph = TURBO_TRIGGER_KPH
): TurboState {
  if (!Number.isFinite(dt) || dt <= 0) return { ...state };
  const triggerMs = Number.isFinite(triggerKph) && triggerKph > 0 ? triggerKph / 3.6 : TURBO_TRIGGER_MS;
  const active = Math.max(0, state.active - dt);
  const cooldown = Math.max(0, state.cooldown - dt);
  if (!enabled || !onTrack || throttle < 0.12 || forwardSpeedMs < triggerMs * 0.78) {
    return { active: 0, cooldown };
  }
  if (active > 0) return { active, cooldown };
  if (cooldown > 0 || forwardSpeedMs < triggerMs) return { active: 0, cooldown };
  return { active: TURBO_DURATION, cooldown: TURBO_DURATION + TURBO_COOLDOWN };
}

/** Experimental threshold-crossing boost. Re-arm below 95 km/h, never start
 * merely because a timer expired above the threshold. Consume the crossing
 * even if traction is insufficient; keep corner/brake protection intact. */
export interface CrossingTurboState extends TurboState { armed: boolean }
export const createCrossingTurboState = (): CrossingTurboState => ({active:0,cooldown:0,armed:true});
export function stepCrossingTurbo(state:CrossingTurboState,dt:number,forwardSpeedMs:number,
 throttle:number,onTrack:boolean,enabled:boolean,triggerKph=100):CrossingTurboState {
 if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(forwardSpeedMs))return {...state};
 const speed=forwardSpeedMs*3.6;
 const armed=state.armed||speed<=triggerKph-5;
 const crossing=armed&&speed>=triggerKph;
 const safe=enabled&&onTrack&&throttle>=.12&&speed>=triggerKph-5;
 const active=safe?(crossing?TURBO_DURATION:Math.max(0,state.active-dt)):0;
 return {active,cooldown:0,armed:armed&&!crossing};
}
