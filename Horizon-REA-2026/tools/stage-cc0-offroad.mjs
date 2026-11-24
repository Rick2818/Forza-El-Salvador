import {mkdir,writeFile,rename} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import assert from "node:assert/strict";

// Explicitly CC0 alternatives, not the purchased Fab scans. No production
// integration until local maps and their rendered appearance have been reviewed.
const assets=[
 {id:"muddy_tracks",author:"Amal Kumar",source:"https://polyhaven.com/a/muddy_tracks"},
 {id:"mud_forest",author:"eye-candy.xyz",source:"https://polyhaven.com/a/mud_forest"}
];
const output=process.env.OFFROAD_STAGE_DIR??"quality-evidence/cc0-pbr";
await mkdir(output,{recursive:true});
const manifest=[];
for(const asset of assets){
 const headers={"User-Agent":"Horizon-El-Salvador/31 (PBR asset preflight)"};
 const res=await fetch("https://api.polyhaven.com/files/"+asset.id,{headers,signal:AbortSignal.timeout(30000)});
 assert.ok(res.ok,asset.id+": asset metadata HTTP "+res.status);
 const metadata=await res.json();
 for(const kind of ["diff","nor_gl","rough"]){
  const aliases={diff:["diff","diffuse","albedo"],nor_gl:["nor_gl","normal_gl"],rough:["rough","roughness"]}[kind];
  const key=aliases.find(k=>metadata[k]?.["2k"]);
  const variants=metadata[key]?.["2k"];
  console.log(asset.id,kind,"available maps",Object.keys(metadata),"selected",key,"formats",Object.keys(variants??{}));
  const entry=variants?.jpg??variants?.png;
  assert.ok(entry?.url&&entry?.md5,asset.id+" missing verified 2K "+kind);
  const url=new URL(entry.url);
  assert.equal(url.protocol,"https:");
  assert.ok(url.hostname==="polyhaven.com"||url.hostname.endsWith(".polyhaven.com")||url.hostname==="dl.polyhaven.org");
  const result=await fetch(url,{headers,signal:AbortSignal.timeout(90000)});
  assert.ok(result.ok,asset.id+" "+kind+" HTTP "+result.status);
  const bytes=Buffer.from(await result.arrayBuffer());
  assert.ok(bytes.length>1000&&bytes.length<=16*1024*1024);
  const md5=createHash("md5").update(bytes).digest("hex");
  assert.equal(md5,entry.md5,asset.id+" "+kind+" integrity mismatch");
  const ext=variants.jpg?"jpg":"png",name=asset.id+"-"+kind+"."+ext;
  await writeFile(join(output,name+".tmp"),bytes);
  await rename(join(output,name+".tmp"),join(output,name));
  manifest.push({...asset,license:"CC0",kind,resolution:"2k",file:name,url:url.href,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
 }
}
await writeFile(join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Staged six verified PBR maps; visual and mobile approval still required.");
