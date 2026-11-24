/**
 * 2H / 4H mode for future licensed pickup GLBs.
 *
 * Drive force remains applied at the rigid body's centre of mass because
 * Rapier raycast wheel engine forces caused pitch-flips in Horizon. The
 * contact-aware traction factor is an arcade simulation, not a mechanical
 * transfer-case / differential solver.
 */
export type FourWheelDriveMode = "2H" | "4A" | "4H";

export const FOUR_BY_FOUR_PICKUP_IDS = [
  "ram-1500-trx",
  "chevrolet-silverado-z71",
  "ford-f150-raptor",
  "ford-f150-raptor-police",
  "ram-3500-alternative",
  "chevrolet-silverado-ev-alternative"
] as const;

export const MAX_MODE_SWITCH_KPH = 30;

export function isFourWheelDrivePickup(vehicleId: string | undefined): boolean {
  return !!vehicleId && FOUR_BY_FOUR_PICKUP_IDS.some((id) => id === vehicleId);
}

/** RAM TRX is full-time 4WD: there is no 2H setting on that model. */
export function defaultFourWheelDriveMode(vehicleId: string | undefined): FourWheelDriveMode {
  return vehicleId === "ram-1500-trx" || vehicleId === "chevrolet-silverado-ev-alternative" ? "4A" : "2H";
}

/** Changes simulated transfer-case mode at a conservative low speed. */
export function nextFourWheelDriveMode(
  current: FourWheelDriveMode, speedKph: number, vehicleId?: string
): FourWheelDriveMode {
  if (!Number.isFinite(speedKph) || Math.abs(speedKph) > MAX_MODE_SWITCH_KPH) return current;
  return current === "4H" ? defaultFourWheelDriveMode(vehicleId) : "4H";
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
  const powered = mode === "2H" ? rear : Math.max(rear, (front + rear) * 0.5);
  if (powered === 0) return 0;
  const offRoad = mode === "2H" ? 1 : 1 + (mode === "4H" ? 0.22 : 0.1)
    * Math.max(0, Math.min(1, (0.86 - surfaceGrip) / 0.36));
  return Math.min(1.22, powered * offRoad);
}
