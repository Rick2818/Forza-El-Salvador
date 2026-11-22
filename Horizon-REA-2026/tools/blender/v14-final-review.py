"""V14 additional Blender review correction: clear legible GOODYEAR name,
reduce helmet visual mass, remove dislocated glove details. Output is REAL GLB.
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
CARS=ROOT/'public/models/selected'
BAL=ROOT/'public/models/balloon/goodyear-v14.glb'
SOURCES=ROOT/'tools/blender/selected-sources/v14'
OUT=ROOT/'docs/quality/v14'
IMG=OUT/'previews'
DESIGNS=json.loads((ROOT/'src/vehicle/vehicle-designs.json').read_text())
for d in (SOURCES,OUT,IMG):d.mkdir(parents=True,exist_ok=True)

def render(name,target,campos,ortho,width=840,height=560,power=950):
    bpy.ops.object.camera_add(location=campos);cam=bpy.context.object
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=ortho
    bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(campos[0]/2,campos[1]/2,campos[2]+4))
    light=bpy.context.object;light.data.energy=power;light.data.size=8 if ortho<3 else 35
    scene=bpy.context.scene
    if scene.world is None:scene.world=bpy.data.worlds.new('V14 Final Review')
    scene.world.color=(.008,.017,.029)
    scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.render.resolution_x=width;scene.render.resolution_y=height
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(IMG/name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam,do_unlink=True);bpy.data.objects.remove(light,do_unlink=True)
    return str((IMG/name).relative_to(ROOT))

def save(name):
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/name),compress=True)

pilots=[]
for d in DESIGNS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path=CARS/(d['id']+'.glb')
    old=hashlib.sha256(path.read_bytes()).hexdigest()
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    originalWheels={n:bpy.data.objects[n].matrix_world.translation.copy() for n in
        ('wheel_fr','wheel_fl','wheel_rr','wheel_rl')}
    eye=min(1.125,d['height']-.122)
    y=-d['width']*.181
    # Correct disproportionate oversize helmet and visor geometry, never body.
    changed=0
    tokens=('helmet','visor','chin_cradle','chin_air_intake','cheek_graphic')
    for o in list(bpy.data.objects):
        if not o.name.startswith('HorizonPilotV14_'):continue
        if 'glove_knuckle_rib' in o.name:
            bpy.data.objects.remove(o,do_unlink=True)
            continue
        if any(tag in o.name.lower() for tag in tokens):
            if o.type!='MESH':continue
            o.data=o.data.copy();m=o.matrix_world.copy();im=m.inverted_safe()
            center=Vector((-.36,y,eye))
            for v in o.data.vertices:
                p=m@v.co;p=center+(p-center)*.89;v.co=im@p;changed+=1
            o.data.update()
    for n,p in originalWheels.items():
        if (bpy.data.objects[n].matrix_world.translation-p).length>1e-5:
            raise RuntimeError('Wheel pivot changed during second visual review: '+n)
    save(d['id']+'-pilot-v14-final.blend')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_extras=True,export_animations=False)
    imagePath=None
    if d['id'] in ('porsche-911','koenigsegg-jesko-odin','ferrari-california-t'):
        objs=[(o,o.hide_render) for o in bpy.data.objects if o.type=='MESH' and not
              (o.name.startswith('HorizonPilotV14_') or o.name.startswith('V14DriverSteering') or o.name.startswith('Cockpit_V11_steering'))]
        for o,_ in objs:o.hide_render=True
        imagePath=render(d['id']+'-v14-final.png',(-.34,y,1.0),
            (1.35,-2.4,1.62),1.70,840,560,850)
    pilots.append({'id':d['id'],'helmetVerticesRefined':changed,
        'inputSha256':old,'outputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'preview':imagePath})
    print('V14_REAL_PILOT_FINAL '+json.dumps(pilots[-1]),flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(BAL))
removed=[]
for o in list(bpy.data.objects):
    if 'gold_piping_at_40' in o.name:
        removed.append(o.name)
        bpy.data.objects.remove(o,do_unlink=True)
# The stitched fabric patch matches the envelope instead of a black rectangle.
for mat in bpy.data.materials:
    if 'GOODYEAR_embossed_fabric_patch' in mat.name:
        mat.diffuse_color=(.026,.12,.35,1)
        if mat.use_nodes:
            p=mat.node_tree.nodes.get('Principled BSDF')
            p.inputs['Base Color'].default_value=(.026,.12,.35,1)
save('goodyear-balloon-v14-final.blend')
bpy.ops.export_scene.gltf(filepath=str(BAL),export_format='GLB',
    export_extras=True,export_animations=False)
img=render('goodyear-v14-final-night.png',(0,0,38),(6,-116,70),85,880,580,15500)
balloon={'removedLogoOcclusionGeometry':removed,
 'render':img,'sha256':hashlib.sha256(BAL.read_bytes()).hexdigest()}
report={'status':'V14_REVIEWED_3D_ARTIFACTS_FINAL',
        'pilots':pilots,'balloon':balloon}
(OUT/'final-visual-review.json').write_text(json.dumps(report,indent=2)+'\n')
print('V14_FINAL_VISUAL_INSPECTION_EXPORT '+json.dumps(report),flush=True)
