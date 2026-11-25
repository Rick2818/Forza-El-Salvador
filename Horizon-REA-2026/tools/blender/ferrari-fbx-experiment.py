"""Experimental export only: identical F430 source geometry, no production writes."""
import bpy, pathlib, json, hashlib
root=pathlib.Path.cwd()
src=root/"public/models/external-candidates/ferrari-f430.glb"
dst=root/"public/models/experimental/ferrari-f430.fbx"
dst.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
assert meshes, "No mesh imported"
def inventory(objects):
    return {"meshes":len(objects),"triangles":sum(len(o.data.loop_triangles) for o in objects),
            "names":[o.name for o in objects],"materials":sorted({m.name for o in objects for m in o.data.materials if m})}
for o in meshes: o.data.calc_loop_triangles()
before=inventory(meshes)
bpy.ops.export_scene.fbx(filepath=str(dst),object_types={'MESH','EMPTY','ARMATURE'},
    axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,
    add_leaf_bones=False,bake_anim=False,use_mesh_modifiers=False)
assert dst.is_file() and dst.stat().st_size>0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(dst))
after_meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
for o in after_meshes: o.data.calc_loop_triangles()
after=inventory(after_meshes)
report={"source_sha256":hashlib.sha256(src.read_bytes()).hexdigest(),"source_bytes":src.stat().st_size,
    "fbx_sha256":hashlib.sha256(dst.read_bytes()).hexdigest(),"fbx_bytes":dst.stat().st_size,
    "before":before,"after":after,"production_approved":False}
out=root/"review/quality";out.mkdir(parents=True,exist_ok=True)
(out/"ferrari-fbx-export.json").write_text(json.dumps(report,indent=2))
print("FERRARI_FBX_EXPORT",json.dumps(report))
assert before["triangles"]==after["triangles"],"FBX round trip changed triangle count"
