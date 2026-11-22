import * as THREE from "three";
import type { Track } from "./track";

export const MONZON_CINEMATIC_START_SEC = 2.8;
export const MONZON_CINEMATIC_END_SEC = .7;
export const MONZON_BURST_COUNT = 42;
export const MONZON_FIREWORK_DURATION = 17.6;
export const MONZON_SPARKS_PER_BURST = 96;
export const MONZON_SPARK_TRAILS = 3;
export const MONZON_FIREWORK_PATTERNS = [
  "peony", "chrysanthemum", "golden-willow", "palm",
  "ring", "comet", "multistage"
] as const;
export type FireworkPattern = typeof MONZON_FIREWORK_PATTERNS[number];
export interface FireworkSoundCue {
  kind: "launch" | "burst";
  distance: number;
  pattern: FireworkPattern;
}
const GOLDEN_ANGLE = 2.399963229728653;
const PALETTE = [0xffc96b,0xff6ca3,0x86deff,0xa5ffbc,0xc7a9ff,0xfff0bb,0xffb86a];

/** The start camera returns to the driver before the green light. */
export function monzonCinematicCameraActive(circuit: string, countdown: number, enabled = true): boolean {
  return enabled && circuit === "monzon" &&
    countdown < MONZON_CINEMATIC_START_SEC && countdown > MONZON_CINEMATIC_END_SEC;
}
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
    float age = uTime - aInfo.x - aTrail * 0.085;
    float mode = aInfo.z;
    float life = mode > 1.5 && mode < 3.5 ? 3.75 : 2.8;
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
    float drag = mode > 1.5 && mode < 4.5 ? 0.82 : 0.42;
    float travel = aInfo.y * (1.0 - exp(-drag * age)) / drag;
    if (mode > 4.5 && mode < 5.5) travel *= 0.83;
    float gravity = mode > 1.5 && mode < 4.5 ? 6.0 : 4.45;
    if (mode > 5.5) gravity = 5.0;
    vec3 flight = d * travel;
    flight.y -= gravity * age * age;
    // Subtle deterministic sideways wind, no CPU-side particle physics.
    flight.x += age * age * 0.48 * sin(aInfo.w * 13.7);
    vec3 transformed = position + flight;
    vec4 mvPosition = modelViewMatrix * vec4(transformed,1.0);
    gl_Position = projectionMatrix * mvPosition;
    float pulse = 0.87 + .13 * sin(27.0 * age + aInfo.w * 47.0);
    vAlpha = min(1.0, age * 8.0) * pow(1.0 - age / life,1.12)
      * (1.0 - aTrail * .25) * pulse;
    vCore = 1.0 - aTrail * .25;
    vTint = aTint;
    gl_PointSize = min(50.0,max(1.0,
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
    gl_FragColor = vec4(vTint * (1.08 + .4 * nucleus * vCore),alpha);
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
  void main() {
    float age = uTime - aStart - aSeed * .45;
    float life = 4.25;
    vAlpha = age >= 0.0 && age < life
      ? min(1.0, age * 1.5) * pow(1.0 - age/life,1.8) * .22 : 0.0;
    vec3 p = position + vec3(sin(aSeed * 25.0) * age * 2.3,
      1.8 * age + aSeed * 3.0, cos(aSeed * 17.0) * age * 2.3);
    vec4 view = modelViewMatrix * vec4(p,1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = vAlpha > 0.0
      ? min(130.0,(22.0 + age * 17.0) * 190.0 / max(38.0,-view.z)) : 0.0;
  }
`;
const SMOKE_FRAGMENT = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - vec2(.5)) * 2.0;
    float a = vAlpha * pow(max(0.0,1.0-r),2.4);
    if (a < .006) discard;
    gl_FragColor = vec4(.48,.52,.60,a);
  }
`;

function pointMaterial(vertexShader: string, density = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,fragmentShader:SPARK_FRAGMENT,
    uniforms: {uTime:{value:0},uSize:{value:17},uDensity:{value:density}},
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
  private elapsed = 0;
  private burstCursor = 0;
  private launchCursor = 0;
  private active = false;

  constructor(scene:THREE.Scene, track:Track, private readonly onCue:(cue:FireworkSoundCue)=>void = ()=>{}) {
    this.group.name = "monzon-v16-gpu-grand-prix-pyrotechnics";
    const p=track.sampleAt(track.startIndex);
    const tangent=track.tangentAt(track.startIndex);
    const right=track.rightAt(track.startIndex);
    this.group.position.copy(p).addScaledVector(tangent,130);
    this.cameraOrigin.copy(p).addScaledVector(tangent,-18).addScaledVector(right,23);
    this.cameraOrigin.y += 8;
    this.cameraTarget.copy(this.group.position).add(new THREE.Vector3(0,112,0));

    const center:number[]=[],direction:number[]=[],info:number[]=[],tint:number[]=[],trail:number[]=[],gate:number[]=[];
    const corePosition:number[]=[],coreStart:number[]=[],coreTint:number[]=[];
    const rocketPosition:number[]=[],rocketStart:number[]=[],rocketHeight:number[]=[],rocketTrail:number[]=[],rocketTint:number[]=[];
    const smokePosition:number[]=[],smokeStart:number[]=[],smokeSeed:number[]=[];
    for(let i=0;i<MONZON_BURST_COUNT;i++) {
      const wave=Math.floor(i/7),column=i%7;
      const along=(wave-2.4)*30+(i%2)*12;
      // Far beyond both safety barriers; their particles never collide.
      const lateral=(column-3)*38+(wave%2)*14;
      const height=94+(i%5)*15+(wave===5?18:0);
      const burst: Burst = {
        start:monzonFireworkBurstTime(i),
        center:new THREE.Vector3(right.x*lateral+tangent.x*along,height,
          right.z*lateral+tangent.z*along),
        colour:new THREE.Color(wave===5 && i%2===0?0xffcc6d:PALETTE[i%PALETTE.length]),
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
        if(burst.mode===2 || burst.mode===3)dy=Math.abs(dy)*.87+.18;
        if(burst.mode===4){dx=Math.cos(theta);dy=Math.sin(theta);dz=.15*Math.sin(3*theta);}
        if(burst.mode===5){dy=Math.abs(dy)*1.55+.3;dx*=.46;dz*=.46;}
        const sparkLag=burst.mode===6 && spark%2===0?.56:0;
        const speed=(burst.mode===2?23:burst.mode===5?36:31)+((spark*11)%13)*1.3;
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

    const cores=new THREE.Points(geometry({
      position:{array:corePosition,size:3},
      aStart:{array:coreStart,size:1},aTint:{array:coreTint,size:3}
    }),pointMaterial(CORE_VERTEX));
    cores.name="v16-synchronised-flash-cores";
    cores.frustumCulled=false;
    this.group.add(cores);
    this.materials.push(cores.material as THREE.ShaderMaterial);

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

    const haze=new THREE.Points(geometry({
      position:{array:smokePosition,size:3},
      aStart:{array:smokeStart,size:1},
      aSeed:{array:smokeSeed,size:1}
    }),new THREE.ShaderMaterial({
      vertexShader:SMOKE_VERTEX,fragmentShader:SMOKE_FRAGMENT,
      uniforms:{uTime:{value:0}},
      transparent:true,depthWrite:false,depthTest:true,
      blending:THREE.NormalBlending,toneMapped:false,fog:false
    }));
    haze.name="v16-soft-expanding-pyrotechnic-haze";
    haze.frustumCulled=false;
    haze.renderOrder=1;
    this.group.add(haze);
    this.materials.push(haze.material as THREE.ShaderMaterial);

    for(let i=0;i<2;i++) {
      const light=new THREE.PointLight(0xffd1a4,0,175,2);
      light.castShadow=false;this.flashLights.push(light);this.group.add(light);
    }
    this.group.visible=false;
    this.group.userData.particleCount=center.length/3;
    this.group.userData.drawCalls=4;
    this.group.userData.patterns=[...MONZON_FIREWORK_PATTERNS];
    this.group.userData.physicsColliders=0;
    scene.add(this.group);
  }

  setQuality(quality:"alta"|"equilibrada"):void {
    // Constant vertex buffers in both modes; balanced mode shades ~60%
    // of fragments with no change to the finale choreography.
    this.materials[0].uniforms.uDensity.value=quality==="alta"?1:.62;
    this.materials[0].uniforms.uSize.value=quality==="alta"?17:14;
  }
  start():void {
    this.elapsed=0;this.burstCursor=0;this.launchCursor=0;
    for (const material of this.materials) material.uniforms.uTime.value=0;
    this.active=true;this.group.visible=true;
  }
  stop():void {
    this.active=false;this.group.visible=false;
    for(const light of this.flashLights)light.intensity=0;
  }
  get running():boolean{return this.active;}
  update(dt:number):void {
    if(!this.active)return;
    this.elapsed+=Math.max(0,Math.min(dt,.05));
    if(this.elapsed>=MONZON_FIREWORK_DURATION){this.stop();return;}
    for(const material of this.materials)material.uniforms.uTime.value=this.elapsed;

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
      light.intensity=age>=0&&age<.42?850*Math.exp(-age*9):0;
    }
  }
  cinematicCamera(camera:THREE.PerspectiveCamera):void {
    camera.position.copy(this.cameraOrigin);
    camera.lookAt(this.cameraTarget);
    camera.fov=68;
    camera.updateProjectionMatrix();
  }
}
