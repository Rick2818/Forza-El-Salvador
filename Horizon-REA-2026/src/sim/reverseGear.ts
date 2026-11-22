/** Arcade reversing uses the brake pedal only once forward movement stops.
 * Constant, sufficiently strong propulsion is essential inside pit garages.
 * The cap protects steering and vehicle stability while backing out. */
export const REVERSE_LIMIT_MS = 17; // 61.2 km/h (38 MPH) max
export const REVERSE_ENGAGEMENT_MS = 0.6;

/** Return a positive force magnitude to subtract from forward propulsion. */
export function reverseDriveForce(brake: number, signedSpeedMs: number, maxEngineForce: number): number {
  if (![brake, signedSpeedMs, maxEngineForce].every(Number.isFinite) ||
      maxEngineForce <= 0 || brake <= 0.05 ||
      signedSpeedMs >= REVERSE_ENGAGEMENT_MS || signedSpeedMs <= -REVERSE_LIMIT_MS) return 0;
  const remaining = REVERSE_LIMIT_MS + signedSpeedMs;
  const taper = Math.min(1, Math.max(0, remaining / 3));
  return Math.min(1, Math.max(0, brake)) * maxEngineForce * 1.8 * taper;
}
