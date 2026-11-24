import * as THREE from "three";
import type { OffroadSurface } from "../world/offroadPrototype";

/** Persistent mud build-up: no automatic cleaning on dry sections. */
export function accumulateMud(current: number, surface: OffroadSurface | undefined, speed: number, dt: number, contactFraction: number): number {
  if (![current,speed,dt,contactFraction].every(Number.isFinite)) return 0;
  const old = THREE.MathUtils.clamp(current,0,1);
  if (!surface || dt <= 0 || Math.abs(speed) < .3) return old;
  const rate = surface === "puddle" ? .85 : surface === "mud" ? .50 : .025;
  const exposure = rate * Math.min(1,Math.abs(speed)/7) * THREE.MathUtils.clamp(contactFraction,0,1);
  return Math.min(1, old + (1-old)*(-Math.expm1(-exposure*Math.min(dt,.25))));
}

/** Stable PBR-only coating. Preserve geometry, alpha, textures and shader programs.
 * No procedural screen noise, no fragment discard and no per-frame material replacement.
 * Heavy mud is approximated by a smooth dark earthy tint and wet roughness, pending original mud art.
 */
export class PickupMudCoating {
  private amount=0;
  private readonly copies=new Map<THREE.MeshStandardMaterial,Map<number,THREE.MeshStandardMaterial>>();
  private readonly assigned=new Map<THREE.Mesh,{original:THREE.Material|THREE.Material[],coating:THREE.Material|THREE.Material[]}>();
  private readonly tint=new THREE.Color(0x715035);
  private nextScan=0;
  get coverage():number{return this.amount;}
  update(root:THREE.Object3D,coverage:number,dt:number):void{
    if(!Number.isFinite(coverage))return;
    this.amount=THREE.MathUtils.clamp(coverage,0,1);
    if(this.amount<=.001&&this.assigned.size===0)return;
    this.nextScan-=Math.max(0,Number.isFinite(dt)?dt:0);
    if(this.nextScan<=0){
      this.nextScan=2;
      root.updateWorldMatrix(true,true);
      const inverse=root.matrixWorld.clone().invert();
      const rootBounds=new THREE.Box3();
      const bounds=new Map<THREE.Mesh,THREE.Box3>();
      root.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
        if(!o.geometry.boundingBox)return;
        const box=o.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));
        if(box.isEmpty())return;
        bounds.set(o,box);rootBounds.union(box);
      });
      const height=Math.max(.1,rootBounds.max.y-rootBounds.min.y);
      root.traverse(o=>{
        if(!(o instanceof THREE.Mesh)||this.assigned.has(o))return;
        const box=bounds.get(o);
        const relative=box?THREE.MathUtils.clamp((box.getCenter(new THREE.Vector3()).y-rootBounds.min.y)/height,0,1):.5;
        // Wheels, lower panels, middle and upper surfaces collect different amounts.
        // Quantize to three weights to limit material variants per original.
        const zone=relative<.38?1:relative<.68?.76:.42;
        const original=o.material as THREE.Material|THREE.Material[];
        const map=(m:THREE.Material):THREE.Material=>{
          // Never touch windows, lamps, transparent surfaces or emissive details.
          if(!(m instanceof THREE.MeshStandardMaterial)||m.transparent||m.opacity<.99||m.alphaTest>0||
            /glass|window|windscreen|windshield|lamp|light|emissive|headlight|taillight|interior|cabin/i.test(m.name)||
            m.emissiveMap||m.emissiveIntensity*m.emissive.getHex()>0||
            (m instanceof THREE.MeshPhysicalMaterial&&m.transmission>0))return m;
          let zones=this.copies.get(m);if(!zones){zones=new Map();this.copies.set(m,zones);}
          const existing=zones.get(zone);if(existing)return existing;
          const clone=m.clone();zones.set(zone,clone);return clone;
        };
        const coating=Array.isArray(original)?original.map(map):map(original);
        if(Array.isArray(original)?original.every((m,i)=>m===(coating as THREE.Material[])[i]):coating===original)return;
        o.material=coating;this.assigned.set(o,{original,coating});
      });
    }
    // Only standard material uniforms change. Never change alpha, map, normalMap,
    // material side, depth flags, shader definitions or geometry.
    const intensity=THREE.MathUtils.smoothstep(this.amount,0,1)*.88;
    for(const [original,zones] of this.copies)for(const [zone,clone] of zones){
      const mix=intensity*zone;
      clone.color.copy(original.color).lerp(this.tint,mix);
      clone.roughness=THREE.MathUtils.lerp(original.roughness,.83,mix);
      clone.metalness=THREE.MathUtils.lerp(original.metalness,0,mix);
      if(original instanceof THREE.MeshPhysicalMaterial&&clone instanceof THREE.MeshPhysicalMaterial){
        // Keep clearcoat feature enabled when present; change only its weight.
        clone.clearcoat=THREE.MathUtils.lerp(original.clearcoat,original.clearcoat*.28,mix);
        clone.clearcoatRoughness=THREE.MathUtils.lerp(original.clearcoatRoughness,.68,mix);
      }
    }
  }
  dispose():void{
    for(const [mesh,{original,coating}] of this.assigned)if(mesh.material===coating)mesh.material=original;
    for(const zones of this.copies.values())for(const mat of zones.values())mat.dispose();
    this.assigned.clear();this.copies.clear();
  }
}
