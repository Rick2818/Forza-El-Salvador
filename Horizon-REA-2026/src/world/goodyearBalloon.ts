import * as THREE from "three";
import type { Track } from "./track";

/** Animated Goodyear branded balloon, fully procedural and light on FPS. */
export class GoodyearBalloon {
  readonly group=new THREE.Group();
  private readonly origin=new THREE.Vector3();
  private time=0;
  constructor(scene:THREE.Scene,track:Track){
    this.group.name="suzaka-moving-goodyear-balloon";
    const idx=Math.round(475/track.segmentLength);
    const p=track.sampleAt(idx),r=track.rightAt(idx);
    this.origin.set(p.x+r.x*165,p.y+165,p.z+r.z*165);
    const blue=new THREE.MeshStandardMaterial({color:0x10438e,roughness:.87});
    const yellow=new THREE.MeshStandardMaterial({color:0xffd029,roughness:.86,side:THREE.DoubleSide});
    const shell=new THREE.Mesh(new THREE.SphereGeometry(11.5,24,16),blue);
    shell.scale.y=1.2;shell.position.y=17;this.group.add(shell);
    for(let i=0;i<6;i++){
      const stripe=new THREE.Mesh(new THREE.SphereGeometry(11.56,5,16,
        (i+.15)*Math.PI/3,.11,.2,Math.PI-.4),yellow);
      stripe.scale.y=1.2;stripe.position.y=17;this.group.add(stripe);
    }
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(5.1,4.4,1.8,16),yellow);
    ring.position.y=4;this.group.add(ring);
    const basket=new THREE.Mesh(new THREE.BoxGeometry(3.7,2.8,2.8),
      new THREE.MeshStandardMaterial({color:0x936234,roughness:.96}));
    basket.position.y=-3;this.group.add(basket);
    const ropes=new THREE.MeshStandardMaterial({color:0xe1d8ba});
    for(const x of [-1.4,1.4])for(const z of [-1,1]){
      const rope=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,9,6),ropes);
      rope.position.set(x,2.4,z);this.group.add(rope);
    }
    const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext("2d");
    if(ctx){
      ctx.clearRect(0,0,1024,256);
      ctx.fillStyle="#ffdb24";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="bold 164px Arial";ctx.fillText("GOODYEAR",512,128,975);
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const wordmark=new THREE.Sprite(new THREE.SpriteMaterial({
      map:texture,transparent:true,depthTest:false,depthWrite:false
    }));
    wordmark.name="goodyear-wordmark";wordmark.position.set(0,18,11);
    wordmark.scale.set(23,6,1);this.group.add(wordmark);
    this.group.position.copy(this.origin);scene.add(this.group);
  }
  update(dt:number):void{
    this.time+=dt;
    this.group.position.set(
      this.origin.x+32*Math.sin(this.time*.028),
      this.origin.y+4*Math.sin(this.time*.18),
      this.origin.z+19*Math.cos(this.time*.032)
    );
    this.group.rotation.y=.12*Math.sin(this.time*.012);
  }
}
