import * as THREE from "three";
import type { Vehicle } from "../vehicle/vehicle";
import type { Track } from "../world/track";
import { offroadSectorAt } from "../world/offroadPrototype";

/** Bounded GPU point pool. No per-frame geometry allocation or new draw calls per droplet. */
export class MudSpray {
  private readonly capacity=1200;
  private readonly positions=new Float32Array(this.capacity*3);
  private readonly velocities=new Float32Array(this.capacity*3);
  private readonly life=new Float32Array(this.capacity);
  private readonly color=new Float32Array(this.capacity*3);
  private readonly geometry=new THREE.BufferGeometry();
  private readonly points:THREE.Points;
  private cursor=0;
  private emission=0;
  constructor(scene:THREE.Scene){
    this.positions.fill(-10000);
    this.geometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color",new THREE.BufferAttribute(this.color,3).setUsage(THREE.DynamicDrawUsage));
    const material=new THREE.PointsMaterial({size:.18,vertexColors:true,sizeAttenuation:true,transparent:true,opacity:.87,depthWrite:false});
    this.points=new THREE.Points(this.geometry,material);
    this.points.frustumCulled=false;
    scene.add(this.points);
  }
  update(dt:number,vehicle:Vehicle,track:Track,hint:number){
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.08);
    const contact=vehicle.wheelContactPoints();
    const where=track.locate(vehicle.position,hint);
    const sector=offroadSectorAt(track.progress(where.index));
    const speed=Math.abs(vehicle.speed);
    const emit=sector.surface!=="dirt" && speed>.5 && Math.abs(where.lateral)<track.halfWidth;
    this.emission+=emit?Math.min(210,speed*(sector.surface==="puddle"?22:14))*dt:0;
    const count=Math.floor(this.emission);this.emission-=count;
    for(let j=0;j<count;j++){
      const wheel=j%4;
      if(!vehicle.controller.wheelIsInContact(wheel))continue;
      const p=contact[wheel],i=this.cursor++%this.capacity,k=i*3;
      const tangent=track.tangentAt(where.index),right=track.rightAt(where.index);
      const side=wheel%2===0?1:-1;
      this.positions[k]=p.x;this.positions[k+1]=p.y+.08;this.positions[k+2]=p.z;
      const spread=side*(1+Math.random()*3);
      const rear=-Math.sign(vehicle.speed)*(1+Math.random()*speed*.4);
      this.velocities[k]=right.x*spread+tangent.x*rear;
      this.velocities[k+1]=1.5+Math.random()*4.0;
      this.velocities[k+2]=right.z*spread+tangent.z*rear;
      this.life[i]=.30+Math.random()*.8;
      const shade=.45+Math.random()*.55;
      this.color[k]=.23*shade;this.color[k+1]=.115*shade;this.color[k+2]=.045*shade;
    }
    for(let i=0;i<this.capacity;i++){
      if(this.life[i]<=0)continue;
      const k=i*3;
      this.life[i]-=dt;
      if(this.life[i]<=0){this.positions[k]=-10000;this.positions[k+1]=-10000;this.positions[k+2]=-10000;continue;}
      this.velocities[k+1]-=9.81*dt;
      for(let j=0;j<3;j++)this.positions[k+j]+=this.velocities[k+j]*dt;
    }
    this.geometry.attributes.position.needsUpdate=true;
    this.geometry.attributes.color.needsUpdate=true;
  }
  dispose(){
    this.points.removeFromParent();this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
