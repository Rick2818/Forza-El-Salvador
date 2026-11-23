/** CPU/GPU visibility budget for thousands of 3D spectators.
 * Keep every spectator placed in the world, but draw only those inside the
 * useful distance/forward view. This must not alter race physics. */
export const CROWD_VISIBLE_METRES = 480;
export const CROWD_CAMERA_MOVE_METRES = 9;
export const CROWD_REFRESH_INTERVAL_SECONDS = .42;
export const CROWD_DIRECTION_DOT_THRESHOLD = .995;

export function shouldRefreshCrowd(
  cameraMovedSquared: number, directionDot: number, elapsedSeconds: number
): boolean {
  return cameraMovedSquared >= CROWD_CAMERA_MOVE_METRES ** 2 ||
    directionDot < CROWD_DIRECTION_DOT_THRESHOLD ||
    elapsedSeconds >= CROWD_REFRESH_INTERVAL_SECONDS;
}

/** A generous rear margin prevents pops as the player passes a grandstand. */
export function audienceInView(distance: number, forwardDistance: number): boolean {
  return Number.isFinite(distance) && Number.isFinite(forwardDistance) &&
    distance < CROWD_VISIBLE_METRES &&
    (distance < 28 || forwardDistance >= -distance * .25);
}

/** Lower polygon count beyond the nearest camera distance. */
export function audienceLod(distance: number): 0 | 1 | 2 {
  return distance < 18 ? 0 : distance < 75 ? 1 : 2;
}
