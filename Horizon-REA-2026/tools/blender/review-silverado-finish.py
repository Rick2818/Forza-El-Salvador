"""Isolated visual review; never replaces the source GLB or live wheel pivots."""
import bpy, json, math, re, hashlib, os
from pathlib import Path
from mathutils import Vector
source=Path("Horizon-REA-2026/public/models/external-candidates/chevrolet-silverado-ev-alternative.glb")
out=Path("review/silverado")
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
decoded=Path(os.environ.get('SILVERADO_REVIEW_GLB',str(source)))
assert decoded.is_file(), 'Missing review GLB'
bpy.ops.import_scene.gltf(filepath=str(decoded.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
assert meshes, "No vehicle meshes"
bounds=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
lo=Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
hi=Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
center=(lo+hi)/2
size=hi-lo
length=max(size.x,size.y)
assert length>0 and size.z>0
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=960
scene.render.resolution_y=540
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new("Review daylight")
scene.world.use_nodes=True
scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value=(.55,.64,.78,1)
scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value=.55
scene.view_settings.view_transform="AgX"
long=Vector((1,0,0)) if size.x>=size.y else Vector((0,1,0))
side=Vector((-long.y,long.x,0))
def aim(obj,p):
    obj.rotation_euler=(p-obj.location).to_track_quat("-Z","Y").to_euler()
def area(name,offset,power,width):
    data=bpy.data.lights.new(name,"AREA")
    data.energy=power*length*length
    data.shape="DISK"
    data.size=width*length
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob)
    ob.location=center+offset*length;aim(ob,center)
area("Key",long*.35+side*.65+Vector((0,0,1)),90,1.0)
area("Fill",-side*.7+Vector((0,0,.65)),40,.8)
area("Rim",-long*.7+Vector((0,0,.8)),75,.7)
cam=bpy.data.objects.new("Review camera",bpy.data.cameras.new("Review camera"))
scene.collection.objects.link(cam);scene.camera=cam
cam.data.type="ORTHO";cam.data.ortho_scale=length*1.42
cam.location=center+long*length*1.1+side*length*.8+Vector((0,0,length*.5));aim(cam,center)
def render(name):
    scene.render.filepath=str((out/name).resolve());bpy.ops.render.render(write_still=True)
def snapshot():
    result=[]
    for mat in bpy.data.materials:
        if not mat.use_nodes: continue
        for n in mat.node_tree.nodes:
            if n.type=="BSDF_PRINCIPLED":
                values={}
                for key in ("Roughness","Metallic","Alpha","Coat Weight","Coat Roughness"):
                    s=n.inputs.get(key)
                    if s is not None: values[key]={"value":float(s.default_value),"linked":s.is_linked}
                result.append({"material":mat.name,"pbr":values})
    return result
before=snapshot()
render("silverado-source.png")
paint=re.compile(r"(^|[_\s:.])(body|bodyshell|paint|carrosserie)([_\s.0-9]|$)|exterior_mm_ext|color1mtl|vehicle_generic_smallspecmap__paint",re.I)
excluded=re.compile(r"wheel|tyre|tire|rim|glass|window|light|badge|brake|caliper|mirror|interior|seat|chassis|plastic|carbon",re.I)
eligible=set()
protected=set()
for o in meshes:
    for slot in o.material_slots:
        mat=slot.material
        if not mat:continue
        if excluded.search(o.name+" "+mat.name):protected.add(mat)
        elif paint.search(o.name+" "+mat.name):eligible.add(mat)
changes=[]
for mat in eligible-protected:
    if not mat.use_nodes:continue
    for node in mat.node_tree.nodes:
        if node.type!="BSDF_PRINCIPLED":continue
        for name,value in (("Roughness",.31),("Coat Weight",.35),("Coat Roughness",.23)):
            socket=node.inputs.get(name)
            if socket and not socket.is_linked:
                old=float(socket.default_value)
                if name=="Roughness":value=min(old,value)
                if name=="Coat Weight":value=max(old,value)
                if abs(old-value)>1e-5:
                    socket.default_value=value
                    changes.append({"material":mat.name,"property":name,"before":old,"after":value})
render("silverado-candidate.png")
bpy.ops.wm.save_as_mainfile(filepath=str((out/"silverado-review.blend").resolve()))
report={"source":str(source),"decoded_sha256":hashlib.sha256(decoded.read_bytes()).hexdigest(),"sha256":hashlib.sha256(source.read_bytes()).hexdigest(),"blender":bpy.app.version_string,"mesh_count":len(meshes),"vertices":sum(len(o.data.vertices) for o in meshes),"dimensions":list(size),"material_before":before,"material_after":snapshot(),"changes":changes,"note":"Review only. No source geometry, wheel transforms or game assets overwritten."}
(out/"silverado-review.json").write_text(json.dumps(report,indent=2))
print("SILVERADO_BLENDER_REVIEW",json.dumps({k:report[k] for k in ("blender","mesh_count","vertices","dimensions","changes")}))
