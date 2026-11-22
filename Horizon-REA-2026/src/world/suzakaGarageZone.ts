import * as THREE from "three";
import type { Track } from "./track";
import { GARAGE_WIDTH, GARAGE_FRONT_Z, GARAGE_REAR_Z, MONZON_PIT_GARAGES } from "./monzonPitAccess";

/** The approved Suzaka figure-eight has a long, low, nearly straight
 * northwestern section at sample 1333/1500. Garages sit outside its right
 * margin, far from the elevated crossover and existing grandstands. */
export const SUZAKA_GARAGE_INDEX_FRACTION = 1333 / 1500;
export const SUZAKA_GARAGE_LOCAL_CENTER_X = (MONZON_PIT_GARAGES[0].x +
  MONZON_PIT_GARAGES[MONZON_PIT_GARAGES.length - 1].x) / 2;
export const SUZAKA_PIT_ENTRY_RANGE = [-29, -21] as const;
export const SUZAKA_PIT_EXIT_RANGE = [21, 29] as const;

export function suzakaGarageAnchor(track: Pick<Track,"samples"|"sampleAt"|"tangentAt">): number {
  return Math.round(track.samples.length * SUZAKA_GARAGE_INDEX_FRACTION) % track.samples.length;
}

export function isSuzakaGaragePortal(index: number, count: number, side: number): boolean {
  if (side <= 0 || count < 100) return false;
  const anchor = Math.round(count * SUZAKA_GARAGE_INDEX_FRACTION) % count;
  const delta = ((index - anchor + count + Math.floor(count / 2)) % count) - Math.floor(count / 2);
  return (delta >= SUZAKA_PIT_ENTRY_RANGE[0] && delta <= SUZAKA_PIT_ENTRY_RANGE[1]) ||
    (delta >= SUZAKA_PIT_EXIT_RANGE[0] && delta <= SUZAKA_PIT_EXIT_RANGE[1]);
}

export interface GarageWorldFrame {
  position: THREE.Vector3;
  yaw: number;
}

export function suzakaGarageFrame(track: Pick<Track,"samples"|"sampleAt"|"tangentAt">): GarageWorldFrame {
  const index = suzakaGarageAnchor(track);
  const road = track.sampleAt(index), tangent = track.tangentAt(index);
  // Local +X follows the direction of racing; local +Z is its right side.
  const yaw = Math.atan2(-tangent.z, tangent.x);
  const origin = new THREE.Vector3(SUZAKA_GARAGE_LOCAL_CENTER_X,0,0)
    .applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
  return {
    position: new THREE.Vector3(road.x-origin.x,road.y,road.z-origin.z),
    yaw
  };
}

export function suzakaGarageWorldToLocal(frame: GarageWorldFrame, x:number,z:number): {x:number;z:number} {
  const dx=x-frame.position.x,dz=z-frame.position.z;
  return {
    x:Math.cos(frame.yaw)*dx-Math.sin(frame.yaw)*dz,
    z:Math.sin(frame.yaw)*dx+Math.cos(frame.yaw)*dz
  };
}

export function nearSuzakaGaragePaddock(frame: GarageWorldFrame,x:number,z:number):boolean {
  const local=suzakaGarageWorldToLocal(frame,x,z);
  return local.x>77&&local.x<285&&local.z>7&&local.z<GARAGE_REAR_Z+13;
}

export function suzakaGarageAt(track:Pick<Track,"samples"|"sampleAt"|"tangentAt">,x:number,z:number):string|null {
  const p=suzakaGarageWorldToLocal(suzakaGarageFrame(track),x,z);
  if(p.z<GARAGE_FRONT_Z+.65||p.z>GARAGE_REAR_Z-.9)return null;
  for(const bay of MONZON_PIT_GARAGES)
    if(Math.abs(p.x-bay.x)<GARAGE_WIDTH*.40)return bay.name;
  return null;
}

/** Driving lane in front of seven garages, joined to Suzaka asphalt at
 * physical gaps in the right-side barrier. Flat asphalt also covers the
 * garage forecourt, so tyre raycasts have a real ground floor beneath it. */
export function createSuzakaGaragePitLane(frame:GarageWorldFrame):THREE.Group {
  const root=new THREE.Group();root.name="suzaka-open-garage-pit-lane";
  root.position.copy(frame.position);root.rotation.y=frame.yaw;
  const asphalt=new THREE.MeshStandardMaterial({color:0x171a1d,roughness:.96});
  const markings=new THREE.MeshBasicMaterial({color:0xf0e6b4,toneMapped:false});
  const road=new THREE.Mesh(new THREE.BoxGeometry(204,.085,25),asphalt);
  road.name="suzaka-drivable-pit-apron";
  road.position.set(SUZAKA_GARAGE_LOCAL_CENTER_X,.055,18.3);
  root.add(road);
  for(const localX of [90,104,165,245,266]){
    const line=new THREE.Mesh(new THREE.BoxGeometry(6,.01,.18),markings);
    line.position.set(localX,.103,11.2);
    root.add(line);
  }
  root.userData.serviceGarages=7;
  root.userData.raceTrackConnected=true;
  return root;
}
