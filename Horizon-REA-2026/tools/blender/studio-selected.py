"""Render actual selected GLBs in a repeatable CPU Cycles lighting setup.

blender -b -t 4 --python tools/blender/studio-selected.py
These images show the exported game geometry, without retouching.
"""
import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'review/preart-studio'
OUT.mkdir(parents=True, exist_ok=True)
designs=json.loads((ROOT/'src/vehicle/vehicle-designs.json').read_text())
reports=[]

def aim(obj, point):
    obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()

for design in designs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    asset=ROOT/'public/models/selected'/(design['id']+'.glb')
    bpy.ops.import_scene.gltf(filepath=str(asset))
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=64
    # CPU builds without OpenImageDenoise must still render reproducibly.
    scene.cycles.use_denoising=False
    scene.render.resolution_x=960
    scene.render.resolution_y=600
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Neutral studio')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.24,.28,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=-.6
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005))
    floor=bpy.context.object
    mat=bpy.data.materials.new('Studio floor');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(.11,.13,.16,1)
    bs.inputs['Roughness'].default_value=.58
    floor.data.materials.append(mat)
    for name,loc,power,size in [('Key',(2,-4,6),1700,5),('Fill',(1,4,4),1300,4),('Rim',(-4,-1,4),1800,3)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;aim(ob,(0,0,.6))
    data=bpy.data.cameras.new('Studio camera');cam=bpy.data.objects.new('Studio camera',data)
    scene.collection.objects.link(cam);scene.camera=cam
    cam.location=(7.0,5.4,3.1);cam.data.lens=52;aim(cam,(0,0,.60))
    path=OUT/(design['id']+'.png');scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    reports.append(dict(vehicleId=design['id'],assetSha256=hashlib.sha256(asset.read_bytes()).hexdigest(),
        image=path.name,engine='Cycles CPU',samples=64,productionApproved=False))
    (OUT/'manifest.json').write_text(json.dumps(dict(status='PREART_REVIEW_REQUIRED',
        visualFidelityApproved=False,fps60Verified=False,vehicles=reports),indent=2)+'\n')
    print('STUDIO',design['id'],flush=True)
