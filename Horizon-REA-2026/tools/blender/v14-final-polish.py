"""Final V14 visual polish of actual GLBs after 3 Blender passes.

Fixes issues found in REAL renders: hands holding air; GOODYEAR glyphs
buried by the envelope; thin pyrotechnic reference lines. Produces authentic
review renders and revised GLBs without changing approved bodywork.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
DESIGNS=json.loads((ROOT/'src/vehicle/vehicle-designs.json').read_text())
BLEND=ROOT/'tools/blender/selected-sources/v14'
QUALITY=ROOT/'docs/quality/v14'
PREVIEW=QUALITY/'previews'
CARGLB=ROOT/'public/models/selected'
BALGLB=ROOT/'public/models/balloon/goodyear-v14.glb'
for d in (BLEND,QUALITY,PREVIEW):d.mkdir(parents=True,exist_ok=True)

def mat(name,rgb,rough=.54,metal=0,emission=None):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    if emission:
        v=p.inputs.get('Emission Color') or p.inputs.get('Emission')
        if v:v.default_value=(*emission,1)
        strength=p.inputs.get('Emission Strength')
        if strength:strength.default_value=1.3
    m.diffuse_color=(*rgb,1)
    return m

def tube(name,pts,rad,material):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D'
    data.bevel_depth=rad;data.bevel_resolution=2
    spline=data.splines.new('POLY');spline.points.add(len(pts)-1)
    for v,p in zip(spline.points,pts):v.co=(*p,1)
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj);data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
    return bpy.context.object

def render_scene(target,path,ortho=2.15,light=650):
    bpy.ops.object.camera_add(location=(1.6,-2.7,1.65) if ortho<3 else (12,-123,71))
    cam=bpy.context.object;cam.name='V14_Finish_Review_Camera'
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=ortho
    bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(2.0,-3.5,4.2) if ortho<3 else (20,-43,100))
    key=bpy.context.object;key.data.energy=light;key.data.size=5 if ortho<3 else 30
    bpy.ops.object.light_add(type='AREA',location=(-2.0,2,3.3) if ortho<3 else (-28,31,75))
    fill=bpy.context.object;fill.data.energy=light*.65;fill.data.size=4 if ortho<3 else 30
    scene=bpy.context.scene
    if scene.world is None:scene.world=bpy.data.worlds.new('V14 Finish Studio')
    scene.world.color=(.014,.024,.039)
    scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.resolution_x=760;scene.render.resolution_y=510
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    for o in (cam,key,fill):bpy.data.objects.remove(o,do_unlink=True)

def save(name):
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND/name),compress=True)

pilot_results=[]
for d in DESIGNS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    glb=CARGLB/(d['id']+'.glb')
    origin=hashlib.sha256(glb.read_bytes()).hexdigest()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    bpy.context.view_layer.update()
    pilots=[o for o in bpy.data.objects if o.name.startswith('HorizonPilotV14_') and o.type=='MESH']
    if len(pilots)<35:raise RuntimeError('V14 driver missing '+d['id'])
    wheels=('wheel_fr','wheel_fl','wheel_rr','wheel_rl')
    old={w:bpy.data.objects[w].matrix_world.translation.copy() for w in wheels}
    # In V13 a wrist ends near x=.01 while actual Ferrari steering is at x=.26.
    # Reposition just the forearm / glove ends with a smooth deformation,
    # leaving elbows and shoulders at their fitting positions.
    edited=0
    for ob in pilots:
        if not any(token in ob.name for token in
            ('curved_arm','gloved_fingers','sculpted_glove_finger','glove_knuckle_rib')):
            continue
        ob.data=ob.data.copy()
        frame=ob.matrix_world.copy();inv=frame.inverted_safe()
        for v in ob.data.vertices:
            pos=frame@v.co
            t=max(0,min(1,(pos.x+.24)/.27));blend=t*t*(3-2*t)
            pos.x+=.21*blend;pos.z+=.053*blend
            v.co=inv@pos;edited+=1
        ob.data.update()
    y=-d['width']*.181
    dark=mat('v14_steering_rim_dark_suede',(.017,.018,.02),.85)
    alloy=mat('v14_steering_hub_anodized',(.25,.28,.33),.31,.65)
    wheelExists=any(o.name.startswith('Cockpit_V11_steering_rim') or
        o.name.startswith('V14DriverSteeringRim') for o in bpy.data.objects)
    if not wheelExists:
        bpy.ops.mesh.primitive_torus_add(
            major_segments=48,minor_segments=10,major_radius=.112,minor_radius=.012,
            location=(.264,y,.961),rotation=(0,math.pi/2,0))
        steering=bpy.context.object;steering.name='V14DriverSteeringRim'
        steering.data.materials.append(dark)
        for a in (math.pi*.5,math.pi*7/6,math.pi*11/6):
            end=(.264,y+.10*math.cos(a),.961+.10*math.sin(a))
            tube('V14DriverSteeringSpoke',[(.264,y,.961),end],.010,alloy)
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24,radius=.032,depth=.036,location=(.264,y,.961),
            rotation=(0,math.pi/2,0))
        hub=bpy.context.object;hub.name='V14DriverSteeringHub'
        hub.data.materials.append(alloy)
    bpy.context.view_layer.update()
    for name,v in old.items():
        if (bpy.data.objects[name].matrix_world.translation-v).length>1e-5:
            raise RuntimeError('Wheel pivot changed: '+name)
    save(d['id']+'-pilot-v14-final-polish.blend')
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',
                              export_extras=True,export_animations=False)
    # For an honest anatomical preview include a visible steering wheel and
    # a simple temporary seat rig, never added to the exported car GLB.
    other=[(o,o.hide_render) for o in bpy.data.objects if o.type=='MESH'
           and not (o.name.startswith('HorizonPilotV14_') or
                    o.name.startswith('V14DriverSteering') or
                    o.name.startswith('Cockpit_V11_steering'))]
    for o,flag in other:o.hide_render=True
    seat=mat('v14_preview_seat_black',(.025,.03,.04),.85)
    for name,loc,size in [
      ('PreviewSeatBack',(-.675,y,.89),(.10,.40,.44)),
      ('PreviewSeatCushion',(-.44,y,.705),(.44,.40,.10))
    ]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
        o=bpy.context.object;o.name=name;o.dimensions=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bevel=o.modifiers.new('Seat bevel','BEVEL');bevel.width=.035;bevel.segments=3
        o.data.materials.append(seat)
    img=PREVIEW/(d['id']+'-final-polish.png')
    render_scene((-.35,y,.99),img,1.72,750)
    pilot_results.append({'id':d['id'],'previousSha256':origin,
        'newSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),
        'steeringAdded':not wheelExists,'handForearmVerticesAligned':edited,
        'pilotMeshes':len(pilots),'render':str(img.relative_to(ROOT))})
    print('V14_PILOT_POLISHED '+json.dumps(pilot_results[-1]),flush=True)

# In a distinct actual Blender pass, lift the glyphs above the curved envelope
# and add stitched bands: the first render hid letters behind their own fabric.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(BALGLB))
bpy.context.view_layer.update()
letters=[o for o in bpy.data.objects if o.name.startswith('HorizonBalloonV14_GOODYEAR_')]
if len(letters)<16:raise RuntimeError('Original Goodyear curved lettering missing')
for ob in letters:
    side=-1 if '_F_' in ob.name else 1
    ob.location.y+=side*1.2
    ob.scale*=1.045
    # Geometry remains 3D, rather than converting back to an overlay sprite.
    for m in ob.data.materials:
        m.diffuse_color=(.99,.85,.025,1)
        if m.use_nodes:
            p=m.node_tree.nodes.get('Principled BSDF')
            p.inputs['Base Color'].default_value=(.99,.85,.025,1)
            emission=p.inputs.get('Emission Color') or p.inputs.get('Emission')
            if emission:emission.default_value=(.7,.52,.014,1)
            strength=p.inputs.get('Emission Strength')
            if strength:strength.default_value=.65

banner=mat('V14_GOODYEAR_embossed_fabric_patch',(.009,.037,.18),.9)
def radius(z):
    t=max(0,min(1,(z-18)/45))
    return 2.8+19.1*max(0,math.sin(t*math.pi))**.83*(.86+.14*t)-2.8*t**3
for side in (-1,1):
    vertices=[];faces=[];nx=50;ny=14
    for k in range(ny+1):
        z=36.2+k*9.6/ny
        r=radius(z)
        for i in range(nx+1):
            x=-17.4+i*34.8/nx
            y=side*(math.sqrt(max(1,r*r-x*x))+.32)
            vertices.append((x,y,z))
    for k in range(ny):
        for i in range(nx):
            a=k*(nx+1)+i
            faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new('Embossed cloth ribbon')
    mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new('HorizonBalloonV14_GOODYEAR_embossed_band_'+str(side),mesh)
    bpy.context.collection.objects.link(ob);ob.data.materials.append(banner)
    for f in mesh.polygons:f.use_smooth=True
# Keep a genuine Blender GLB asset with a UV-independent 3D stitched wordmark.
save('goodyear-balloon-v14-final-polish.blend')
bpy.ops.export_scene.gltf(filepath=str(BALGLB),export_format='GLB',
                          export_extras=True,export_animations=False)
img=PREVIEW/'goodyear-final-polish-night.png'
render_scene((0,0,38),img,86,15000)
balloon={'totalLogotypeLetters':len(letters),'stitchedBanners':2,
  'render':str(img.relative_to(ROOT)),
  'sha256':hashlib.sha256(BALGLB.read_bytes()).hexdigest()}
print('V14_BALLOON_POLISHED '+json.dumps(balloon),flush=True)

# A distinct Blender scene (reference-only) shows thicker luminous trails.
fireblend=BLEND/'monzon-fireworks-v14-pass3.blend'
if not fireblend.is_file():raise RuntimeError('Missing V14 third pyro pass')
bpy.ops.wm.open_mainfile(filepath=str(fireblend))
lines=0
for o in bpy.data.objects:
    if o.type=='CURVE' and o.name.startswith('v14_pyro_star_'):
        o.data.bevel_depth*=2.8;lines+=1
if bpy.context.scene.world is None:bpy.context.scene.world=bpy.data.worlds.new('Monzon Night V14')
bpy.context.scene.world.color=(.0005,.0015,.005)
save('monzon-fireworks-v14-final-polish.blend')
bpy.ops.object.camera_add(location=(0,-118,36))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,43))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=110
bpy.context.scene.camera=cam
bpy.context.scene.render.engine='CYCLES'
bpy.context.scene.cycles.samples=14
bpy.context.scene.render.resolution_x=880
bpy.context.scene.render.resolution_y=520
bpy.context.scene.render.resolution_percentage=100
bpy.context.scene.render.image_settings.file_format='PNG'
pyro=PREVIEW/'monzon-fireworks-final-polish.png'
bpy.context.scene.render.filepath=str(pyro)
bpy.ops.render.render(write_still=True)
pyroReport={'curvedTrailsPolished':lines,'referenceOnly':True,'render':str(pyro.relative_to(ROOT))}
result={'status':'V14_FINAL_POLISH_EXPORTS_AND_RENDERS_READY_FOR_VISUAL_REVIEW',
 'pilots':pilot_results,'balloon':balloon,'fireworksReference':pyroReport}
(QUALITY/'final-polish-report.json').write_text(json.dumps(result,indent=2)+'\n')
print('V14_FINAL_POLISH_COMPLETE '+json.dumps(result),flush=True)
