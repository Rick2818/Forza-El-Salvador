import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {makeRng} from '../core/mathx';
import type {Track} from './track';
import {distanceToTrack, type TerrainField} from './terrain';
import {createSuzakaResilientPines} from './suzakaResilientPines';
import {inSuzakaPublicStand, planSuzakaPublicStands} from './suzakaPublicStands';

/** Distance thresholds with hysteresis prevent repeated instance repacking at
 * a boundary. Near detail stays geometric, distant pines use the authored atlas. */
export function pineDetail(distance:number,previous:0|1|2):0|1|2{
  if(distance<(previous===0?46:36))return 0;
  if(distance<(previous===2?85:105))return 1;
  return 2;
}

export interface PinePlacement {x:number; y:number; z:number; height:number; width:number; yaw:number; shade:number}

/** Clustered spacing, with a clear safety corridor around EVERY road segment. */
export function pinePlacements(track:Track, ground:Pick<TerrainField,'heightAt'>):PinePlacement[] {
 const random=makeRng(28182026), trees:PinePlacement[]=[], occupied=new Map<string,PinePlacement[]>();
 const stands=planSuzakaPublicStands(track);
 for(let anchor=0;anchor<140;anchor++) {
  const index=Math.floor(random()*track.samples.length),p=track.sampleAt(index),right=track.rightAt(index);
  const side=random()<.5?-1:1, offset=30+random()*125;
  for(let i=0;i<7;i++) {
   const x=p.x+right.x*offset*side+(random()-.5)*58;
   const z=p.z+right.z*offset*side+(random()-.5)*58;
   if(distanceToTrack(x,z,track,3)<track.barrierLateralOffset+12)continue;
   if(inSuzakaPublicStand(x,z,stands))continue; // do not hide spectator terraces behind pines
   const cx=Math.floor(x/7),cz=Math.floor(z/7);
   let close=false;
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
    if((occupied.get(`${cx+dx}/${cz+dz}`)??[]).some(t=>Math.hypot(t.x-x,t.z-z)<6))close=true;
   }
   if(close)continue;
   const tree={x,y:ground.heightAt(x,z),z,height:20+random()*10,width:.8+random()*.4,yaw:random()*Math.PI*2,shade:.82+random()*.21};
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
 private detailLevels: (0|1|2)[]=[];
 private lastCenter=new THREE.Vector3(Infinity,Infinity,Infinity);
 constructor(scene:THREE.Scene,track:Track,ground:TerrainField) {
  this.group.name='suzaka-pine-forest';scene.add(this.group);
  this.placements=pinePlacements(track,ground);
  this.detailLevels=this.placements.map(()=>2);
  // Immediately available realistic foliage, independent of network and GLB.
  const fallback=createSuzakaResilientPines(this.placements);
  this.group.add(fallback);
  this.group.userData.treeCount=this.placements.length;
  this.group.userData.source="procedural-safe";
  this.ready=this.load().then(()=>{
    this.group.userData.ready=true;
    this.group.userData.source="Blender-CC0";
    // Do not draw the procedural fallback on top of the successfully loaded forest.
    fallback.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    fallback.traverse(o=>{if(o instanceof THREE.InstancedMesh){geometries.add(o.geometry);for(const m of [o.material].flat())materials.add(m);o.dispose();}});
    for(const g of geometries)g.dispose();
    for(const m of materials)m.dispose();
    this.update(new THREE.Vector3(0,0,0),1);
  }).catch(error=>{
    this.group.userData.ready=true;
    this.group.userData.source="procedural-safe";
    this.group.userData.assetError=String(error);
    console.warn("[Horizon] Suzaka Blender trees unavailable; organic fallback remains visible:",error);
  });
 }
 private async load():Promise<void> {
  const [near,medium,atlas]=await Promise.all([loadLOD('near'),loadLOD('medium'),
   new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}scenery/pine-far.png`)]);
  atlas.colorSpace=THREE.SRGBColorSpace;
  atlas.anisotropy=8;
  atlas.minFilter=THREE.LinearMipmapLinearFilter;
  atlas.magFilter=THREE.LinearFilter;
  for(const source of [near,medium]) {
   source.updateMatrixWorld(true);
   const tier:THREE.InstancedMesh[]=[];
   source.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh) || Array.isArray(obj.material))return;
    const authored=obj.material as THREE.MeshStandardMaterial;
    const isNeedle=/needle/i.test(authored.name);
    if(authored.map) {
      // Preserve the original CC0 photographic needles and bark. Better mip
      // and grazing-angle filtering avoids the chunky/pixelated Roblox look.
      authored.map.anisotropy=8;
      authored.map.minFilter=THREE.LinearMipmapLinearFilter;
      authored.map.magFilter=THREE.LinearFilter;
    }
    const material=new THREE.MeshLambertMaterial({
      name:authored.name,map:authored.map,color:authored.color,
      vertexColors:!!obj.geometry.getAttribute('color'),
      alphaTest:isNeedle?.34:0,
      alphaToCoverage:isNeedle, // MSAA-softened fine twig silhouettes, no alpha sorting
      side:isNeedle?THREE.DoubleSide:THREE.FrontSide,
      depthWrite:true,
      transparent:false
    });
    // Preserve the source bark and twig patterns; use inexpensive diffuse
    // shading so branches have dimension without expensive PBR passes.
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
  // The old 1.7x unlit texture made distant pines look like flat luminous
  // cardboard. Use diffuse illumination and antialiased cutout silhouettes.
  const far=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({
    map:atlas,color:0xe8eae5,alphaTest:.34,alphaToCoverage:true,
    side:THREE.DoubleSide,transparent:false,depthWrite:true
  }),this.placements.length);
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
  for(let i=0;i<this.placements.length;i++) {
   const tree=this.placements[i];
   const distance=Math.hypot(tree.x-center.x,tree.z-center.z);
   if(distance>1100)continue;
   // More trees retain their actual Blender branches before becoming impostors.
   const tier=this.detailLevels[i]=pineDetail(distance,this.detailLevels[i]),index=counts[tier]++;
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
