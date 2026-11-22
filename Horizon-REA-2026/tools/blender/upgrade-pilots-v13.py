"""Horizon V13 human proportions: replace V12 primitives with sculpted racing pilots.

Run inside Blender 5 with numpy:
 blender -b -t 2 --python tools/blender/upgrade-pilots-v13.py

Non-destructive GLB pass. Retains all bodywork, glass, rims, and physics pivots.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector
import bmesh

ROOT=Path(__file__).resolve().parents[2]
DESIGNS=json.loads((ROOT/'src/vehicle/vehicle-designs.json').read_text())
MODELS=ROOT/'public/models/selected'
BLENDS=ROOT/'tools/blender/selected-sources/v13'
REPORTS=ROOT/'docs/quality/v13'
BLENDS.mkdir(parents=True,exist_ok=True)
REPORTS.mkdir(parents=True,exist_ok=True)
PREFIX='HorizonPilotV13_'
JOINT_SECTIONS=12

def mat(name,rgb,rough=.56,metal=0):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb,1)
    return m

def rgb(h):
    c=[int(h[k:k+2],16)/255 for k in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)

def surface(name,verts,faces,material):
    data=bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces)
    data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    o=bpy.data.objects.new(PREFIX+name,data)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    for f in data.polygons:f.use_smooth=True
    return o

def loft(name,sections,material,detail=20):
    """Anatomical ring loft, not overlapped sphere/cylinder primitives.

    Each section: (center x,center y,center z,radius in X,radius in Y).
    """
    vertices=[]
    for x,y,z,rx,ry in sections:
        for i in range(detail):
            a=i*math.tau/detail
            vertices.append((x+rx*math.cos(a),y+ry*math.sin(a),z))
    faces=[]
    for j in range(len(sections)-1):
        for i in range(detail):
            a=j*detail+i;b=j*detail+(i+1)%detail
            faces.append((a,b,b+detail,a+detail))
    faces.append(tuple(range(detail-1,-1,-1)))
    faces.append(tuple((len(sections)-1)*detail+i for i in range(detail)))
    return surface(name,vertices,faces,material)

def limb(name,points,thickness,material):
    """Curved limb sweep with shoulder->elbow->hand or hip->knee->foot."""
    pts=[Vector(p) for p in points]
    verts=[]
    for i,p in enumerate(pts):
        tangent=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)])
        tangent.normalize()
        axis=tangent.cross(Vector((0,0,1)))
        if axis.length<.01:axis=tangent.cross(Vector((0,1,0)))
        axis.normalize()
        binormal=tangent.cross(axis).normalized()
        for k in range(JOINT_SECTIONS):
            angle=math.tau*k/JOINT_SECTIONS
            v=p+(axis*math.cos(angle)+binormal*math.sin(angle))*thickness[i]
            verts.append(tuple(v))
    faces=[]
    for i in range(len(pts)-1):
        for k in range(JOINT_SECTIONS):
            a=i*JOINT_SECTIONS+k
            b=i*JOINT_SECTIONS+(k+1)%JOINT_SECTIONS
            faces.append((a,b,b+JOINT_SECTIONS,a+JOINT_SECTIONS))
    faces.append(tuple(range(JOINT_SECTIONS-1,-1,-1)))
    faces.append(tuple((len(pts)-1)*JOINT_SECTIONS+k for k in range(JOINT_SECTIONS)))
    return surface(name,verts,faces,material)

def driver(d):
    if any(ob.name.startswith(PREFIX) for ob in bpy.data.objects):
        raise RuntimeError('V13 driver already present: '+d['id'])
    seat_y= -d['width']*.181
    height=d['height']
    eye=min(1.125,height-.122)
    # Lower low-roof supercars and shift torso 4 cm aft for the Mercedes.
    shift=-.045 if d['style']=='amg' else 0
    suit=mat('v13_suit_matte_graphite',(.017,.025,.045))
    torsoHighlight=mat('v13_suit_panels',(.038,.055,.075),.72)
    suitSeam=mat('v13_suit_seams',(.14,.17,.21))
    helmet=mat('v13_helmet_pearlescent',(.72,.79,.85),.3,.18)
    visor=mat('v13_visordark_optical',(.015,.037,.068),.2,.42)
    helmetStripe=mat('v13_helmet_accent',rgb(d['paint']),.35,.2)
    gloves=mat('v13_racing_gloves',(.036,.039,.042),.76)
    harness=mat('v13_safety_harness_red',(.55,.016,.018),.72)
    boot=mat('v13_pedal_boots',(.026,.028,.033),.82)

    # Sculpt shoulders, chest, waist and back into one continuous anatomical silhouette.
    loft('one_piece_torso',[
        (-.64+shift,seat_y,.755,.145,.13),
        (-.61+shift,seat_y,.815,.18,.17),
        (-.565+shift,seat_y,.875,.19,.20),
        (-.52+shift,seat_y,.945,.17,.215),
        (-.49+shift,seat_y,eye-.25,.15,.19),
        (-.445+shift,seat_y,eye-.20,.11,.155),
        (-.425+shift,seat_y,eye-.17,.065,.085),
    ],suit,24)
    # Helmet: curved rigid shell with tapered chin and round crown.
    z=eye
    loft('aerodynamic_fullface_helmet',[
        (-.38,seat_y,z-.143,.054,.066),
        (-.373,seat_y,z-.127,.120,.111),
        (-.370,seat_y,z-.092,.155,.136),
        (-.386,seat_y,z-.025,.167,.151),
        (-.39,seat_y,z+.047,.157,.143),
        (-.40,seat_y,z+.096,.122,.116),
        (-.415,seat_y,z+.135,.06,.064),
        (-.42,seat_y,z+.148,.012,.014)
    ],helmet,30)
    # Fitted visor wraps around the upper front of the helmet.
    v=[],[]
    vertices=[];faces=[];ny=15;nz=5
    for j in range(nz):
        level=(j/(nz-1)-.5)*.105
        for i in range(ny):
            lateral=(i/(ny-1)*2-1)*.117
            curve=max(.0,1-(lateral/.158)**2-(level/.162)**2)
            x=-.38 + .165*math.sqrt(curve)+.004
            vertices.append((x,seat_y+lateral,z+level+.017))
    for j in range(nz-1):
        for i in range(ny-1):
            a=j*ny+i
            faces.append((a,a+1,a+ny+1,a+ny))
    surface('curved_dark_visor',vertices,faces,visor)
    # Forehead racing livery and jaw vent, both following the original shell.
    loft('helmet_top_stripe',[
        (-.42,seat_y,z+.142,.011,.020),
        (-.414,seat_y,z+.154,.05,.027),
        (-.4,seat_y,z+.163,.015,.017)
    ],helmetStripe,14)
    loft('chin_air_intake',[
        (-.232,seat_y,z-.118,.008,.048),
        (-.225,seat_y,z-.091,.008,.053),
        (-.225,seat_y,z-.067,.006,.042)
    ],visor,14)
    # Slim shoulder armour and recessed left/right harness straps.
    for sign in (-1,1):
        limb('shoulder_panel',[
            (-.46+shift,seat_y+sign*.158,eye-.24),
            (-.51+shift,seat_y+sign*.180,eye-.285),
            (-.56+shift,seat_y+sign*.161,eye-.34)
        ],[.065,.069,.052],torsoHighlight)
        limb('racing_harness',[
            (-.465+shift,seat_y+sign*.125,eye-.226),
            (-.53+shift,seat_y+sign*.071,eye-.315),
            (-.635+shift,seat_y+sign*.058,.806)
        ],[.018,.019,.019],harness)
        a=(-.475+shift,seat_y+sign*.157,eye-.25)
        elbow=(-.195+shift,seat_y+sign*.210,eye-.35)
        wrist=(.01,seat_y+sign*.090,.907)
        limb('curved_arm',[
            a,(-.36+shift,seat_y+sign*.195,eye-.29),elbow,
            (-.10,seat_y+sign*.14,eye-.235),wrist
        ],[.071,.067,.064,.052,.044],suit)
        loft('gloved_fingers',[
            (wrist[0]-.035,wrist[1],wrist[2]-.04,.035,.042),
            (wrist[0]+.012,wrist[1],wrist[2],.044,.048),
            (wrist[0]+.048,wrist[1],wrist[2]+.02,.018,.031)
        ],gloves,12)
        # Bent hips, knees and boots reach the pedals, not the front bumper.
        hip=(-.61+shift,seat_y+sign*.099,.743)
        knee=(-.115,seat_y+sign*.12,.492)
        pedal=(.33,seat_y+sign*.10,.337)
        limb('anatomical_legs',[
            hip,(-.39,seat_y+sign*.12,.626),knee,(.07,seat_y+sign*.11,.398),pedal
        ],[.117,.123,.111,.075,.066],suit)
        limb('foot_on_pedal',[
            (.24,seat_y+sign*.10,.352),(.33,seat_y+sign*.10,.329),
            (.41,seat_y+sign*.10,.319)
        ],[.064,.059,.037],boot)
    return len([ob for ob in bpy.data.objects if ob.name.startswith(PREFIX)])

def run(d):
    asset=MODELS/(d['id']+'.glb')
    original=hashlib.sha256(asset.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(asset))
    bpy.context.view_layer.update()
    wheels=('wheel_fr','wheel_fl','wheel_rr','wheel_rl')
    for w in wheels:
        if bpy.data.objects.get(w) is None:raise RuntimeError('Missing wheel pivot '+w)
    before={w:tuple(bpy.data.objects[w].matrix_world.translation) for w in wheels}
    old=[ob for ob in bpy.data.objects if ob.name.startswith('HorizonPilot_')]
    if len(old)<10:raise RuntimeError('Expected 13 V12 pilot mesh objects in '+d['id']+' got '+str(len(old)))
    for ob in old:bpy.data.objects.remove(ob,do_unlink=True)
    count=driver(d)
    if count<22:raise RuntimeError('V13 pilot is incomplete: '+str(count))
    bpy.context.view_layer.update()
    for w,oldPosition in before.items():
        if (bpy.data.objects[w].matrix_world.translation-Vector(oldPosition)).length>1e-5:
            raise RuntimeError('Wheel rig changed '+w)
    bpy.context.scene['HorizonPilotVersion']='V13 anatomical seated driver, approved exterior retained'
    bpy.context.scene['ReplacesV12Meshes']=len(old)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDS/(d['id']+'-pilot-v13.blend')),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',
        export_extras=True,export_animations=False)
    result={'id':d['id'],'inputSha256':original,'outputSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),
        'oldPilotRemoved':len(old),'newPilotMeshes':count,'wheelsPreserved':True,
        'blenderSource':(d['id']+'-pilot-v13.blend')}
    print('PILOT_V13 '+json.dumps(result),flush=True)
    return result

report=[run(d) for d in DESIGNS]
assert len(report)==7 and all(r['newPilotMeshes']>=22 for r in report)
(REPORTS/'pilot-report.json').write_text(json.dumps({
    'status':'EXPORTED_REVIEW_REQUIRED','vehicles':report
},indent=2)+'\n')
print('PILOT_V13_ALL_SEVEN_EXPORTS_OK')
