"""Private off-road Blender preflight: inventory, export, round-trip audit.
Run with Blender 5.0.1:
  blender -b --factory-startup --python-exit-code 1 --python tools/blender/offroad_preflight.py -- --smoke --out /tmp/offroad-smoke
  blender -b --factory-startup --python-exit-code 1 --python tools/blender/offroad_preflight.py -- --blend /private/dirt/dirt_track.blend --out /private/audit
  blender -b --factory-startup --python-exit-code 1 --python tools/blender/offroad_preflight.py -- --fbx /private/mud/fbx/forest-puddle.fbx --out /private/audit
No real assets or renders may be uploaded to a public repository or public Actions artifact.
"""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
import bpy

def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)

def inventory():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    return {
        "blender": bpy.app.version_string,
        "meshes": [{"name": o.name, "triangles": triangles(o),
                    "dimensions": list(o.dimensions),
                    "materials": [m.name if m else None for m in o.data.materials],
                    "hide_render": o.hide_render} for o in meshes],
        "images": [{"name": i.name, "size": list(i.size), "packed": bool(i.packed_file),
                    "filepath": i.filepath} for i in bpy.data.images
                   if i.source == "FILE"],
    }

def glb_inventory(path):
    with path.open("rb") as f:
        magic, version, length = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF" or version != 2 or length != path.stat().st_size:
            raise ValueError("Invalid GLB")
        n, typ = struct.unpack("<I4s", f.read(8))
        if typ != b"JSON":
            raise ValueError("Missing JSON chunk")
        doc = json.loads(f.read(n))
        _, typ = struct.unpack("<I4s", f.read(8))
        if typ != b"BIN\x00":
            raise ValueError("Missing binary chunk")
        start = f.tell()
        hashes = []
        for image in doc.get("images", []):
            v = doc["bufferViews"][image["bufferView"]]
            f.seek(start + v.get("byteOffset", 0))
            hashes.append(hashlib.sha256(f.read(v["byteLength"])).hexdigest())
    count = 0
    for mesh in doc.get("meshes", []):
        for p in mesh["primitives"]:
            if p.get("mode", 4) != 4:
                raise ValueError("Non-triangle primitive")
            a = p.get("indices", p["attributes"]["POSITION"])
            count += doc["accessors"][a]["count"] // 3
    return {"triangles": count, "image_sha256": hashes, "materials": len(doc.get("materials", []))}

def main():
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--smoke", action="store_true")
    g.add_argument("--blend", type=Path)
    g.add_argument("--fbx", type=Path)
    p.add_argument("--objects", nargs="+", help="Explicit mesh names after inventory; required for real export")
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args(sys.argv[sys.argv.index("--")+1:])
    out = a.out.resolve()
    if any((q / ".git").exists() for q in [out, *out.parents]):
        raise ValueError("Use a staging directory outside Git")
    out.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if a.smoke:
        bpy.ops.mesh.primitive_cube_add()
        a.objects = [bpy.context.object.name]
    elif a.blend:
        bpy.ops.wm.open_mainfile(filepath=str(a.blend.resolve()), load_ui=False)
    else:
        bpy.ops.import_scene.fbx(filepath=str(a.fbx.resolve()))
    report = inventory()
    report["visual_approved"] = False
    report["publication_approved"] = False
    (out / "source-inventory.json").write_text(json.dumps(report, indent=2))
    if not a.objects:
        print("Inventory complete; choose explicit mesh names, including intended LOD, before export.")
        return
    objs = [bpy.context.scene.objects.get(name) for name in a.objects]
    if any(o is None or o.type != "MESH" for o in objs):
        raise ValueError("Invalid mesh selection")
    if any(o.modifiers for o in objs):
        raise ValueError("Inspect source modifiers before export; no implicit geometry changes")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        if o.hide_get() or o.hide_viewport:
            raise ValueError("Inspect hidden LOD before export")
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    expected = sum(triangles(o) for o in objs)
    target = out / "candidate.glb"
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB",
        use_selection=True, export_apply=False, export_image_format="AUTO",
        export_draco_mesh_compression_enable=False)
    result = glb_inventory(target)
    result["expected_triangles"] = expected
    result["visual_approved"] = False
    result["publication_approved"] = False
    (out / "export-audit.json").write_text(json.dumps(result, indent=2))
    if result["triangles"] != expected:
        raise ValueError("Triangle count changed")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(target))
    after = inventory()
    (out / "roundtrip-inventory.json").write_text(json.dumps(after, indent=2))
    if sum(o["triangles"] for o in after["meshes"]) != expected:
        raise ValueError("Round-trip triangle count changed")
    print("Geometry count passed. Texture byte comparison and visual review remain mandatory.")

if __name__ == "__main__":
    main()
