/** Suzaka recovery guards. Shared by racing and regression tests so 350-504
 * MPH driving never triggers the previous hard-coded 200m/s reset. */
export const SUZAKA_RESCUE_EXTRA_METRES = .85;
export const SUZAKA_STRANDED_KERB_MARGIN = 0.95;
export const SUZAKA_STRANDED_DELAY_SEC = 2.2;

export function escapedSuzakaBarrier(lateral:number,barrierOffset:number):boolean {
  return Number.isFinite(lateral) && Math.abs(lateral)>barrierOffset+SUZAKA_RESCUE_EXTRA_METRES;
}

export function strandedOutsideSuzakaKerb(lateral:number,halfWidth:number,planarSpeed:number):boolean {
  return Number.isFinite(lateral) && Math.abs(lateral)>halfWidth+SUZAKA_STRANDED_KERB_MARGIN &&
    Number.isFinite(planarSpeed) && planarSpeed<1.0;
}

export function exceedsArcadeSafetyVelocity(totalSpeedMs:number,vehicleLimitMph:number):boolean {
  return Number.isFinite(totalSpeedMs) && totalSpeedMs>vehicleLimitMph*.44704+55;
}
