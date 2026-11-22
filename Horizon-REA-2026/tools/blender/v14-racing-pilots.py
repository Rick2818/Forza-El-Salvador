"""Horizon V14: THREE auditable Blender passes on each of seven approved cars.

Stage 1 geometry; stage 2 PBR, visor, racing details; stage 3 cabin fitting
and GLB export. Never modifies approved bodywork/wheels or replaces vehicles.
Run blender -b -t 2 --python tools/blender/v14-racing-pilots.py
"""
import bpy,math,json,hashlib,os
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
DESIGNS=json.loads((ROOT/'src/vehicle/vehicle-designs.json').read_text())
MODELS=ROOT/'public/models/selected'
SOURCE=ROOT/'tools/blender/selected-sources/v14'
QUALITY=ROOT/'docs/quality/v14'
PREVIEW=QUALITY/'previews'
for d in (SOURCE,QUALITY,PREVIEW):d.mkdir(parents=True,exist_ok=True)
PREFIX="HorizonPilotV14_"

# Reuse tested continuous anatomical surface generators (not primitive objects).
v13path=ROOT/'tools/blender/upgrade-pilots-v13.py'
legacy=v13path.read_text().split('def run(d):')[0]
legacy=legacy.replace("PREFIX='HorizonPilotV13_'","PREFIX='HorizonPilotV14_'")
ns={'__file__':str(v13path),'__name__':'horizon_v14_components'}
exec(compile(legacy,str(v13path),'exec'),ns)
driver,loft,limb,surface,mat=ns['driver'],ns['loft'],ns['limb'],ns['surface'],ns['mat']

def active():
    return [ob for ob in bpy.data.objects if ob.name.startswith(PREFIX)]

def assert_wheels(old):
    bpy.context.view_layer.update()
    for wheel,position in old.items():
        obj=bpy.data.objects.get(wheel)
        if obj is None or (obj.matrix_world.translation-Vector(position)).length>1e-5:
            raise RuntimeError('Existing wheel pivot changed: '+wheel)

def save_stage(d,pass_num,final=False):
    bpy.context.scene['HorizonVisualQuality']='V14'
    bpy.context.scene['BlenderPass']=pass_num
    path=SOURCE/(d['id']+'-pilot-v14-p'+str(pass_num)+'.blend')
    if not (final or d['id'] in ('ferrari-california-t','porsche-911','koenigsegg-jesko-odin')):
        # Only representative interim sources are retained; all 7 final sources kept.
        return None
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    return str(path.relative_to(ROOT))

def material(name,c,rough=.55,metal=.0):
    return mat(name,c,rough,metal)

def geometry_pass(d):
    old=[o for o in bpy.data.objects if o.name.startswith('HorizonPilotV13_') or o.name.startswith('HorizonPilot_')]
    if len(old)<10:raise RuntimeError('No original pilot: '+d['id'])
    for o in old:bpy.data.objects.remove(o,do_unlink=True)
    driver(d)
    y=-d['width']*.181
    z=min(1.125,d['height']-.122)
    dark=material('v14_helmet_carbon_front',(.022,.031,.043),.28,.25)
    cloth=material('v14_organic_racing_suit',(.025,.030,.049),.74)
    leather=material('v14_racing_gloves_premium',(.035,.035,.037),.68)
    # Sculpt aerodynamic lower helmet jaw and cheekbones, with continuous ring lofts.
    loft('chin_cradle',[
      (-.33,y,z-.16,.075,.105),(-.29,y,z-.135,.084,.118),
      (-.264,y,z-.094,.070,.104),(-.254,y,z-.064,.035,.063)
    ],dark,28)
    # Anatomical thighs / knees rather than thin joint-to-joint metal-rod effect.
    for s in (-1,1):
        sy=y+s*.105
        loft('stitched_knee_armor',[
            (-.215,sy,.430,.067,.075),(-.145,sy,.452,.094,.102),
            (-.092,sy,.495,.096,.104),(-.046,sy,.519,.048,.061)
        ],cloth,18)
        # Scalloped wrist cuff and individual five-finger glove silhouettes.
        palm=(.035,y+s*.09,.916)
        for finger in range(5):
            fy=palm[1]+s*(finger-2)*.018
            tip=(.087+(4-finger)*.004,fy+s*.014,.917+(finger-2)*.010)
            limb('sculpted_glove_finger',[
              (palm[0]+.010,fy,palm[2]),(.065,fy,tip[2]),tip
            ],[.013,.012,.007],leather)
    return len(active()),len(old)

def add_cord(name,pts,thickness,m):
    return limb(name,pts,[thickness]*len(pts),m)

def finish_pass(d):
    y=-d['width']*.181;z=min(1.125,d['height']-.122)
    for m in bpy.data.materials:
        if m.name.startswith('v13_'):m.name=m.name.replace('v13_','v14_')
    accent=mat('v14_team_accent',ns['rgb'](d['paint']),.36,.17)
    seam=mat('v14_seam_piping',(.41,.42,.46),.68,.08)
    visor=mat('v14_antiglare_visor_edge',(.023,.047,.068),.17,.34)
    red=mat('v14_fia_harness_fabric',(.57,.022,.027),.7,0)
    buckle=mat('v14_fia_buckle_brushed',(.52,.56,.60),.28,.65)
    # A fitted reflective brow, chin rim and structural aerodynamic stabilizer.
    for s in (-1,1):
      add_cord('visor_side_seal',[
        (-.238,y+s*.108,z-.025),(-.282,y+s*.126,z+.025),
        (-.340,y+s*.133,z+.075)
      ],.009,visor)
      add_cord('visor_frame',[
        (-.214,y+s*.104,z+.054),(-.216,y+s*.040,z+.075),
        (-.214,y,z+.078)
      ],.011,seam)
      add_cord('helmet_cheek_graphic',[
        (-.335,y+s*.133,z-.075),(-.362,y+s*.143,z-.025),
        (-.395,y+s*.126,z+.016)
      ],.014,accent)
      add_cord('racing_suit_shoulder_piping',[
        (-.465,y+s*.147,z-.244),(-.52,y+s*.17,z-.292),
        (-.565,y+s*.146,z-.349)
      ],.007,seam)
      add_cord('arm_sleeve_seam',[
        (-.345,y+s*.194,z-.284),(-.225,y+s*.210,z-.337),
        (-.103,y+s*.155,z-.241)
      ],.006,accent)
      # FIA belt: chest diagonals and hip anchoring, with buckle at navel.
      add_cord('double_layer_shoulder_harness',[
        (-.456,y+s*.123,z-.232),(-.525,y+s*.058,z-.315),
        (-.621,y+s*.045,.800)
      ],.013,red)
      for n in range(3):
        add_cord('glove_knuckle_rib',[
          (.048+n*.010,y+s*.093,z-.006),(.056+n*.010,y+s*.125,z-.002),
          (.066+n*.010,y+s*.129,z+.004)
        ],.0035,seam)
      add_cord('trouser_side_seam',[
        (-.46,y+s*.19,.622),(-.27,y+s*.21,.52),
        (-.12,y+s*.19,.453),(.08,y+s*.14,.383)
      ],.007,seam)
    loft('quick_release_central_buckle',[
      (-.588,y,.795,.025,.046),(-.568,y,.816,.035,.053),
      (-.555,y,.828,.022,.037)
    ],buckle,14)
    # Team helmet identity, with a long dorsal stripe rather than an unreadable logo.
    add_cord('helmet_racing_centre_stripe',[
        (-.52,y,z+.072),(-.487,y,z+.127),(-.416,y,z+.167),
        (-.350,y,z+.151),(-.298,y,z+.122)
    ],.015,accent)
    for ob in active():
        if ob.type=='MESH':
            for face in ob.data.polygons:face.use_smooth=True
    return len(active())

def fit_pass(d):
    pilot=active()
    if len(pilot)<35:raise RuntimeError('Missing V14 detailed pilot '+d['id']+' '+str(len(pilot)))
    height=d['height']
    maxz=max((ob.matrix_world@v.co).z for ob in pilot if ob.type=='MESH' for v in ob.data.vertices)
    shift=max(0,maxz-(height-.072))
    # Lower helmet and upper body uniformly only when roof clearance is insufficient.
    if shift>.0:
        for ob in pilot:ob.location.z-=shift
    bpy.context.view_layer.update()
    updated=max((ob.matrix_world@v.co).z for ob in pilot if ob.type=='MESH' for v in ob.data.vertices)
    if updated>height-.055:raise RuntimeError('Pilot extends through cabin roof '+d['id'])
    if shift>.16:raise RuntimeError('Pilot roof correction too large '+d['id'])
    return {'meshes':len(pilot),'roofClearanceM':round(height-updated,4),
            'verticalFittingShiftM':round(shift,4)}

def preview(d,pass_number):
    if pass_number!=3 and d['id'] not in ('porsche-911','koenigsegg-jesko-odin'):
        return None
    # Authentic Blender render of the ACTUAL final model, with exterior hidden
    # to inspect the pilot geometry rather than image-generation concept art.
    others=[ob for ob in bpy.data.objects if ob.type in ('MESH','CURVE','FONT') and not ob.name.startswith(PREFIX)]
    previous=[(ob,ob.hide_render) for ob in others]
    for ob in others:ob.hide_render=True
    bpy.ops.object.camera_add(location=(2.25,-3.6,2.12))
    cam=bpy.context.object;cam.name='V14_Preview_Camera'
    target=Vector((-.32,-d['width']*.181,.96))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=2.25
    bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(1.2,-2.8,4))
    key=bpy.context.object;key.data.energy=650;key.data.shape='DISK';key.data.size=5
    bpy.ops.object.light_add(type='AREA',location=(-2,2,2.8))
    fill=bpy.context.object;fill.data.energy=520;fill.data.size=4.5
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=8
    scene.render.resolution_x=640;scene.render.resolution_y=400;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world.color=(.06,.075,.10)
    out=PREVIEW/(d['id']+'-pass'+str(pass_number)+'.png')
    scene.render.filepath=str(out)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam,do_unlink=True)
    bpy.data.objects.remove(key,do_unlink=True)
    bpy.data.objects.remove(fill,do_unlink=True)
    for ob,flag in previous:ob.hide_render=flag
    return str(out.relative_to(ROOT))

reports=[]
for d in DESIGNS:
    asset=MODELS/(d['id']+'.glb')
    original=hashlib.sha256(asset.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(asset))
    bpy.context.view_layer.update()
    wheels=('wheel_fr','wheel_fl','wheel_rr','wheel_rl')
    before={w:tuple(bpy.data.objects[w].matrix_world.translation) for w in wheels}
    count,oldcount=geometry_pass(d);assert_wheels(before)
    p1=save_stage(d,1);preview(d,1)
    fine=finish_pass(d);assert_wheels(before)
    p2=save_stage(d,2);preview(d,2)
    fit=fit_pass(d);assert_wheels(before)
    p3=save_stage(d,3,True);p3img=preview(d,3)
    bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',
        export_extras=True,export_animations=False)
    result={'id':d['id'],'inputSha256':original,
      'outputSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),
      'pass1':{'geometryMeshes':count,'replacedV13':oldcount,'blend':p1},
      'pass2':{'materialDetailMeshes':fine,'blend':p2},
      'pass3':{'fitting':fit,'blend':p3,'render':p3img},
      'wheelPivotsPreserved':True}
    reports.append(result)
    print('HORIZON_V14_PILOT '+json.dumps(result),flush=True)
assert len(reports)==7
(QUALITY/'pilot-pass-report.json').write_text(json.dumps({
    'status':'THREE_REAL_BLENDER_PASSES_EXPORTED_VISUAL_APPROVAL_PENDING',
    'passes':[1,2,3],'vehicles':reports},indent=2)+'\n')
print('HORIZON_V14_SEVEN_PILOTS_COMPLETE',flush=True)
