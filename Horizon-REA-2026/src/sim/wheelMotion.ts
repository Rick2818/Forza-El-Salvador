/** Pure front-axle steering and rolling wheel animation. +Z is forward. */
export function visibleWheelSteer(physicsAngle: number, front: boolean): number {
  if (!front || !Number.isFinite(physicsAngle)) return 0;
  // Steering remains faithful to physical yaw direction; moderate scale makes
  // small real high-speed steering angles perceptible from chase camera.
  return Math.max(-0.48, Math.min(0.48, physicsAngle * 1.45));
}

export function nextWheelRoll(
  previous: number, forwardSpeedMs: number, yawRate: number,
  lateralOffset: number, wheelRadius: number, dt: number
): number {
  if (![previous, forwardSpeedMs, yawRate, lateralOffset, wheelRadius, dt].every(Number.isFinite) ||
      wheelRadius <= 0.05 || dt <= 0) return previous;
  // Inner wheel rotates slower in a bend, outer faster. Reverse flips rotation.
  const localSpeed = forwardSpeedMs - Math.max(-2, Math.min(2, yawRate)) * lateralOffset;
  const angle = previous + localSpeed * dt / wheelRadius;
  return ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}
