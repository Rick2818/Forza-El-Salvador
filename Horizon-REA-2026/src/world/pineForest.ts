import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {makeRng} from '../core/mathx';
import type {Track} from './track';
import {distanceToTrack, type TerrainField} from './terrain';

export interface PinePlacement {x:number; y:number; z:number; height:number; width:number; yaw:number; shade:number}

/** Clustered spacing, with a clear safety corridor around EVERY road segment. */
export function pinePlacements(track:Track, ground:Pick<TerrainField,'heightAt'>):PinePlacement[] {
 const random=makeRng(28182026), trees:PinePlacement[]=[], occupied=new Map<string,PinePlacement[]>();
 for(let anchor=0;anchor<140;anchor++) {
  const index=Math.floor(random()*track.samples.length),p=track.sampleAt(index),right=track.rightAt(index);
  const side=random()<.5?-1:1, offset=45+random()*140;
  for(let i=0;i<7;i++) {
   const x=p.x+right.x*offset*side+(random()-.5)*58;
   const z=p.z+right.z*offset*side+(random()-.5)*58;
   if(distanceToTrack(x,z,track,3)<track.barrierLateralOffset+12)continue;
   const cx=Math.floor(x/7),cz=Math.floor(z/7);
   let close=false;
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
    if((occupied.get(`${cx+dx}/${cz+dz}`)??[]).some(t=>Math.hypot(t.x-x,t.z-z)<6))close=true;
   }
   if(close)continue;
   const tree={x,y:ground.heightAt(x,z),z,height:20+random()*10,width:.8+random()*.4,yaw:random()*Math.PI*2,shade:.9+random()*.16};
   trees.push(tree);const key=`${cx}/${cz}`,cell=occupied.get(key)??[];cell.push(tree);occupied.set(key,cell);
  }
 }
 return trees;
}

async function loadLOD(name:string):Promise<THREE.Group> {
 const response=await fetch(`${import.meta.env.BASE_URL}scenery/pine-${name}.glb.gz`);
 if(!response.ok)throw Error(`Pine LOD ${name}: HTTP ${response.status}`);
 let bytes=await response.arrayBuffer();
 if(new Uint8Array(bytes)[0]===31) bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 return (await new GLTFLoader().parseAsync(bytes,'')).scene;
}

/** Two true 3D branch LODs plus a Blender-baked distant impostor. Seven or
 * fewer forest draw calls, independent of the number of placed trees. */
export class PineForest {
 readonly group=new THREE.Group();
 readonly ready:Promise<void>;
 readonly placements:PinePlacement[];
 private tiers:THREE.InstancedMesh[][]=[];
 private refresh=1;
 private lastCenter=new THREE.Vector3(Infinity,Infinity,Infinity);
 constructor(scene:THREE.Scene,track:Track,ground:TerrainField) {
  this.group.name='suzaka-pine-forest';scene.add(this.group);
  this.placements=pinePlacements(track,ground);
  this.ready=this.load().then(()=>{this.group.userData.ready=true;});
 }
 private async load():Promise<void> {
  const [near,medium,atlas]=await Promise.all([loadLOD('near'),loadLOD('medium'),
   new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}scenery/pine-far.png`)]);
  atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;
  for(const source of [near,medium]) {
   source.updateMatrixWorld(true);
   const tier:THREE.InstancedMesh[]=[];
   source.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh) || Array.isArray(obj.material))return;
    const authored=obj.material as THREE.MeshStandardMaterial;
    const material=new THREE.MeshLambertMaterial({name:authored.name,map:authored.map,
     color:authored.color,vertexColors:!!obj.geometry.getAttribute('color'),
     alphaTest:/needle/i.test(authored.name)?.4:0,side:THREE.DoubleSide});
    // Lambert foliage has no specular sheen and needs no environment sampling.
    const geometry=obj.geometry.clone().applyMatrix4(obj.matrixWorld);
    const mesh=new THREE.InstancedMesh(geometry,material,this.placements.length);
    mesh.name=`suzaka-${source===near?'near':'medium'}-${authored.name}`;
    mesh.count=0;mesh.castShadow=false;mesh.receiveShadow=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);tier.push(mesh);
   });
   this.tiers.push(tier);
  }
  const planes:THREE.BufferGeometry[]=[];
  for(let i=0;i<3;i++) {
   const geometry=new THREE.PlaneGeometry(8.8,17.6).translate(0,8,0).rotateY(i*Math.PI/3);
   const uv=geometry.getAttribute('uv');
   for(let j=0;j<uv.count;j++)uv.setX(j,(uv.getX(j)+i)/3);
   planes.push(geometry);
  }
  const geometry=mergeGeometries(planes,false);planes.forEach(g=>g.dispose());
  const far=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({map:atlas,alphaTest:.4,
   side:THREE.DoubleSide,toneMapped:false}),this.placements.length);
  far.name='suzaka-pine-impostors';far.count=0;far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.group.add(far);this.tiers.push([far]);
 }
 update(center:THREE.Vector3,dt:number):void {
  if(this.tiers.length!==3)return;
  this.refresh+=dt;
  if(this.refresh<.35 && center.distanceToSquared(this.lastCenter)<400)return;
  this.refresh=0;this.lastCenter.copy(center);
  const counts=[0,0,0],matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const tint=new THREE.Color(),axis=new THREE.Vector3(0,1,0);
  for(const tree of this.placements) {
   const distance=Math.hypot(tree.x-center.x,tree.z-center.z);
   if(distance>1100)continue;
   const tier=distance<110?0:distance<290?1:2,index=counts[tier]++;
   position.set(tree.x,tree.y,tree.z);scale.set(tree.width*tree.height/15.8,tree.height/15.8,tree.width*tree.height/15.8);
   rotation.setFromAxisAngle(axis,tree.yaw);matrix.compose(position,rotation,scale);
   tint.setRGB(tree.shade,tree.shade,tree.shade);
   for(const mesh of this.tiers[tier]) {mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,tint);}
  }
  this.tiers.forEach((tier,i)=>tier.forEach(mesh=>{
   mesh.count=counts[i];mesh.visible=counts[i]>0;mesh.instanceMatrix.needsUpdate=true;
   if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   mesh.computeBoundingSphere();
  }));
  this.group.userData.counts=counts;
 }
}
