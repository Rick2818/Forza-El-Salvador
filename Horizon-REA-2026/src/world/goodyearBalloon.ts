import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {RELEASE_LABEL} from "../core/version";
import type {Track} from "./track";

/** All axes in metres; the same smooth route runs in night and day circuits. */
export function balloonMotion(time:number):{x:number;y:number;z:number;yaw:number}{
  return {x:22*Math.sin(time*.18)+7*Math.sin(time*.061),
    y:3.7*Math.sin(time*.32),z:16*Math.cos(time*.16),
    yaw:.2*Math.sin(time*.095)};
}

/** V14 Blender-authored 40m balloon, with real curved lettering on both faces.
 * The interim geometry is hidden when the actual 3-pass asset loads. */
export class GoodyearBalloon {
  readonly group=new THREE.Group();
  readonly ready:Promise<boolean>;
  private readonly origin=new THREE.Vector3();
  private readonly night:boolean;
  private elapsed=0;
  private readonly glow:THREE.PointLight|null;
  private readonly fallback:THREE.Group;
  private loaded=false;
  constructor(scene:THREE.Scene,track:Track) {
    this.night=track.circuit.id==="monzon";
    this.group.name=track.circuit.id+"-goodyear-v14-authored-glb-balloon";
    // Position 180–210m ahead so the full monumental silhouette remains in
    // the driving camera's real FOV instead of completely above the player.
    const index=Math.round((this.night?185:220)/track.segmentLength);
    const p=track.sampleAt(index),r=track.rightAt(index);
    this.origin.set(p.x+r.x*(this.night?40:48),p.y+12,p.z+r.z*(this.night?40:48));
    this.group.position.copy(this.origin);
    this.fallback=new THREE.Group();this.fallback.name="glb-loading-fallback";
    const blue=new THREE.MeshStandardMaterial({color:0x073f99,roughness:.76});
    const envelope=new THREE.Mesh(new THREE.SphereGeometry(18,32,24),blue);
    envelope.position.y=43;envelope.scale.y=1.23;
    this.fallback.add(envelope);this.group.add(this.fallback);
    this.glow=this.night?new THREE.PointLight(0xffc843,1500,130,1.7):null;
    if(this.glow){this.glow.position.y=42;this.glow.castShadow=false;this.group.add(this.glow);}
    scene.add(this.group);
    this.ready=new GLTFLoader().loadAsync(
      import.meta.env.BASE_URL+"models/balloon/goodyear-v14.glb?rev="+RELEASE_LABEL
    ).then(({scene:asset})=>{
      const lettering=asset.getObjectsByProperty("isMesh",true).filter(
        (obj)=>obj.name.includes("GOODYEAR_"));
      if(lettering.length<16)throw new Error("GOODYEAR V14 must carry 16 curved glyph meshes");
      if(!asset.getObjectByName("HorizonBalloonV14_woven_envelope_12_gore_panels"))
        throw new Error("V14 fabric envelope mesh missing");
      asset.traverse(obj=>{
        if(!(obj instanceof THREE.Mesh))return;
        obj.castShadow=false;obj.receiveShadow=false;
        if(obj.material instanceof THREE.MeshStandardMaterial){
          if(obj.material.name.includes("integrated_LED"))obj.material.emissiveIntensity=this.night?2.2:.8;
          if(obj.material.name.includes("Goodyear_gold"))obj.material.emissiveIntensity=this.night?.65:.14;
        }
      });
      asset.name="blender-v14-goodyear-40m";
      this.group.add(asset);
      this.fallback.visible=false;
      this.loaded=true;
      return true;
    }).catch(err=>{
      console.warn("[Horizon V14] Goodyear GLB failed, using fallback",err);
      return false;
    });
  }
  update(dt:number):void{
    this.elapsed+=dt;
    const p=balloonMotion(this.elapsed);
    this.group.position.set(this.origin.x+p.x,this.origin.y+p.y,this.origin.z+p.z);
    this.group.rotation.set(.014*Math.sin(this.elapsed*.35),p.yaw,.023*Math.sin(this.elapsed*.27));
    if(this.glow)this.glow.intensity=1450+300*Math.sin(this.elapsed*.83);
  }
  get center():THREE.Vector3{
    return this.group.position.clone().add(new THREE.Vector3(0,41,0));
  }
  get isBlenderAssetLoaded():boolean{return this.loaded;}
}
