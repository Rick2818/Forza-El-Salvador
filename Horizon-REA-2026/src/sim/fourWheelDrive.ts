/**
 * 2H / 4H mode for future licensed pickup GLBs.
 *
 * Drive force remains applied at the rigid body's centre of mass because
 * Rapier raycast wheel engine forces caused pitch-flips in Horizon. The
 * contact-aware traction factor is an arcade simulation, not a mechanical
 * transfer-case / differential solver.
 */
export type FourWheelDriveMode = "2H" | "4H";

export const FOUR_BY_FOUR_PICKUP_IDS = [
  "ram-1500-trx",
  "chevrolet-silverado-z71",
  "ford-f150-raptor"
] as const;

export const MAX_MODE_SWITCH_KPH = 30;

export function isFourWheelDrivePickup(vehicleId: string | undefined): boolean {
  return !!vehicleId && FOUR_BY_FOUR_PICKUP_IDS.some((id) => id === vehicleId);
}

/** Changing the transfer case at high road speeds is prohibited. */
export function nextFourWheelDriveMode(
  current: FourWheelDriveMode, speedKph: number
): FourWheelDriveMode {
  if (!Number.isFinite(speedKph) || Math.abs(speedKph) > MAX_MODE_SWITCH_KPH) return current;
  return current === "2H" ? "4H" : "2H";
}

/**
 * Reduces centre-of-mass propulsion when powered axle wheels lose contact.
 * 4H can continue on the front axle if the rear axle hangs in the air.
 * Off-road 4H provides a mild traction advantage, but no speed bonus on tarmac.
 *
 * Wheel ordering is FR, FL, RR, RL (same as selectedAsset.WHEEL_NAMES).
 */
export function pickupContactTraction(
  mode: FourWheelDriveMode, contacts: readonly boolean[], surfaceGrip: number
): number {
  if (contacts.length !== 4) throw new Error("Se requieren cuatro ruedas");
  const front = (Number(contacts[0]) + Number(contacts[1])) * 0.5;
  const rear = (Number(contacts[2]) + Number(contacts[3])) * 0.5;
  const powered = mode === "4H" ? Math.max(rear, (front + rear) * 0.5) : rear;
  if (powered === 0) return 0;
  const offRoad = mode === "4H"
    ? 1 + 0.22 * Math.max(0, Math.min(1, (0.86 - surfaceGrip) / 0.36))
    : 1;
  return Math.min(1.22, powered * offRoad);
}
