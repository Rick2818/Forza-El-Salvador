/** Stable rollover recovery, independent of steering and airborne maneuvers. */
export const ROLLOVER_RECOVERY_SECONDS = 1.5;
export const ROLLOVER_MAX_PLANAR_SPEED_MS = 8 / 3.6;
export function isStationaryUpsideDown(
  rotation: {x:number; y:number; z:number; w:number},
  planarSpeedMs: number
): boolean {
  if(!Number.isFinite(planarSpeedMs) || planarSpeedMs > ROLLOVER_MAX_PLANAR_SPEED_MS) return false;
  const {x,y,z,w} = rotation;
  if(![x,y,z,w].every(Number.isFinite)) return false;
  // World vertical component of local car-up axis (0,1,0).
  const upY = 1 - 2 * (x*x + z*z);
  return upY < -0.5;
}
