import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { BODY_CENTER_Y, type CarVisual } from "./carModel";
import { removeExternalStage } from "./externalBackdrop";
import { EXTERNAL_VEHICLES } from "./externalRoster";

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

/** Measured from the transformed GLB tyre meshes, not from body dimensions. */
interface ExternalTyreFit {
  centers: readonly THREE.Vector3[];
  radii: readonly number[];
}
const measuredTyres = new Map<string,ExternalTyreFit>();

/** F430's front/rear sidewalls and axle positions differ from arcade defaults. */
export function measureFerrariF430Tyres(model:THREE.Object3D):ExternalTyreFit {
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  const middle=box.getCenter(new THREE.Vector3());
  const candidates:{center:THREE.Vector3;radius:number}[]=[];
  model.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh) || !/lod_a_tyre_mm_/i.test(obj.name))return;
    const b=new THREE.Box3().setFromObject(obj);
    const size=b.getSize(new THREE.Vector3());
    const radius=Math.max(size.y,size.z)/2;
    const center=b.getCenter(new THREE.Vector3());
    if(!Number.isFinite(radius)||radius<.16||radius>.65)return;
    candidates.push({center,radius});
  });
  // Positive Z is the Ferrari's front axle after model orientation is normalized.
  const positions:[[number,number],[number,number],[number,number],[number,number]]=
    [[1,1],[-1,1],[1,-1],[-1,-1]];
  const ordered=positions.map(([side,axle])=>candidates.find(({center})=>
    Math.sign(center.x-middle.x)===side && Math.sign(center.z-middle.z)===axle));
  if(candidates.length!==4 || ordered.some(value=>!value))
    throw new Error("Ferrari F430: faltan las cuatro mallas de neumático independientes del GLB");
  return {
    centers:ordered.map(x=>x!.center),
    radii:ordered.map(x=>x!.radius)
  };
}

export function externalWheelRadii(id:string,d:ExternalDimensions):readonly number[]{
  const fitted=measuredTyres.get(id);
  return fitted ? [...fitted.radii] : [d.wheelRadius,d.wheelRadius,d.wheelRadius,d.wheelRadius];
}

const HAS_WHEEL = /(^|[_:\s.])(wheel|wheels|tyre|tyres|tire|tires|rim|rims|rin|rines|neumatico|pneu|tyrewall|llanta|rueda|rubber|caucho)([_:\s.0-9]|$)/i;
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
export function externalWheelMounts(d:ExternalDimensions,id?:string):{x:number;y:number;z:number;front:boolean}[]{
  const fitted=id?measuredTyres.get(id):undefined;
  if(fitted)return fitted.centers.map((hub,i)=>({
    x:hub.x,y:hub.y-BODY_CENTER_Y+.235,z:hub.z,front:i<2
  }));
  return [
    {x:d.track/2, y:d.wheelRadius-BODY_CENTER_Y+.235,z:d.wheelbase/2,front:true},
    {x:-d.track/2,y:d.wheelRadius-BODY_CENTER_Y+.235,z:d.wheelbase/2,front:true},
    {x:d.track/2,y:d.wheelRadius-BODY_CENTER_Y+.235,z:-d.wheelbase/2,front:false},
    {x:-d.track/2,y:d.wheelRadius-BODY_CENTER_Y+.235,z:-d.wheelbase/2,front:false}
  ];
}
function hubsFor(d:ExternalDimensions,id?:string):THREE.Vector3[]{
  return externalWheelMounts(d,id).map(p=>new THREE.Vector3(p.x,p.y-.235,p.z));
}
function wheelLabel(mesh:THREE.Mesh):string{
  const names=[mesh.name,mesh.parent?.name??"",mesh.parent?.parent?.name??""];
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  names.push(...mats.map(m=>m.name));
  return names.join(" ");
}
function isWheel(mesh:THREE.Mesh):boolean{
  const n=wheelLabel(mesh);
  return !IS_STEERING.test(n)&&! /wheel[_\s-]*(arch|well|house)|spare[_\s-]*(wheel|tyre|tire)/i.test(n)&&HAS_WHEEL.test(n);
}
/** Fit independently named tyre meshes; reject ambiguous geometry instead of
 * silently treating a rim or a merged axle as a measured tyre. */
function measureExternalTyres(model:THREE.Object3D,d:ExternalDimensions):ExternalTyreFit|undefined{
  const bounds=new THREE.Box3().setFromObject(model);
  const mid=bounds.getCenter(new THREE.Vector3());
  const groups:Array<Array<{center:THREE.Vector3;radius:number}>>=[[],[],[],[]];
  model.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh))return;
    const label=wheelLabel(obj);
    if(IS_STEERING.test(label)||! /tyre|tire|neumatico|pneu|caucho|rubber/i.test(label))return;
    const box=new THREE.Box3().setFromObject(obj,true);
    const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const radius=(size.y+size.z)/4;
    if(!Number.isFinite(radius)||radius<d.wheelRadius*.65||radius>d.wheelRadius*1.5||
       size.x>radius*1.6||Math.abs(size.y-size.z)>radius*.22||
       Math.abs(center.x-mid.x)<d.track*.25||Math.abs(center.z-mid.z)<d.wheelbase*.25||
       box.min.y<-.08||box.min.y>.2)return;
    const i=(center.z>=mid.z?0:2)+(center.x>=mid.x?0:1);
    groups[i].push({center,radius});
  });
  const chosen=groups.map(g=>g.sort((a,b)=>b.radius-a.radius)[0]);
  if(chosen.some(x=>!x))return undefined;
  if(Math.abs(chosen[0].center.z-chosen[1].center.z)>.12||
     Math.abs(chosen[2].center.z-chosen[3].center.z)>.12||
     Math.abs(chosen[0].radius-chosen[1].radius)>.04||
     Math.abs(chosen[2].radius-chosen[3].radius)>.04)return undefined;
  return {centers:chosen.map(x=>x.center),radii:chosen.map(x=>x.radius)};
}

const isPickupAsset=(id:string)=>/^(ford-|ram-|chevrolet-)/.test(id);
const needsGeometricFit=(id:string)=>isPickupAsset(id)||id==="mercedes-amg-gt-alternative"||id==="tesla-roadster-electric-alternative";

/** Unnamed pickup wheel primitives: use measured bounding geometry, not
 * material names. Require four symmetric, ground-adjacent circular assemblies. */
function measurePickupGeometry(model:THREE.Object3D,d:ExternalDimensions):ExternalTyreFit|undefined{
  const mid=new THREE.Box3().setFromObject(model,true).getCenter(new THREE.Vector3());
  const groups:Array<Array<{center:THREE.Vector3;radius:number}>>=[[],[],[],[]];
  model.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh)||IS_STEERING.test(wheelLabel(obj))||
       /spare|caliper|brake|wheel[_\s-]*(arch|well|house)/i.test(wheelLabel(obj)))return;
    const b=new THREE.Box3().setFromObject(obj,true),s=b.getSize(new THREE.Vector3()),p=b.getCenter(new THREE.Vector3());
    const radius=(s.y+s.z)/4;
    if(!Number.isFinite(radius)||radius<d.wheelRadius*.60||radius>d.wheelRadius*1.45||
       s.x>radius*1.9||s.x<.035||Math.abs(s.y-s.z)>radius*.25||
       Math.abs(p.x-mid.x)<d.track*.25||Math.abs(p.z-mid.z)<d.wheelbase*.24||
       b.min.y<-.08||b.min.y>.25)return;
    groups[(p.z>=mid.z?0:2)+(p.x>=mid.x?0:1)].push({center:p,radius});
  });
  const selected=groups.map(g=>g.sort((a,b)=>b.radius-a.radius)[0]);
  if(selected.some(x=>!x))return undefined;
  if(Math.abs(selected[0].center.z-selected[1].center.z)>.15||
     Math.abs(selected[2].center.z-selected[3].center.z)>.15||
     Math.abs(selected[0].radius-selected[1].radius)>.06||
     Math.abs(selected[2].radius-selected[3].radius)>.06)return undefined;
  return {centers:selected.map(x=>x.center),radii:selected.map(x=>x.radius)};
}

/** Match individual rims, tyres and brake parts to the same measured hub.
 * Never move a large body panel merely because a name contains "wheel". */
function atMeasuredPickupHub(mesh:THREE.Mesh,hubs:readonly THREE.Vector3[],radii:readonly number[]):boolean{
  const label=wheelLabel(mesh);
  if(IS_STEERING.test(label)||/spare|wheel[_\s-]*(arch|well|house)/i.test(label))return false;
  const box=indexedWorldBounds(mesh),size=box.getSize(new THREE.Vector3()),p=box.getCenter(new THREE.Vector3());
  const i=distanceToHub(p,hubs),r=radii[i],h=hubs[i];
  return Math.abs(p.x-h.x)<=r*.65&&Math.abs(p.y-h.y)<=r*.36&&Math.abs(p.z-h.z)<=r*.36&&
    size.x<=r*2.0&&size.y<=r*2.25&&size.z<=r*2.25&&
    size.y>=r*.35&&size.z>=r*.35;
}

/** Measure tyres that share a single GLB mesh using their actual indexed
 * vertices in each quadrant, rather than guessing the wheelbase. */
function measureMergedTyres(model:THREE.Object3D,d:ExternalDimensions):ExternalTyreFit|undefined{
  const center=new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  const bounds=Array.from({length:4},()=>new THREE.Box3());
  const point=new THREE.Vector3();
  model.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh))return;
    const label=wheelLabel(obj);
    if(IS_STEERING.test(label)||/spare|wheel[_\s-]*(arch|well|house)/i.test(label)||
       !/tyre|tire|neumatico|pneu|caucho|rubber/i.test(label))return;
    const pos=obj.geometry.getAttribute("position"),idx=obj.geometry.index;
    if(!pos)return;
    for(let i=0;i<(idx?.count??pos.count);i++){
      point.fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(obj.matrixWorld);
      if(Math.abs(point.x-center.x)<d.track*.22||
         Math.abs(point.z-center.z)<d.wheelbase*.18||
         point.y<-.08||point.y>d.wheelRadius*2.8)continue;
      const quadrant=(point.z>=center.z?0:2)+(point.x>=center.x?0:1);
      bounds[quadrant].expandByPoint(point);
    }
  });
  if(bounds.some(b=>b.isEmpty()))return undefined;
  const sizes=bounds.map(b=>b.getSize(new THREE.Vector3()));
  const centers=bounds.map(b=>b.getCenter(new THREE.Vector3()));
  const radii=sizes.map(s=>(s.y+s.z)/4);
  if(sizes.some((s,i)=>radii[i]<d.wheelRadius*.60||radii[i]>d.wheelRadius*1.45||
    Math.abs(s.y-s.z)>radii[i]*.25||s.x>radii[i]*2.2||bounds[i].min.y>.20)||
    Math.abs(centers[0].z-centers[1].z)>.12||Math.abs(centers[2].z-centers[3].z)>.12||
    Math.abs(radii[0]-radii[1])>.05||Math.abs(radii[2]-radii[3])>.05)return undefined;
  return {centers,radii};
}

/** Bounds of referenced vertices only: GLB primitives can share a larger
 * attribute buffer. Reading all vertices makes a split wheel look like an axle. */
export function indexedWorldBounds(mesh:THREE.Mesh):THREE.Box3{
  mesh.updateWorldMatrix(true,false);
  const pos=mesh.geometry.getAttribute("position"),idx=mesh.geometry.index;
  const box=new THREE.Box3(),p=new THREE.Vector3();
  if(pos)for(let i=0;i<(idx?.count??pos.count);i++)
    box.expandByPoint(p.fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld));
  return box;
}
function quadrantWheelBounds(mesh:THREE.Mesh,mid:THREE.Vector3):THREE.Box3[]{
  const boxes=Array.from({length:4},()=>new THREE.Box3());
  const pos=mesh.geometry.getAttribute("position"),idx=mesh.geometry.index,p=new THREE.Vector3();
  if(pos)for(let i=0;i<(idx?.count??pos.count);i++){
    p.fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld);
    boxes[(p.z>=mid.z?0:2)+(p.x>=mid.x?0:1)].expandByPoint(p);
  }
  return boxes;
}
/** The Mercedes source names are generic. Object_28 is a candidate from the
 * observed bounds, not assumed to be rubber until four circular clusters fit. */
function measureMercedesMerged(model:THREE.Object3D,d:ExternalDimensions):ExternalTyreFit|undefined{
  const mid=new THREE.Box3().setFromObject(model,true).getCenter(new THREE.Vector3());
  let fit:ExternalTyreFit|undefined;
  model.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh)||!/^Object_28(?:$|[_.])/i.test(obj.name))return;
    const boxes=quadrantWheelBounds(obj,mid);
    if(boxes.some(b=>b.isEmpty()))return;
    const centers=boxes.map(b=>b.getCenter(new THREE.Vector3()));
    const sizes=boxes.map(b=>b.getSize(new THREE.Vector3()));
    const radii=sizes.map(s=>(s.y+s.z)/4);
    console.info("[Horizon] MERCEDES_WHEEL_CLUSTERS",JSON.stringify({centers:centers.map(p=>p.toArray()),sizes:sizes.map(p=>p.toArray())}));
    if(sizes.some((s,i)=>radii[i]<d.wheelRadius*.55||radii[i]>d.wheelRadius*1.5||
      Math.abs(s.y-s.z)>radii[i]*.30||s.x>radii[i]*2.1||boxes[i].min.y>.08||
      Math.abs(centers[i].x-mid.x)<d.track*.25||Math.abs(centers[i].z-mid.z)<d.wheelbase*.20))return;
    if(Math.abs(centers[0].z-centers[1].z)>.12||Math.abs(centers[2].z-centers[3].z)>.12||
       Math.abs(radii[0]-radii[1])>.05||Math.abs(radii[2]-radii[3])>.05)return;
    fit={centers,radii};
  });
  return fit;
}
/** Only classify anonymous merged meshes when EVERY referenced vertex belongs
 * to one measured hub envelope. This avoids detaching chassis triangles. */
function isMergedHubAssembly(mesh:THREE.Mesh,hubs:readonly THREE.Vector3[],radii:readonly number[]):boolean{
  const pos=mesh.geometry.getAttribute("position"),idx=mesh.geometry.index,p=new THREE.Vector3();
  if(!pos)return false;
  const seen=new Set<number>();
  for(let i=0;i<(idx?.count??pos.count);i++){
    p.fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld);
    const k=distanceToHub(p,hubs),h=hubs[k],r=radii[k];
    if(Math.abs(p.x-h.x)>r*.95||Math.hypot(p.y-h.y,p.z-h.z)>r*1.15)return false;
    seen.add(k);
  }
  return seen.size>=2;
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
  const rosterVehicle=EXTERNAL_VEHICLES.find(car=>car.id===id);
  if(!url && !rosterVehicle?.modelUrl)throw Error("El modelo no está en la lista de vehículos jugables: "+id);
  const task=externalLoader().loadAsync(url??(import.meta.env.BASE_URL+rosterVehicle!.modelUrl)).then(({scene})=>{
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
    // Ford's imported nose points opposite the +Z physics forward axis,
    // as reported in the V21 road test. Rotate the asset, never the inputs.
    if(id==="ford-f150-raptor-police"){
      scene.rotation.y+=Math.PI;
      scene.updateMatrixWorld(true);box.setFromObject(scene);
      dim=box.getSize(new THREE.Vector3());
    }
    // Mercedes Object_28 has four measured circular tyre clusters on a
    // rotated rectangle. Recover its actual longitudinal axis, not a guess
    // from the overall body bounds. Rotate the complete source before fitting.
    if(id==="mercedes-amg-gt-alternative"){
      const middle=new THREE.Box3().setFromObject(scene,true).getCenter(new THREE.Vector3());
      let yaw:number|undefined;
      scene.traverse(obj=>{
        if(!(obj instanceof THREE.Mesh)||obj.name!=="Object_28")return;
        const b=quadrantWheelBounds(obj,middle);
        if(b.some(x=>x.isEmpty()))return;
        const p=b.map(x=>x.getCenter(new THREE.Vector3()));
        const front=p[0].clone().add(p[1]).multiplyScalar(.5);
        const rear=p[2].clone().add(p[3]).multiplyScalar(.5);
        const axis=front.sub(rear);
        const frontWidth=p[0].clone().sub(p[1]),rearWidth=p[2].clone().sub(p[3]);
        // Both axles must agree and be perpendicular to the longitudinal axis.
        if(axis.length()<.001||frontWidth.length()<.001||rearWidth.length()<.001)return;
        if(Math.abs(axis.clone().normalize().dot(frontWidth.clone().normalize()))>.12||
          Math.abs(axis.clone().normalize().dot(rearWidth.clone().normalize()))>.12)return;
        yaw=Math.atan2(axis.x,axis.z);
      });
      if(yaw!==undefined&&Math.abs(yaw)<Math.PI/4){
        scene.rotation.y-=yaw;
        scene.updateMatrixWorld(true);
        box.setFromObject(scene);dim=box.getSize(new THREE.Vector3());
        console.info("[Horizon] MERCEDES_AXLE_YAW_DEG",yaw*180/Math.PI);
      }
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
    if(id==="ferrari-f430")measuredTyres.set(id,measureFerrariF430Tyres(scene));
    else {
      const fit=measureExternalTyres(scene,d)??measureMergedTyres(scene,d)??(needsGeometricFit(id)?measurePickupGeometry(scene,d):undefined)??(id==='mercedes-amg-gt-alternative'?measureMercedesMerged(scene,d):undefined);
      if(fit)measuredTyres.set(id,fit);
      else {
        console.warn("[Horizon] Geometría de neumáticos pendiente de calibración:",id);
        if(needsGeometricFit(id)){
          const candidates:unknown[]=[];
          scene.traverse(obj=>{
            if(!(obj instanceof THREE.Mesh))return;
            const b=new THREE.Box3().setFromObject(obj,true),s=b.getSize(new THREE.Vector3()),p=b.getCenter(new THREE.Vector3());
            candidates.push({name:wheelLabel(obj),size:s.toArray(),center:p.toArray(),minY:b.min.y});
          });
          console.warn("[Horizon] WHEEL_GEOMETRY_DIAG",id,JSON.stringify(candidates));
        }
      }
    }
    loaded.set(id,scene);
  }).finally(()=>pending.delete(id));
  pending.set(id,task);
  return task;
}
export function hasExternalVehicle(id:string):boolean{return loaded.has(id);}
export function hasMeasuredExternalTyres(id:string):boolean{return measuredTyres.has(id);}
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
    // Expand only this corner's referenced triangles. Sharing the full axle's
    // position buffer gave each wheel an invalid full-axle bounding box.
    const compact=divided.toNonIndexed();
    divided.dispose();
    compact.computeBoundingBox();
    compact.computeBoundingSphere();
    owned.push(compact);
    const part=new THREE.Mesh(compact,mesh.material);
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
  const hubs=hubsFor(d,id);
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
    // Mercedes wheel material primitives are merged across all corners.
    // Only admit them if their referenced vertices fit measured hub envelopes.
    // Silverado has 12 explicitly audited source primitives. Do not let
    // broad geometric/name heuristics detach coachwork or rear lamps.
    if(id==="chevrolet-silverado-ev-alternative"){
      if(/^Object_(7001|19001|15001|25001)_NEUMA_0$/i.test(child.name)||
        /^Object_(9001|21001|13001|27001)_(DARK_GRAY|CHROME)_0$/i.test(child.name))
        wheelMeshes.push(child);
      return;
    }
    if(isWheel(child)||(needsGeometricFit(id)&&measuredTyres.has(id)&&
      (atMeasuredPickupHub(child,hubs,externalWheelRadii(id,d))||
       (id==='mercedes-amg-gt-alternative'&&isMergedHubAssembly(child,hubs,externalWheelRadii(id,d))))))wheelMeshes.push(child);
  });
  // A pose integrity audit must detect shifted panels even when triangle
  // counts remain identical. Compare original body meshes and transforms.
  const silveradoBody=new Map<THREE.Mesh,{world:THREE.Matrix4;geometry:THREE.BufferGeometry}>();
  if(id==="chevrolet-silverado-ev-alternative"){
    const selected=new Set(wheelMeshes);
    imported.traverse(o=>{
      if(o instanceof THREE.Mesh&&!selected.has(o))
        silveradoBody.set(o,{world:o.matrixWorld.clone(),geometry:o.geometry});
    });
    if(wheelMeshes.length!==12)throw Error("Silverado: expected twelve original wheel primitives");
  }
  const counts=[0,0,0,0];
  // Reattach wheel meshes from source GLB to live pivots; no substitute tyres.
  for(const mesh of wheelMeshes){
    if(!mesh.parent)continue;
    candidateCount++;
    const sourceLabel=wheelLabel(mesh);
    const box=indexedWorldBounds(mesh),size=box.getSize(new THREE.Vector3());
    const multi=size.x>d.width*.64||size.z>d.wheelbase*.52;
    const parts=multi?partitionWheelMesh(mesh,hubs,owned):
      [{mesh,hub:distanceToHub(box.getCenter(new THREE.Vector3()),hubs)}];
    if(multi)splitSources++;
    for(const item of parts){
      // The wheel is moved, not duplicated; GLB material and geometry survive.
      root.updateMatrixWorld(true);
      // Brake calipers steer with the hub but must never rotate with the rim.
      const fixedBrake=/caliper|étrier|etrier|pinza/i.test(sourceLabel);
      item.mesh.userData.originalWheelLabel=sourceLabel;
      const pivot=fixedBrake?wheels[item.hub].steer:wheels[item.hub].spin;
      if(id==="chevrolet-silverado-ev-alternative"){
        // Preserve the complete authored affine transform, including any
        // shear/nonuniform ancestor scale. Object3D.attach decomposes TRS.
        const originalWorld=item.mesh.matrixWorld.clone();
        pivot.add(item.mesh);
        item.mesh.matrix.copy(pivot.matrixWorld.clone().invert().multiply(originalWorld));
        item.mesh.matrixAutoUpdate=false;
        item.mesh.matrixWorldNeedsUpdate=true;
      }else pivot.attach(item.mesh);
      // For an explicitly named complete rim/tyre ring, align its radial
      // centre with the measured tyre axle. Preserve X (rim dish/offset),
      // radius, mesh shape and the original authored material.
      const ramRearCandidate=id==="ram-3500-alternative"&&item.hub===2&&item.mesh.name==="Object_4";
      if(id!=="chevrolet-silverado-ev-alternative"&&!fixedBrake&&measuredTyres.has(id)&&(/tyre|tire|neumatico|pneu|rubber|caucho|rim|rines?|sidewall|thread|tread|LOD_A_WHEEL/i.test(sourceLabel)||ramRearCandidate)){
        const bound=indexedWorldBounds(item.mesh),s=bound.getSize(new THREE.Vector3());
        const p=bound.getCenter(new THREE.Vector3()),h=hubs[item.hub],r=externalWheelRadii(id,d)[item.hub];
        const partR=(s.y+s.z)/4,offset=Math.hypot(p.y-h.y,p.z-h.z);
        if(partR>=r*.48&&partR<=r*1.18&&Math.abs(s.y-s.z)<=partR*(ramRearCandidate ? .28 : .20)&&
           s.x<=r*2&&offset>Math.min(.025,r*.075)&&offset<=r*.32){
          const worldOrigin=item.mesh.getWorldPosition(new THREE.Vector3());
          worldOrigin.y+=h.y-p.y;worldOrigin.z+=h.z-p.z;
          item.mesh.position.copy(pivot.worldToLocal(worldOrigin));
          item.mesh.userData.radialCorrectionM=offset;
          item.mesh.updateWorldMatrix(true,false);
        }
      }
      counts[item.hub]++;
      copied+=triangulationCount(item.mesh.geometry);
    }
  }
  // Audit actual wheel-local geometry after attachment. Axial X offsets are
  // intentional (rim dish); radial Y/Z eccentricity is not.
  root.updateMatrixWorld(true);
  const wheelAlignment=wheels.map((wheel,i)=>{
    const center=wheel.steer.getWorldPosition(new THREE.Vector3());
    const radius=externalWheelRadii(id,d)[i];
    const parts:Array<{name:string;kind:string;radialOffsetM:number;radiusM:number;center:number[];sourceLabel:string;materials:string[];triangles:number;widthM:number}>= [];
    wheel.spin.traverse(obj=>{
      if(!(obj instanceof THREE.Mesh))return;
      const bounds=indexedWorldBounds(obj),s=bounds.getSize(new THREE.Vector3()),p=bounds.getCenter(new THREE.Vector3());
      const partRadius=(s.y+s.z)/4;
      // Full circular surfaces only: spokes, balance weights and lugs are
      // not expected to have a bounding box centered on the hub.
      if(partRadius<radius*.48||partRadius>radius*1.18||Math.abs(s.y-s.z)>partRadius*.28)return;
      const label=String(obj.userData.originalWheelLabel??wheelLabel(obj));
      // Silverado source audit: each measured wheel has one NEUMA tyre,
      // a DARK_GRAY inner assembly and an outer CHROME rim. Only the
      // four observed outer rim primitives qualify; chrome trim elsewhere
      // on the body is never classified by this rule.
      const silveradoRim=id==="chevrolet-silverado-ev-alternative"&&
        /^Object_(9001|21001|13001|27001)_CHROME_0$/i.test(obj.name)&&
        partRadius>=radius*.65&&partRadius<=radius*.85&&
        Math.hypot(p.y-center.y,p.z-center.z)<=.005;
      const kind=/tyre|tire|neumatico|pneu|rubber|caucho|sidewall|thread|tread|(?:^|_)NEUMA(?:_|$)/i.test(label)?"tyre":
        silveradoRim||/rim|rines?|llanta|LOD_A_WHEEL/i.test(label)?"rim":"unidentified";
      parts.push({name:obj.name,kind,radialOffsetM:Math.hypot(p.y-center.y,p.z-center.z),
        radiusM:partRadius,center:p.toArray(),sourceLabel:label,materials:[obj.material].flat().map(m=>m.name),triangles:triangulationCount(obj.geometry),widthM:s.x,...{correctedM:Number(obj.userData.radialCorrectionM??0)}});
    });
    const tyres=parts.filter(p=>p.kind==="tyre"),rims=parts.filter(p=>p.kind==="rim");
    const maxOffsetM=parts.length?Math.max(...parts.map(p=>p.radialOffsetM)):null;
    const pairOffsetM=tyres.length&&rims.length?Math.max(...tyres.flatMap(t=>rims.map(r=>Math.hypot(t.center[1]-r.center[1],t.center[2]-r.center[2])))):null;
    return {corner:wheel.steer.name,radiusM:radius,parts,maxOffsetM,pairOffsetM,
      toleranceM:Math.min(.025,radius*.075),explicitPair:tyres.length>0&&rims.length>0};
  });
  root.userData.wheelAlignment=wheelAlignment;
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
  // Preserve original wheel assignment diagnostics; batch only inside each
  // rigid motion group after material adaptation.
  let renderMeshesBefore=0,renderMeshesAfter=0;
  root.traverse(obj=>{if(obj instanceof THREE.Mesh)renderMeshesBefore++;});
  // Keep tyre/rim/caliper meshes independently inspectable until visual acceptance.
  // V29 production regression: coachwork visibly fragmented on Silverado.
  // Keep original GLB hierarchy, transforms and attributes intact. No
  // destructive geometry merge until source-pose fidelity is verified.
  // Applies to all ten imported models, not only the reported pickup.
  root.traverse(obj=>{if(obj instanceof THREE.Mesh)renderMeshesAfter++;});
  if(silveradoBody.size){
    root.updateMatrixWorld(true);
    let maxMatrixError=0,unchanged=0;
    for(const [mesh,original] of silveradoBody){
      let parent:THREE.Object3D|null=mesh.parent;
      while(parent&&parent!==bodyRoot)parent=parent.parent;
      if(parent!==bodyRoot||mesh.geometry!==original.geometry)throw Error("Silverado: body mesh detached "+mesh.name);
      for(let k=0;k<16;k++)maxMatrixError=Math.max(maxMatrixError,Math.abs(mesh.matrixWorld.elements[k]-original.world.elements[k]));
      unchanged++;
    }
    if(maxMatrixError>1e-6||counts.some(n=>n!==3))throw Error("Silverado: source pose changed");
    root.userData.bodyPoseAudit={unchanged,maxMatrixError,wheelParts:counts};
  }
  root.userData.renderMeshBudget={before:renderMeshesBefore,after:renderMeshesAfter};
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
