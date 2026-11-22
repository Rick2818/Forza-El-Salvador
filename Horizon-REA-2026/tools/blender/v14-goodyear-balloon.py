"""Goodyear V14: three REAL Blender modelling passes, preview PNGs, final GLB.
Blend files remain editable. No texture planes/spherical placeholder used.
Run: blender -b -t 2 --python tools/blender/v14-goodyear-balloon.py
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/balloon'
BLENDS=ROOT/'tools/blender/selected-sources/v14'
QUALITY=ROOT/'docs/quality/v14'
PREVIEW=QUALITY/'previews'
for d in (OUT,BLENDS,QUALITY,PREVIEW):d.mkdir(parents=True,exist_ok=True)
P='HorizonBalloonV14_'

def material(name,rgb,rough=.67,metal=0,emissive=None,strength=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*rgb,1)
    shader.inputs['Roughness'].default_value=rough
    shader.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb,1)
    if emissive:
        # Blender 3.4 and later: glTF exporter preserves emissive materials.
        e=shader.inputs.get('Emission') or shader.inputs.get('Emission Color')
        if e:e.default_value=(*emissive,1)
        strengthInput=shader.inputs.get('Emission Strength')
        if strengthInput:strengthInput.default_value=strength
    return m

NAVY=material('V14_ripstop_Goodyear_deep_blue',(.005,.058,.24),.72)
BLUE=material('V14_ripstop_Goodyear_blue',(.018,.137,.44),.7)
YELLOW=material('V14_Goodyear_gold',(.95,.72,.015),.48,0,(.70,.46,.008),.35)
DARK=material('V14_wicker_brushed_walnut',(.12,.063,.031),.91)
ROPE=material('V14_suspension_cord',(.39,.35,.27),.85)
METAL=material('V14_burner_brushed_steel',(.34,.40,.47),.3,.65)
EMIT=material('V14_integrated_LED_gold',(.97,.84,.22),.28,0,(1,.64,.12),1.6)
bpy.ops.wm.read_factory_settings(use_empty=True)

# Materials may be reset by read_factory_settings, allocate AFTER reset:
NAVY=material('V14_ripstop_Goodyear_deep_blue',(.005,.058,.24),.72)
BLUE=material('V14_ripstop_Goodyear_blue',(.018,.137,.44),.7)
YELLOW=material('V14_Goodyear_gold',(.95,.72,.015),.48,0,(.70,.46,.008),.35)
DARK=material('V14_wicker_brushed_walnut',(.12,.063,.031),.91)
ROPE=material('V14_suspension_cord',(.39,.35,.27),.85)
METAL=material('V14_burner_brushed_steel',(.34,.40,.47),.3,.65)
EMIT=material('V14_integrated_LED_gold',(.97,.84,.22),.28,0,(1,.64,.12),1.6)

def shape(name,verts,faces,mats,indices=None):
    data=bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(P+name,data);bpy.context.collection.objects.link(obj)
    for mat in mats:data.materials.append(mat)
    for i,poly in enumerate(data.polygons):
        poly.use_smooth=True
        if indices:poly.material_index=indices[i]
    return obj

def tube(name,pts,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(len(pts)-1)
    for p,v in zip(spline.points,pts):p.co=(*v,1)
    ob=bpy.data.objects.new(P+name,curve);bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True);bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object

def ring_radius(t):
    return 2.8+19.1*(max(0,math.sin(t*math.pi))**.83)*(.86+.14*t)-2.8*(t**3)
def envelope():
    verts=[];faces=[];indices=[]
    layers=52;segments=96
    for row in range(layers+1):
        t=row/layers;z=18+45*t;r=ring_radius(t)
        for i in range(segments):
            a=i*math.tau/segments
            # Very shallow seam between fabric gores makes the silhouette tactile.
            seam=1-.007*abs(math.sin(i*math.tau/segments*12))**18
            verts.append((r*math.cos(a)*seam,r*math.sin(a)*seam,z))
    for row in range(layers):
        for i in range(segments):
            n=row*segments+i; m=row*segments+(i+1)%segments
            faces.append((n,m,m+segments,n+segments))
            wedge=i//8
            indices.append(2 if wedge%6==0 else 1 if wedge%2 else 0)
    return shape('woven_envelope_12_gore_panels',verts,faces,[NAVY,BLUE,YELLOW],indices)

def basket():
    segments=32;levels=9
    verts=[];faces=[]
    for j in range(levels+1):
        z=1.1+j*.65;r=3.1-j*.008
        for i in range(segments):
            a=i*math.tau/segments
            verts.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(levels):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    shape('reinforced_rattan_basket',verts,faces,[DARK])
    for k in range(6):
        z=1.5+k*.9
        tube('rattan_band_'+str(k),[
          (3.11*math.cos(i*math.tau/64),3.11*math.sin(i*math.tau/64),z) for i in range(65)],.07,YELLOW if k==5 else ROPE)
    for k in range(8):
        a=k*math.tau/8
        tube('suspension_cable_'+str(k),[
          (2.7*math.cos(a),2.7*math.sin(a),6.8),
          (3.9*math.cos(a),3.9*math.sin(a),10.2),
          (4.6*math.cos(a),4.6*math.sin(a),17.9)
        ],.085,ROPE)
    tube('burner_frame',[(0,0,7.6),(0,0,12.2)],.46,METAL)
    tube('throat_ring',[(3.0*math.cos(i*math.tau/64),3.0*math.sin(i*math.tau/64),18) for i in range(65)],.30,METAL)

def shape_pass():
    envelope();basket()

def logo(side):
    # Each glyph is on the curved fabric surface, not a billboard or a floating PNG.
    word='GOODYEAR'
    rad=ring_radius((41-18)/45)
    for index,char in enumerate(word):
        x=(index-3.5)*4.12
        d=math.sqrt(max(1,rad*rad-x*x))
        text=bpy.data.curves.new('letter','FONT')
        text.body=char;text.align_x='CENTER';text.align_y='CENTER'
        text.size=4.6;text.extrude=.035;text.bevel_depth=.026;text.bevel_resolution=1
        obj=bpy.data.objects.new(P+'GOODYEAR_'+('F' if side<0 else 'B')+'_'+str(index),text)
        bpy.context.collection.objects.link(obj)
        obj.location=(x,side*(d+.10),41)
        # Blender fonts are XY with a +Z front normal. Rotate to the two sky-facing banks.
        obj.rotation_euler=(math.pi/2,0,math.pi if side>0 else 0)
        obj.data.materials.append(YELLOW)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')

def finish_pass():
    for side in [-1,1]:logo(side)
    for gore in range(12):
        a=gore*math.tau/12
        pts=[(ring_radius(j/70)*math.cos(a),ring_radius(j/70)*math.sin(a),18+45*j/70) for j in range(71)]
        tube('reinforced_gore_seam_'+str(gore),pts,.060,ROPE)
    for z in [24,40,52]:
        radius=ring_radius((z-18)/45)+.1
        tube('gold_piping_at_'+str(z),[
          (radius*math.cos(i*math.tau/96),radius*math.sin(i*math.tau/96),z) for i in range(97)],.09,YELLOW)

def lighting_pass():
    # Single mesh for LEDs = 1 draw call, not 80 separate dynamic lights.
    vertices=[];faces=[]
    for row,z in enumerate([24,40,52]):
        radius=ring_radius((z-18)/45)+.32
        for i in range(40):
            a=i*math.tau/40
            cx,cy=radius*math.cos(a),radius*math.sin(a)
            u=Vector((math.cos(a),math.sin(a),0))
            t=Vector((-math.sin(a),math.cos(a),0))
            center=Vector((cx,cy,z))
            for p in [center+u*.22,center+t*.23,center+Vector((0,0,.27)),center-t*.23]:
                vertices.append(tuple(p))
            b=len(vertices)-4
            faces.append((b,b+1,b+2));faces.append((b,b+2,b+3))
    shape('integrated_basket_and_envelope_LEDs',vertices,faces,[EMIT])
    # Maintain an exhaust burner above basket but inside neck, not a giant ball.
    tube('burner_nozzle',[(0,0,9),(0,0,13),(0,0,17)],.29,METAL)

def stage(passnum):
    bpy.context.scene['HorizonV14Pass']=passnum
    bpy.context.preferences.filepaths.save_version=0
    out=BLENDS/('goodyear-balloon-v14-pass'+str(passnum)+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
    return out

def render(passnum,night=False):
    bpy.ops.object.camera_add(location=(83,-114,79))
    cam=bpy.context.object;cam.name='V14_balloon_review_camera'
    target=Vector((0,0,36));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=84
    bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(22,-31,91))
    key=bpy.context.object;key.data.energy=12000 if night else 15500;key.data.size=32
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=12
    scene.render.resolution_x=760;scene.render.resolution_y=510
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    if scene.world is None:scene.world=bpy.data.worlds.new("V14 Balloon Studio World")
    scene.world.color=(.008,.018,.05) if night else (.27,.37,.51)
    path=PREVIEW/('goodyear-pass'+str(passnum)+('-night' if night else '')+'.png')
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam,do_unlink=True);bpy.data.objects.remove(key,do_unlink=True)
    return str(path.relative_to(ROOT))

stages=[]
for index,func in [(1,shape_pass),(2,finish_pass),(3,lighting_pass)]:
    func()
    b=stage(index);p=render(index)
    stages.append({'pass':index,'blend':str(b.relative_to(ROOT)),'preview':p,'meshes':sum(o.type=='MESH' for o in bpy.data.objects)})
    print('BALLOON_V14_PASS '+json.dumps(stages[-1]),flush=True)
out=OUT/'goodyear-v14.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_extras=True,export_animations=False)
night=render(3,True)
report={'model':'GOODYEAR 40m GORES 3-pass Blender authored','passes':stages,
 'nightPreview':night,'asset':str(out.relative_to(ROOT)),
 'glbBytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
 'status':'EXPORTED_VISUAL_APPROVAL_PENDING'}
(QUALITY/'balloon-pass-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('BALLOON_V14_GLB_READY '+json.dumps(report),flush=True)
