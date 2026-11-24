import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {loadSelectedVehicle} from "./selectedAsset";
import {Vehicle} from "./vehicle";
import {Track} from "../world/track";
import {OFFROAD_CIRCUIT,offroadSectorAt} from "../world/offroadPrototype";

/** Real loaded pickup bodies on the actual graded route, without WebGL.
 * Controlled sector starts isolate traction from GPU stalls. No teleport during a trial. */
export async function probeOffroadPhysics(){
 await RAPIER.init();
 const ids=["chevrolet-silverado-ev-alternative","ram-3500-alternative","ford-f150-raptor-police"];
 const track=new Track(OFFROAD_CIRCUIT);track.build();
 const reports=[];
 for(const id of ids){
  await loadSelectedVehicle(id);
  for(const fraction of [.025,.22,.40,.68]){
   const world=new RAPIER.World({x:0,y:-13.5,z:0});world.timestep=1/60;
   track.addPhysics(world);
   const scene=new THREE.Scene();scene.userData.offroadVehicleFinish=true;
   const car=new Vehicle(world,scene,{vehicleId:id,paintColor:0,accentColor:0,number:7});
   const i=(track.startIndex+Math.round(fraction*track.samples.length))%track.samples.length;
   const start=track.sampleAt(i),t=track.tangentAt(i);
   car.place(start,Math.atan2(t.x,t.z));
   let hint=i,contactSamples=0,peakKph=0,invalid=false,travel=0,forward=0,maxLateral=0;
   try{
    for(let k=0;k<480;k++){
     const p=car.body.translation();
     const point=new THREE.Vector3(p.x,p.y,p.z),loc=track.locate(point,hint);hint=loc.index;
     const grip=track.gripAt(hint,loc.lateral);
     const sector=offroadSectorAt(track.progress(hint));
     const grips=track.gripAtFootprints(car.wheelContactPoints(),hint,car.wheelGripBuffer());
     // Closed-loop steering along the road, no forced position or velocity.
     const next=track.sampleAt(hint+Math.round(14/track.segmentLength));
     const q=car.body.rotation(),dir=new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
     const error=Math.atan2(next.x-p.x,next.z-p.z)-Math.atan2(dir.x,dir.z);
     const steer=THREE.MathUtils.clamp(Math.atan2(Math.sin(error),Math.cos(error))*1.5,-.6,.6);
     car.update(1/60,{throttle:k<90?0:.8,brake:0,steer:k<90?0:steer,handbrake:k<90},grip,grips,sector);
     world.step();car.afterPhysicsStep(1/60);car.syncVisual(1/60);
     const v=car.body.translation();
     if(![v.x,v.y,v.z,car.speedKph].every(Number.isFinite)){invalid=true;break;}
     if(k>=90){travel+=Math.hypot(v.x-p.x,v.z-p.z);forward=(v.x-start.x)*t.x+(v.z-start.z)*t.z;peakKph=Math.max(peakKph,car.speedKph);maxLateral=Math.max(maxLateral,Math.abs(loc.lateral));if(car.wheelDebug().filter(w=>w.contact).length>=2)contactSamples++;}
    }
    reports.push({id,fraction,surface:offroadSectorAt(fraction).surface,invalid,travel,forward,peakKph,contactSamples,maxLateral});
   }finally{car.dispose(world);world.free();}
  }
 }
 return reports;
}
