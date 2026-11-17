"""
Horizon El Salvador / Porsche 911 992 visual asset pipeline.
Same Blender -> glTF workflow as tools/blender/car-body.py.

Source: "Porsche 911 C4S 2020 Aerokit" / JK3Dstudios.
License: CC BY 4.0 as documented by asset library distributors.
Asset credit documentation: docs/porsche-911-credits.md.
Never substitute this for the Ferrari GLB or change the production default.

Usage:
 blender --background --factory-startup --python tools/blender/porsche-911.py -- --input /tmp/porsche-911-c4s.glb --output public/models/porsche-911-real.glb
"""
import argparse
import json
import math
import os
import sys
import bpy
from mathutils import Vector, Matrix

def args():
    opts = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", default="/tmp/porsche-inspect.json")
    parser.add_argument("--front", choices=["-Y","+Y","-X","+X"], default="-Y")
    return parser.parse_args(opts)

def bounds(objects):
    b = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for v in obj.bound_box:
            b.append(obj.matrix_world @ Vector(v))
    if not b:
        raise RuntimeError("Source GLB has no mesh objects")
    low = Vector([min(p[i] for p in b) for i in range(3)])
    high = Vector([max(p[i] for p in b) for i in range(3)])
    return low, high

def transform(objects, matrix):
    for obj in objects:
        if obj.parent is None:
            obj.matrix_world = matrix @ obj.matrix_world
    bpy.context.view_layer.update()

def analyze(objects):
    low, high = bounds(objects)
    materials = []
    for mat in bpy.data.materials:
        materials.append({"name": mat.name, "blend_method": getattr(mat, "blend_method", "N/A")})
    return {
        "objects": len(objects),
        "mesh_objects": sum(1 for o in objects if o.type == "MESH"),
        "names": [o.name for o in objects[:110]],
        "bounds_min": [round(v,4) for v in low],
        "bounds_max": [round(v,4) for v in high],
        "size": [round(v,4) for v in (high-low)],
        "materials": materials[:80]
    }

def main():
    p = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=p.input)
    objs = list(bpy.context.scene.objects)
    first = analyze(objs)
    print("HORIZON_ORIGINAL", json.dumps(first, ensure_ascii=False))
    low, high = bounds(objs)
    dims = high - low
    # The front axis is explicitly defined per asset, never guessed by an image.
    heading = {"-Y": math.pi/2, "+Y": -math.pi/2, "+X": 0., "-X": math.pi}[p.front]
    transform(objs, Matrix.Rotation(heading,4,"Z"))
    low, high = bounds(objs)
    dims = high - low
    long_axis = max(dims.x, dims.y)
    scale = min(4.65 / long_axis, 2.06 / min(dims.x,dims.y))
    transform(objs, Matrix.Scale(scale,4))
    low,high=bounds(objs)
    # Blender coordinates (+X nose, +Y width, +Z up); wheel origin on ground.
    transform(objs, Matrix.Translation(Vector((-(high.x+low.x)*.5,-(high.y+low.y)*.5,-low.z))))
    report = {"source": p.input, "license": "CC BY 4.0 (source attribution required)",
              "asset": "Porsche 911 C4S 2020 Aerokit", "input": first,
              "export": analyze(objs), "scale": scale, "front": p.front}
    os.makedirs(os.path.dirname(os.path.abspath(p.output)),exist_ok=True)
    # Keep original material textures, cabin and windshield, unlike procedural wedge.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=p.output,export_format="GLB",
                              use_selection=True,export_apply=True)
    with open(p.report,"w",encoding="utf8") as fh:
        json.dump(report,fh,indent=2,ensure_ascii=False)
    print("HORIZON_CONVERTED",json.dumps(report["export"],ensure_ascii=False))
    print("HORIZON_OUTPUT",p.output,os.path.getsize(p.output))
if __name__=="__main__":
    main()
