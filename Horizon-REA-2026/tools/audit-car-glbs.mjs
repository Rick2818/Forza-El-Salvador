import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "public/models/selected");
const ids = [
  "ferrari-california-t","porsche-911","yangwang-u9",
  "koenigsegg-jesko-odin","bugatti-chiron",
  "lamborghini-aventador-roadster","mercedes-amg-gt-black-series"
];

for (const id of ids) {
  const buf = readFileSync(join(dir, id + ".glb"));
  if (buf.toString("ascii", 0, 4) !== "glTF") throw Error(id + ": invalid GLB header");
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLength));
  const names = (gltf.materials || []).map((mat, n) => {
    const p = mat.pbrMetallicRoughness || {};
    return {
      n, name: mat.name, alphaMode: mat.alphaMode || "OPAQUE",
      alpha: p.baseColorFactor?.[3] ?? 1, doubleSided: mat.doubleSided ?? false,
      transmission: mat.extensions?.KHR_materials_transmission?.transmissionFactor ?? 0
    };
  });
  const shapes = (gltf.meshes || []).map((mesh, n) => {
    const primitives = mesh.primitives.map(p => ({
      material: names[p.material]?.name || "none",
      triangles: Math.floor((gltf.accessors[p.indices]?.count ?? gltf.accessors[p.attributes?.POSITION]?.count ?? 0) / 3),
      bbox: (gltf.accessors[p.attributes?.POSITION]?.max || []).map((v, i) => Number(v.toFixed(2)))
    }));
    return { n, name: mesh.name, primitives };
  });
  const pilotNodes = (gltf.nodes || []).filter(node => node.name?.startsWith("HorizonPilotV13_"));
  if (pilotNodes.length < 17) {
    throw Error(id + ": Blender racing driver not embedded in the exported GLB");
  }
  for (const wheel of ["wheel_fr","wheel_fl","wheel_rr","wheel_rl"]) {
    if (!(gltf.nodes || []).some(node => node.name === wheel))
      throw Error(id + ": approved wheel pivot missing after Blender export: " + wheel);
  }
  if (["mercedes-amg-gt-black-series","koenigsegg-jesko-odin"].includes(id) &&
      !(gltf.nodes || []).some(node => node.name?.startsWith("V12_sculpted_curved_rear_taillight"))) {
    throw Error(id + ": V12 rounded rear light signature absent");
  }
  const summary = {
    id, bytes: buf.length, pilotMeshes: pilotNodes.length,
    materials: names, meshes: shapes.sort((a,b) =>
      b.primitives.reduce((s,p)=>s+p.triangles,0) -
      a.primitives.reduce((s,p)=>s+p.triangles,0)).slice(0, 10),
    totalTriangles: shapes.reduce((a,m)=> a + m.primitives.reduce((b,p)=>b+p.triangles,0),0),
    nodes: gltf.nodes?.length
  };
  console.log("HORIZON_GLTF_AUDIT " + JSON.stringify(summary));
}
