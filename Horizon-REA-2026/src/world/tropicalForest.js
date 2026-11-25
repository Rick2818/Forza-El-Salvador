import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
const ROOT=import.meta.env.BASE_URL+"scenery/tropical-review/";
export async function installTropicalForest(scene,track,info){
 const loader=new GLTFLoader();
 const ids=["island_tree_01","island_tree_02"];
 const locations=[];
 for(let i=0;i<track.samples.length;i+=5)for(const side of [-1,1]){
  const p=track.samples[i],r=track.rightAt(i),offset=10+25*(.5+.5*Math.sin(i*1.72+side));
  const x=p.x+r.x*offset*side,z=p.z+r.z*offset*side;
  let nearest=p,dist=Infinity;
  for(const s of track.samples){const d=Math.hypot(s.x-x,s.z-z);if(d<dist){nearest=s;dist=d;}}
  if(dist<9||locations.some(s=>Math.hypot(s.x-x,s.z-z)<7))continue;
  const t=Math.max(0,Math.min(1,(dist-track.halfWidth)/24)),blend=t*t*(3-2*t);
  locations.push({x,z,y:nearest.y+(-1-nearest.y)*blend,height:11+8*(.5+.5*Math.sin(i*1.11)),yaw:i*.37,variant:Math.abs(i+(side>0?1:0))%2});
 }
 const sets=[];
 for(let v=0;v<ids.length;v++){
  const tiers=[];
  for(const tier of ["near","far"]){
   const gltf=await loader.loadAsync(ROOT+ids[v]+"-"+tier+".glb");
   const model=gltf.scene;model.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),mid=bounds.getCenter(new THREE.Vector3());
   if(size.y<.01)throw Error("Invalid tree dimensions");
   const normalization=new THREE.Matrix4().makeScale(1/size.y,1/size.y,1/size.y).multiply(new THREE.Matrix4().makeTranslation(-mid.x,-bounds.min.y,-mid.z));
   const parts=[];let triangles=0;
   model.traverse(o=>{
    if(!o.isMesh)return;
    const g=o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(normalization);
    triangles+=(g.index?.count??g.attributes.position.count)/3;
    const m=new THREE.InstancedMesh(g,o.material,locations.length);
    m.name="tropical-"+ids[v]+"-"+tier;m.count=0;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);parts.push(m);
   });
   if(!parts.length||!triangles)throw Error("Empty tropical model");
   tiers.push({parts,triangles});
  }
  sets.push(tiers);
 }
 info.treeCount=locations.length;info.forestAsset="Poly Haven island_tree_01/02 CC0";info.forestReviewOnly=true;
 const dummy=new THREE.Object3D(),last=new THREE.Vector3(Infinity,Infinity,Infinity);
 return center=>{
  if(last.distanceToSquared(center)<64)return;last.copy(center);
  const candidates=locations.map((p,i)=>({p,i,d:Math.hypot(p.x-center.x,p.z-center.z)})).filter(e=>e.d<125).sort((a,b)=>a.d-b.d);
  let nearCount=0,farCount=0,triangles=0;const counts=[[0,0],[0,0]];
  for(const {p,d} of candidates){
   const v=p.variant;let tier=d<34&&nearCount<6?0:1;
   if(tier===0&&triangles+sets[v][0].triangles>110000)tier=1;
   const s=sets[v][tier];
   if(triangles+s.triangles>155000||tier===1&&farCount>=48)continue;
   dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.yaw;dummy.scale.setScalar(p.height);dummy.updateMatrix();
   const index=counts[v][tier]++;
   for(const m of s.parts)m.setMatrixAt(index,dummy.matrix);
   triangles+=s.triangles;if(tier===0)nearCount++;else farCount++;
  }
  for(let v=0;v<sets.length;v++)for(let t=0;t<2;t++)for(const m of sets[v][t].parts){
   m.count=counts[v][t];m.visible=m.count>0;m.instanceMatrix.needsUpdate=true;if(m.count)m.computeBoundingSphere();
  }
  info.nearTreeCount=nearCount;info.maxNearTreeCount=Math.max(info.maxNearTreeCount??0,nearCount);info.forestTriangles=triangles;info.visibleTreeCount=nearCount+farCount;
 };
}
export async function installSoilMaterials(track,info){
 const loader=new THREE.TextureLoader(),names=["dirt","mud_forest"];
 const road=track.group.getObjectByName("offroad-surface");
 const materials=await Promise.all(names.map(async name=>{
  const [map,normalMap,roughnessMap]=await Promise.all(["diff","nor_gl","rough"].map(kind=>loader.loadAsync(ROOT+name+"_"+kind+".jpg")));
  map.colorSpace=THREE.SRGBColorSpace;
  for(const tex of [map,normalMap,roughnessMap]){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2.2,2.2);tex.anisotropy=4;}
  return new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,roughness:1,side:THREE.DoubleSide});
 }));
 const {offroadSectorAt}=await import("./offroadPrototype");
 road.geometry.clearGroups();
 const row=road.geometry.index.count/track.samples.length;
 for(let i=0;i<track.samples.length;i++)road.geometry.addGroup(i*row,row,offroadSectorAt(track.progress(i)).surface==="dirt"?0:1);
 // Adjacent sectors have one group each instead of one draw per sample.
 const old=road.geometry.groups.slice();road.geometry.clearGroups();
 for(const group of old){const prev=road.geometry.groups.at(-1);if(prev&&prev.materialIndex===group.materialIndex&&prev.start+prev.count===group.start)prev.count+=group.count;else road.geometry.addGroup(group.start,group.count,group.materialIndex);}
 const oldMaterial=road.material;road.material=materials;oldMaterial.dispose();
 info.soilAssets=names;
}
