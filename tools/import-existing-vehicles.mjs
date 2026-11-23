// Importa modelos GLB ya creados por terceros sin sustituir los autos activos.
// Origen fijado a commit público, licencias conservadas y validación de cabeceras GLB.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const revision = "5948d1307f673e98aedae591c0d78c834f184713";
const sourceBase = "https://raw.githubusercontent.com/supercar3d/supercar_3D_asssets/" + revision + "/";
const dest = "Horizon-REA-2026/public/models/external-candidates";
const models = [
  { id: "ferrari-f430", path: "basic/ferrari/f430", file: "f430.glb",
    author: "Ddiaz Design", original: "https://skfb.ly/prtB6", license: "CC BY 4.0" },
  { id: "lamborghini-aventador", path: "basic/lamborghini/aventador", file: "aventador.glb",
    author: "BlackCube", original: "https://skfb.ly/ovA69", license: "CC BY 4.0" }
];
async function retrieve(path) {
  const res = await fetch(sourceBase + path, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error("HTTP " + res.status + ": " + path);
  return Buffer.from(await res.arrayBuffer());
}
function inspectGLB(bytes, id) {
  if (bytes.length < 4096 || bytes.toString("utf8", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw new Error(id + ": archivo GLB v2 ausente o corrupto");
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || jsonLength + 20 > bytes.length)
    throw new Error(id + ": JSON chunk inválido");
  const scene = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
  if (!Array.isArray(scene.meshes) || scene.meshes.length < 8 || !Array.isArray(scene.nodes))
    throw new Error(id + ": mallas o nodos insuficientes");
  const names = scene.nodes.map(x => x.name ?? "");
  return { meshes: scene.meshes.length, nodes: scene.nodes.length,
    wheelNamedNodes: names.filter(n => /wheel|tyre|tire|rim/i.test(n)).length,
    interiorNamedNodes: names.filter(n => /interior|seat|cockpit|dashboard|steer/i.test(n)).length };
}
await mkdir(dest, { recursive: true });
const results = [];
for (const model of models) {
  const [glb, license] = await Promise.all([
    retrieve(model.path + "/" + model.file),
    retrieve(model.path + "/license.txt")
  ]);
  const licenseText = license.toString("utf8");
  if (!licenseText.includes("Creative Commons Attribution") ||
      licenseText.includes("NonCommercial"))
    throw new Error(model.id + ": licencia no confirmada como CC BY");
  const audit = inspectGLB(glb, model.id);
  if (glb.byteLength > 25000000) throw new Error(model.id + ": peso excesivo");
  const filename = model.id + ".glb";
  await writeFile(join(dest, filename), glb);
  await writeFile(join(dest, model.id + "-LICENSE.txt"),
    licenseText.trim() + "\n\nFuente de distribución: " +
    "https://github.com/supercar3d/supercar_3D_asssets/blob/" + revision +
    "/" + model.path + "/\n");
  results.push({ id: model.id, filename, sizeBytes: glb.byteLength,
    sha256: createHash("sha256").update(glb).digest("hex"),
    ...audit, original: model.original, author: model.author,
    license: model.license, sourceCommit: revision, status: "candidate-not-in-roster",
    note: "Sin certificación de interior completo, pivotes de rueda, rendimiento ni derechos de marcas." });
  console.log(model.id, glb.length + " bytes", JSON.stringify(audit));
}
await writeFile(join(dest, "provenance.json"), JSON.stringify(results, null, 2) + "\n");
console.log("Modelos originales descargados y verificados en staging, sin modificar selección activa.");