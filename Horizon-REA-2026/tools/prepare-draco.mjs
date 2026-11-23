// Copia el decodificador Draco requerido por algunos GLB reales.
import {mkdirSync,copyFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
const src=resolve("node_modules/three/examples/jsm/libs/draco/gltf");
const dest=resolve("public/model-draco");
mkdirSync(dest,{recursive:true});
for(const f of ["draco_wasm_wrapper.js","draco_decoder.wasm","draco_decoder.js"]){
 if(!existsSync(resolve(src,f)))throw Error("Decoder Draco faltante: "+f);
 copyFileSync(resolve(src,f),resolve(dest,f));
}
console.log("Decodificador Draco disponible sin CDN externo.");
