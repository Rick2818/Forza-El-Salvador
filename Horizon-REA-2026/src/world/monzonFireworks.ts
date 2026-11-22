import * as THREE from "three";
import type { Track } from "./track";

/** Cinematic view only during the safe red/yellow countdown interval. */
export const MONZON_CINEMATIC_START_SEC = 2.8;
export const MONZON_CINEMATIC_END_SEC = 0.7;
export const MONZON_FIREWORK_DURATION = 10.4;
export const MONZON_BURST_COUNT = 16;
export function monzonCinematicCameraActive(circuit:string, countdown:number, enabled=true):boolean {
  return enabled && circuit==="monzon" && countdown < MONZON_CINEMATIC_START_SEC &&
    countdown > MONZON_CINEMATIC_END_SEC;
}
export function monzonFireworkBurstTime(index:number):number {
  return .44+index*.40+(index%3)*.09;
}
type Burst = {start:number, pos:THREE.Vector3, hue:THREE.Color};
/** One points draw call, three shadowless light accents, no physics interference. */
export class MonzonLaunchFireworks {
  readonly group = new THREE.Group();
  private readonly particleCount = MONZON_BURST_COUNT*72;
  private readonly rocketCount = MONZON_BURST_COUNT;
  private readonly positions=new Float32Array((this.particleCount+this.rocketCount)*3);
  private readonly colors=new Float32Array((this.particleCount+this.rocketCount)*3);
  private readonly geometry=new THREE.BufferGeometry();
  private readonly bursts:Burst[]=[];
  private readonly lightAccents:THREE.PointLight[]=[];
  private elapsed=0;
  private nextAudioBurst=0;
  private active=false;
  readonly cameraOrigin=new THREE.Vector3();
  readonly cameraTarget=new THREE.Vector3();
  constructor(scene:THREE.Scene,track:Track,private readonly onBurst:()=>void=()=>{}) {
    this.group.name="monzon-cinematic-opening-fireworks";
    const start=track.sampleAt(track.startIndex);
    const forward=track.tangentAt(track.startIndex);
    const right=track.rightAt(track.startIndex);
    // The fireworks spread over the sky above the start straight.
    this.group.position.copy(start).addScaledVector(forward,70);
    this.cameraOrigin.copy(start).addScaledVector(forward,-26).addScaledVector(right,20);
    this.cameraOrigin.y+=8;
    this.cameraTarget.copy(this.group.position).add(new THREE.Vector3(0,94,0));
    const palette=[0xff4563,0xffdd51,0x64f8ff,0x65ffaa,0xac78ff,0xffac59,0xffffff];
    for(let i=0;i<MONZON_BURST_COUNT;i++){
      const across=(i%5-2)*30, along=(Math.floor(i/5)-1)*42;
      const origin=new THREE.Vector3(
        right.x*across+forward.x*along,
        65+(i%5)*14,
        right.z*across+forward.z*along
      );
      this.bursts.push({
        start:monzonFireworkBurstTime(i),
        pos:origin,
        hue:new THREE.Color(palette[i%palette.length])
      });
    }
    this.geometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3)
      .setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color",new THREE.BufferAttribute(this.colors,3)
      .setUsage(THREE.DynamicDrawUsage));
    const points=new THREE.Points(this.geometry,new THREE.PointsMaterial({
      vertexColors:true,transparent:true,opacity:.99,depthWrite:false,
      blending:THREE.AdditiveBlending,size:3.75,sizeAttenuation:true,
      toneMapped:false,fog:false
    }));
    points.frustumCulled=false;
    this.group.add(points);
    for(let i=0;i<3;i++){
      const light=new THREE.PointLight(palette[i+1],0,180,2);
      light.castShadow=false;
      this.group.add(light);
      this.lightAccents.push(light);
    }
    this.group.visible=false;
    scene.add(this.group);
  }
  start():void {
    this.active=true;
    this.elapsed=0;
    this.nextAudioBurst=0;
    this.group.visible=true;
  }
  stop():void {
    this.active=false;this.group.visible=false;
    for(const light of this.lightAccents)light.intensity=0;
  }
  get running():boolean{return this.active;}
  update(dt:number):void {
    if(!this.active)return;
    this.elapsed+=dt;
    if(this.elapsed>MONZON_FIREWORK_DURATION){this.stop();return;}
    while(this.nextAudioBurst<this.bursts.length &&
      this.elapsed>=this.bursts[this.nextAudioBurst].start){
      this.onBurst();this.nextAudioBurst++;
    }
    let offset=0;
    for(let i=0;i<this.bursts.length;i++){
      const burst=this.bursts[i];
      const elapsed=this.elapsed-burst.start;
      for(let k=0;k<72;k++){
        const base=offset*3;
        const phase=(k+.5)/72;
        const theta=k*2.399963229728653+i*.21;
        const v=Math.sqrt(Math.max(0,1-(2*phase-1)**2));
        if(elapsed>=0 && elapsed<2.45){
          const scale=elapsed*30;
          this.positions[base]=burst.pos.x+Math.cos(theta)*v*scale;
          this.positions[base+1]=burst.pos.y+(2*phase-1)*scale-6.8*elapsed*elapsed;
          this.positions[base+2]=burst.pos.z+Math.sin(theta)*v*scale;
          const brightness=Math.max(0,1-elapsed/2.45);
          this.colors[base]=burst.hue.r*brightness;
          this.colors[base+1]=burst.hue.g*brightness;
          this.colors[base+2]=burst.hue.b*brightness;
        }else {
          this.positions[base]=0;this.positions[base+1]=-500;
          this.positions[base+2]=0;
          this.colors[base]=this.colors[base+1]=this.colors[base+2]=0;
        }
        offset++;
      }
      // Rising comet before each large airborne explosion.
      const rocketIndex=(this.particleCount+i)*3;
      const rise=this.elapsed-(burst.start-.78);
      if(rise>=0&&rise<.78){
        this.positions[rocketIndex]=burst.pos.x;
        this.positions[rocketIndex+1]=Math.max(5,burst.pos.y*rise/.78);
        this.positions[rocketIndex+2]=burst.pos.z;
        this.colors[rocketIndex]=1;
        this.colors[rocketIndex+1]=.85;
        this.colors[rocketIndex+2]=.4;
      } else {
        this.positions[rocketIndex]=0;this.positions[rocketIndex+1]=-500;
        this.positions[rocketIndex+2]=0;
        this.colors[rocketIndex]=this.colors[rocketIndex+1]=this.colors[rocketIndex+2]=0;
      }
    }
    this.geometry.attributes.position.needsUpdate=true;
    this.geometry.attributes.color.needsUpdate=true;
    for(let i=0;i<this.lightAccents.length;i++){
      const burst=this.bursts[(this.nextAudioBurst-1-i+MONZON_BURST_COUNT)%MONZON_BURST_COUNT];
      const age=this.elapsed-burst.start;
      const light=this.lightAccents[i];
      light.position.copy(burst.pos);
      light.intensity=age>=0&&age<.36?3500*Math.exp(-age*8):0;
    }
  }
  cinematicCamera(camera:THREE.PerspectiveCamera):void {
    camera.position.copy(this.cameraOrigin);
    camera.lookAt(this.cameraTarget);
    camera.fov=64;
    camera.updateProjectionMatrix();
  }
}
