#!/usr/bin/env python3
"""Render inspection sheets directly from the Ferrari F430 GLB; no substitution."""
import bpy, math, os
from mathutils import Vector

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),"../.."))
SOURCE=os.path.join(ROOT,"replacements/assets/ferrari-f430.glb")
OUT=os.path.join(ROOT,"review/v20-f430")
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
if not meshes: raise RuntimeError("El F430 GLB no contiene mallas")
corners=[obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box]
low=Vector([min(c[i] for c in corners) for i in range(3)])
high=Vector([max(c[i] for c in corners) for i in range(3)])
center=(low+high)*.5; dims=high-low
print("SOURCE_GLTF",SOURCE,"mesh_count",len(meshes),"bounds",list(dims))
# The GLB is preserved: no changes to imported meshes, shaders or geometry.
world=bpy.context.scene.world
if not world:
    world=bpy.data.worlds.new("Studio")
    bpy.context.scene.world=world
world.use_nodes=True
bg=world.node_tree.nodes.get("Background")
if bg:
    bg.inputs["Color"].default_value=(.32,.38,.46,1)
    bg.inputs["Strength"].default_value=.75

def add_area(name,position,power,size):
    datab=bpy.data.lights.new(name,"AREA")
    datab.energy=power; datab.shape="DISK"; datab.size=size
    obj=bpy.data.objects.new(name,datab)
    bpy.context.scene.collection.objects.link(obj)
    obj.location=position
    direction=center-obj.location
    obj.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()

S=max(dims.x,dims.y, dims.z,1)
add_area("Softbox grande",(center.x-S,center.y-S,center.z+S),1400,S*2.2)
add_area("Softbox trasero",(center.x+S,center.y+S*.5,center.z+S*.8),1000,S*1.7)
add_area("Softbox lateral",(center.x+S,center.y-S,center.z+S*.6),800,S*1.5)
# Camera positions correspond to the axes of the *imported* mesh. Orientation
# can be audited, no assumed vehicle front is silently remapped.
camera_data=bpy.data.cameras.new("InspectionCamera")
cam=bpy.data.objects.new("InspectionCamera",camera_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera=cam
cam.data.type="ORTHO"
cam.data.ortho_scale=S*1.55
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=20
scene.render.resolution_x=1280
scene.render.resolution_y=760
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.film_transparent=False
scene.view_settings.view_transform="Standard"
scene.view_settings.look="Medium High Contrast"
scene.render.filepath=os.path.join(OUT,"f430-3d-front34.png")

def render(name,direction):
    cam.location=center+Vector(direction)*S
    delta=center-cam.location
    cam.rotation_euler=delta.to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=os.path.join(OUT,name)
    bpy.ops.render.render(write_still=True)
    print("REAL_GLB_RENDER",scene.render.filepath)

if dims.x>=dims.y:
    front=(1.5,-1.3,.8)
    side=(0,-2,.55)
    back=(-1.5,1.3,.8)
else:
    front=(1.3,-1.5,.8)
    side=(2,0,.55)
    back=(-1.3,1.5,.8)
render("f430-3d-front34.png",front)
render("f430-3d-side.png",side)
render("f430-3d-rear34.png",back)
print("RENDER_DONE",len(meshes),"bounding_box",tuple(round(float(v),2) for v in dims))
