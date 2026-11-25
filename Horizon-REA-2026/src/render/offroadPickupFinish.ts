import * as THREE from "three";
/** Materials are already cloned per vehicle. Only called by El Imposible.
 * Preserve authored textures and avoid accidentally treating lamps as paint. */
export function applyOffroadPickupFinish(root:THREE.Object3D,bodyColor?:THREE.Color,vehicleId?:string):void{
 // RAM source export has generic names. Only the observed untextured
 // silver shell candidate qualifies, and only when its bounds span the
 // coachwork. Never select wheel, textured or small trim primitives.
 root.updateMatrixWorld(true);
 const overall=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
 const ramShell=(o:THREE.Mesh,m:THREE.MeshStandardMaterial)=>{
  if(vehicleId!=="ram-3500-alternative"||o.name!=="Object_2"||
   m.name!=="1___Default"||m.map||m.emissiveMap||
   !/dodge_ramobjcleanermaterialmergergles/i.test(o.parent?.name??""))return false;
  const s=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  return overall.x>0&&overall.z>0&&s.x>=overall.x*.55&&s.z>=overall.z*.50;
 };
 const done=new Set<THREE.Material>();let painted=0;
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(done.has(m)||!(m instanceof THREE.MeshStandardMaterial))continue;
   done.add(m);
   const label=m.name+" "+o.name;
   const glass=/glass|window|windshield|windscreen|glazing|vitrage|vidrio|cristal/i.test(label);
   const lamp=/lamp|light|emissive|faro|headlight|taillight/i.test(label)||!!m.emissiveMap;
   if(glass){m.transparent=true;m.opacity=.18;m.depthWrite=false;if(m instanceof THREE.MeshPhysicalMaterial)m.transmission=0;m.envMapIntensity=.06;}
   else if(!lamp){
    const paint=ramShell(o,m)||(/paint|body|bodyshell|carrosserie|color1mtl|exterior_mm_ext/i.test(label)&&!/wheel|tyre|tire|rim|interior|plastic|seat|chrome|mirror|brake|badge|emblem/i.test(label));
    if(!paint&&(m.alphaTest>0||m.alphaMap))continue;
    m.transparent=false;m.opacity=1;m.depthWrite=true;m.envMapIntensity=Math.min(m.envMapIntensity,.12);
    if(m instanceof THREE.MeshPhysicalMaterial){m.transmission=0;m.clearcoat=Math.min(m.clearcoat,.25);m.clearcoatRoughness=Math.max(m.clearcoatRoughness,.28);}
    if(paint){
     painted++;if(bodyColor)m.color.copy(bodyColor);
     m.map=null;m.alphaMap=null;m.alphaTest=0;m.vertexColors=false;
     m.emissive.set(0);m.emissiveIntensity=0;m.metalness=.16;m.roughness=.48;m.envMapIntensity=.07;
     if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=.18;m.clearcoatRoughness=.38;}
    }
   }
   m.needsUpdate=true;
  }
 });
 root.userData.offroadOpaquePaintMaterials=painted;
}
