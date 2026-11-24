import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { loadSelectedVehicle, wheelConnections, wheelRadiiForVehicle } from "./selectedAsset";
import { hasMeasuredExternalTyres, externalAudit } from "./externalDriving";
import { Vehicle } from "./vehicle";

const ids=["ford-f150-raptor-police","ram-3500-alternative","chevrolet-silverado-ev-alternative"];
export async function probePickups(){
  await RAPIER.init();
  const results=[];
  for(const id of ids){
    await loadSelectedVehicle(id);
    const world=new RAPIER.World({x:0,y:-13.5,z:0});
    world.timestep=1/60;
    world.createCollider(RAPIER.ColliderDesc.cuboid(100,.1,30000).setTranslation(0,-.1,0));
    const car=new Vehicle(world,new THREE.Scene(),{vehicleId:id,paintColor:0,accentColor:0,number:7});
    car.place(new THREE.Vector3(0,0,0),0);
    let peak=0,invalid=false,contactSamples=0;
    try{
      for(let i=0;i<60*180;i++){
        car.update(1/60,{throttle:i<120?0:1,brake:0,steer:0,handbrake:false},1);
        world.step();car.afterPhysicsStep(1/60);
        const p=car.body.translation();
        if(![p.x,p.y,p.z,car.speed].every(Number.isFinite)){invalid=true;break;}
        peak=Math.max(peak,car.speed/.44704);
        if(i>=120&&i%60===0&&car.wheelDebug().every(w=>w.contact))contactSamples++;
      }
      car.syncVisual();
      results.push({id,peakMph:peak,limitMph:car.speedLimitMph,invalid,contactSamples,
        measured:hasMeasuredExternalTyres(id),mounts:wheelConnections(id),radii:wheelRadiiForVehicle(id),
        wheelMeshes:externalAudit(id)?.assignedWheelMeshes??[],
        finalPosition:car.body.translation()});
    }finally{car.dispose(world);world.free();}
  }
  return results;
}
