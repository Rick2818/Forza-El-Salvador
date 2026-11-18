import fs from "node:fs";
import path from "node:path";
const [root, stage] = process.argv.slice(2);
if (!root || !stage) throw new Error("Uso: node prepare-ruby-integration.mjs ROOT STAGE");
function read(file) { return fs.readFileSync(path.join(root,file),"utf8"); }
function write(file,content) {
  const dest=path.join(stage,file);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,content,"utf8");
}
let main=read("src/main.ts");
if (!main.includes('from "./vehicle/convertibleAsset"')) {
  main='import { preloadConvertible } from "./vehicle/convertibleAsset";\n'+main;
  const anchor='progress(34, "Cargando carrocerías de Blender…");';
  if (!main.includes(anchor)) throw new Error("main.ts cambio: no se encuentra el punto de carga. No se modifico ningun archivo.");
  main=main.replace(anchor,anchor+"\n  await preloadConvertible();");
}
write("src/main.ts",main);
let car=read("src/vehicle/carModel.ts");
if (!car.includes('from "./convertibleAsset"')) {
  car='import { createConvertibleVisual } from "./convertibleAsset";\n'+car;
  const anchor="export function createCarVisual(opts: CarOptions): CarVisual {";
  if (!car.includes(anchor)) throw new Error("carModel.ts cambio: no se encuentra la funcion del carro.");
  car=car.replace(anchor,anchor+`
  if (opts.isPlayer) {
    try {
      const convertible = createConvertibleVisual(BODY_CENTER_Y);
      if (convertible) return convertible;
    } catch (error) {
      console.warn("[Horizon] Modelo rubi incompatible; se conserva el anterior.", error);
    }
  }
`);
}
if (!/export\s+(type|enum)\s+Silhouette\b/.test(car)) {
  car += '\nexport type Silhouette = "coupe" | "muscle" | "rally";\n';
}
write("src/vehicle/carModel.ts",car);
let race=read("src/race/race.ts");
if (!/export\s+(type|enum)\s+Difficulty\b/.test(race)) {
  race += '\nexport type Difficulty = "facil" | "normal" | "dificil";\n';
}
write("src/race/race.ts",race);
console.log("Parches preparados; los originales aun no se han reemplazado.");
