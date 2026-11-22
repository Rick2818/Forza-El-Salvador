import * as THREE from "three";
import type { Track } from "./track";

/** World-space displacement in metres. No frame-rate-dependent movement. */
export function balloonMotion(time: number): { x: number; y: number; z: number; yaw: number } {
  return {
    x: Math.sin(time * 0.18) * 22 + Math.sin(time * .061) * 7,
    y: Math.sin(time * .32) * 3.7,
    z: Math.cos(time * .16) * 16,
    yaw: Math.sin(time * .095) * .20
  };
}

/** Two-circuit, prominent and illuminated Goodyear balloon. */
export class GoodyearBalloon {
  readonly group = new THREE.Group();
  private readonly origin = new THREE.Vector3();
  private readonly night: boolean;
  private elapsed = 0;
  private readonly bulbs: THREE.Mesh[] = [];
  private readonly glow: THREE.PointLight | null;

  constructor(scene: THREE.Scene, track: Track) {
    this.night = track.circuit.id === "monzon";
    this.group.name = track.circuit.id + "-giant-animated-goodyear-balloon";
    // In front of the starting grid instead of 165m to the side at 475m into the lap.
    const idx = Math.round((this.night ? 85 : 380) / track.segmentLength);
    const p = track.sampleAt(idx), r = track.rightAt(idx);
    this.origin.set(p.x + r.x * (this.night ? 38 : 45),
      p.y + (this.night ? 74 : 78), p.z + r.z * (this.night ? 38 : 45));
    const blue = new THREE.MeshStandardMaterial({
      color: 0x06449b, roughness: .55, emissive: this.night ? 0x052f71 : 0x000000,
      emissiveIntensity: this.night ? .66 : 0, side: THREE.DoubleSide
    });
    const yellow = new THREE.MeshStandardMaterial({
      color: 0xffd321, roughness: .65, emissive: this.night ? 0xffac0b : 0x000000,
      emissiveIntensity: this.night ? .56 : 0, side: THREE.DoubleSide
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 28), blue);
    shell.scale.y = 1.18; shell.position.y = 23; shell.name="goodyear-40m-envelope";
    this.group.add(shell);
    for (let k = 0; k < 8; k++) {
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(20.11, 12, 24,
        k * Math.PI / 4 + .09, .12, .16, Math.PI - .32), yellow);
      stripe.scale.y=1.18; stripe.position.y=23;
      this.group.add(stripe);
    }
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 5, 3.2, 20), yellow);
    throat.position.y=2.6; this.group.add(throat);
    const basketMat = new THREE.MeshStandardMaterial({color:0x9c6432,roughness:.92});
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(4.4,4.0,5.2,12),basketMat);
    basket.position.y=-6; basket.name="wicker-basket"; this.group.add(basket);
    const ropeMat = new THREE.MeshBasicMaterial({color:0xefdbba});
    for(const x of [-3.0,3.0]) for(const z of [-2.5,2.5]){
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,10,6),ropeMat);
      rope.position.set(x,-.8,z);this.group.add(rope);
    }
    // The mark is attached to the envelope (not a screen-space sprite), facing both banks.
    const canvas=document.createElement("canvas");
    canvas.width=2048;canvas.height=512;
    const ctx=canvas.getContext("2d");
    if(ctx){
      ctx.clearRect(0,0,2048,512);
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="900 305px Arial";
      ctx.lineWidth=13;ctx.strokeStyle="#062962";
      ctx.strokeText("GOODYEAR",1024,255,2000);
      ctx.fillStyle="#ffdf24";ctx.fillText("GOODYEAR",1024,255,2000);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    for(const side of [-1,1]){
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(37,9.1),new THREE.MeshBasicMaterial({
        map,transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false
      }));
      sign.name="GOODYEAR-illuminated-logo";
      sign.position.set(0,25,side*19.3);
      sign.rotation.y=side<0?Math.PI:0;
      this.group.add(sign);
    }
    const ledMat = new THREE.MeshBasicMaterial({color:0xffdc4b,toneMapped:false});
    for (let k = 0; k < 44; k++){
      const a = k*Math.PI*2/44;
      const led = new THREE.Mesh(new THREE.SphereGeometry(.36,5,4),ledMat);
      led.position.set(19.8*Math.cos(a),22.8,19.8*Math.sin(a));
      led.name="balloon-led";
      this.bulbs.push(led);
      this.group.add(led);
    }
    this.glow = this.night ? new THREE.PointLight(0xffc83c, 2100, 105, 1.7) : null;
    if (this.glow) {this.glow.position.set(0,19,0); this.glow.castShadow=false;this.group.add(this.glow);}
    this.group.position.copy(this.origin);
    scene.add(this.group);
  }

  update(dt:number): void {
    this.elapsed+=dt;
    const m=balloonMotion(this.elapsed);
    this.group.position.set(this.origin.x+m.x,this.origin.y+m.y,this.origin.z+m.z);
    this.group.rotation.set(.012*Math.sin(this.elapsed*.4),m.yaw,.025*Math.sin(this.elapsed*.29));
    if(this.glow)this.glow.intensity=1800+370*Math.sin(this.elapsed*1.35);
    const pulse=.74+.25*Math.sin(this.elapsed*1.3);
    for(let i=0;i<this.bulbs.length;i++){
      this.bulbs[i].scale.setScalar(this.night?pulse:0.6);
    }
  }

  /** Center used by the dedicated Monzón cinematographic shot. */
  get center(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0,23,0));
  }
}
