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
  get coverage():number {return this.amount.value;}
  update(root: THREE.Object3D, coverage:number, dt:number):void {
    this.amount.value = THREE.MathUtils.clamp(coverage,0,1);
    this.nextScan -= dt;
    if (this.nextScan > 0) return;
    this.nextScan = .5;
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh) || this.assigned.has(o)) return;
      const original = o.material as THREE.Material | THREE.Material[];
      const map = (m:THREE.Material):THREE.Material => {
        if (!(m instanceof THREE.MeshStandardMaterial) || /lamp|light|emissive|headlight|taillight/i.test(m.name) || m.emissiveMap) return m;
        if (this.copies.has(m)) return this.copies.get(m)!;
        const clone=m.clone();
        const glass=m.transparent || (m instanceof THREE.MeshPhysicalMaterial && m.transmission > 0);
        const max=glass ? .50 : .94;
        clone.onBeforeCompile=shader=>{
          shader.uniforms.horizonMud=this.amount;
          shader.vertexShader="varying vec3 vMudLocal;\n"+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvMudLocal=position;");
          shader.fragmentShader="uniform float horizonMud; varying vec3 vMudLocal;\n"+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
            float fleck = fract(sin(dot(floor(vMudLocal*57.0),vec3(12.9898,78.233,39.425)))*43758.5453);
            float patch = 0.5+0.5*sin(vMudLocal.x*17.0+sin(vMudLocal.z*11.0)*3.0+vMudLocal.y*13.0);
            float smear = smoothstep(0.12,0.65,horizonMud*(0.65+patch*0.55+fleck*0.35));
            float mudMix = smear * horizonMud * ${max.toFixed(2)};
            diffuseColor.rgb = mix(diffuseColor.rgb,mix(vec3(.055,.027,.012),vec3(.22,.12,.055),fleck),mudMix);
          `);
        };
        clone.customProgramCacheKey=()=> "horizon-offroad-mud-v1-"+max;
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
