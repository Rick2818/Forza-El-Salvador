#!/usr/bin/env node
/**
 * V20 quality gate. Distinguishes the exact intended ten vehicle variants from
 * the unrelated third-party substitutes currently on the public roster.
 *
 * --strict: fail unless all ten physical GLBs and review approvals are present.
 * Default: audit-only report, never advertises an unapproved asset as ready.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const project=resolve(import.meta.dirname,"..");
const manifest=JSON.parse(readFileSync(resolve(project,"replacements/v20-targets.json"),"utf8"));
const roster=readFileSync(resolve(project,"src/vehicle/externalRoster.ts"),"utf8");
const active=[...roster.matchAll(/\bid:"([^"]+)"/g)].map(m=>m[1]);
const expected=manifest.vehicles;
if(expected.length!==10 || new Set(expected.map(v=>v.id)).size!==10) {
  throw new Error("El inventario objetivo debe contener exactamente 10 identificadores únicos");
}
function inspectGlb(path) {
  const binary=readFileSync(path);
  if(binary.length<128 || binary.toString("ascii",0,4)!=="glTF" ||
     binary.readUInt32LE(4)!==2 || binary.readUInt32LE(8)!==binary.length)
    throw Error("GLB no válido");
  const size=binary.readUInt32LE(12);
  if(binary.toString("ascii",16,20)!=="JSON")throw Error("Falta chunk JSON");
  const data=JSON.parse(binary.subarray(20,20+size).toString("utf8"));
  const names=[...(data.nodes??[]),...(data.meshes??[])].map(n=>(n.name??"").toLowerCase());
  const nodes=(data.nodes??[]).map(n=>n.name);
  return {
    nodes:nodes.length,meshes:(data.meshes??[]).length,
    wheels:["wheel_fr","wheel_fl","wheel_rr","wheel_rl"].filter(x=>nodes.includes(x)),
    cabin:names.some(n=>/interior|cockpit|dashboard|seat|steering|asiento/.test(n)),
    underbody:names.some(n=>/chassis|suspension|underbody|undercarriage|axle|diffuser|floorpan/.test(n))
  };
}
const rows=expected.map(v=>{
  const reasons=[];
  if(!active.includes(v.id))reasons.push("el ID exacto no está en el catálogo activo");
  const file=resolve(project,v.asset_path);
  let inspection=null;
  if(!existsSync(file))reasons.push("falta el GLB objetivo: "+v.asset_path);
  else {
    try{
      inspection=inspectGlb(file);
      if(inspection.wheels.length!==4)reasons.push("faltan pivotes independientes");
      if(!inspection.cabin)reasons.push("interior no demostrado");
      if(!inspection.underbody)reasons.push("bajos no demostrados");
    }catch(e){reasons.push(String(e));}
  }
  for(const key of ["assetImported","rightsReviewed","geometryApproved","physicsApproved","runtimeFpsApproved"]) {
    if(v[key]!==true)reasons.push("aprobación pendiente: "+key);
  }
  return {id:v.id,ready:reasons.length===0,reasons,inspection};
});
const ready=rows.filter(x=>x.ready).length;
console.log(JSON.stringify({
  milestone:"V20 - fidelidad exacta de 10 vehículos",ready,target:10,
  activeIds:active,expectedIds:expected.map(x=>x.id),
  substitutions:active.filter(id=>!expected.some(v=>v.id===id)),
  results:rows
},null,2));
if(process.argv.includes("--strict")&&ready!==10)process.exitCode=1;
