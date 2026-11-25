/** Arcade low-speed torque floor only on the off-road route. It remains
 * bounded by tyre grip, actual powered-wheel contact (applied by caller),
 * throttle, and fades out before highway speeds. No teleport or speed cheat. */
export function offroadLaunchForce(existing:number,mass:number,throttle:number,speed:number,grip:number):number{
 if(![existing,mass,throttle,speed,grip].every(Number.isFinite)||mass<=0||throttle<=0||grip<=0||speed>=12)return existing;
 const fade=Math.max(0,1-(Math.max(0,speed)/12)**2);
 const acceleration=Math.min(3.2,9.81*Math.max(0,grip)*.72);
 const target=mass*acceleration*Math.min(1,throttle)*fade;
 return Math.max(existing,target);
}
