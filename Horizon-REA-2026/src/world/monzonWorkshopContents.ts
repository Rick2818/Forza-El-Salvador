import * as THREE from "three";
import { createHumanPeople } from "./humanPeople";
import { GARAGE_SCALE } from "./monzonPitAccess";

/** Physical proxies for the EXISTING Blender workshop kit.  Blender authored
 * the equipment in metre units (X across a bay, Z along its depth after glTF
 * Y-up conversion).  Keep the collision bounding boxes aligned with the
 * scaled equipment placed from z=30.4 in MonzonGarages.update(). */
export interface WorkshopObstacle {
  key: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  y: number;
  height: number;
}

export const GARAGE_EQUIPMENT_ANCHOR_Z = 30.4;
export const WORKSHOP_OBSTACLES: readonly WorkshopObstacle[] = [
  { key: "workbench", x: 4.8, z: 5.4, width: 2.95, depth: 1.10, y: .62, height: 1.22 },
  { key: "drawers", x: 4.8, z: 2.6, width: 1.55, depth: .8, y: .58, height: 1.16 },
  { key: "cabinet", x: 5.7, z: 7.2, width: 1.32, depth: .76, y: 1.15, height: 2.30 },
  { key: "shelves-and-parts-bins", x: -4.55, z: 7.58, width: 2.80, depth: 1.02, y: 1.26, height: 2.55 },
  { key: "tire-rack", x: -4.7, z: 4.46, width: 2.72, depth: 1.18, y: 1.12, height: 2.24 },
  { key: "tire-stacks", x: -4.9, z: 1.5, width: 1.70, depth: 1.12, y: .38, height: .74 },
  { key: "compressor", x: -4.9, z: 6.4, width: 1.90, depth: .85, y: .55, height: 1.10 },
  { key: "floor-jack", x: 3.2, z: 1.9, width: .70, depth: 1.72, y: .43, height: .86 },
  { key: "engine-on-stand", x: -1.65, z: 2.4, width: 1.50, depth: 1.45, y: .83, height: 1.66 },
  { key: "gearbox-and-parts-table", x: 1.35, z: 6.8, width: 2.52, depth: 1.13, y: .67, height: 1.34 }
];

export function obstacleWorldBox(bayX: number, obstacle: WorkshopObstacle): {
  x: number; y: number; z: number; width: number; height: number; depth: number
} {
  return {
    x: bayX + obstacle.x * GARAGE_SCALE,
    y: .12 + obstacle.y,
    z: GARAGE_EQUIPMENT_ANCHOR_Z + obstacle.z * GARAGE_SCALE,
    width: obstacle.width * GARAGE_SCALE,
    height: obstacle.height,
    depth: obstacle.depth * GARAGE_SCALE
  };
}

export function mechanicStations(bayX: number): readonly {x:number; z:number; yaw:number}[] {
  return [
    {x: bayX - 3.70, z: 35.65, yaw: Math.PI * .16},
    {x: bayX + 3.60, z: 35.35, yaw: -Math.PI * .18}
  ];
}

/** Anatomical clothed mechanics, retaining the approved physical station positions. */
export function createPitMechanics(bays: readonly {x:number; color:number}[]): THREE.Group {
  const skin=[0xf2cda4,0xc99770,0x9a6349,0xe2b596];
  const people=bays.flatMap((bay,i)=>mechanicStations(bay.x).map((p,j)=>({
    ...p,yaw:p.yaw+Math.PI,y:.12,shirt:bay.color,skin:skin[(i+j)%skin.length],worker:true
  })));
  const group=createHumanPeople(people,"monzon-fourteen-pit-mechanics");
  group.userData.mechanics=people.length;group.userData.mechanicsPerGarage=2;
  return group;
}
