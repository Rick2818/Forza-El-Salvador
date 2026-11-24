/** Wheel steering matches the SAME angle applied to Rapier. +Z is forward. */
export function visibleWheelSteer(physicsAngle: number, front: boolean): number {
  if (!front || !Number.isFinite(physicsAngle)) return 0;
  // Do not exaggerate steering by 45%: the rendered tyre must share its
  // contact patch direction with the physics wheel on every circuit.
  return Math.max(-0.48, Math.min(0.48, physicsAngle));
}

/** Integrate wheel travel after each physics step, never once per render frame.
 * A wheel loses road-derived rolling when airborne; a locked handbrake rear
 * tyre remains stationary even as the vehicle slides on the asphalt.
 */
export function nextWheelRoll(
  previous: number, forwardSpeedMs: number, yawRate: number,
  lateralOffset: number, wheelRadius: number, dt: number,
  contact = true, locked = false
): number {
  if (![previous, forwardSpeedMs, yawRate, lateralOffset, wheelRadius, dt].every(Number.isFinite) ||
      wheelRadius <= 0.05 || dt <= 0 || !contact || locked) return previous;
  const localSpeed = forwardSpeedMs - Math.max(-2, Math.min(2, yawRate)) * lateralOffset;
  const angle = previous + localSpeed * dt / wheelRadius;
  return ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}
