import {describe,expect,it} from "vitest";
import * as THREE from "three";
import designs from "./vehicle-designs.json";
import { Vehicle } from "./vehicle";

/** Exercises the real Vehicle.afterPhysicsStep governor without loading GLBs.
 * All seven cars are clamped in m/s and shown in EXACT matching MPH. */
describe("Speed governor: 350/450/504 MPH per model",()=>{
  it.each(designs.map(d=>[d.id,d.tuning.topSpeed] as const))
    ("enforces physical velocity for %s", (id, top)=>{
      const design=designs.find(d=>d.id===id)!;
      let velocity={x:top*1.2,y:0,z:0};
      const quat=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
      const body={
        linvel:()=>velocity,
        rotation:()=>quat,
        setLinvel:(v:typeof velocity)=>{velocity=v;}
      };
      const car=Object.create(Vehicle.prototype) as Vehicle;
      Object.assign(car,{tuning:design.tuning,forceForward:new THREE.Vector3(),body,speed:0});
      expect(car.speedLimitMph).toBeCloseTo(top/.44704,6);
      car.afterPhysicsStep();
      expect(velocity.x).toBeCloseTo(top,5);
      expect(car.speed/.44704).toBeCloseTo(car.speedLimitMph,5);
    });
});
