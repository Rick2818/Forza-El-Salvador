import * as THREE from "three";
type Maps={map:THREE.Texture;normalMap:THREE.Texture;roughnessMap:THREE.Texture};
let maps:{road:Maps;forest:Maps}|undefined;
export async function preloadOffroadPbr():Promise<void>{
 const loader=new THREE.TextureLoader();
 async function load(id:string,kind:string){
  const t=await loader.loadAsync(import.meta.env.BASE_URL+"scenery/offroad-pbr/"+id+"-"+kind+".webp");
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;t.colorSpace=kind==="diff"?THREE.SRGBColorSpace:THREE.NoColorSpace;return t;
 }
 async function material(id:string):Promise<Maps>{const [map,normalMap,roughnessMap]=await Promise.all(["diff","nor_gl","rough"].map(k=>load(id,k)));return {map,normalMap,roughnessMap};}
 const [road,forest]=await Promise.all([material("muddy_tracks"),material("mud_forest")]);maps={road,forest};
}
export function offroadPbr(kind:"road"|"forest"):Maps|undefined{return maps?.[kind];}
