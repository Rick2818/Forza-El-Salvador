import RAPIER from "@dimforge/rapier3d-compat";
import type { Track } from "./track";
import { suzakaPitBarrierGap } from "./suzakaPitAccess";

/** Suzaka's old rail was 7.5m outside the kerb and had ZERO collider
 * thickness. These overlapping solid volumes sit directly after the kerb
 * and are tested against high-speed CCD impacts on every part of the lap. */
export const SUZAKA_OUTER_BARRIER_THICKNESS = 1.10;
export const SUZAKA_OUTER_BARRIER_HEIGHT = 2.25;
export const SUZAKA_BARRIER_STEP_SAMPLES = 4;

export interface SuzakaBarrierSegment {
  side: -1 | 1;
  x: number;
  y: number;
  z: number;
  yaw: number;
  length: number;
  thickness: number;
  height: number;
}

export function planSuzakaRoadsideProtection(
  track: Pick<Track,"samples"|"rightAt"|"barrierLateralOffset"|"segmentLength">
): SuzakaBarrierSegment[] {
  const N=track.samples.length;
  if (!N) return [];
  const walls:SuzakaBarrierSegment[]=[];
  for(let i=0;i<N;i+=SUZAKA_BARRIER_STEP_SAMPLES) {
    const next=(i+SUZAKA_BARRIER_STEP_SAMPLES)%N;
    const a=track.samples[i],b=track.samples[next];
    const ar=track.rightAt(i),br=track.rightAt(next);
    for(const side of [-1,1] as const) {
      if(suzakaPitBarrierGap((i+SUZAKA_BARRIER_STEP_SAMPLES/2)*track.segmentLength,side))continue;
      const ax=a.x+ar.x*side*track.barrierLateralOffset;
      const az=a.z+ar.z*side*track.barrierLateralOffset;
      const bx=b.x+br.x*side*track.barrierLateralOffset;
      const bz=b.z+br.z*side*track.barrierLateralOffset;
      const dx=bx-ax,dz=bz-az;
      const length=Math.hypot(dx,dz);
      if(length<.01) continue;
      walls.push({
        side,
        x:(ax+bx)/2,
        y:(a.y+b.y)/2+SUZAKA_OUTER_BARRIER_HEIGHT/2-.18,
        z:(az+bz)/2,
        yaw:Math.atan2(dx,dz),
        length:length+1.75, // overlap adjacent segments even in curves
        thickness:SUZAKA_OUTER_BARRIER_THICKNESS,
        height:SUZAKA_OUTER_BARRIER_HEIGHT
      });
    }
  }
  return walls;
}

/** Only the two full-lap perimeter walls are installed here; the flyover
 * also has taller, closer double protection in suzakaSuspensionBridge.ts. */
export function installSuzakaRoadsideProtection(world:RAPIER.World,track:Track):number {
  if(track.circuit.id!=="suzaka") return 0;
  const segments=planSuzakaRoadsideProtection(track);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for(const wall of segments) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(wall.thickness/2,wall.height/2,wall.length/2)
        .setTranslation(wall.x,wall.y,wall.z)
        .setRotation({x:0,y:Math.sin(wall.yaw/2),z:0,w:Math.cos(wall.yaw/2)})
        .setFriction(.72)
        .setRestitution(.04),
      body
    );
  }
  return segments.length;
}
