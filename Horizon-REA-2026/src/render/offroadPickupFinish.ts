import * as THREE from "three";
/** Materials are already cloned per vehicle. Only called by El Imposible.
 * Preserve authored textures and avoid accidentally treating lamps as paint. */
export function applyOffroadPickupFinish(root:THREE.Object3D):void{
 const done=new Set<THREE.Material>();
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(done.has(m)||!(m instanceof THREE.MeshStandardMaterial))continue;
   done.add(m);
   const label=m.name+" "+o.name;
   const glass=/glass|window|windshield|windscreen|glazing|vitrage|vidrio|cristal/i.test(label);
   const lamp=/lamp|light|emissive|faro|headlight|taillight/i.test(label)||!!m.emissiveMap;
   if(glass){m.transparent=true;m.opacity=.18;m.depthWrite=false;if(m instanceof THREE.MeshPhysicalMaterial)m.transmission=0;m.envMapIntensity=.06;}
   else if(!lamp&&m.alphaTest===0&&!m.alphaMap){
    m.transparent=false;m.opacity=1;m.depthWrite=true;m.envMapIntensity=Math.min(m.envMapIntensity,.12);
    if(m instanceof THREE.MeshPhysicalMaterial){m.transmission=0;m.clearcoat=Math.min(m.clearcoat,.25);m.clearcoatRoughness=Math.max(m.clearcoatRoughness,.28);}
    if(/paint|body|bodyshell|carrosserie|color1mtl|exterior_mm_ext/i.test(label)&&!/wheel|tyre|tire|rim|interior|plastic|seat|chrome|mirror|brake/i.test(label)){
     m.metalness=Math.min(m.metalness,.38);m.roughness=THREE.MathUtils.clamp(m.roughness,.36,.65);
    }
   }
   m.needsUpdate=true;
  }
 });
}
