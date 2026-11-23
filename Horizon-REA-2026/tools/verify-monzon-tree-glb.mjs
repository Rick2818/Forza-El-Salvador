// Validate the actual Blender exports before they are committed or served.
// No third-party packages, headless renderer or manually authored glTF mockups.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../public/scenery/", import.meta.url);
const results = [];
for (const version of [1, 2]) {
  const path = new URL(`monzon-tree-v${version}.glb`, root);
  const bytes = readFileSync(path);
  if (bytes.length < 10_000) throw Error(`Variant ${version} is too small: ${bytes.length}`);
  if (bytes.toString("utf8", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2)
    throw Error(`Variant ${version} is not a glTF 2.0 binary`);
  if (bytes.readUInt32LE(8) !== bytes.length)
    throw Error(`Variant ${version} has a corrupted byte count`);
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || length > bytes.length - 20)
    throw Error(`Variant ${version} has no valid glTF JSON chunk`);
  const json = JSON.parse(bytes.toString("utf8", 20, 20 + length));
  const names = (json.meshes ?? []).map(mesh => mesh.name?.toLowerCase() ?? "");
  if (!names.some(x => /bark|trunk/.test(x)) || !names.some(x => /leaves|leaf|foliage/.test(x)))
    throw Error(`Variant ${version} is missing separate bark and foliage meshes: ${names}`);
  if (json.meshes.length !== 2)
    throw Error(`Variant ${version} must contain exactly 2 meshes for 4 total instanced draw calls`);
  if ((json.images?.length ?? 0) < 2 || (json.materials?.length ?? 0) < 2)
    throw Error(`Variant ${version} is missing the embedded bark and foliage textures/materials`);
  if (!json.images.every(image => Number.isInteger(image.bufferView)))
    throw Error(`Variant ${version} has external texture dependencies`);
  if ((json.accessors ?? []).some(accessor => !accessor.count || accessor.count > 200_000))
    throw Error(`Variant ${version} has invalid/heavy vertex budget`);
  const treeHeight = Math.max(...(json.accessors ?? [])
    .filter(accessor => accessor.type === "VEC3" && Array.isArray(accessor.max))
    .map(accessor => Math.max(...accessor.max.map(Math.abs))));
  if (!Number.isFinite(treeHeight) || treeHeight < 3 || treeHeight > 25)
    throw Error(`Variant ${version} has unrealistic dimensions: ${treeHeight}`);
  results.push({ variant: version, bytes: bytes.length, meshes: names,
    embeddedImages: json.images.length, materials: json.materials.length });
}
console.log("MONZON_TREE_GLB_VERIFIED", JSON.stringify(results));
