#!/usr/bin/env node
/**
 * Vehicle replacement intake: audits actual binary GLB files before any
 * existing car can be replaced. Does NOT modify the game or enable assets.
 * Usage:
 *   node tools/audit-replacement-models.mjs --available
 *   node tools/audit-replacement-models.mjs --release
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const project = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(project, "replacements/manifest.json"), "utf8"));
const strict = process.argv.includes("--release");
let failed = false;

function inspectGlb(filename) {
  const b = readFileSync(filename);
  if (b.byteLength < 128 || b.toString("ascii", 0, 4) !== "glTF") {
    throw new Error("Formato inválido: se requiere GLB binario");
  }
  if (b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) {
    throw new Error("Cabecera glTF 2.0 o longitud incorrecta");
  }
  const jsonSize = b.readUInt32LE(12);
  if (b.toString("ascii", 16, 20) !== "JSON") throw new Error("Sin sección JSON de glTF");
  const gltf = JSON.parse(b.subarray(20, 20 + jsonSize).toString("utf8"));
  const nodes = (gltf.nodes ?? []).map(n => n.name ?? "");
  const meshes = (gltf.meshes ?? []).map(m => m.name ?? "");
  const names = [...nodes, ...meshes];
  const triangles = (gltf.meshes ?? []).reduce((count, mesh) => count +
    (mesh.primitives ?? []).reduce((n, p) => {
      const a = (gltf.accessors ?? [])[p.indices ?? p.attributes?.POSITION];
      return n + (p.mode === undefined || p.mode === 4 ? Math.floor((a?.count ?? 0) / 3) : 0);
    }, 0), 0);
  const test = pattern => names.some(n => pattern.test(n));
  const wheels = ["wheel_fr", "wheel_fl", "wheel_rr", "wheel_rl"].filter(n => nodes.includes(n));
  return {
    bytes:b.length, triangles, meshes:meshes.length,
    wheels, interior:test(/interior|cockpit|dashboard|steering|seat|asiento|tablero/i),
    underbody:test(/under.?body|under.?floor|chassis|diffuser|suspension|axle|differential|floor.?pan|exhaust|subframe|escape|bajos/i)
  };
}

const standalone = process.argv.indexOf("--file");
if (standalone >= 0) {
  const file = process.argv[standalone + 1];
  if (!file) throw new Error("Falta ruta tras --file");
  const stats = inspectGlb(resolve(project, file));
  console.log(JSON.stringify({file, ...stats}));
  process.exit(0);
}

for (const car of manifest.cars) {
  const file = resolve(project, car.model);
  if (!existsSync(file)) {
    console.log("PENDIENTE", car.id, "archivo GLB no disponible");
    if (strict) failed = true;
    continue;
  }
  try {
    const stats = inspectGlb(file);
    const commercial = ["CC0","CC-BY-4.0"].includes(car.license) &&
      !!car.original && !!car.creator && car.rightsReviewed === true;
    const complete = stats.wheels.length === 4 && stats.interior && stats.underbody;
    const performant = stats.triangles >= 15000 && stats.triangles <= 350000 &&
      stats.bytes <= 20 * 1024 * 1024;
    console.log(JSON.stringify({ id:car.id, ...stats, commercial, complete, performant }));
    if (strict && (!commercial || !complete || !performant)) failed = true;
  } catch(error) {
    console.error("RECHAZADO", car.id, error.message);
    failed = true;
  }
}
if (strict && manifest.cars.length !== 10) failed = true;
if (failed) {
  console.error(strict ? "BLOQUEADA LA SUSTITUCIÓN: faltan licencias, detalles mecánicos, ruedas o rendimiento."
    : "Auditoría fallida; no importar recursos corruptos.");
  process.exitCode = 1;
}
