import {beforeAll,describe,it,expect} from "vitest";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {Track} from "./track";
import {getCircuit} from "./circuits";
import {suzakaGarageAnchor} from "./suzakaGarageZone";
import {installSuzakaRoadsideProtection} from "./suzakaRoadsideSafety";

beforeAll(async()=>{await RAPIER.init()});

function circuit():Track {
 const track=new Track(getCircuit("suzaka")!);
 track.buildVisuals=()=>{};
 track.build();return track;
}
function simulateCrossing(delta:number):{offset:number;barrier:number}{
 const track=circuit();
 const world=new RAPIER.World({x:0,y:0,z:0});
 world.timestep=1/60;
 expect(installSuzakaRoadsideProtection(world,track)).toBeGreaterThan(600);
 const index=suzakaGarageAnchor(track)+delta;
 const point=track.sampleAt(index),right=track.rightAt(index);
 const initial=track.halfWidth-1;
 const car=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
   .setTranslation(point.x+right.x*initial,point.y+1,
     point.z+right.z*initial).setCcdEnabled(true).setLinearDamping(0).lockRotations());
 world.createCollider(RAPIER.ColliderDesc.cuboid(.8,.46,1.1),car);
 car.setLinvel({x:right.x*16,y:0,z:right.z*16},true);
 for(let k=0;k<80;k++)world.step();
 const p=car.translation();
 const offset=(p.x-point.x)*right.x+(p.z-point.z)*right.z;
 world.free();
 return {offset,barrier:track.barrierLateralOffset};
}
describe("Suzaka: física real de portales de entrada/salida de pits",()=>{
 it.each([-25,25] as const)("auto atraviesa abertura %i hacia el paddock", delta=>{
  const result=simulateCrossing(delta);
  expect(result.offset).toBeGreaterThan(result.barrier+6);
 });
 it("un coche NO atraviesa el muro sólido entre las dos aberturas",()=>{
  const result=simulateCrossing(0);
  expect(result.offset).toBeLessThan(result.barrier+1);
 });
});
