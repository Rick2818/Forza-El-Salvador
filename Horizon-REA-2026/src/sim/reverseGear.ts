/** Pressing BRAKE while moving forward still brakes. Once stopped, holding
 * BRAKE selects an actual reverse gear; it must keep pulling as the car
 * gains negative speed. Maximum reverse is 28 MPH for safe garage manoeuvres. */
export const REVERSE_LIMIT_MS=12.5;
export function reverseDriveForce(brake:number,signedSpeedMs:number,maxEngineForce:number):number {
  if(![brake,signedSpeedMs,maxEngineForce].every(Number.isFinite) ||
     brake<=.05 || signedSpeedMs>.58 || signedSpeedMs<=-REVERSE_LIMIT_MS)return 0;
  const fade=Math.min(1,Math.max(0,(REVERSE_LIMIT_MS+signedSpeedMs)/2.5));
  return Math.max(0,Math.min(1,brake))*maxEngineForce*1.35*fade;
}
