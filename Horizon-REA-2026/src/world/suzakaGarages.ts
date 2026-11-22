import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Track } from "./track";
import { GARAGE_LAYOUT } from "./monzonGarages";
import { createPitMechanics } from "./monzonWorkshopContents";
import {
  suzakaPitFrame, SUZAKA_PIT_BAY_X, SUZAKA_PIT_FRONT,
  SUZAKA_PIT_DEPTH, SUZAKA_PIT_BAY_WIDTH, SUZAKA_PIT_GATE_CENTERS
} from "./suzakaPitAccess";

/** Seven visible, accessible garages and 14 mechanics with world-aligned
 * collision volumes. No Blender download is required for the basic workshops. */
export class SuzakaGarages {
  readonly group = new THREE.Group();
  private readonly frame: ReturnType<typeof suzakaPitFrame>;
  private installed = false;

  constructor(scene: THREE.Scene, track: Track) {
    if (track.circuit.id !== "suzaka") throw Error("SuzakaGarages requires Suzaka");
    this.frame=suzakaPitFrame(track);
    this.group.name="suzaka-open-garages";
    this.group.position.set(this.frame.x, this.frame.y, this.frame.z);
    this.group.rotation.y=this.frame.yaw;

    const concrete=new THREE.MeshStandardMaterial({color:0x9da6ac,roughness:.84});
    const steel=new THREE.MeshStandardMaterial({color:0x26343e,metalness:.42,roughness:.47});
    const floor=new THREE.MeshStandardMaterial({color:0x9aa1a2,roughness:.96});
    const lane=new THREE.MeshStandardMaterial({color:0x292f33,roughness:.95});
    const white=new THREE.MeshBasicMaterial({color:0xe9e4b8});

    const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;
      this.group.add(mesh);
      return mesh;
    };
    // Concrete apron inside the two open fence gates; the entire area is
    // supported by Track's existing ground collider.
    box("suzaka-pit-service-lane",0,.055,15.8,214,.09,14.2,lane);
    for(const x of SUZAKA_PIT_GATE_CENTERS) {
      box("suzaka-pit-gate-arrow",x,.12,18.5,9,.025,.4,white);
    }
    for(let i=0;i<SUZAKA_PIT_BAY_X.length;i++){
      const x=SUZAKA_PIT_BAY_X[i],bay=GARAGE_LAYOUT[i];
      const front=SUZAKA_PIT_FRONT,rear=front+SUZAKA_PIT_DEPTH;
      const mid=(front+rear)/2,half=SUZAKA_PIT_BAY_WIDTH/2;
      const h=5.65;
      box("suzaka-garage-floor",x,.11,mid,SUZAKA_PIT_BAY_WIDTH,.18,SUZAKA_PIT_DEPTH,floor);
      box("suzaka-garage-rear-wall",x,h/2,rear,SUZAKA_PIT_BAY_WIDTH,h,.36,concrete);
      for(const side of [-1,1]) {
        box("suzaka-garage-side-wall",x+side*(half-.12),h/2,mid,.24,h,SUZAKA_PIT_DEPTH,concrete);
        box("suzaka-garage-front-column",x+side*(half-.25),h/2,front+.25,.45,h,.45,steel);
        box("suzaka-garage-parking-mark",x+side*3.4,.22,front+4,.09,.02,7,white);
      }
      box("suzaka-garage-roof",x,h+.12,mid,SUZAKA_PIT_BAY_WIDTH+.3,.25,SUZAKA_PIT_DEPTH+.3,steel);
      box("suzaka-garage-brand-fascia",x,h-.4,front+.14,SUZAKA_PIT_BAY_WIDTH,1.5,.3,
        new THREE.MeshStandardMaterial({color:bay.color,roughness:.6}));
      // The signage faces the pit lane, and the shutter is fully raised.
      const canvas=document.createElement("canvas");
      canvas.width=1024;canvas.height=128;
      const ctx=canvas.getContext("2d");
      if(ctx) {
        ctx.fillStyle="#111820";ctx.fillRect(0,0,1024,128);
        ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.font="bold 67px Arial, sans-serif";ctx.fillText(bay.name,512,64,955);
      }
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(SUZAKA_PIT_BAY_WIDTH-.9,1.6),
        new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}));
      sign.position.set(x,h-.35,front-.05);sign.rotation.y=Math.PI;
      sign.name="suzaka-garage-brand-"+bay.brand;this.group.add(sign);
    }
    // Same approved procedural pit crew as Monzon: two mechanics per brand.
    this.group.add(createPitMechanics(SUZAKA_PIT_BAY_X.map((x,i)=>({x,color:GARAGE_LAYOUT[i].color}))));
    this.group.userData.drivableGarages=7;
    this.group.userData.mechanics=14;
    scene.add(this.group);
  }

  installPhysics(world:RAPIER.World): void {
    if(this.installed)return;
    this.installed=true;
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const yaw=this.frame.yaw;
    const rotation={x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)};
    const solid=(x:number,y:number,z:number,w:number,h:number,d:number)=>{
      const wx=this.frame.x+x*this.frame.tx+z*this.frame.rx;
      const wz=this.frame.z+x*this.frame.tz+z*this.frame.rz;
      world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2)
        .setTranslation(wx,this.frame.y+y,wz)
        .setRotation(rotation).setFriction(.9),body);
    };
    for(const x of SUZAKA_PIT_BAY_X) {
      const h=5.65,mid=SUZAKA_PIT_FRONT+SUZAKA_PIT_DEPTH/2;
      solid(x,.11,mid,SUZAKA_PIT_BAY_WIDTH,.18,SUZAKA_PIT_DEPTH);
      solid(x,h/2,SUZAKA_PIT_FRONT+SUZAKA_PIT_DEPTH,SUZAKA_PIT_BAY_WIDTH,h,.36);
      for(const side of [-1,1]) {
        solid(x+side*(SUZAKA_PIT_BAY_WIDTH/2-.12),h/2,mid,.24,h,SUZAKA_PIT_DEPTH);
        solid(x+side*(SUZAKA_PIT_BAY_WIDTH/2-.25),h/2,SUZAKA_PIT_FRONT+.25,.45,h,.45);
      }
      solid(x,h+.12,mid,SUZAKA_PIT_BAY_WIDTH+.3,.25,SUZAKA_PIT_DEPTH+.3);
    }
    this.group.userData.physicsInstalled=true;
  }
}
