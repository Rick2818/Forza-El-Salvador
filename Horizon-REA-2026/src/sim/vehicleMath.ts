/**
 * Pure vehicle math kernel.
 *
 * Origin: this module began as `rea-lab/vehicle-core.js`, a standalone artifact
 * analysed with REA 6.8.0 (open_binary sha256 37750ab8…, analyze_javascript_application
 * evidence ev_b1d1bbff…). The static graph confirmed 7 call-flow findings and 0 parse
 * failures, so the kernel was promoted to TypeScript and extended here. See
 * REA-EVIDENCE.md for the recorded evidence and the limitations REA reported.
 */

export const GEAR_RATIOS = [3.42, 2.21, 1.56, 1.19, 0.97, 0.81] as const;
export const FINAL_DRIVE = 3.55;
export const WHEEL_RADIUS = 0.36;
export const ENGINE_PEAK_TORQUE = 520;
export const ENGINE_IDLE_RPM = 950;
export const ENGINE_REDLINE_RPM = 7600;
export const ENGINE_PEAK_RPM = 3100;

export function engineTorqueAt(rpm: number): number {
  const clamped = Math.min(Math.max(rpm, ENGINE_IDLE_RPM), ENGINE_REDLINE_RPM);
  const x = (clamped - ENGINE_PEAK_RPM) / (ENGINE_REDLINE_RPM - ENGINE_IDLE_RPM);
  const shape = 1.0 - 0.62 * x * x;
  return Math.max(ENGINE_PEAK_TORQUE * shape, ENGINE_PEAK_TORQUE * 0.32);
}

export function rpmForSpeed(speedMs: number, gear: number): number {
  const ratio = GEAR_RATIOS[gear] * FINAL_DRIVE;
  const wheelRpm = (Math.abs(speedMs) / (2 * Math.PI * WHEEL_RADIUS)) * 60;
  return Math.max(ENGINE_IDLE_RPM, wheelRpm * ratio);
}

export function gearForSpeed(speedMs: number): number {
  const wheelRpm = (Math.abs(speedMs) / (2 * Math.PI * WHEEL_RADIUS)) * 60;
  for (let i = 0; i < GEAR_RATIOS.length; i++) {
    const rpm = wheelRpm * GEAR_RATIOS[i] * FINAL_DRIVE;
    if (rpm < ENGINE_REDLINE_RPM * 0.94) return i;
  }
  return GEAR_RATIOS.length - 1;
}

export function wheelForce(_speedMs: number, throttle: number, gear: number, rpm: number): number {
  const ratio = GEAR_RATIOS[gear] * FINAL_DRIVE;
  const torque = engineTorqueAt(rpm) * throttle;
  return (torque * ratio) / WHEEL_RADIUS;
}

/** Simplified combined-slip tire curve (Pacejka-shaped, normalised). */
export function tireForce(slip: number, peakSlip: number, peakMu: number, load: number): number {
  const s = Math.abs(slip);
  if (s < 0.01) return 0;
  const normalised = s / peakSlip;
  const curve = Math.sin(1.55 * Math.atan(normalised * 1.9));
  return Math.sign(slip) * curve * peakMu * load;
}

export function steeringAngleAt(speedMs: number, steerInput: number, maxAngle = 0.52): number {
  const speedFactor = 1 / (1 + Math.abs(speedMs) * 0.055);
  const angle = steerInput * maxAngle * speedFactor;
  return Math.max(Math.min(angle, maxAngle), -maxAngle);
}

export function dragForce(speedMs: number, area = 1.92, cd = 0.31): number {
  const rho = 1.225;
  return 0.5 * rho * cd * area * speedMs * speedMs;
}

export function downforceN(speedMs: number, coefficient = 3.15): number {
  return coefficient * speedMs * speedMs;
}

/** Extra arcade drive on genuine high-speed STRAIGHTS only. Retains the
 * previously proven low-speed throttle/AI tuning for all seven cars.
 * Compensating a portion of quadratic aero drag lets 350-504 MPH ceilings
 * actually be reached without sending full launch power into a corner. */
function smoothRange(value: number, a: number, b: number): number {
  const t=Math.max(0,Math.min(1,(value-a)/(b-a)));
  return t*t*(3-2*t);
}

export function straightOnlyDragAssist(
  speedMs:number, throttle:number, steering:number, lateralSpeedMs:number,
  yawRate:number, grip:number
):number {
  if(![speedMs,throttle,steering,lateralSpeedMs,yawRate,grip].every(Number.isFinite))return 0;
  if(throttle<=0||grip<=.85||Math.abs(steering)>.025||
    Math.abs(lateralSpeedMs)>.8||Math.abs(yawRate)>.12)return 0;
  return dragForce(Math.abs(speedMs))*1.15*
    smoothRange(Math.abs(speedMs),78,115)*Math.min(1,Math.max(0,throttle))*grip;
}

/** Cut engine torque progressively when a player attempts a fast turn.
 * Avoid forced braking; turbo traction code already drops boost instantly.
 * Crucially restores control of the 504 MPH-class electric car during
 * continuous steering without compromising its acceleration on a straight. */
export function highSpeedCornerDriveFactor(speedMs:number,steering:number):number {
  if(!Number.isFinite(speedMs)||!Number.isFinite(steering))return 0;
  const turn=Math.min(1,Math.abs(steering));
  const reserve=smoothRange(turn,.05,.20);
  const safeTurnSpeed=82-22*turn;
  return 1-reserve*smoothRange(Math.abs(speedMs),safeTurnSpeed-20,safeTurnSpeed+2);
}

/** S / brake becomes reverse only after the car has nearly stopped.
 * Limit reverse to 14 m/s (31 mph) while keeping enough torque to get
 * out of the Suzaka/Monzón garages without a slow crawl. */
export function reverseDriveForce(forwardMs: number, brake: number): number {
  if (!Number.isFinite(forwardMs) || !Number.isFinite(brake) ||
      brake <= .05 || forwardMs >= .6) return 0;
  return Math.min(1,Math.max(0,brake)) * 9200 *
    Math.min(1,Math.max(0,(14 + forwardMs) / 4));
}
