import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {Track} from "./track";
import {getCircuit} from "./circuits";
import {GARAGE_FRONT_Z,GARAGE_REAR_Z,MONZON_PIT_GARAGES} from "./monzonPitAccess";
import {
 suzakaGarageAnchor,suzakaGarageFrame,isSuzakaGaragePortal,
 suzakaGarageWorldToLocal,nearSuzakaGaragePaddock,createSuzakaGaragePitLane,
 suzakaGarageAt
} from "./suzakaGarageZone";
import {planSuzakaRoadsideProtection} from "./suzakaRoadsideSafety";

const build=():Track=>{
 const t=new Track(getCircuit("suzaka")!);
 t.buildVisuals=()=>{};t.build();return t;
};

describe("Suzaka: siete talleres transitables, físicos y ubicados en el trazado real",()=>{
 it("aparcamiento de siete marcas próximo a un tramo bajo y recto",()=>{
  const t=build();
  const index=suzakaGarageAnchor(t),point=t.sampleAt(index);
  expect(point.y).toBeLessThan(.5);
  const frame=suzakaGarageFrame(t);
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw);
  const road=new THREE.Vector3(179.5,0,0).applyQuaternion(rotation).add(frame.position);
  expect(road.distanceTo(point)).toBeLessThan(.1);
  expect(MONZON_PIT_GARAGES).toHaveLength(7);
  for(const garage of MONZON_PIT_GARAGES){
    const center=new THREE.Vector3(garage.x,0,(GARAGE_FRONT_Z+GARAGE_REAR_Z)/2)
      .applyQuaternion(rotation).add(frame.position);
    const local=suzakaGarageWorldToLocal(frame,center.x,center.z);
    expect(local.x).toBeCloseTo(garage.x,2);
    expect(local.z).toBeGreaterThan(GARAGE_FRONT_Z);
    expect(suzakaGarageAt(t,center.x,center.z)).toBe(garage.name);
    expect(nearSuzakaGaragePaddock(frame,center.x,center.z)).toBe(true);
  }
  const lane=createSuzakaGaragePitLane(frame);
  expect(lane.getObjectByName("suzaka-drivable-pit-apron")).toBeDefined();
  expect(lane.userData.serviceGarages).toBe(7);
 });
 it("habilita dos entradas SOLO en muro derecho, conservando la defensa del resto del circuito",()=>{
  const t=build(),i=suzakaGarageAnchor(t),N=t.samples.length;
  expect(isSuzakaGaragePortal(i-25,N,1)).toBe(true);
  expect(isSuzakaGaragePortal(i+25,N,1)).toBe(true);
  expect(isSuzakaGaragePortal(i,N,1)).toBe(false);
  expect(isSuzakaGaragePortal(i-25,N,-1)).toBe(false);
  const pieces=planSuzakaRoadsideProtection(t);
  const fullCount=Math.ceil(N/4)*2;
  expect(pieces.length).toBeGreaterThan(fullCount-30);
  expect(pieces.length).toBeLessThan(fullCount);
  expect(pieces.filter(p=>p.side===-1)).toHaveLength(Math.ceil(N/4));
 });
});
