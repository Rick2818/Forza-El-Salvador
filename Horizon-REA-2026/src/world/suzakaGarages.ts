import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Track } from "./track";
import {
  SUZAKA_GARAGE_NAMES, SUZAKA_GARAGE_METRES, SUZAKA_GARAGE_WIDTH,
  SUZAKA_GARAGE_DEPTH, SUZAKA_GARAGE_HEIGHT, SUZAKA_PIT_START_M, SUZAKA_PIT_END_M
} from "./suzakaPitAccess";

/** Seven separate drive-in bays on a pit lane following the live road elevation. */
export class SuzakaGarages {
  readonly group = new THREE.Group();
  private readonly roadGeometry: THREE.BufferGeometry;
  private readonly placements: {x:number;y:number;z:number;yaw:number}[] = [];
  private physicsInstalled = false;

  constructor(scene: THREE.Scene, track: Track) {
    this.group.name = "suzaka-seven-drivable-garages";
    const offset = track.barrierLateralOffset;
    const concrete = new THREE.MeshStandardMaterial({color:0x8b969d,roughness:.88});
    const floor = new THREE.MeshStandardMaterial({color:0x878c8b,roughness:.93});
    const steel = new THREE.MeshStandardMaterial({color:0x202c36,metalness:.4,roughness:.5});
    const toolRed = new THREE.MeshStandardMaterial({color:0xc0242c,roughness:.66});
    const yellow = new THREE.MeshBasicMaterial({color:0xfac72b});
    const box = (parent:THREE.Group,name:string,x:number,y:number,z:number,
      w:number,h:number,d:number,mat:THREE.Material):void => {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      mesh.name=name; mesh.position.set(x,y,z); mesh.receiveShadow=true; parent.add(mesh);
    };

    // Accessible asphalt strip behind the barrier, from the entrance to the exit.
    const vertices:number[]=[], uvs:number[]=[], triangles:number[]=[];
    const first=Math.ceil(SUZAKA_PIT_START_M/track.segmentLength);
    const last=Math.floor(SUZAKA_PIT_END_M/track.segmentLength);
    for(let i=first;i<=last;i++){
      const p=track.sampleAt(i),r=track.rightAt(i);
      for(const lateral of [offset+.65,offset+11.2]){
        vertices.push(p.x+r.x*lateral,p.y+.08,p.z+r.z*lateral);
        uvs.push(lateral/8,i*track.segmentLength/10);
      }
      if(i>first){
        const a=(i-first-1)*2,b=a+2;
        triangles.push(a,b,a+1,a+1,b,b+1);
      }
    }
    this.roadGeometry=new THREE.BufferGeometry();
    this.roadGeometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    this.roadGeometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    this.roadGeometry.setIndex(triangles);
    this.roadGeometry.computeVertexNormals();
    const road=new THREE.Mesh(this.roadGeometry,new THREE.MeshStandardMaterial({
      color:0x191c20,roughness:.97,side:THREE.DoubleSide
    }));
    road.name="suzaka-pit-lane-asphalt";road.receiveShadow=true;this.group.add(road);

    SUZAKA_GARAGE_NAMES.forEach((brand,i)=>{
      const idx=Math.round(SUZAKA_GARAGE_METRES[i]/track.segmentLength);
      const p=track.sampleAt(idx),r=track.rightAt(idx),t=track.tangentAt(idx);
      const yaw=Math.atan2(-t.z,t.x);
      const x=p.x+r.x*(offset+17),z=p.z+r.z*(offset+17);
      this.placements.push({x,y:p.y,z,yaw});
      const bay=new THREE.Group();
      bay.name="suzaka-garage-"+(i+1)+"-"+brand.toLowerCase();
      bay.position.set(x,p.y,z);bay.rotation.y=yaw;
      const w=SUZAKA_GARAGE_WIDTH,d=SUZAKA_GARAGE_DEPTH,h=SUZAKA_GARAGE_HEIGHT;
      box(bay,"floor",0,.035,0,w,.16,d,floor);
      box(bay,"rear-wall",0,h/2,d/2,w,h,.3,concrete);
      for(const side of [-1,1]){
        box(bay,"side-wall",side*(w/2-.14),h/2,0,.28,h,d,concrete);
        box(bay,"entry-pillar",side*(w/2-.25),h/2,-d/2,.5,h,.5,steel);
        box(bay,"tools",side*6.25,1,3.4,1.2,2,2,toolRed);
      }
      box(bay,"roof",0,h+.15,0,w+.5,.3,d+.5,steel);
      box(bay,"header",0,h-.15,-d/2-.25,w,1.35,.3,steel);
      box(bay,"entry-marking",0,.14,-d/2-.15,w-1,.03,.16,yellow);
      const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=192;
      const ctx=canvas.getContext("2d");
      if(ctx){
        ctx.fillStyle="#101923";ctx.fillRect(0,0,1024,192);
        ctx.fillStyle="#f7f7f6";ctx.font="bold 82px Arial";
        ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText((i+1)+"  "+brand,512,100,970);
      }
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(w-.5,1.2),
        new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide,toneMapped:false}));
      sign.name="bay-brand";sign.position.set(0,h-.15,-d/2-.48);
      sign.rotation.y=Math.PI;bay.add(sign);
      this.group.add(bay);
    });
    this.group.userData.drivableGarages=SUZAKA_GARAGE_NAMES.length;
    this.group.userData.pitEntryMetres=290;
    this.group.userData.pitExitMetres=595;
    scene.add(this.group);
  }

  installPhysics(world:RAPIER.World):void {
    if(this.physicsInstalled)return;
    this.physicsInstalled=true;
    const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const position=this.roadGeometry.getAttribute("position") as THREE.BufferAttribute;
    const index=this.roadGeometry.index;
    if(!index)throw Error("Suzaka pit lane index missing");
    world.createCollider(RAPIER.ColliderDesc.trimesh(
      new Float32Array(position.array as ArrayLike<number>),
      new Uint32Array(index.array as ArrayLike<number>)).setFriction(1.05),ground);
    for(const p of this.placements){
      const fixed=world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
        .setTranslation(p.x,p.y,p.z)
        .setRotation({x:0,y:Math.sin(p.yaw/2),z:0,w:Math.cos(p.yaw/2)}));
      const solid=(x:number,y:number,z:number,w:number,h:number,d:number):void=>{
        world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2)
          .setTranslation(x,y,z).setFriction(.8),fixed);
      };
      const w=SUZAKA_GARAGE_WIDTH,d=SUZAKA_GARAGE_DEPTH,h=SUZAKA_GARAGE_HEIGHT;
      solid(0,.035,0,w,.16,d);
      solid(0,h/2,d/2,w,h,.3);
      for(const side of [-1,1]){
        solid(side*(w/2-.14),h/2,0,.28,h,d);
        solid(side*(w/2-.25),h/2,-d/2,.5,h,.5);
        solid(side*6.25,1,3.4,1.2,2,2);
      }
      solid(0,h+.15,0,w+.5,.3,d+.5);
      solid(0,h-.15,-d/2-.25,w,1.35,.3);
    }
    this.group.userData.physicsInstalled=true;
  }
}
