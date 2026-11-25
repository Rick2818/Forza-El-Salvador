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

/** Per-vehicle material clones; original texture maps and geometry unchanged.
 * This procedural surface layer is an engineering candidate, not final art.
 */
export class PickupMudCoating {
  private readonly amount = {value:0};
  private readonly copies = new Map<THREE.Material, THREE.Material>();
  private readonly assigned = new Map<THREE.Mesh, {original: THREE.Material | THREE.Material[], coating: THREE.Material | THREE.Material[]}>();
  private nextScan = 0;
  constructor(private readonly webgpu=false){}
  get coverage():number {return this.amount.value;}
  update(root: THREE.Object3D, coverage:number, dt:number):void {
    this.amount.value = THREE.MathUtils.clamp(coverage,0,1);
    if(this.webgpu)for(const [original,clone] of this.copies){
      if(original instanceof THREE.MeshStandardMaterial && clone instanceof THREE.MeshStandardMaterial){clone.color.copy(original.color).lerp(new THREE.Color(0x4a301c),this.amount.value*.68);clone.roughness=THREE.MathUtils.lerp(original.roughness,.88,this.amount.value*.55);}
    }
    // Keep approved materials untouched until actual mud is accumulated.
    if (this.amount.value <= .001 && this.assigned.size === 0) return;
    this.nextScan -= dt;
    if (this.nextScan > 0) return;
    this.nextScan = .5;
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh) || this.assigned.has(o)) return;
      const original = o.material as THREE.Material | THREE.Material[];
      const map = (m:THREE.Material):THREE.Material => {
        if (!(m instanceof THREE.MeshStandardMaterial) || /lamp|light|emissive|headlight|taillight/i.test(m.name) || m.emissiveMap) return m;
        if (this.copies.has(m)) return this.copies.get(m)!;
        // Keep windows, lights and interior materials intact.
        if (m.transparent || m.opacity < .99 || /glass|window|windscreen|windshield|interior|dashboard|seat|mirror|chrome/i.test(m.name) || (m instanceof THREE.MeshPhysicalMaterial && m.transmission > 0)) return m;
        const clone=m.clone();
        if(this.webgpu){clone.color.lerp(new THREE.Color(0x4a301c),this.amount.value*.68);clone.roughness=THREE.MathUtils.lerp(m.roughness,.88,this.amount.value*.55);this.copies.set(m,clone);return clone;}
        const max=.58;
        clone.onBeforeCompile=shader=>{
          shader.uniforms.horizonMud=this.amount;
          shader.vertexShader="varying vec3 vMudLocal;\n"+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvMudLocal=position;");
          shader.fragmentShader="uniform float horizonMud; varying vec3 vMudLocal;\n"+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
            // Continuous, low-frequency streaks: no hash/floor speckle or hard pixels.
            vec3 mudPos = vMudLocal;
            float mudPattern = .5 + .5*sin(dot(mudPos,vec3(2.8,1.4,2.2)) + .65*sin(dot(mudPos,vec3(4.1,-.9,3.0))));
            float mudStreak = .5 + .5*sin(dot(mudPos,vec3(7.0,1.2,-4.0)));
            float smear = smoothstep(.25,.82,horizonMud*(.65+.38*mudPattern+.16*mudStreak));
            float mudMix = smear * horizonMud * ${max.toFixed(2)};
            diffuseColor.rgb = mix(diffuseColor.rgb,mix(vec3(.065,.032,.015),vec3(.15,.075,.032),mudPattern),mudMix);
          `);
        };
        clone.customProgramCacheKey=()=> "horizon-offroad-mud-v3-"+max;
        this.copies.set(m,clone);
        return clone;
      };
      const coating=Array.isArray(original)?original.map(map):map(original);
      o.material=coating;
      this.assigned.set(o,{original,coating});
    });
  }
  dispose():void {
    for(const [mesh,{original,coating}] of this.assigned) if(mesh.material===coating) mesh.material=original;
    for(const mat of this.copies.values()) mat.dispose();
    this.assigned.clear();this.copies.clear();
  }
}
