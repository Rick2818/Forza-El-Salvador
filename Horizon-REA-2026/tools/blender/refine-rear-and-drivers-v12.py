"""Non-destructive Blender V12 pass: two rounded rears, seven racing drivers."""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
DESIGNS = json.loads((ROOT/'src/vehicle/vehicle-designs.json').read_text())
GLBS = ROOT/'public/models/selected'
BLENDS = ROOT/'tools/blender/selected-sources/v12'
REPORT = ROOT/'docs/quality/v12'
BLENDS.mkdir(parents=True, exist_ok=True)
REPORT.mkdir(parents=True, exist_ok=True)
REFINE = {'mercedes-amg-gt-black-series','koenigsegg-jesko-odin'}

def material(name, rgb, metal=0, rough=.55):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    m.diffuse_color=(*rgb,1)
    return m

def sphere(name,xyz,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14,ring_count=10,location=xyz)
    o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    for poly in o.data.polygons:poly.use_smooth=True
    return o

def limb(name,a,b,radius,mat):
    a=Vector(a);b=Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=9,radius=radius,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    o.data.materials.append(mat)
    return o

def line(name,pts,radius,mat):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D'
    d.bevel_depth=radius;d.bevel_resolution=2
    s=d.splines.new('POLY');s.points.add(len(pts)-1)
    for v,p in zip(s.points,pts):v.co=(*p,1)
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
    bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    return bpy.context.object

def pilot(d):
    if any(o.name.startswith('HorizonPilot_') for o in bpy.data.objects):
        raise RuntimeError('Pilot already present; refusing duplication')
    y=-d['width']*.18
    hz=min(1.13,d['height']-.153)
    shoulder=hz-.255
    suit=material('pilot_suit_charcoal',(.016,.025,.040))
    shell=material('pilot_helmet_ivory',(.72,.78,.83),.14,.35)
    visor=material('pilot_visor_dark',(.025,.043,.055),.24,.28)
    gloves=material('pilot_gloves',(.03,.035,.038))
    harness=material('pilot_racing_harness',(.70,.10,.035))
    sphere('HorizonPilot_helmet',(-.37,y,hz),(.164,.135,.132),shell)
    sphere('HorizonPilot_visor',(-.22,y,hz+.014),(.023,.108,.054),visor)
    sphere('HorizonPilot_torso',(-.53,y,shoulder-.09),(.225,.20,.226),suit)
    sphere('HorizonPilot_hips',(-.65,y,.755),(.22,.20,.082),suit)
    limb('HorizonPilot_neck',(-.42,y,shoulder+.05),(-.4,y,hz-.10),.05,suit)
    for side in (-1,1):
        a=(-.42,y+side*.145,shoulder)
        elbow=(-.17,y+side*.186,shoulder-.07)
        hand=(.03,y+side*.086,.923)
        limb('HorizonPilot_upper_arm',a,elbow,.064,suit)
        limb('HorizonPilot_forearm',elbow,hand,.048,suit)
        sphere('HorizonPilot_glove',hand,(.055,.052,.042),gloves)
        line('HorizonPilot_harness',[(-.51,y+side*.12,shoulder+.13),
             (-.48,y+side*.065,shoulder-.055),(-.65,y+side*.075,.81)],.017,harness)
    return len([o for o in bpy.data.objects if o.name.startswith('HorizonPilot_')])

def rear_roundover(d):
    rear=-d['length']/2
    half_width=d['width']/2
    extent=.60 if d['style']=='amg' else .67
    shift=.15 if d['style']=='amg' else .19
    count=0; objects=[]
    for ob in list(bpy.data.objects):
        if ob.type!='MESH':continue
        ancestors=[];o=ob
        while o is not None:ancestors.append(o.name);o=o.parent
        if any(a.startswith(('wheel_fr','wheel_fl','wheel_rr','wheel_rl')) for a in ancestors):continue
        ob.data=ob.data.copy()
        world=ob.matrix_world.copy();inv=world.inverted_safe();modified=0
        for v in ob.data.vertices:
            p=world@v.co
            dist=p.x-rear
            if dist<-.05 or dist>extent or p.z<.16 or p.z>.97 or abs(p.y)>half_width*1.15:continue
            t=max(0,min(1,(extent-dist)/extent))
            side=min(1,abs(p.y)/half_width)
            influence=t*t*(3-2*t)*side*side
            if influence<.001:continue
            p.x+=shift*influence
            p.y*=1-.056*t*side
            p.z+=.015*t*side
            v.co=inv@p;modified+=1
        if modified:
            ob.data.update();count+=modified;objects.append((ob.name,modified))
    if count<30:raise RuntimeError('Not enough rear geometry sculpted: '+str(count))
    red=material('v12_rear_signature_red',(.65,.008,.015),rough=.3)
    carbon=material('v12_diffuser_carbon',(.025,.030,.036),rough=.72)
    tail=[];skirt=[]
    for i in range(49):
        lateral=(i/48)*2-1
        y=lateral*half_width*.80
        x=rear-.023+shift*(abs(lateral)**2)
        tail.append((x,y,.70-.035*abs(lateral)**1.5))
        skirt.append((x+.015,y,.285))
    line('V12_sculpted_curved_rear_taillight',tail,.016,red)
    line('V12_sculpted_lower_diffuser',skirt,.017,carbon)
    return {'vertexCount':count,'objects':objects,'rearCornerRoundoverMetres':shift,'rearEndAffectedMetres':extent}

def run(d):
    path=GLBS/(d['id']+'.glb')
    original=hashlib.sha256(path.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    wheel_names=('wheel_fr','wheel_fl','wheel_rr','wheel_rl')
    if not all(bpy.data.objects.get(n) for n in wheel_names):
        raise RuntimeError(d['id']+': missing approved wheel pivots')
    before={n:tuple(bpy.data.objects[n].matrix_world.translation) for n in wheel_names}
    rear=rear_roundover(d) if d['id'] in REFINE else None
    count=pilot(d)
    if count<13:raise RuntimeError('Missing pieces of pilot '+d['id'])
    bpy.context.view_layer.update()
    for name,coords in before.items():
        if (bpy.data.objects[name].matrix_world.translation-Vector(coords)).length>1e-5:
            raise RuntimeError('Wheel pivot moved: '+name)
    if rear is not None:
        bpy.context.preferences.filepaths.save_version=0
        bpy.context.scene['rearRevision']='V12 rounded rear and driver'
        bpy.ops.wm.save_as_mainfile(filepath=str(BLENDS/(d['id']+'-rear-v12.blend')),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_extras=True,export_animations=False)
    result={'id':d['id'],'originalSha256':original,
        'outputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'pilotMeshes':count,'wheelsUnchanged':True,'rearRefinement':rear}
    print('HORIZON_V12 '+json.dumps(result),flush=True)
    return result

data=[run(d) for d in DESIGNS]
assert len(data)==7
assert sum(r['rearRefinement'] is not None for r in data)==2
(REPORT/'blender-refinement.json').write_text(json.dumps({'status':'EXPORTED_NOT_YET_VISUALLY_APPROVED','vehicles':data},indent=2)+'\n')
print('HORIZON_V12_ALL_EXPORTED')
