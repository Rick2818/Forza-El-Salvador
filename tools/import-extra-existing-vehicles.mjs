import {mkdir,readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
const REV="3eb0f1afac277d81bca7b7f643de81915ea76965";
const SOURCE="https://raw.githubusercontent.com/nutricionistaalmeidavh-spec/assetscarros3d/"+REV+"/";
const DEST="Horizon-REA-2026/public/models/external-candidates";
const models=[
 ["porsche-911-c4s","porsche-911-c4s.glb","Porsche 911 C4S 2020 Aerokit","JK3Dstudios"],
 ["bugatti-chiron-profilee","bugatti-chiron.glb","2023 Bugatti Chiron Profilee","DisneyCars"],
 ["koenigsegg-jesko","koenigsegg-jesko.glb","2020 Koenigsegg Jesko","Ddiaz Design"],
 ["ford-f150-raptor-police","ford-f150-raptor.glb","Ford F150 Raptor Police","Vehsource"]
];
async function get(path){
 const r=await fetch(SOURCE+path,{signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw Error(path+" HTTP "+r.status);
 return Buffer.from(await r.arrayBuffer());
}
const credits=(await get("CREDITS.md")).toString("utf8");
await mkdir(DEST,{recursive:true});
const manifestPath=join(DEST,"provenance.json");
const manifest=JSON.parse((await readFile(manifestPath)).toString("utf8"));
for(const [id,file,model,author] of models){
 const line=credits.split("\n").find(s=>s.includes(String.fromCharCode(96)+file+String.fromCharCode(96)));
 if(!line||!line.includes(model)||!line.includes(author)||!line.includes("| CC Attribution |")||line.includes("ShareAlike")||line.includes("NonCommercial"))
   throw Error(id+": atribución/licencia no verificable");
 const buffer=await get("assets/"+file);
 if(buffer.length<1024||buffer.length>25000000||buffer.toString("ascii",0,4)!=="glTF"||buffer.readUInt32LE(4)!==2||buffer.readUInt32LE(8)!==buffer.length)
   throw Error(id+": GLB inválido");
 const n=buffer.readUInt32LE(12);
 if(buffer.readUInt32LE(16)!==0x4e4f534a||n+20>buffer.length)throw Error(id+": JSON GLB inválido");
 const data=JSON.parse(buffer.toString("utf8",20,20+n));
 if(!data.meshes?.length||!data.nodes?.length)throw Error(id+": mallas vacías");
 await writeFile(join(DEST,id+".glb"),buffer);
 await writeFile(join(DEST,id+"-LICENSE.txt"),line+"\nReferencia: https://github.com/nutricionistaalmeidavh-spec/assetscarros3d/blob/"+REV+"/CREDITS.md\nCC BY (declarada); verificar derechos antes de uso comercial.\n");
 const item={id,filename:id+".glb",sizeBytes:buffer.length,sha256:createHash("sha256").update(buffer).digest("hex"),meshes:data.meshes.length,nodes:data.nodes.length,
  author,license:"CC BY declarada",sourceCommit:REV,status:"candidate-not-in-roster",note:"Aún por validar ruedas, bajo, interior, variante y FPS."};
 const i=manifest.findIndex(x=>x.id===id);
 if(i<0)manifest.push(item);else manifest[i]=item;
 console.log(id,item.sizeBytes,item.meshes,item.nodes);
}
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\n");
