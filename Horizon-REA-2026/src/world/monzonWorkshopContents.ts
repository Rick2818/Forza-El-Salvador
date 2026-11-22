import * as THREE from "three";
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

/** 14 recognisable 3D pit mechanics: safety helmets, faces, workwear, pants,
 * arms, gloves and boots. Instancing keeps this to a fixed low draw-call cost. */
export function createPitMechanics(bays: readonly {x:number; color:number}[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "monzon-fourteen-pit-mechanics";
  type Component = "torso" | "head" | "cap" | "left-leg" | "right-leg" |
    "left-arm" | "right-arm" | "left-glove" | "right-glove" |
    "left-boot" | "right-boot" | "safety-vest";

  const geometries: Record<Component,THREE.BufferGeometry> = {
    torso: new THREE.CylinderGeometry(.30, .26, .78, 10),
    head: new THREE.SphereGeometry(.215, 10, 8),
    cap: new THREE.CylinderGeometry(.235, .28, .18, 12),
    "left-leg": new THREE.CylinderGeometry(.12, .135, .75, 8),
    "right-leg": new THREE.CylinderGeometry(.12, .135, .75, 8),
    "left-arm": new THREE.CylinderGeometry(.105, .11, .73, 8),
    "right-arm": new THREE.CylinderGeometry(.105, .11, .73, 8),
    "left-glove": new THREE.SphereGeometry(.12, 8, 6),
    "right-glove": new THREE.SphereGeometry(.12, 8, 6),
    "left-boot": new THREE.BoxGeometry(.27,.19,.42),
    "right-boot": new THREE.BoxGeometry(.27,.19,.42),
    "safety-vest": new THREE.BoxGeometry(.34,.20,.04)
  };
  const materials: Record<Component,THREE.MeshStandardMaterial> = {
    torso: new THREE.MeshStandardMaterial({color:0xffffff,roughness:.81}),
    head: new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95}),
    cap: new THREE.MeshStandardMaterial({color:0xe1e7ed,roughness:.57}),
    "left-leg": new THREE.MeshStandardMaterial({color:0x25313b,roughness:.91}),
    "right-leg": new THREE.MeshStandardMaterial({color:0x25313b,roughness:.91}),
    "left-arm": new THREE.MeshStandardMaterial({color:0xffffff,roughness:.81}),
    "right-arm": new THREE.MeshStandardMaterial({color:0xffffff,roughness:.81}),
    "left-glove": new THREE.MeshStandardMaterial({color:0x252a2c,roughness:.75}),
    "right-glove": new THREE.MeshStandardMaterial({color:0x252a2c,roughness:.75}),
    "left-boot": new THREE.MeshStandardMaterial({color:0x171a1d,roughness:.98}),
    "right-boot": new THREE.MeshStandardMaterial({color:0x171a1d,roughness:.98}),
    "safety-vest": new THREE.MeshStandardMaterial({color:0xffd86b,roughness:.64})
  };
  const people = bays.flatMap(bay => mechanicStations(bay.x).map(station => ({...station, color:bay.color})));
  const meshes = {} as Record<Component, THREE.InstancedMesh>;
  for (const name of Object.keys(geometries) as Component[]) {
    const mesh = new THREE.InstancedMesh(geometries[name], materials[name], people.length);
    mesh.name = "pit-mechanic-" + name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    meshes[name] = mesh;
    group.add(mesh);
  }
  const transform = new THREE.Matrix4();
  const rotated = new THREE.Quaternion();
  const rotatePart = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1,1,1);
  const axis = new THREE.Vector3(0,1,0);
  const skin = [0xf2cda4,0xc99770,0x9a6349,0xe2b596];
  people.forEach((worker,index) => {
    rotated.setFromAxisAngle(axis,worker.yaw);
    const parts: Record<Component,[number,number,number]> = {
      torso:[0,1.21,0],
      head:[0,1.79,0],
      cap:[0,2.00,0],
      "left-leg":[-.155,.52,0],
      "right-leg":[.155,.52,0],
      "left-arm":[-.36,1.17,-.03],
      "right-arm":[.36,1.17,-.03],
      "left-glove":[-.39,.78,-.1],
      "right-glove":[.39,.78,-.1],
      "left-boot":[-.16,.11,.09],
      "right-boot":[.16,.11,.09],
      "safety-vest":[0,1.34,-.29]
    };
    for (const name of Object.keys(parts) as Component[]) {
      const [x,y,z] = parts[name];
      pos.set(x,y,z).applyQuaternion(rotated).add(new THREE.Vector3(worker.x,.12,worker.z));
      rotatePart.copy(rotated);
      if(name==="left-arm" || name==="right-arm") {
        rotatePart.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),name==="left-arm"?-.17:.17));
      }
      transform.compose(pos,rotatePart,scale);
      meshes[name].setMatrixAt(index,transform);
      if(name==="torso" || name==="left-arm" || name==="right-arm")
        meshes[name].setColorAt(index,new THREE.Color(worker.color));
      if(name==="head") meshes[name].setColorAt(index,new THREE.Color(skin[index%skin.length]));
    }
  });
  Object.values(meshes).forEach(mesh=>{
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
  });
  group.userData.mechanics = people.length;
  group.userData.mechanicsPerGarage = 2;
  return group;
}
