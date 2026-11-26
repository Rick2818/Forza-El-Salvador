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

/** Arcade expedition: explicit transfer case, no automatic engagement. */
export function nextManualTrailMode(current: FourWheelDriveMode,speedKph:number):FourWheelDriveMode {
  if(!Number.isFinite(speedKph)||Math.abs(speedKph)>MAX_MODE_SWITCH_KPH)return current;
  return current==="4H"?"2H":"4H";
}
/** Available drive force before contact multiplier, in newtons. 2H has
 * only the rear axle and cannot match 4H in deep mud or on steep grades. */
export function trailDriveLimit(mass:number,grip:number,mode:FourWheelDriveMode):number {
  const mu=Math.max(0,Math.min(1,grip));
  return Math.max(0,mass)*9.81*mu*(mode==="4H"?1.12: .48);
}

/** Low-range, contact-limited arcade extraction assist. Only explicit 4H,
 * on wet terrain, with driver demand and ground contact. Never moves a
 * stationary uncommanded vehicle, or a vehicle with all wheels airborne.
 * Fade out before normal trail speed so this cannot become a speed boost. */
export function trailExtractionForce(
  mass:number, contacts:readonly boolean[], mode:FourWheelDriveMode,
  wet:boolean, planarSpeed:number, demand:number
):number {
  if(mode!=="4H"||!wet||contacts.length!==4||
    !Number.isFinite(mass)||!Number.isFinite(planarSpeed)||!Number.isFinite(demand))return 0;
  const count=contacts.reduce((sum,contact)=>sum+Number(contact),0);
  if(!count||demand<=0)return 0;
  const fade=1-Math.max(0,Math.min(1,(Math.abs(planarSpeed)-1.2)/2.8));
  const groundedCapacity=count===1?.40:count===2?.72:count===3?.82:.90;
  return Math.max(0,mass)*9.81*groundedCapacity*fade*Math.min(1,demand);
}

/** Grade-aware low-range torque reserve (arcade). Grade is signed rise/run
 * in the requested direction. Never powers 2H, airborne or idle vehicles.
 * Compensates gravity and rolling resistance through walking/climbing speed.
 */
export function trailHillForce(mass:number,contacts:readonly boolean[],mode:FourWheelDriveMode,grade:number,resistance:number,waterDepth:number,planarSpeed:number,demand:number):number {
 if(mode!=="4H"||contacts.length!==4||![mass,grade,resistance,waterDepth,planarSpeed,demand].every(Number.isFinite)||grade<.10||demand<=0)return 0;
 const count=contacts.reduce((sum,c)=>sum+Number(c),0);if(!count)return 0;
 const slope=Math.min(.65,Math.max(0,grade));
 const gravity=slope/Math.sqrt(1+slope*slope);
 const rolling=.22*Math.max(0,Math.min(1,resistance))+.14*Math.max(0,Math.min(.55,waterDepth));
 const fade=1-Math.max(0,Math.min(1,(Math.abs(planarSpeed)-2.5)/4.5));
 const capacity=[0,.55,.85,1,1.12][count];
 return Math.max(0,mass)*9.81*Math.min(capacity,gravity+rolling+.20)*fade*Math.min(1,demand);
}
