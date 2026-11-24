"""Export the approved ruby .blend for Horizon. Never changes the source file.
Usage: blender --background --python export-ruby-game.py -- --source FILE --output FILE
Wheel pivots are placed at wheel centres; meshes have one material each.
Studio objects never enter the GLB. No external packages are required.
"""
import argparse
import os
import sys
import json
import bpy
from mathutils import Vector, Matrix

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.source))
wheels = ["wheel_front_L","wheel_front_R","wheel_rear_L","wheel_rear_R"]
for name in wheels:
    if bpy.data.objects.get(name) is None:
        raise RuntimeError("El archivo no contiene la rueda "+name)
# Isolate the car from the preview studio by explicit identities/types.
parts = [o for o in bpy.context.scene.objects if o.type in {"MESH","CURVE"}
         and o.name != "Studio floor" and not o.name.startswith("Studio floor.")]
if not parts:
    raise RuntimeError("No se encontro geometria del carro.")
for name in wheels:
    pivot = bpy.data.objects[name]
    x = 1.335 if "front" in name else -1.335
    y = .875 if name.endswith("_L") else -.875
    children = [(child,child.matrix_world.copy()) for child in pivot.children]
    pivot.location = (x,y,.365)
    bpy.context.view_layer.update()
    for child,world in children:
        child.matrix_world = world
bpy.context.view_layer.update()
# Bake all modifiers and curves before export; isolate material slots so the
# runtime can merge compatible static pieces without changing their colours.
for obj in list(parts):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    if obj.type=="CURVE":
        bpy.ops.object.convert(target="MESH")
    else:
        bpy.ops.object.convert(target="MESH")
    if len(obj.data.materials)>1:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="MATERIAL")
        bpy.ops.object.mode_set(mode="OBJECT")
# Cut the costly transmission pass; runtime uses the same approximation.
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    p=next((n for n in mat.node_tree.nodes if n.bl_idname=="ShaderNodeBsdfPrincipled"),None)
    if p:
        transmission=next((s for s in p.inputs if s.identifier=="Transmission Weight"),None)
        if transmission: transmission.default_value=0
parts=[o for o in bpy.context.scene.objects if o.type=="MESH"
       and o.name!="Studio floor" and not o.name.startswith("Studio floor.")]
bpy.ops.object.select_all(action="DESELECT")
for obj in parts: obj.select_set(True)
for name in wheels: bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=parts[0]
# Preconditions are checked against the generated scene, not filenames alone.
wind=bpy.data.objects.get("Curved windscreen")
if wind is None: raise RuntimeError("Falta parabrisas.")
ys=[(wind.matrix_world@v.co).y for v in wind.data.vertices]
if min(ys)>-.79 or max(ys)<.79: raise RuntimeError("Parabrisas incompleto.")
os.makedirs(os.path.dirname(os.path.abspath(args.output)),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(args.output),
    export_format="GLB",use_selection=True,export_apply=True,export_extras=True)
report={
    "source":os.path.abspath(args.source),"output":os.path.abspath(args.output),
    "mesh_objects":len(parts),"wheel_pivots":wheels,
    "triangles":sum(sum(max(0,len(p.vertices)-2) for p in obj.data.polygons) for obj in parts),
    "bytes":os.path.getsize(args.output),"performance":"NOT_MEASURED"
}
with open(args.output+".json","w",encoding="utf-8") as f: json.dump(report,f,indent=2)
print("HORIZON_GAME_EXPORT="+json.dumps(report))
