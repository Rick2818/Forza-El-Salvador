import * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type WheelSet = "original" | "ferrari" | "jesko";
export type PaintHex = string;

const DONOR_IDS: Record<Exclude<WheelSet,"original">,string> = {
  ferrari: "ferrari-f430",
  jesko: "koenigsegg-jesko"
};
const BODY_PATTERN = /exterior_mm_ext|paint|carrosserie|car_?body|bodypaint|^body$|color1mtl|vehicle_generic_smallspecmap__paint/i;
const NON_PAINT = /wheel|tire|tyre|rim|glass|window|windscreen|headlight|taillight|interior|seat|dashboard|undercarriage|chassis|brake|caliper|rotor|spoiler|mirror|plastic|steer|carbon/i;
const SAVED_PREFIX = "horizon.gallery.custom.";

export const PAINTS = ["#E5222D","#161B21","#135BBD","#EFAB35","#F5F7FA","#676C77","#168A65"] as const;
export const WHEEL_SETS: readonly WheelSet[] = ["original","ferrari","jesko"] as const;
export interface VehicleFinish { paint:string; wheels:WheelSet; }
export const DEFAULT_FINISH: VehicleFinish = {paint:"#E5222D",wheels:"original"};

export function isBodyPaintMesh(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const descriptor = [
    mesh.name,
    mesh.parent?.name ?? "",
    ...materials.map(m=>m.name)
  ].join(" ").toLowerCase();
  if (NON_PAINT.test(descriptor) && !BODY_PATTERN.test(descriptor)) return false;
  return BODY_PATTERN.test(descriptor) || /^object_\d+$/.test(mesh.name.toLowerCase())
    && /^body/i.test(mesh.parent?.name ?? "");
}

/** Alters only identified body panels. The original GLB meshes remain intact. */
export function tintVehicleBody(car: THREE.Object3D, hex: string): number {
  const color = hex === "original" ? null : new THREE.Color(hex);
  let count=0;
  car.traverse(obj=>{
    if (!(obj instanceof THREE.Mesh) || !isBodyPaintMesh(obj)) return;
    const original = Array.isArray(obj.material)?obj.material:[obj.material];
    if(!obj.userData.horizonOriginalPaint)obj.userData.horizonOriginalPaint=original;
    const stored = obj.userData.horizonOriginalPaint as THREE.Material[];
    if(hex === "original") {
      const previous = Array.isArray(obj.material) ? obj.material : [obj.material];
      previous.forEach(material => { if(!stored.includes(material)) material.dispose(); });
      obj.material=stored.length===1?stored[0]:stored;
      count++; return;
    }
    const replacements=stored.map(material=>{
      const copy=material.clone();
      if(copy instanceof THREE.MeshStandardMaterial){
        if(color)copy.color.copy(color);
        copy.metalness=Math.max(copy.metalness,0.18);
        copy.roughness=Math.min(copy.roughness,0.45);
        if(copy instanceof THREE.MeshPhysicalMaterial){
          copy.clearcoat=Math.max(copy.clearcoat,0.45);
          copy.clearcoatRoughness=Math.min(copy.clearcoatRoughness,0.3);
        }
      }
      return copy;
    });
    const old=Array.isArray(obj.material)?obj.material:[obj.material];
    old.forEach(material=>{if(!stored.includes(material))material.dispose();});
    obj.material=replacements.length===1?replacements[0]:replacements;
    count++;
  });
  return count;
}

function safeRead(id:string): VehicleFinish {
  try {
    const saved=JSON.parse(localStorage.getItem(SAVED_PREFIX+id)??"null");
    const wheels:WheelSet=WHEEL_SETS.includes(saved?.wheels)?saved.wheels:"original";
    const paint=typeof saved?.paint==="string" && /^#[0-9a-f]{6}$/i.test(saved.paint)
      ? saved.paint : "original";
    return {paint,wheels};
  }catch{return {paint:"original",wheels:"original"};}
}
function safeSave(id:string,finish:VehicleFinish): void {
  try{localStorage.setItem(SAVED_PREFIX+id,JSON.stringify(finish));}catch{/* optional */}
}

type RimDonor={parts:THREE.Mesh[];center:THREE.Vector3;radius:number};
function wheelMeshes(scene:THREE.Object3D): THREE.Mesh[] {
  const parts:THREE.Mesh[]=[];
  scene.traverse(object=>{
    if (!(object instanceof THREE.Mesh))return;
    const name=object.name.toLowerCase();
    if (/lod_a_wheel_mm_wheel/i.test(name))parts.push(object);
  });
  return parts;
}
function prepareWheelSource(gltf:THREE.Object3D): RimDonor {
  gltf.updateMatrixWorld(true);
  const rims=wheelMeshes(gltf);
  if(!rims.length)throw Error("El modelo donante no tiene aros 3D separados.");
  const first=rims[0], center=new THREE.Box3().setFromObject(first).getCenter(new THREE.Vector3());
  const box=new THREE.Box3().setFromObject(first);
  const size=box.getSize(new THREE.Vector3());
  const radius=Math.max(size.y,size.z)/2;
  if(radius<0.001)throw Error("La llanta del donante tiene un tamaño inválido.");
  const candidates:THREE.Mesh[]=[];
  gltf.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const name=node.name.toLowerCase();
    if(!/lod_a_(wheel|tyre)_mm_/i.test(name))return;
    const partBox=new THREE.Box3().setFromObject(node);
    const partCenter=partBox.getCenter(new THREE.Vector3());
    if(partCenter.distanceTo(center) < radius*.65)candidates.push(node);
  });
  return {parts:candidates.length?candidates:[first],center,radius};
}
function findPositions(scene:THREE.Object3D,dimensions:THREE.Vector3,kind:"sport"|"pickup"):THREE.Vector3[]{
  const overall = new THREE.Box3().setFromObject(scene);
  const center = overall.getCenter(new THREE.Vector3());
  const candidates:THREE.Vector3[]=[];
  scene.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const n=node.name.toLowerCase();
    if(!/wheel|tyre|tire|neumatico/i.test(n)||/steer/i.test(n))return;
    const box=new THREE.Box3().setFromObject(node);
    const bounds=box.getSize(new THREE.Vector3());
    if(bounds.length()<.05||Math.max(bounds.x,bounds.z)>dimensions.z*.45)return;
    const hub=box.getCenter(new THREE.Vector3());
    if(candidates.some(p=>p.distanceTo(hub)<.24))return;
    candidates.push(hub);
  });
  if(candidates.length>=4){
    // Keep only one measured wheel position per vehicle quadrant.
    const quad=[[-1,1],[1,1],[-1,-1],[1,-1]];
    const selected=quad.map(([sx,sz])=>candidates
      .filter(p=>Math.sign(p.x-center.x)===sx&&Math.sign(p.z-center.z)===sz)
      .sort((a,b)=>Math.abs(b.x-center.x)-Math.abs(a.x-center.x))[0]);
    if(selected.every((p):p is THREE.Vector3 => p !== undefined))return selected;
  }
  const radius=kind==="pickup"?Math.max(.39,Math.min(dimensions.y*.29,.74))
                              :Math.max(.28,Math.min(dimensions.y*.30,.50));
  const width=dimensions.x*.48, axle=dimensions.z*.30;
  return [
    new THREE.Vector3(-width,radius,axle),
    new THREE.Vector3(width,radius,axle),
    new THREE.Vector3(-width,radius,-axle),
    new THREE.Vector3(width,radius,-axle)
  ];
}

export class GalleryCustomizer{
  private car:THREE.Group|null=null;
  private id="";
  private kind:"sport"|"pickup"="sport";
  private finish:VehicleFinish={paint:"original",wheels:"original"};
  private overlay:THREE.Group|null=null;
  private generation=0;
  private donors=new Map<string,Promise<RimDonor>>();
  constructor(private readonly scene:THREE.Scene,private readonly loader:GLTFLoader){}
  attach(group:THREE.Group,id:string,kind:"sport"|"pickup"):void{
    this.clearWheels();
    this.car=group;this.id=id;this.kind=kind;
    this.finish=safeRead(id);
    this.setPaint(this.finish.paint);
    void this.setWheels(this.finish.wheels);
    this.renderControls();
  }
  dispose():void {this.generation++;this.clearWheels();this.car=null;}
  get state():VehicleFinish{return {...this.finish};}
  setPaint(hex:string):void{
    if(!this.car)return;
    if(hex!=="original"&&!/^#[0-9a-f]{6}$/i.test(hex))return;
    const count=tintVehicleBody(this.car,hex);
    this.finish.paint=hex;
    safeSave(this.id,this.finish);
    const result=document.getElementById("finish-status");
    if(result)result.textContent=count>0
      ? "Color aplicado a "+count+" paneles identificados."
      : "La pintura de este GLB está integrada en texturas: cambio parcial o no disponible.";
    this.renderControls();
  }
  private async donor(style:Exclude<WheelSet,"original">):Promise<RimDonor>{
    const id=DONOR_IDS[style];
    let task=this.donors.get(id);
    if(!task){
      task=this.loader.loadAsync(import.meta.env.BASE_URL+"models/external-candidates/"+id+".glb")
        .then(x=>prepareWheelSource(x.scene));
      this.donors.set(id,task);
    }
    return task;
  }
  async setWheels(style:WheelSet):Promise<void>{
    if(!this.car||!WHEEL_SETS.includes(style))return;
    const token=++this.generation;
    this.finish.wheels=style;
    safeSave(this.id,this.finish);
    this.clearWheels();
    this.renderControls();
    const result=document.getElementById("finish-status");
    if(style==="original"){
      if(result)result.textContent="Llantas originales del archivo GLB restauradas.";
      return;
    }
    if(result)result.textContent="Montando juego 3D real de llantas...";
    try{
      const rim=await this.donor(style);
      if(token!==this.generation||!this.car)return;
      const body=new THREE.Box3().setFromObject(this.car);
      const dimensions=body.getSize(new THREE.Vector3());
      const centers=findPositions(this.car,dimensions,this.kind);
      const targetRadius=this.kind==="pickup"?Math.max(.39,Math.min(dimensions.y*.29,.74))
                                           :Math.max(.28,Math.min(dimensions.y*.30,.5));
      const ratio=targetRadius/rim.radius;
      const group=new THREE.Group();
      group.name="horizon-custom-3d-wheels";
      for(const hub of centers){
        const wheel=new THREE.Group();
        wheel.position.copy(hub);
        wheel.scale.setScalar(ratio);
        for(const part of rim.parts){
          const mesh=part.clone();
          mesh.geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);
          mesh.geometry.translate(-rim.center.x,-rim.center.y,-rim.center.z);
          mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);
          mesh.material=Array.isArray(part.material)?part.material.map(x=>x.clone()):part.material.clone();
          mesh.castShadow=true;
          wheel.add(mesh);
        }
        group.add(wheel);
      }
      this.scene.add(group);this.overlay=group;
      if(result)result.textContent="Juego de llantas 3D montado. Posiciones aproximadas; inspección visual pendiente.";
    }catch(error){
      if(token!==this.generation)return;
      this.finish.wheels="original";safeSave(this.id,this.finish);this.renderControls();
      if(result)result.textContent="Este juego de llantas no se pudo montar: "+String(error);
    }
  }
  private clearWheels():void{
    if(!this.overlay)return;
    this.scene.remove(this.overlay);
    this.overlay.traverse(obj=>{
      if(!(obj instanceof THREE.Mesh))return;
      obj.geometry.dispose();
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      materials.forEach(m=>m.dispose());
    });
    this.overlay=null;
  }
  private renderControls():void {
    for(const b of document.querySelectorAll<HTMLButtonElement>("[data-wheelset]")){
      b.classList.toggle("selected",b.dataset.wheelset===this.finish.wheels);
      b.setAttribute("aria-pressed",String(b.dataset.wheelset===this.finish.wheels));
    }
    for(const b of document.querySelectorAll<HTMLButtonElement>("[data-paint]")){
      b.classList.toggle("selected",b.dataset.paint===this.finish.paint);
      b.setAttribute("aria-pressed",String(b.dataset.paint===this.finish.paint));
    }
    const input=document.getElementById("custom-paint") as HTMLInputElement|null;
    if(input && this.finish.paint!=="original")input.value=this.finish.paint;
  }
}
