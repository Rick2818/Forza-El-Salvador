/**
 * Validate each Blender-exported circuit, and prove that Vite copied the exact
 * binary GLB into dist/ before publishing Horizon El Salvador to GitHub Pages.
 */
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const names = ["monzon", "suzaka", "sparda", "sakhir-horizon"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

for (const name of names) {
  const source = join(root, "public", "circuits", name + ".glb");
  const compiled = join(root, "dist", "circuits", name + ".glb");
  const blender = join(root, "tools", "blender", "circuit-sources", name + ".blend");

  const src = readFileSync(source);
  const dst = readFileSync(compiled);
  const blend = readFileSync(blender);
  if (src.length < 100_000) throw new Error(`${name}: source GLB too small (${src.length} bytes)`);
  if (src.toString("ascii", 0, 4) !== "glTF") throw new Error(`${name}: missing GLB magic`);
  if (src.readUInt32LE(4) !== 2) throw new Error(`${name}: GLB version is not 2`);
  if (src.readUInt32LE(8) !== src.length) throw new Error(`${name}: GLB length header mismatch`);
  if (src.readUInt32LE(12) <= 0) throw new Error(`${name}: GLB is missing first chunk`);
  if (dst.length !== src.length || hash(dst) !== hash(src)) {
    throw new Error(`${name}: GitHub Pages dist does not match the original GLB`);
  }
  if (blend.length < 10_000 || blend.toString("ascii", 0, 7) !== "BLENDER") {
    throw new Error(`${name}: missing or invalid editable Blender source`);
  }
  console.log(`OK ${name}: ${statSync(source).size} bytes GLB copied intact and Blender source valid`);
}
console.log("All four circuits passed binary asset validation.");
