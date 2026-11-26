import * as THREE from "three";
import type { Track } from "./track";

export const MONZON_OPENING_DURATION = 19;
export const MONZON_BURST_COUNT = 42;
export const MONZON_FIREWORK_DURATION = 17.6;
export const MONZON_SPARKS_PER_BURST = 384;
export const MONZON_SPARK_TRAILS = 2;
export const MONZON_FIREWORK_PATTERNS = [
  "peony", "chrysanthemum", "golden-willow", "palm",
  "ring", "star", "multistage"
] as const;
export type FireworkPattern = typeof MONZON_FIREWORK_PATTERNS[number];
export interface FireworkSoundCue {
  kind: "launch" | "burst";
  distance: number;
  pattern: FireworkPattern;
}
const GOLDEN_ANGLE = 2.399963229728653;
const PALETTE = [0xffcd78,0xff5954,0x83c9ff,0x93ffaf,0xfff4d9,0xffd9a0,0xffb86a];

export function monzonFireworkBurstTime(i: number): number {
  if (i < 0 || i >= MONZON_BURST_COUNT) throw new RangeError("Firework index outside show");
  const wave = Math.floor(i / 7), column = i % 7;
  // Deliberately tight gold/multicolour finale; earlier waves alternate.
  return wave === 5 ? 13.18 + column * .11
    : .94 + wave * 2.36 + column * .25 + (i % 3) * .035;
}
export function fireworkVisibility(t: number): number {
  return t <= 0 || t >= 3.75 ? 0
    : Math.min(1,t * 6) * Math.pow(1 - t / 3.75,1.1);
}
export function fireworkSoundDelay(distance: number): number {
  return Math.min(1.5, Math.max(0,distance) / 343);
}

/** Active range of chronological bursts, including launch/tail margins. */
export function activeBurstRange(t:number,lead:number,life:number):[number,number]{
  let first=0,end=MONZON_BURST_COUNT;
  while(first<end&&monzonFireworkBurstTime(first)+life<t)first++;
  end=first;while(end<MONZON_BURST_COUNT&&monzonFireworkBurstTime(end)-lead<=t)end++;
  return [first,end];
}
/** Original procedural four-frame smoke atlas, generated once, no external art. */
function makeSmokeFlipbook():THREE.DataTexture{
  const tile=64,w=tile*4,h=tile,data=new Uint8Array(w*h*4);
  for(let f=0;f<4;f++)for(let y=0;y<h;y++)for(let x=0;x<tile;x++){
    const px=(x+.5)/tile*2-1,py=(y+.5)/tile*2-1,r=Math.hypot(px,py);
    const noise=.62+.15*Math.sin(px*12+py*9+f*.7)+.12*Math.cos(py*17-px*8+f*.9)+.10*Math.sin(px*29-py*18);
    const a=Math.max(0,1-r)*Math.max(0,noise)*Math.max(0,1-r*.75);
    const i=(y*w+f*tile+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(a*255);
  }
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

type Burst = {
  start: number;
  center: THREE.Vector3;
  colour: THREE.Color;
  mode: number;
  distance: number;
};

/** Vertices are permanently resident on the GPU: only time and quality
 * uniforms change each frame. No per-frame Float32Array uploads. */
const SPARK_VERTEX = /* glsl */ `
  attribute vec3 aDirection;
  attribute vec4 aInfo;
  attribute vec3 aTint;
  attribute float aTrail;
  attribute float aGate;
  uniform float uTime;
  uniform float uDensity;
  uniform float uSize;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vCore;
  void main() {
    float age = uTime - aInfo.x - aTrail * (aInfo.z > 1.5 && aInfo.z < 3.5 ? .115 : .065);
    float mode = aInfo.z;
    float life = mode > 1.5 && mode < 3.5 ? 3.75 : 3.15;
    if (mode > 5.5) life = 2.25;
    if (age <= 0.0 || age >= life || aGate > uDensity) {
      gl_Position = vec4(2.0,2.0,2.0,1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vTint = aTint;
      vCore = 0.0;
      return;
    }
    vec3 d = aDirection;
    float drag = mode > 1.5 && mode < 3.5 ? 0.72 : (mode > .5 && mode < 1.5 ? .52 : .38);
    float travel = aInfo.y * (1.0 - exp(-drag * age)) / drag;
    if (mode > 4.5 && mode < 5.5) travel *= 0.83;
    float gravity = mode > 1.5 && mode < 2.5 ? 4.8 : (mode > 2.5 && mode < 3.5 ? 3.4 : 2.1);
    if (mode > 5.5) gravity = 5.0;
    vec3 flight = d * travel;
    flight.y -= gravity * age * age;
    // Subtle deterministic sideways wind, no CPU-side particle physics.
    flight.x += age * age * 0.48 * sin(aInfo.w * 13.7);
    vec3 transformed = position + flight;
    vec4 mvPosition = modelViewMatrix * vec4(transformed,1.0);
    gl_Position = projectionMatrix * mvPosition;
    float pulse = 0.87 + .13 * sin(27.0 * age + aInfo.w * 47.0);
    vAlpha = min(1.0, age * 32.0) * pow(1.0 - age / life,1.12)
      * (1.0 - aTrail * .25) * pulse;
    vCore = 1.0 - aTrail * .25;
    vTint = aTint;
    gl_PointSize = min(32.0,max(1.0,
      uSize * (185.0 / max(30.0,-mvPosition.z)) * (1.0 - aTrail * .11)));
  }
`;
const SPARK_FRAGMENT = /* glsl */ `
  precision mediump float;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vCore;
  void main() {
    float d = length(gl_PointCoord - vec2(.5)) * 2.0;
    float halo = pow(max(0.0,1.0 - d),2.35);
    float nucleus = pow(max(0.0,1.0 - d),6.0);
    float alpha = vAlpha * (halo * .72 + nucleus * .54);
    if (alpha < .005) discard;
    vec3 colour=mix(pow(vTint,vec3(.4545)),vec3(1.0,.96,.87),nucleus*.6);
    gl_FragColor = vec4(colour * (1.2 + .8 * nucleus * vCore),alpha);
  }
`;
const CORE_VERTEX = /* glsl */ `
  attribute float aStart;
  attribute vec3 aTint;
  uniform float uTime;
  uniform float uSize;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vCore;
  void main() {
    vCore = 1.0;
    float age = uTime - aStart;
    vAlpha = age >= 0.0 && age < .44 ? pow(1.0 - age / .44,2.0) : 0.0;
    vTint = aTint;
    vec4 view = modelViewMatrix * vec4(position,1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = vAlpha > 0.0 ? min(85.0,uSize * 2.8 * 185.0 / max(35.0,-view.z)) : 0.0;
  }
`;
const ROCKET_VERTEX = /* glsl */ `
  attribute float aStart;
  attribute float aHeight;
  attribute float aTrail;
  attribute vec3 aTint;
  uniform float uTime;
  uniform float uSize;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vCore;
  void main() {
    vCore = 1.0;
    float flight = uTime - (aStart - .86) - aTrail * .046;
    float f = clamp(flight / .86, 0.0, 1.0);
    vAlpha = flight >= 0.0 && flight <= .86 ? .8 * (1.0 - aTrail * .064) : 0.0;
    vec3 transformed = position + vec3(0.0,aHeight * (1.0 - pow(1.0 - f,1.35)),0.0);
    vec4 view = modelViewMatrix * vec4(transformed,1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = vAlpha > 0.0 ? min(32.0,uSize * 180.0 / max(35.0,-view.z)) : 0.0;
    vTint = aTint;
  }
`;
const SMOKE_VERTEX = /* glsl */ `
  attribute float aStart;
  attribute float aSeed;
  uniform float uTime;
  varying float vAlpha;
  varying float vPhase;
  void main() {
    float age = uTime - aStart - aSeed * .45;
    vPhase=clamp(age/4.25,0.0,.999)*3.0;
    float life = 4.25;
    vAlpha = age >= 0.0 && age < life
      ? min(1.0, age * 1.5) * pow(1.0 - age/life,1.8) * .22 : 0.0;
    vec3 p = position + vec3(sin(aSeed * 25.0) * age * 2.3,
      1.8 * age + aSeed * 3.0, cos(aSeed * 17.0) * age * 2.3);
    vec4 view = modelViewMatrix * vec4(p,1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = vAlpha > 0.0
      ? min(82.0,(22.0 + age * 17.0) * 190.0 / max(38.0,-view.z)) : 0.0;
  }
`;
const SMOKE_FRAGMENT = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  varying float vPhase;
  uniform sampler2D uSmokeAtlas;
  void main() {
    float r = length(gl_PointCoord - vec2(.5)) * 2.0;
    float frame=floor(vPhase);
    vec2 p=vec2((frame+.015+gl_PointCoord.x*.97)/4.0,gl_PointCoord.y);
    vec2 q=vec2((min(3.0,frame+1.0)+.015+gl_PointCoord.x*.97)/4.0,gl_PointCoord.y);
    float cloud=mix(texture2D(uSmokeAtlas,p).a,texture2D(uSmokeAtlas,q).a,fract(vPhase));
    float a = vAlpha * cloud * pow(max(0.0,1.0-r),.7);
    if (a < .006) discard;
    gl_FragColor = vec4(.48,.52,.60,a);
  }
`;

function pointMaterial(vertexShader: string, density = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,fragmentShader:SPARK_FRAGMENT,
    uniforms: {uTime:{value:0},uSize:{value:5.5},uDensity:{value:density}},
    transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,toneMapped:false,fog:false
  });
}

function geometry(attributes: Record<string,{array:number[];size:number}>): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  for (const [name,attr] of Object.entries(attributes)) {
    result.setAttribute(name,new THREE.Float32BufferAttribute(attr.array,attr.size));
  }
  return result;
}

export class MonzonLaunchFireworks {
  readonly group = new THREE.Group();
  readonly cameraOrigin = new THREE.Vector3();
  readonly cameraTarget = new THREE.Vector3();
  private readonly bursts: Burst[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly flashLights: THREE.PointLight[] = [];
  private readonly layers:Array<{points:THREE.Points;perBurst:number;lead:number;life:number}>=[];
  private readonly smokeAtlas=makeSmokeFlipbook();
  private readonly circuitId:string;
  private gpuPrepared=false;
  private elapsed = 0;
  private burstCursor = 0;
  private launchCursor = 0;
  private active = false;

  constructor(scene:THREE.Scene, track:Track, private readonly onCue:(cue:FireworkSoundCue)=>void = ()=>{}) {
    this.circuitId=track.circuit.id;
    this.group.name = track.circuit.id+"-v29-cinematic-aerial-shells";
    const p=track.sampleAt(track.startIndex);
    const tangent=track.tangentAt(track.startIndex);
    const right=track.rightAt(track.startIndex);
    this.group.position.copy(p).addScaledVector(tangent,130);
    this.cameraOrigin.copy(p).addScaledVector(tangent,-18).addScaledVector(right,23);
    this.cameraOrigin.y += 6;
    this.cameraTarget.copy(this.group.position).add(new THREE.Vector3(0,105,0));

    const center:number[]=[],direction:number[]=[],info:number[]=[],tint:number[]=[],trail:number[]=[],gate:number[]=[];
    const corePosition:number[]=[],coreStart:number[]=[],coreTint:number[]=[];
    const rocketPosition:number[]=[],rocketStart:number[]=[],rocketHeight:number[]=[],rocketTrail:number[]=[],rocketTint:number[]=[];
    const smokePosition:number[]=[],smokeStart:number[]=[],smokeSeed:number[]=[];
    for(let i=0;i<MONZON_BURST_COUNT;i++) {
      const wave=Math.floor(i/7),column=i%7;
      const along=(wave-2.4)*15+(i%2)*10;
      // Far beyond both safety barriers; their particles never collide.
      const lateral=(column-3)*31+(wave%2)*12;
      const height=82+(i%5)*11+(wave===5?18:0);
      const burst: Burst = {
        start:monzonFireworkBurstTime(i),
        center:new THREE.Vector3(right.x*lateral+tangent.x*along,height,
          right.z*lateral+tangent.z*along),
        colour:new THREE.Color(i%7===2||i%7===3||(wave===5&&i%2===0)?0xffcc6d:PALETTE[i%PALETTE.length]),
        mode:i%MONZON_FIREWORK_PATTERNS.length,
        distance:Math.hypot(lateral,along+130,height)
      };
      this.bursts.push(burst);
      corePosition.push(burst.center.x,burst.center.y,burst.center.z);
      coreStart.push(burst.start);
      coreTint.push(burst.colour.r,burst.colour.g,burst.colour.b);
      for(let tail=0;tail<13;tail++) {
        rocketPosition.push(burst.center.x,5,burst.center.z);
        rocketStart.push(burst.start);
        rocketHeight.push(burst.center.y-5);
        rocketTrail.push(tail);
        rocketTint.push(1,.78,.4);
      }
      for(let cloud=0;cloud<7;cloud++) {
        smokePosition.push(burst.center.x,burst.center.y,burst.center.z);
        smokeStart.push(burst.start);
        smokeSeed.push((cloud+.5)/7+i*.071);
      }
      for(let spark=0;spark<MONZON_SPARKS_PER_BURST;spark++) {
        const a=(spark+.5)/MONZON_SPARKS_PER_BURST;
        const polar=Math.acos(1-2*a);
        const theta=spark*GOLDEN_ANGLE+i*.37;
        let dx=Math.sin(polar)*Math.cos(theta);
        let dy=Math.cos(polar);
        let dz=Math.sin(polar)*Math.sin(theta);
        if(burst.mode===2)dy=Math.abs(dy)*.78+.16;
        if(burst.mode===3){const branch=Math.floor(spark/32)*GOLDEN_ANGLE;dx=Math.cos(branch)*(.65+.25*Math.sin(theta));dz=Math.sin(branch)*(.65+.25*Math.sin(theta));dy=.65+.28*a;}
        let radius=1;
        if(burst.mode===4 || burst.mode===5) {
          const angle=spark/MONZON_SPARKS_PER_BURST*Math.PI*2;
          if(burst.mode===5) {
            // Sample the perimeter of a five-point star, preserving straight edges.
            const edge=spark/MONZON_SPARKS_PER_BURST*10;
            const k=Math.floor(edge),f=edge-k;
            const a=k*Math.PI/5+Math.PI/2,b=(k+1)*Math.PI/5+Math.PI/2;
            const r0=k%2?.43:1,r1=k%2?1:.43;
            const x=Math.cos(a)*r0*(1-f)+Math.cos(b)*r1*f;
            const y=Math.sin(a)*r0*(1-f)+Math.sin(b)*r1*f;
            radius=Math.hypot(x,y);
            dx=right.x*x/radius;dy=y/radius;dz=right.z*x/radius;
          } else {dx=right.x*Math.cos(angle);dy=Math.sin(angle);dz=right.z*Math.cos(angle);}
        }
        const sparkLag=burst.mode===6 && spark%2===0?.56:0;
        // Coherent shells, rather than widely scattered velocities that erase the figure.
        const speed=(burst.mode===2?25:burst.mode===3?35:burst.mode===1?39:33)*radius*(.94+(spark%17)*.008);
        for(let layer=0;layer<MONZON_SPARK_TRAILS;layer++) {
          center.push(burst.center.x,burst.center.y,burst.center.z);
          direction.push(dx,dy,dz);
          info.push(burst.start+sparkLag,speed,burst.mode,(spark+i*.17)/MONZON_SPARKS_PER_BURST);
          tint.push(burst.colour.r,burst.colour.g,burst.colour.b);
          trail.push(layer);
          gate.push(((spark*37+i*19)%101)/101);
        }
      }
    }

    const sparks=geometry({
      position:{array:center,size:3},aDirection:{array:direction,size:3},
      aInfo:{array:info,size:4},aTint:{array:tint,size:3},
      aTrail:{array:trail,size:1},aGate:{array:gate,size:1}
    });
    const starMat=pointMaterial(SPARK_VERTEX);
    const stars=new THREE.Points(sparks,starMat);
    stars.name="v16-seven-3d-burst-patterns-and-multistage-trails";
    stars.frustumCulled=false;
    this.group.add(stars);
    this.materials.push(starMat);
    this.layers.push({points:stars,perBurst:MONZON_SPARKS_PER_BURST*MONZON_SPARK_TRAILS,lead:0,life:4.05});

    const cores=new THREE.Points(geometry({
      position:{array:corePosition,size:3},
      aStart:{array:coreStart,size:1},aTint:{array:coreTint,size:3}
    }),pointMaterial(CORE_VERTEX));
    cores.name="v16-synchronised-flash-cores";
    cores.frustumCulled=false;
    this.group.add(cores);
    this.materials.push(cores.material as THREE.ShaderMaterial);
    this.layers.push({points:cores,perBurst:1,lead:0,life:.44});

    const rockets=new THREE.Points(geometry({
      position:{array:rocketPosition,size:3},
      aStart:{array:rocketStart,size:1},
      aHeight:{array:rocketHeight,size:1},
      aTrail:{array:rocketTrail,size:1},
      aTint:{array:rocketTint,size:3}
    }),pointMaterial(ROCKET_VERTEX));
    rockets.name="v16-ascending-comet-launch-trails";
    rockets.frustumCulled=false;
    this.group.add(rockets);
    this.materials.push(rockets.material as THREE.ShaderMaterial);
    this.layers.push({points:rockets,perBurst:13,lead:.86,life:.60});

    const haze=new THREE.Points(geometry({
      position:{array:smokePosition,size:3},
      aStart:{array:smokeStart,size:1},
      aSeed:{array:smokeSeed,size:1}
    }),new THREE.ShaderMaterial({
      vertexShader:SMOKE_VERTEX,fragmentShader:SMOKE_FRAGMENT,
      uniforms:{uTime:{value:0},uSmokeAtlas:{value:this.smokeAtlas}},
      transparent:true,depthWrite:false,depthTest:true,
      blending:THREE.NormalBlending,toneMapped:false,fog:false
    }));
    haze.name="v16-soft-expanding-pyrotechnic-haze";
    haze.frustumCulled=false;
    haze.renderOrder=1;
    this.group.add(haze);
    this.materials.push(haze.material as THREE.ShaderMaterial);
    this.layers.push({points:haze,perBurst:7,lead:0,life:6.0});

    for(let i=0;i<2;i++) {
      const light=new THREE.PointLight(0xffd1a4,0,175,2);
      light.castShadow=false;light.visible=false;this.flashLights.push(light);this.group.add(light);
    }
    this.group.visible=false;
    this.group.userData.particleCount=center.length/3;
    this.group.userData.drawCalls=4;
    this.group.userData.patterns=[...MONZON_FIREWORK_PATTERNS];
    this.group.userData.physicsColliders=0;
    this.updateDrawRanges(0);
    scene.add(this.group);
  }

  /** Upload every resident particle buffer before the opening. A tiny private
   * target avoids drawing the entire circuit a second time. */
  prepareGpu(renderer:THREE.WebGLRenderer):void{
    if(this.gpuPrepared)return;
    const stage=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,1000);
    camera.position.set(0,50,150);camera.lookAt(0,100,0);
    const target=new THREE.WebGLRenderTarget(4,4),previous=renderer.getRenderTarget();
    const ranges=this.layers.map(l=>({...l.points.geometry.drawRange}));
    try{
      for(const layer of this.layers){
        layer.points.geometry.setDrawRange(0,1);
        const clone=layer.points.clone(false);clone.frustumCulled=false;stage.add(clone);
      }
      renderer.setRenderTarget(target);renderer.render(stage,camera);
      if(renderer.getContext().isContextLost())throw Error("Fireworks preparation lost WebGL");
      this.gpuPrepared=true;
    }finally{
      this.layers.forEach((l,i)=>l.points.geometry.setDrawRange(ranges[i].start,ranges[i].count));
      renderer.setRenderTarget(previous);target.dispose();
    }
  }
  private updateDrawRanges(t:number):void{
    let total=0;
    for(const layer of this.layers){
      const [first,end]=activeBurstRange(t,layer.lead,layer.life);
      const start=first*layer.perBurst,count=(end-first)*layer.perBurst;
      if(layer.points.geometry.drawRange.start!==start||layer.points.geometry.drawRange.count!==count)
        layer.points.geometry.setDrawRange(start,count);
      total+=count;
    }
    this.group.userData.activeParticleVertices=total;
  }
  setQuality(quality:"alta"|"equilibrada"):void {
    // Constant vertex buffers in both modes; balanced mode shades ~60%
    // of fragments with no change to the finale choreography.
    this.materials[0].uniforms.uDensity.value=quality==="alta"?1:.8;
    this.materials[0].uniforms.uSize.value=quality==="alta"?8.5:7.2;
  }
  start():void {
    this.elapsed=0;this.burstCursor=0;this.launchCursor=0;
    for (const material of this.materials) material.uniforms.uTime.value=0;
    this.active=true;this.group.visible=true;this.updateDrawRanges(0);
  }
  stop():void {
    this.active=false;this.group.visible=false;
    this.group.userData.activeParticleVertices=0;
    for(const light of this.flashLights){light.intensity=0;light.visible=false;}
  }
  get running():boolean{return this.active;}
  update(dt:number):void {
    if(!this.active)return;
    this.elapsed+=Math.max(0,Math.min(dt,.05));
    if(this.elapsed>=MONZON_FIREWORK_DURATION){this.stop();return;}
    for(const material of this.materials)material.uniforms.uTime.value=this.elapsed;
    this.updateDrawRanges(this.elapsed);

    while(this.launchCursor<this.bursts.length &&
      this.elapsed>=this.bursts[this.launchCursor].start-.84) {
      const b=this.bursts[this.launchCursor];
      if(this.launchCursor%3===0)this.onCue({
        kind:"launch",distance:b.distance,pattern:MONZON_FIREWORK_PATTERNS[b.mode]
      });
      this.launchCursor++;
    }
    while(this.burstCursor<this.bursts.length &&
      this.elapsed>=this.bursts[this.burstCursor].start) {
      const b=this.bursts[this.burstCursor];
      if(this.burstCursor%2===0 || this.burstCursor>=35)this.onCue({
        kind:"burst",distance:b.distance,pattern:MONZON_FIREWORK_PATTERNS[b.mode]
      });
      this.burstCursor++;
    }
    // Only two unshadowed scene lights flash; the actual thousands of sparks
    // illuminate themselves through additive shader emission.
    for(let i=0;i<this.flashLights.length;i++){
      const b=this.bursts[Math.max(0,this.burstCursor-1-i)];
      const age=this.elapsed-b.start;
      const light=this.flashLights[i];
      light.position.copy(b.center);
      light.color.copy(b.colour);
      light.visible=age>=0&&age<.42;
      light.intensity=light.visible?850*Math.exp(-age*9):0;
    }
  }
  cinematicCamera(camera:THREE.PerspectiveCamera, time = this.elapsed,
    scene?:THREE.Scene, player?:THREE.Vector3):void {
    const ease=(t:number)=>{const x=THREE.MathUtils.clamp(t,0,1);return x*x*(3-2*x);};
    const position=this.cameraOrigin.clone();
    const target=this.cameraTarget.clone();
    let fov=62;
    if(time<2.2 && scene) {
      const blimp=scene.getObjectByName(this.circuitId+"-goodyear-v18-lateral-airship");
      if(blimp) {
        target.copy(blimp.position).add(new THREE.Vector3(0,43,0));
        position.copy(target).add(new THREE.Vector3(15,-15,105));
        fov=48;
      }
    } else if(this.circuitId==="monzon"&&time>=6.3 && time<8.3) {
      // Close enough to inspect actual anatomy and the crowd's applause.
      position.set(159+ease((time-6.3)/2)*2,8.2,-42);
      target.set(160,7.1,-49);
      fov=49;
    } else if(this.circuitId==="monzon"&&time>=8.3 && time<10.3) {
      position.set(111.8+ease((time-8.3)/2)*.5,1.6,32.1);
      target.set(114.3,1.35,35.65);
      fov=48;
    } else {
      position.x+=Math.sin(time*.15)*5;
      position.y+=2;
      fov=64;
    }
    // After the final sparks fade, blend from the show back to the player's grid.
    if(time>17.6 && player) {
      const blend=ease((time-17.6)/(MONZON_OPENING_DURATION-17.6));
      position.lerp(player.clone().add(new THREE.Vector3(-7,3.2,0)),blend);
      target.lerp(player.clone().add(new THREE.Vector3(7,1,0)),blend);
      fov=THREE.MathUtils.lerp(fov,62,blend);
    }
    camera.position.copy(position);
    camera.lookAt(target);
    camera.fov=fov;
    camera.updateProjectionMatrix();
  }

  dispose():void {
    this.stop();
    this.group.traverse(object=>{
      if(object instanceof THREE.Points) object.geometry.dispose();
    });
    for(const material of this.materials) material.dispose();
    this.smokeAtlas.dispose();
    this.group.removeFromParent();
  }
}
