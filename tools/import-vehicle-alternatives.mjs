// Importa cuatro sustitutos 3D existentes, nunca crea geometría genérica.
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
const origin="nutricionistaalmeidavh-spec/assetscarros3d";
const version="3eb0f1afac277d81bca7b7f643de81915ea76965";
const root="https://raw.githubusercontent.com/"+origin+"/"+version+"/";
const dest="Horizon-REA-2026/public/models/external-candidates";
const models=[
 {id:"mercedes-amg-gt-alternative",file:"mercedes-benz-amg-gt.glb",title:"Mercedes Benz AMG GT",author:"Yan Carvalho",kind:"sports",replaces:"mercedes-amg-gt-black-series",variant:"AMG GT estándar; no Black Series"},
 {id:"tesla-roadster-electric-alternative",file:"tesla-roadster.glb",title:"Tesla Roadster 2020",author:"metarex.4d",kind:"sports",replaces:"yangwang-u9",variant:"Deportivo eléctrico Tesla; no Yangwang U9"},
 {id:"ram-3500-alternative",file:"dodge-ram.glb",title:"Dodge Ram 3500",author:"David_Holiday",kind:"pickup",replaces:null,variant:"RAM 3500; no RAM 1500 TRX"},
 {id:"chevrolet-silverado-ev-alternative",file:"chevrolet-silverado.glb",title:"2024 Chevrolet Silverado EV RST",author:"Ddiaz Design",kind:"pickup",replaces:null,variant:"Silverado EV RST; no Silverado Z71"}
];
async function get(path){const response=await fetch(root+path,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error(path+" "+response.status);return Buffer.from(await response.arrayBuffer());}
const credits=(await get("CREDITS.md")).toString("utf8");
const cars=JSON.parse((await get("cars.json")).toString("utf8")).cars??[];
await mkdir(dest,{recursive:true});
const manifestPath=join(dest,"provenance.json");
const manifest=JSON.parse((await readFile(manifestPath)).toString("utf8"));
for(const car of models){
 const credit=credits.split("\n").find(line=>line.includes(String.fromCharCode(96)+car.file+String.fromCharCode(96)));
 if(!credit||!credit.includes(car.title)||!credit.includes(car.author)||!credit.includes("| CC Attribution |")||credit.includes("NonCommercial"))
   throw Error("Atribución/licencia CC BY no coincide: "+car.id);
 if(!cars.some(x=>x.file===car.file))throw Error("Falta catálogo de "+car.id);
 const file=await get("assets/"+car.file);
 if(file.length<1024||file.length>25000000||file.toString("ascii",0,4)!=="glTF"||file.readUInt32LE(4)!==2||file.readUInt32LE(8)!==file.length)throw Error("GLB inválido: "+car.id);
 const n=file.readUInt32LE(12);
 if(file.readUInt32LE(16)!==0x4e4f534a||n+20>file.length)throw Error("JSON chunk inválido: "+car.id);
 const gltf=JSON.parse(file.toString("utf8",20,20+n));
 if(!gltf.meshes?.length||!gltf.nodes?.length)throw Error("No existe malla 3D real: "+car.id);
 const path=join(dest,car.id+".glb");
 await writeFile(path,file);
 await writeFile(join(dest,car.id+"-LICENSE.txt"),credit+"\nRepositorio: https://github.com/"+origin+"/blob/"+version+"/CREDITS.md\nLicencia declarada por redistribuidor, autoría y marcas requieren revisión antes de uso comercial.\n");
 const entry={id:car.id,filename:car.id+".glb",sizeBytes:file.length,sha256:createHash("sha256").update(file).digest("hex"),meshes:gltf.meshes.length,nodes:gltf.nodes.length,
  author:car.author,original:credit.match(/https:\/\/sketchfab\.com\/3d-models\/[^)]+/)?.[0]??null,license:"CC BY declarada por distribuidor",sourceCommit:version,
  variant:car.variant,kind:car.kind,replaces:car.replaces,status:"candidate-not-in-roster",note:"Revisar montaje del vehículo, materiales, cabina, suspensión, derechos y FPS antes de producción."};
 const existing=manifest.findIndex(x=>x.id===car.id);
 if(existing<0)manifest.push(entry);else manifest[existing]=entry;
 console.log(car.id,file.length+" bytes",gltf.meshes.length+" mallas");
}
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\n");
console.log("4 alternativas auténticas en carpeta de candidatos. No están activadas.");
