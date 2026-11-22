import * as THREE from "three";
import type {Track} from "./track";

export const MONZON_CINEMATIC_START_SEC=2.8;
export const MONZON_CINEMATIC_END_SEC=.7;
export const MONZON_BURST_COUNT=28;
export const MONZON_FIREWORK_DURATION=13.6;
export const MONZON_SPARKS_PER_BURST=100;
export const MONZON_SPARK_TRAILS=3;
const COUNT=MONZON_BURST_COUNT*(MONZON_SPARKS_PER_BURST*MONZON_SPARK_TRAILS+1);
const GOLDEN=2.399963229728653;
const PALETTE=[0xffba28,0xff2469,0x46eaff,0x61ff91,0xb881ff,0xffffff,0xffec66,0x23a8ff,0xff8942];

export function monzonCinematicCameraActive(circuit:string,countdown:number,enabled=true):boolean{
  return enabled&&circuit==="monzon"&&countdown<MONZON_CINEMATIC_START_SEC&&countdown>MONZON_CINEMATIC_END_SEC;
}
export function monzonFireworkBurstTime(i:number):number{
  return .34+Math.floor(i/7)*2.45+(i%7)*.29+((i*7)%5)*.045;
}
export function fireworkVisibility(t:number):number{
  return t<=0||t>=3.25?0:Math.min(1,t*5)*Math.pow(1-t/3.25,.95);
}
type Burst={start:number;position:THREE.Vector3;colour:THREE.Color;mode:number};

function glow():THREE.CanvasTexture{
  const c=document.createElement("canvas");c.width=c.height=64;
  const x=c.getContext("2d");
  if(x){
    const g=x.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,"rgba(255,255,255,1)");
    g.addColorStop(.17,"rgba(255,255,255,.92)");
    g.addColorStop(.4,"rgba(255,255,255,.38)");
    g.addColorStop(.75,"rgba(255,255,255,.075)");
    g.addColorStop(1,"rgba(255,255,255,0)");
    x.fillStyle=g;x.fillRect(0,0,64,64);
  }
  return new THREE.CanvasTexture(c);
}
export class MonzonLaunchFireworks{
  readonly group=new THREE.Group();
  readonly cameraOrigin=new THREE.Vector3();
  readonly cameraTarget=new THREE.Vector3();
  private readonly positions=new Float32Array(COUNT*3);
  private readonly colours=new Float32Array(COUNT*3);
  private readonly pointsGeometry=new THREE.BufferGeometry();
  private readonly coresGeometry=new THREE.BufferGeometry();
  private readonly bursts:Burst[]=[];
  private readonly lights:THREE.PointLight[]=[];
  private elapsed=0;private soundCursor=0;private active=false;
  constructor(scene:THREE.Scene,track:Track,private readonly onBurst:()=>void=()=>{}){
    this.group.name="monzon-v14-cinematic-grand-prix-fireworks";
    const p=track.sampleAt(track.startIndex),t=track.tangentAt(track.startIndex),r=track.rightAt(track.startIndex);
    this.group.position.copy(p).addScaledVector(t,85);
    this.cameraOrigin.copy(p).addScaledVector(t,-18).addScaledVector(r,23);this.cameraOrigin.y+=8;
    this.cameraTarget.copy(this.group.position).add(new THREE.Vector3(0,118,0));
    for(let i=0;i<MONZON_BURST_COUNT;i++){
      const wave=Math.floor(i/7),column=i%7;
      const x=(column-3)*28+((wave%2)*12),z=(wave-1.5)*29+(i%2)*15;
      this.bursts.push({start:monzonFireworkBurstTime(i),
        position:new THREE.Vector3(r.x*x+t.x*z,76+(i%6)*17+(wave%2)*12,r.z*x+t.z*z),
        colour:new THREE.Color(PALETTE[i%PALETTE.length]),mode:i%4});
    }
    this.pointsGeometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.pointsGeometry.setAttribute("color",new THREE.BufferAttribute(this.colours,3).setUsage(THREE.DynamicDrawUsage));
    const radial=glow();
    const material=new THREE.PointsMaterial({map:radial,vertexColors:true,size:9.6,sizeAttenuation:true,
      blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.96,toneMapped:false,fog:false});
    const main=new THREE.Points(this.pointsGeometry,material);main.name="v14-peony-willow-trails";
    main.frustumCulled=false;this.group.add(main);
    this.coresGeometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(MONZON_BURST_COUNT*3),3).setUsage(THREE.DynamicDrawUsage));
    this.coresGeometry.setAttribute("color",new THREE.BufferAttribute(new Float32Array(MONZON_BURST_COUNT*3),3).setUsage(THREE.DynamicDrawUsage));
    const core=new THREE.Points(this.coresGeometry,new THREE.PointsMaterial({map:radial,vertexColors:true,
      size:32,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false,
      transparent:true,opacity:.80,toneMapped:false,fog:false}));
    core.name="v14-opening-bloom-cores";core.frustumCulled=false;this.group.add(core);
    for(let i=0;i<3;i++){const light=new THREE.PointLight(PALETTE[i],0,200,2);
      light.castShadow=false;this.lights.push(light);this.group.add(light);}
    this.group.visible=false;scene.add(this.group);
  }
  start():void{this.elapsed=0;this.soundCursor=0;this.active=true;this.group.visible=true;}
  stop():void{this.active=false;this.group.visible=false;for(const light of this.lights)light.intensity=0;}
  get running():boolean{return this.active;}
  update(dt:number):void{
    if(!this.active)return;this.elapsed+=dt;
    if(this.elapsed>=MONZON_FIREWORK_DURATION){this.stop();return;}
    while(this.soundCursor<this.bursts.length && this.elapsed>=this.bursts[this.soundCursor].start){
      if(this.soundCursor%2===0)this.onBurst();this.soundCursor++;
    }
    let cursor=0;
    const cores=this.coresGeometry.getAttribute("position") as THREE.BufferAttribute;
    const coreRgb=this.coresGeometry.getAttribute("color") as THREE.BufferAttribute;
    for(let i=0;i<this.bursts.length;i++){
      const b=this.bursts[i],age=this.elapsed-b.start;
      const bright=fireworkVisibility(age);
      for(let s=0;s<MONZON_SPARKS_PER_BURST;s++){
        const ratio=(s+.5)/MONZON_SPARKS_PER_BURST;
        const polar=Math.acos(1-2*ratio),theta=s*GOLDEN+i*.27;
        let dx=Math.sin(polar)*Math.cos(theta),dy=Math.cos(polar),dz=Math.sin(polar)*Math.sin(theta);
        const willow=b.mode===1||b.mode===3;
        if(willow)dy=Math.abs(dy)*.9+.1;
        if(b.mode===2){dy*=.45;dx*=1.24;dz*=1.24;}
        const speed=(willow?26:35)+(s%9)*1.5;
        for(let layer=0;layer<MONZON_SPARK_TRAILS;layer++){
          const n=cursor++*3,t=age-layer*.10,fade=fireworkVisibility(t);
          if(fade<=0){this.positions[n]=0;this.positions[n+1]=-500;this.positions[n+2]=0;
            this.colours[n]=this.colours[n+1]=this.colours[n+2]=0;continue;}
          const distance=speed*t,fall=(willow?14:8)*t*t;
          const strength=fade*(1-layer*.27)*(.8+.2*Math.sin(this.elapsed*33+s*.17));
          this.positions[n]=b.position.x+dx*distance;
          this.positions[n+1]=b.position.y+dy*distance-fall;
          this.positions[n+2]=b.position.z+dz*distance;
          this.colours[n]=b.colour.r*strength;
          this.colours[n+1]=b.colour.g*strength;
          this.colours[n+2]=b.colour.b*strength;
        }
      }
      const n=cursor++*3,rise=age+.82;
      if(rise>=0&&rise<.82){const q=rise/.82;
        this.positions[n]=b.position.x;this.positions[n+1]=7+b.position.y*q*q;this.positions[n+2]=b.position.z;
        this.colours[n]=1;this.colours[n+1]=.79;this.colours[n+2]=.38;
      } else {this.positions[n]=0;this.positions[n+1]=-500;this.positions[n+2]=0;
        this.colours[n]=this.colours[n+1]=this.colours[n+2]=0;}
      cores.setXYZ(i,b.position.x,b.position.y,b.position.z);
      coreRgb.setXYZ(i,b.colour.r*bright,b.colour.g*bright,b.colour.b*bright);
    }
    this.pointsGeometry.attributes.position.needsUpdate=true;
    this.pointsGeometry.attributes.color.needsUpdate=true;
    cores.needsUpdate=true;coreRgb.needsUpdate=true;
    for(let i=0;i<this.lights.length;i++){
      const burst=this.bursts[Math.max(0,this.soundCursor-1-i)],age=this.elapsed-burst.start;
      const light=this.lights[i];light.position.copy(burst.position);light.color.copy(burst.colour);
      light.intensity=age>=0&&age<.6?2200*Math.exp(-age*5):0;
    }
  }
  cinematicCamera(camera:THREE.PerspectiveCamera):void{
    camera.position.copy(this.cameraOrigin);camera.lookAt(this.cameraTarget);
    camera.fov=68;camera.updateProjectionMatrix();
  }
}
