"""Three staged Blender reference renders for Monzón's V14 pyrotechnic choreography.
This is an ART DIRECTION scene. The real-time implementation is monzonFireworks.ts.
"""
import bpy,math,json,random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
BLEND=ROOT/'tools/blender/selected-sources/v14'
QUALITY=ROOT/'docs/quality/v14'
PREVIEW=QUALITY/'previews'
for d in (BLEND,QUALITY,PREVIEW):d.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(20261122)
PALETTE=[(1,.49,.03),(1,.04,.23),(.03,.88,1),(.12,1,.19),(.54,.20,1),(1,.95,.65)]

def luminous(name,c):
    m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
    nodes=m.node_tree.nodes
    nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial')
    emission=nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value=(*c,1)
    emission.inputs['Strength'].default_value=4.5
    m.node_tree.links.new(emission.outputs[0],out.inputs['Surface'])
    return m
materials=[luminous('v14_pyro_hue_'+str(i),c) for i,c in enumerate(PALETTE)]

def stroke(name,points,radius,material):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D'
    cu.bevel_depth=radius;cu.bevel_resolution=1
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for p,xyz in zip(sp.points,points):p.co=(*xyz,1)
    ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);cu.materials.append(material)
    return ob

def burst(i,density=12,mode=0):
    x=(i%7-3)*8;y=(i//7-1)*7;z=28+(i%6)*4
    mat=materials[i%len(materials)]
    for k in range(density):
        theta=k*2.39996323+i*.24
        polar=math.acos(1-2*(k+.5)/density)
        dx=math.sin(polar)*math.cos(theta)
        dy=math.sin(polar)*math.sin(theta)
        dz=math.cos(polar)
        if mode==2:dz=abs(dz)*.95+.08
        radius=8+(k%6)*1.2
        points=[]
        for j in range(13):
            t=j/12
            points.append((x+radius*dx*t,y+radius*dy*t,
                           z+radius*dz*t-(4 if mode==2 else 2)*t*t))
        stroke('v14_pyro_star_'+str(i)+'_'+str(k),points,.055 if mode==0 else .082,mat)

def stage(i):
    bpy.context.preferences.filepaths.save_version=0
    bpy.context.scene['HorizonFireworksPass']=i
    path=BLEND/('monzon-fireworks-v14-pass'+str(i)+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    return path

def show(i):
    bpy.ops.object.camera_add(location=(0,-122,34))
    cam=bpy.context.object;cam.name='V14_firework_review_camera'
    cam.rotation_euler=(Vector((0,0,44))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=109
    bpy.context.scene.camera=cam
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=10
    scene.render.resolution_x=880;scene.render.resolution_y=520
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    scene.world.color=(.002,.004,.013)
    outfile=PREVIEW/('monzon-fireworks-pass'+str(i)+'.png')
    scene.render.filepath=str(outfile);bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam,do_unlink=True)
    return outfile

records=[]
# First pass: radial orchestration and original spatial composition.
for i in range(11):burst(i,10,0)
records.append({'pass':1,'blend':str(stage(1).relative_to(ROOT)),
    'referenceRender':str(show(1).relative_to(ROOT))})
# Second: 2D depth layering, vivid palette, multi-arc bursts.
for i in range(11,22):burst(i,18,1)
records.append({'pass':2,'blend':str(stage(2).relative_to(ROOT)),
    'referenceRender':str(show(2).relative_to(ROOT))})
# Third: trailing gold weeping willow shell and wider sky span.
for i in range(22,28):burst(i,26,2)
records.append({'pass':3,'blend':str(stage(3).relative_to(ROOT)),
    'referenceRender':str(show(3).relative_to(ROOT))})
result={'status':'THREE_STAGED_BLENDER_REFERENCE_IMAGES_RENDERED',
 'scope':'reference composition, not direct gameplay screenshot',
 'runtime':'src/world/monzonFireworks.ts', 'passes':records}
(QUALITY/'fireworks-pass-report.json').write_text(json.dumps(result,indent=2)+'\n')
print('MONZON_V14_3D_PYRO_REFERENCE_READY '+json.dumps(result),flush=True)
