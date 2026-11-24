// Read original GLB JSON without modifying source files. Report texture
// encodings and decoded pixel memory separately from compressed disk bytes.
import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
const dir="public/models/external-candidates";
const results=[];
for(const name of (await readdir(dir)).filter(s=>s.endsWith(".glb")).sort()){
  const b=await readFile(dir+"/"+name);
  if(b.toString("ascii",0,4)!=="glTF")throw Error(name+": invalid GLB");
  const n=b.readUInt32LE(12);
  const j=JSON.parse(b.toString("utf8",20,20+n).trim());
  const types={};let embeddedBytes=0;
  for(const i of j.images??[]){
    const type=i.mimeType??(i.uri?.split(".").pop()??"unknown");
    types[type]=(types[type]??0)+1;
    if(i.bufferView!==undefined)embeddedBytes+=j.bufferViews[i.bufferView]?.byteLength??0;
  }
  results.push({name,glbBytes:b.length,embeddedImageBytes:embeddedBytes,
    images:j.images?.length??0,textures:j.textures?.length??0,materials:j.materials?.length??0,
    encodings:types,extensions:j.extensionsUsed??[],basisTextures:(j.textures??[]).filter(t=>t.extensions?.KHR_texture_basisu).length});
}
if(results.length<10)throw Error("Expected ten source GLBs");
await mkdir("review/quality",{recursive:true});
await writeFile("review/quality/v28-texture-inventory.json",JSON.stringify(results,null,2));
console.log("V28_TEXTURE_INVENTORY",JSON.stringify(results));
