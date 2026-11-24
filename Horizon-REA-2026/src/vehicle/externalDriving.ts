import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { BODY_CENTER_Y, type CarVisual } from "./carModel";
import { removeExternalStage } from "./externalBackdrop";

/**
 * Visual adapter for THIRD-PARTY GLBs. No procedural car body/wheels.
 * Imported triangles remain the actual GLB geometry. Wheels are grouped
 * by material/name and, where necessary, triangle positions.
 */
export interface ExternalDimensions {
  length: number; width: number; height: number; wheelbase: number;
  track: number; wheelRadius: number; paint: string;
}
export interface ExternalVisualAudit {
  sourceMeshes: number;
  assignedWheelMeshes: readonly number[];
  sourceTriangles: number;
  copiedTriangles: number;
  wheelMeshCandidates: number;
  splitSources: number;
  overall: [number,number,number];
}
const loaded = new Map<string,THREE.Group>();
const pending = new Map<string,Promise<void>>();
const diagnostics = new Map<string,ExternalVisualAudit>();

const HAS_WHEEL = /(^|[_:\s.])(wheel|wheels|tyre|tyres|tire|tires|rin|neumatico|pneu|tyrewall|llanta|rueda)([_:\s.0-9]|$)/i;
const IS_STEERING = /steering[_\s-]*wheel|steerwheel|volante|handwheel|steer_wheel|steeringcolumn/i;
const PAINT_PART = /(^|[_\s:.])(body|bodyshell|paint|carrosserie)([_\s.0-9]|$)|exterior_mm_ext|color1mtl|vehicle_generic_smallspecmap__paint/i;
const EXCLUDED_PAINT = /wheel|tyre|tire|rim|neumatico|glass|window|windscreen|windshield|light|badge|emblem|brake|caliper|mirror|steer|interior|seat|chassis|plastic|carbon/i;

let loader:GLTFLoader|null=null;
function externalLoader():GLTFLoader{
  if(!loader){
    loader=new GLTFLoader();
    const draco=new DRACOLoader();
    draco.setDecoderPath(import.meta.env.BASE_URL+"model-draco/");
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}
function distanceToHub(point:THREE.Vector3,hubs:readonly THREE.Vector3[]):number{
  let best=0,lowest=Infinity;
  for(let i=0;i<hubs.length;i++){
    const dx=(point.x-hubs[i].x), dz=(point.z-hubs[i].z);
    const cost=dx*dx+dz*dz;
    if(cost<lowest){lowest=cost;best=i;}
  }
  return best;
}
export function externalWheelMounts(d:ExternalDimensions):{x:number;y:number;z:number;front:boolean}[]{
  return [
    {x:d.track/2, y:d.wheelRadius-BODY_CENTER_Y+.235,z:d.wheelbase/2,front:true},
    {x:-d.track/2,y:d.wheelRadius-BODY_CENTER_Y+.235,z:d.wheelbase/2,front:true},
    {x:d.track/2,y:d.wheelRadius-BODY_CENTER_Y+.235,z:-d.wheelbase/2,front:false},
    {x:-d.track/2,y:d.wheelRadius-BODY_CENTER_Y+.235,z:-d.wheelbase/2,front:false}
  ];
}
function hubsFor(d:ExternalDimensions):THREE.Vector3[]{
  return externalWheelMounts(d).map(p=>new THREE.Vector3(p.x,p.y-.235,p.z));
}
function wheelLabel(mesh:THREE.Mesh):string{
  const names=[mesh.name,mesh.parent?.name??"",mesh.parent?.parent?.name??""];
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  names.push(...mats.map(m=>m.name));
  return names.join(" ");
}
function isWheel(mesh:THREE.Mesh):boolean{
  const n=wheelLabel(mesh);
  return !IS_STEERING.test(n)&&HAS_WHEEL.test(n);
}
function triangulationCount(geo:THREE.BufferGeometry):number{
  return (geo.index?.count??geo.attributes.position?.count??0)/3;
}
function paintName(mesh:THREE.Mesh,mat:THREE.Material):boolean{
  const n=[mesh.name,mesh.parent?.name??"",mat.name].join(" ");
  return !EXCLUDED_PAINT.test(n)&&PAINT_PART.test(n);
}

/** Normalize orientation/scale of the *existing* GLB, never generate a shell. */
export async function loadExternalVehicle(
  id:string,d:ExternalDimensions,url?:string
):Promise<void>{
  if(loaded.has(id))return;
  const running=pending.get(id);if(running)return running;
  const task=externalLoader().loadAsync(url??(import.meta.env.BASE_URL+
    "models/external-candidates/"+id+".glb")).then(({scene})=>{
    removeExternalStage(id, scene);
    scene.updateMatrixWorld(true);
    let box=new THREE.Box3().setFromObject(scene);
    if(box.isEmpty())throw Error(id+": GLB sin carrocería");
    let dim=box.getSize(new THREE.Vector3());
    if(dim.x>dim.z*1.05){
      scene.rotation.y+=Math.PI/2;
      scene.updateMatrixWorld(true);box.setFromObject(scene);
      dim=box.getSize(new THREE.Vector3());
    }
    if(dim.x<.0001||dim.y<.0001||dim.z<.0001)throw Error(id+": geometría degenerada");
    // Preserve proportions. Allow mirror/bumper overhang; avoid height stretching.
    const factor=Math.min(d.length/dim.z,d.width*1.20/dim.x,d.height*1.20/dim.y);
    if(!Number.isFinite(factor)||factor<=0)throw Error(id+": escala inválida");
    scene.scale.multiplyScalar(factor);
    scene.updateMatrixWorld(true);
    box.setFromObject(scene);
    const center=box.getCenter(new THREE.Vector3());
    scene.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));
    scene.updateMatrixWorld(true);
    const after=new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
    if(after.length()<.01)throw Error(id+": modelo no renderizable");
    loaded.set(id,scene);
  }).finally(()=>pending.delete(id));
  pending.set(id,task);
  return task;
}
export function hasExternalVehicle(id:string):boolean{return loaded.has(id);}
export function externalAudit(id:string):ExternalVisualAudit|undefined{return diagnostics.get(id);}

/**
 * Partition a merged tyre/rim mesh using its ORIGINAL indexed triangles.
 * The GPU attributes (positions, UVs, normals and textures) remain from the
 * source GLB. Only per-wheel index buffers are created.
 */
function partitionWheelMesh(
  mesh:THREE.Mesh,hubs:readonly THREE.Vector3[],owned:THREE.BufferGeometry[]
):Array<{mesh:THREE.Mesh,hub:number}>{
  const geo=mesh.geometry,pos=geo.getAttribute("position"),idx=geo.index;
  if(!pos||pos.count<3)return [];
  mesh.updateWorldMatrix(true,false);
  const buckets=[[],[],[],[]] as number[][];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),mid=new THREE.Vector3();
  const count=idx?.count??pos.count;
  for(let i=0;i+2<count;i+=3){
    const i0=idx?idx.getX(i):i,i1=idx?idx.getX(i+1):i+1,i2=idx?idx.getX(i+2):i+2;
    a.fromBufferAttribute(pos,i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos,i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos,i2).applyMatrix4(mesh.matrixWorld);
    mid.copy(a).add(b).add(c).multiplyScalar(1/3);
    const bucket=distanceToHub(mid,hubs);
    buckets[bucket].push(i0,i1,i2);
  }
  const result:Array<{mesh:THREE.Mesh,hub:number}>=[];
  for(let hub=0;hub<4;hub++){
    const indices=buckets[hub];
    if(indices.length<3)continue;
    const divided=new THREE.BufferGeometry();
    for(const [k,attribute] of Object.entries(geo.attributes))divided.setAttribute(k,attribute);
    // Preserve named morph attributes without indexing Three.js' typed attribute object.
    Object.assign(divided.morphAttributes,geo.morphAttributes);
    divided.setIndex(indices);
    divided.addGroup(0,indices.length,0);
    divided.computeBoundingSphere();
    owned.push(divided);
    const part=new THREE.Mesh(divided,mesh.material);
    part.name=mesh.name+"_original_wheel_"+hub;
    part.position.copy(mesh.position);
    part.quaternion.copy(mesh.quaternion);
    part.scale.copy(mesh.scale);
    part.castShadow=mesh.castShadow;
    part.receiveShadow=mesh.receiveShadow;
    mesh.parent!.add(part);
    result.push({mesh:part,hub});
  }
  if(result.length)mesh.removeFromParent();
  return result;
}
function savedFinish(id:string):{paint:string;wheels:string}{
  try{
    const x=JSON.parse(localStorage.getItem("horizon.gallery.custom."+id)??"null");
    return {paint:typeof x?.paint==="string"&&/^#[a-f0-9]{6}$/i.test(x.paint)?x.paint:"original",
      wheels:typeof x?.wheels==="string"?x.wheels:"original"};
  }catch{return {paint:"original",wheels:"original"};}
}
export function createExternalVisual(id:string,d:ExternalDimensions):CarVisual{
  const source=loaded.get(id);
  if(!source)throw Error("El GLB original todavía no está cargado: "+id);
  const root=new THREE.Group();root.name=id;
  const bodyRoot=new THREE.Group();bodyRoot.position.y=-BODY_CENTER_Y;
  root.add(bodyRoot);
  const imported=source.clone(true);
  bodyRoot.add(imported);
  root.updateMatrixWorld(true);
  const hubs=hubsFor(d);
  const wheels=hubs.map((hub,i)=>{
    const steer=new THREE.Group();steer.name=["wheel_fr","wheel_fl","wheel_rr","wheel_rl"][i];
    steer.position.copy(hub);
    const spin=new THREE.Group();spin.name=steer.name+"_spin";
    steer.add(spin);root.add(steer);return {steer,spin};
  });
  root.updateMatrixWorld(true);
  let sourceTriangles=0,sourceMeshes=0,candidateCount=0,splitSources=0,copied=0;
  const owned:THREE.BufferGeometry[]=[];
  const wheelMeshes:THREE.Mesh[]=[];
  imported.traverse(child=>{
    if(!(child instanceof THREE.Mesh))return;
    sourceMeshes++;sourceTriangles+=triangulationCount(child.geometry);
    if(isWheel(child))wheelMeshes.push(child);
  });
  const counts=[0,0,0,0];
  // Reattach wheel meshes from source GLB to live pivots; no substitute tyres.
  for(const mesh of wheelMeshes){
    if(!mesh.parent)continue;
    candidateCount++;
    const box=new THREE.Box3().setFromObject(mesh),size=box.getSize(new THREE.Vector3());
    const multi=size.x>d.width*.64||size.z>d.wheelbase*.52;
    const parts=multi?partitionWheelMesh(mesh,hubs,owned):
      [{mesh,hub:distanceToHub(box.getCenter(new THREE.Vector3()),hubs)}];
    if(multi)splitSources++;
    for(const item of parts){
      // The wheel is moved, not duplicated; GLB material and geometry survive.
      root.updateMatrixWorld(true);
      wheels[item.hub].spin.attach(item.mesh);
      counts[item.hub]++;
      copied+=triangulationCount(item.mesh.geometry);
    }
  }
  // Per-vehicle materials; changing one car must never recolor other racers.
  const paint=new THREE.MeshPhysicalMaterial({
    name:"paint",color:d.paint,metalness:.18,roughness:.32,
    clearcoat:.50,clearcoatRoughness:.24,side:THREE.DoubleSide
  });
  const tail=new THREE.MeshStandardMaterial({name:"taillight",color:0xff2020,emissive:0xff1010,emissiveIntensity:2.4});
  const head=new THREE.MeshStandardMaterial({name:"headlight",color:0xc7e9ff,emissive:0x84bfff,emissiveIntensity:2.2});
  const {paint:requested}=savedFinish(id);
  const bodyColor=requested==="original"?null:new THREE.Color(requested);
  const instances=new Map<THREE.Material,THREE.Material>();
  root.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh))return;
    const mapMaterial=(material:THREE.Material):THREE.Material=>{
      const original=instances.get(material);
      if(original)return original;
      let result:THREE.Material;
      const label=[obj.name,material.name].join(" ");
      if(/taillight|brake_light|rear_lamp/i.test(label))result=tail;
      else if(/headlight|front_lamp/i.test(label))result=head;
      else result=material.clone();
      if(result instanceof THREE.MeshStandardMaterial){
        if(/glass|window|windshield|windscreen|glazing|vitrage/i.test(label)){
          result.transparent=true;result.opacity=.14;result.depthWrite=false;
          result.metalness=0;result.roughness=.9;
        }else if(bodyColor&&paintName(obj,material)){
          result.color.copy(bodyColor);
          // Painted diffuse texture would multiply selected blue by original red.
          result.map=null;result.metalness=Math.max(result.metalness,.16);
          result.roughness=Math.min(result.roughness,.45);
        }
        result.envMapIntensity=.18;
      }
      if(!result.transparent)result.side=THREE.DoubleSide;
      instances.set(material,result);
      return result;
    };
    obj.material=Array.isArray(obj.material)?obj.material.map(mapMaterial):mapMaterial(obj.material);
    obj.castShadow=false;obj.receiveShadow=false;
  });
  root.userData.ownedBatchGeometry=owned;
  const dimensions=new THREE.Box3().setFromObject(imported).getSize(new THREE.Vector3());
  diagnostics.set(id,{
    sourceMeshes,assignedWheelMeshes:counts,sourceTriangles,
    copiedTriangles:copied,wheelMeshCandidates:candidateCount,splitSources,
    overall:[dimensions.x,dimensions.y,dimensions.z]
  });
  root.userData.externalAudit=diagnostics.get(id);
  return {root,bodyRoot,wheels,paint,taillightMat:tail,headlightMat:head};
}
