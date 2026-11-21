/** Share the tyres with cornering instead of adding full nitro through a slide. */
export function turboTractionFactor(
  speedMs: number, steeringRadians: number, wheelbase: number,
  lateralSpeedMs: number, yawRate: number, grip: number
): number {
  if (![speedMs, steeringRadians, wheelbase, lateralSpeedMs, yawRate, grip].every(Number.isFinite) || wheelbase <= 0) return 0;
  const fade = (value: number, start: number, end: number): number => {
    const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  const speed = Math.abs(speedMs);
  // Anticipate the requested turn before yaw/slip have had time to build up.
  // Also cover countersteering and steering release during an existing slide.
  const lateralDemand = Math.max(
    speed * speed * Math.abs(Math.tan(Math.max(-.6, Math.min(.6, steeringRadians)))) / wheelbase,
    speed * Math.abs(yawRate)
  );
  return (1 - fade(lateralDemand, 10, 25)) *
    (1 - fade(Math.abs(lateralSpeedMs), .8, 3)) * fade(grip, .72, .98);
}
