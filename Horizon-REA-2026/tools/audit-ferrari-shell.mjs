import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
const path='Horizon-REA-2026/public/models/selected/ferrari-california-t.glb';
const original=execFileSync('git',['show','3de9b8baf12508849940e42bdf8f5ce26d8ef935:'+path],{maxBuffer:16*1024*1024});
const updated=readFileSync('public/models/selected/ferrari-california-t.glb');
const parse=bytes=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const [before,after]=await Promise.all([parse(original),parse(updated)]);
before.scene.updateMatrixWorld(true);after.scene.updateMatrixWorld(true);
const points=mesh=>{
 const attribute=mesh.geometry.getAttribute('position'),p=new THREE.Vector3(),result=[];
 for(let i=0;i<attribute.count;i++){
  p.fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld);result.push([p.x,p.y,p.z]);
 }
 return result;
};
const tolerance=.000002;
let maximumDeviation=0;
function containsPoints(reference,candidate){
 const bins=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
 for(const p of candidate){const k=key(...p.map(n=>Math.floor(n/tolerance)));const bin=bins.get(k)??[];bin.push(p);bins.set(k,bin);}
 for(const p of reference){
  const cell=p.map(n=>Math.floor(n/tolerance));let best=Infinity;
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
   for(const q of bins.get(key(cell[0]+x,cell[1]+y,cell[2]+z))??[])best=Math.min(best,Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]));
  }
  if(best>tolerance)return false;maximumDeviation=Math.max(maximumDeviation,best);
 }
 return true;
}
const report={baseline:'3de9b8b',preservedMeshes:[],wheelPivots:[],paintPreserved:false,interiorDetails:0};
before.scene.traverse(object=>{
 if(!object.isMesh)return;
 const current=after.scene.getObjectByName(object.name);
 if(!current?.isMesh||!containsPoints(points(object),points(current))||!containsPoints(points(current),points(object)))throw Error('Approved exterior/wheel geometry changed: '+object.name);
 report.preservedMeshes.push(object.name);
});
for(const name of ['wheel_fr','wheel_fl','wheel_rr','wheel_rl']){
 const a=before.scene.getObjectByName(name).getWorldPosition(new THREE.Vector3()),b=after.scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
 if(a.distanceTo(b)>.00001)throw Error('Wheel mount moved: '+name);report.wheelPivots.push(name);
}
const paint=root=>{let color;root.traverse(o=>{for(const mat of [o.material].flat())if(mat?.name==='paint')color=mat.color.toArray();});return color;};
const a=paint(before.scene),b=paint(after.scene);
if(!a||!b||a.some((v,i)=>Math.abs(v-b[i])>.0000001))throw Error('Approved paint altered');
report.paintPreserved=true;report.maximumExteriorDeviationMetres=maximumDeviation;after.scene.traverse(o=>{if(o.name.startsWith('Cockpit_V11')&&o.isMesh)report.interiorDetails++;});
if(report.interiorDetails<10)throw Error('Missing cockpit detail');
mkdirSync('review/art-ferrari',{recursive:true});writeFileSync('review/art-ferrari/geometry-preservation.json',JSON.stringify(report,null,2));
console.log('FERRARI_PRESERVATION',JSON.stringify(report));
