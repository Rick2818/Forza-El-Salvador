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
      // Sample the original GLB wheel surfaces in spin-local coordinates.
      // Compare in the hub's frame so chassis movement cannot masquerade as
      // tyre rotation. Select a referenced vertex farthest from the axle.
      const markers=car.visual.wheels.map(w=>{
        const points:{name:string;mesh:THREE.Mesh;vertex:THREE.Vector3}[]=[];
        car.visual.root.updateMatrixWorld(true);
        w.spin.traverse(o=>{
          if(!(o instanceof THREE.Mesh))return;
          const attr=o.geometry.getAttribute("position"),idx=o.geometry.index;
          if(!attr)return;
          let radius=0;const candidate=new THREE.Vector3(),best=new THREE.Vector3();
          for(let i=0;i<(idx?.count??attr.count);i++){
            candidate.fromBufferAttribute(attr,idx?idx.getX(i):i);
            const local=w.spin.worldToLocal(o.localToWorld(candidate.clone()));
            const r=Math.hypot(local.y,local.z);
            if(r>radius){radius=r;best.copy(candidate);}
          }
          if(radius>.05)points.push({name:o.name,mesh:o,vertex:best});
        });
        return points;
      });
      function wheelSamples(){
        car.visual.root.updateMatrixWorld(true);
        return markers.map((parts,i)=>parts.map(p=>car.visual.wheels[i].steer.worldToLocal(p.mesh.localToWorld(p.vertex.clone()))));
      }
      let previous:THREE.Vector3[][]|null=null;
      const travel=markers.map(parts=>parts.map(()=>0));
      const samples=[0,0,0,0];
      let maxRollError=0;
      for(let i=0;i<60*180;i++){
        car.update(1/60,{throttle:i<120?0:1,brake:0,steer:0,handbrake:false},1);
        world.step();car.afterPhysicsStep(1/60);
        const p=car.body.translation();
        if(![p.x,p.y,p.z,car.speed].every(Number.isFinite)){invalid=true;break;}
        peak=Math.max(peak,car.speed/.44704);
        if(i>=120&&i%60===0&&car.wheelDebug().every(w=>w.contact))contactSamples++;
        // Real low-speed segment, not a high-speed spoke aliasing test.
        if(i>=120&&i<720){
          car.syncVisual();
          const now=wheelSamples(),contacts=car.wheelDebug();
          const wheels=car.wheelVisualDebug();
          if(previous&&car.speed>2&&car.speed<15){
            for(let w=0;w<4;w++){
              if(!contacts[w].contact)continue;
              samples[w]++;
              now[w].forEach((p,k)=>{
                travel[w][k]+=p.distanceTo(previous![w][k]);
              });
              if(!Number.isFinite(wheels[w].roll))maxRollError=Infinity;
            }
          }
          previous=now;
        }
      }
      car.syncVisual();
      results.push({id,peakMph:peak,limitMph:car.speedLimitMph,invalid,contactSamples,
        measured:hasMeasuredExternalTyres(id),mounts:wheelConnections(id),radii:wheelRadiiForVehicle(id),
        wheelMeshes:externalAudit(id)?.assignedWheelMeshes??[],
        motion:markers.map((parts,i)=>({samples:samples[i],parts:parts.map((p,k)=>({name:p.name,vertexTravelM:travel[i][k]}))})),maxRollError,
        finalPosition:car.body.translation()});
    }finally{car.dispose(world);world.free();}
  }
  return results;
}
