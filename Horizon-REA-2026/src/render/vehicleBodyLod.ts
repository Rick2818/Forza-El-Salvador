import * as THREE from "three";
import { MeshoptSimplifier } from "three/addons/libs/meshopt_simplifier.module.js";

type Level=0|1|2|3;
const budgets=[1,.70,.35,.10] as const;
const distances:readonly number[]=[30,75,150];
export function chooseVehicleLod(distance:number,previous:Level):Level{
  let level=previous;
  while(level<3&&distance>distances[level]*1.12)level=(level+1) as Level;
  while(level>0&&distance<distances[level-1]*.88)level=(level-1) as Level;
  return level;
}
/** Preserve nearby rival geometry and only increase distant body LOD under measured draw pressure. */
export function pressureLodDistance(distance:number,pressured:boolean):number{
  if(!pressured||distance<=12)return distance;
  return distance+Math.min(distance-12, distance*.8);
}
type Entry={mesh:THREE.Mesh;original:THREE.BufferGeometry;levels:THREE.BufferGeometry[]};
const count=(g:THREE.BufferGeometry)=>g.index?.count??g.getAttribute("position").count;
const eligible=(m:THREE.Mesh)=>!(m instanceof THREE.SkinnedMesh||m instanceof THREE.InstancedMesh||
  m instanceof THREE.BatchedMesh)&&!Array.isArray(m.material)&&!m.material.transparent&&
  m.material.alphaTest===0&&!Object.keys(m.geometry.morphAttributes).length&&
  m.geometry.groups.length<=1&&m.geometry.drawRange.start===0&&m.geometry.drawRange.count>=count(m.geometry);
function simplify(source:THREE.BufferGeometry,ratio:number,error:number):THREE.BufferGeometry{
  const pos=source.getAttribute("position"),n=count(source);
  if(n<600||!source.index||!pos||pos.itemSize!==3)return source;
  const positions=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){positions[3*i]=pos.getX(i);positions[3*i+1]=pos.getY(i);positions[3*i+2]=pos.getZ(i);}
  const indices=Uint32Array.from(source.index.array);
  const target=Math.max(3,Math.floor(n*ratio/3)*3);
  // Index-only simplification retains original normals, UVs and material.
  // Respect seam topology, use a bounded error, do not force the ratio.
  const [reduced]=MeshoptSimplifier.simplify(indices,positions,3,target,error,["LockBorder"]);
  if(reduced.length>=n||reduced.length<3)return source;
  const g=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(source.attributes))g.setAttribute(name,attribute);
  g.setIndex(new THREE.BufferAttribute(reduced,1));
  if(source.boundingBox)g.boundingBox=source.boundingBox.clone();else g.computeBoundingBox();
  if(source.boundingSphere)g.boundingSphere=source.boundingSphere.clone();else g.computeBoundingSphere();
  return g;
}
/** Body-only LOD, prepared outside active racing. Player and all wheel
 * assemblies are untouched. No mesh/texture creation on distance transitions. */
export class VehicleBodyLod{
  private entries:Entry[]=[];
  level:Level=0;
  triangleCounts=[0,0,0,0];
  async prepare(body:THREE.Group):Promise<void>{
    await MeshoptSimplifier.ready;
    if(!MeshoptSimplifier.supported)return;
    body.traverse(o=>{
      if(!(o instanceof THREE.Mesh)||!eligible(o))return;
      const original=o.geometry;
      const levels=[original,...budgets.slice(1).map((ratio,i)=>simplify(original,ratio,[.008,.025,.06][i]))];
      levels.forEach((g,i)=>{this.triangleCounts[i]+=count(g)/3;});
      if(levels.some(g=>g!==original))this.entries.push({mesh:o,original,levels});
    });
  }
  update(distance:number,pressured=false):void{
    const level=chooseVehicleLod(pressureLodDistance(distance,pressured),this.level);
    this.setLevel(level);
  }
  setLevel(level:Level):void{
    if(level===this.level)return;
    this.level=level;
    for(const e of this.entries)e.mesh.geometry=e.levels[level];
  }
  dispose():void{
    this.setLevel(0);
    for(const e of this.entries)for(const g of new Set(e.levels))if(g!==e.original)g.dispose();
    this.entries=[];
  }
}
