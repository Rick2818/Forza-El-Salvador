// Horizon El Salvador - original vehicle math kernel (target artifact for REA static analysis)
// Authored for this project. No third-party code.

const GEAR_RATIOS = [3.42, 2.21, 1.56, 1.19, 0.97, 0.81];
const FINAL_DRIVE = 3.55;
const WHEEL_RADIUS = 0.345;
const ENGINE_PEAK_TORQUE = 520;
const ENGINE_IDLE_RPM = 950;
const ENGINE_REDLINE_RPM = 7600;
const ENGINE_PEAK_RPM = 3100;

export function engineTorqueAt(rpm) {
  const clamped = Math.min(Math.max(rpm, ENGINE_IDLE_RPM), ENGINE_REDLINE_RPM);
  const x = (clamped - ENGINE_PEAK_RPM) / (ENGINE_REDLINE_RPM - ENGINE_IDLE_RPM);
  const shape = 1.0 - 0.62 * x * x;
  return Math.max(ENGINE_PEAK_TORQUE * shape, ENGINE_PEAK_TORQUE * 0.32);
}

export function gearForSpeed(speedMs) {
  const wheelRpm = (Math.abs(speedMs) / (2 * Math.PI * WHEEL_RADIUS)) * 60;
  for (let i = 0; i < GEAR_RATIOS.length; i++) {
    const rpm = wheelRpm * GEAR_RATIOS[i] * FINAL_DRIVE;
    if (rpm < ENGINE_REDLINE_RPM * 0.94) return i;
  }
  return GEAR_RATIOS.length - 1;
}

export function wheelForce(speedMs, throttle, gear, rpm) {
  const ratio = GEAR_RATIOS[gear] * FINAL_DRIVE;
  const torque = engineTorqueAt(rpm) * throttle;
  return (torque * ratio) / WHEEL_RADIUS;
}

// Simplified combined-slip tire curve (Pacejka-shaped, normalised).
export function tireForce(slip, peakSlip, peakMu, load) {
  const s = Math.abs(slip);
  if (s < 0.01) return 0;
  const normalised = s / peakSlip;
  const curve = Math.sin(1.55 * Math.atan(normalised * 1.9));
  return Math.sign(slip) * curve * peakMu * load;
}

export function steeringAngleAt(speedMs, steerInput, maxAngle = 0.52) {
  const speedFactor = 1 / (1 + Math.abs(speedMs) * 0.055);
  const angle = steerInput * maxAngle * speedFactor;
  return Math.max(Math.min(angle, maxAngle), -maxAngle);
}

export function dragForce(speedMs, area = 1.92, cd = 0.31) {
  const rho = 1.225;
  return 0.5 * rho * cd * area * speedMs * speedMs;
}

export function buildTelemetry(state) {
  return {
    speedKph: Math.round(state.speed * 3.6),
    gear: state.gear + 1,
    rpm: Math.round(state.rpm),
    slipFront: Number(state.slipFront.toFixed(3)),
    slipRear: Number(state.slipRear.toFixed(3))
  };
}
