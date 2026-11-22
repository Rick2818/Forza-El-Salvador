"""Build dedicated adult pit mechanics from the CC0 MakeHuman anatomical mesh.
Blender 4+: blender -b --python tools/blender/v19-mechanics.py
No MakeHuman program code is imported. Source mesh and its license are retained.
"""
import bpy, bmesh, math, os, json, gzip, shutil
from mathutils import Vector, Matrix
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
SRC=os.path.join(ROOT,'tools/blender/sources/v18/makehuman-base.obj.gz')
OUT=os.path.join(ROOT,'public/models/people'); os.makedirs(OUT,exist_ok=True)
verts=[]; faces=[]; groups=[]; group=''
for line in gzip.open(SRC,'rt'):
    p=line.split()
    if not p: continue
    if p[0]=='v': verts.append(tuple(map(float,p[1:4])))
    elif p[0]=='g': group=p[1]
    elif p[0]=='f':
        faces.append([int(v.split('/')[0])-1 for v in p[1:]]); groups.append(group)
S=1.77/16.9455
points=[Vector((v[0]*S,-v[2]*S,(v[1]+8.4488)*S)) for v in verts] # Blender Z up, front -Y
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
# Keep detailed skin above the collar and hands. Surface below it becomes clothing.
usedfaces=[]; codes=[]
for f,g in zip(faces,groups):
    if g not in ['body']: continue
    c=sum((points[i] for i in f),Vector())/len(f)
    if g.startswith('helper-'):
        code=5
    elif c.z>1.495: code=0 # neck and fully modeled face
    elif c.z<.12: continue # feet replaced by sculpted closed shoes
    elif c.z<.95: code=2
    elif abs(c.x)>.372 and c.z<1.30: code=10 # padded work gloves retain five anatomical fingers
    else: code=1
    usedfaces.append(f); codes.append(code)
# Short fitted scalp: keep forehead, ears and all facial features unobstructed.
scalp=[]
for f,g in zip(faces,groups):
    if g!='body':continue
    c=sum((points[i] for i in f),Vector())/len(f)
    if c.z>1.705 or (c.z>1.60 and c.y>-.025):scalp.append(f)
for f in scalp:
    new=[]
    for i in f:
        p=points[i].copy();p.x*=1.035;p.y*=1.035;p.z+=.004
        new.append(len(points));points.append(p)
    usedfaces.append(new);codes.append(3)
used=sorted(set(i for f in usedfaces for i in f)); remap={v:i for i,v in enumerate(used)}
mesh=bpy.data.meshes.new('CC0-anatomical-clothed-human');mesh.from_pydata([points[i] for i in used],[],[[remap[i] for i in f] for f in usedfaces]);mesh.update()
obj=bpy.data.objects.new('Horizon-clothed-human',mesh);bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
# Neutral shoulders, elbow/wrist anatomy retained. Narrow the A-pose's leg stance.
for v in mesh.vertices:
    x,y,z=v.co; ax=abs(x); sign=1 if x>=0 else -1
    if ax>.18 and z>1.0 and z<1.495:
        pivot=Vector((sign*.175,-.015,1.43))
        weight=min(1,max(0,(ax-.18)/.065))
        rotation=Matrix.Rotation(math.radians(-sign*31)*weight,4,'Y')
        # Blender X/Z plane rotation around Y: opposite sign to mathematical XY.
        rotation=Matrix.Rotation(math.radians(sign*31)*weight,4,'Y')
        v.co=pivot+rotation@(v.co-pivot)
    if z<.95: v.co.x-=sign*.105*max(0,1-z/.95)
# An adult build under a loose coverall: broaden the shoulders and waist,
# keep facial anatomy, reduce the oversized childlike head-to-body ratio.
for v in mesh.vertices:
    x,y,z=v.co;sgn=1 if x>=0 else -1
    if .96<z<1.49:
        if abs(x)<.19:
            blend=max(0,min(1,(1.48-z)/.10))
            v.co.x*=1+.20*blend
            front=-.155+.025*(abs(x)/.19)**2
            target=front if y<-.025 else max(y,.082) if y>.025 else y
            v.co.y=y*(1-blend)+target*blend
        elif abs(x)<.36:v.co.x+=sgn*.025
    if .16<z<.96:
        v.co.x+=sgn*.012
        v.co.y+=(.012 if y>0 else -.012)
    if z>1.495:
        v.co.z=1.495+(z-1.495)*.94
        v.co.x*=1.10 if z<1.64 else 1.03
        if y<-.07:v.co.y*=1.055
# One UV palette: the integer region drives per-instance skin / clothing variation.
uv=mesh.uv_layers.new(name='region-and-fabric')
colors=[(.68,.39,.25,1),(.55,.13,.10,1),(.40,.10,.08,1),(.035,.018,.01,1),(.025,.028,.035,1),(.8,.8,.76,1),(.02,.01,.005,1),(.45,.48,.51,1),(.8,.82,.75,1),(.02,.03,.04,1),(.03,.035,.04,1),(.16,.24,.19,1),(.005,.005,.005,1),(.55,.13,.10,1)]
for i,c in enumerate(colors):
    m=bpy.data.materials.new(['skin','overalls','overalls-lower','hair','boots','eyes','iris','steel','reflective-thread','reinforcement','gloves','iris-color','pupil','rolled-collar'][i]);m.diffuse_color=c;obj.data.materials.append(m)
for face,code in zip(mesh.polygons,codes):
    face.material_index=code;face.use_smooth=True
    for li in face.loop_indices:
        raw=points[used[mesh.loops[li].vertex_index]]
        arm=max(0,min(1,(abs(raw.x)-.16)/.085)) if .98<raw.z<1.495 else 0
        uv.data[li].uv=(code/8+.025,arm)
# Cloth thickness and subtle folds, using the existing continuous anatomical topology.
clothed=set()
for poly in mesh.polygons:
    if poly.material_index in (1,2): clothed.update(poly.vertices)
for vi in clothed:
    v=mesh.vertices[vi];x,y,z=v.co
    fold=.004*math.sin(z*83+abs(x)*37)*math.sin(z*31)
    v.co.y+=(.006+fold)*(1 if y>0 else -1)
    if z<.96: v.co.x+=(.008+fold)*(1 if x>0 else -1)
    elif abs(x)<.18: v.co.y+=.012*(1 if y>0 else -1)
# Give the eyes proper dark pupils instead of a blank white sphere.
for poly in mesh.polygons:
    if poly.material_index!=5: continue
    c=poly.center
    # UV palette region 6 is the pupil; source helper eyes give stable eyelid placement.
    if c.y<-.12:
        for li in poly.loop_indices: uv.data[li].uv=(6/8+.025,0)
# Workwear details are separate modeled surfaces, joined before LOD generation.
def patch(name,loc,size,code):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name
    o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for m in obj.data.materials: o.data.materials.append(m)
    for p in o.data.polygons:p.material_index=code
    layer=o.data.uv_layers.active;layer.name="region-and-fabric"
    for d in layer.data:d.uv=(code/8+.025,0)
    bevel=o.modifiers.new('tailored-edge','BEVEL');bevel.width=.025 if 'ankle' in name else .012 if 'sole' in name or 'knee' in name else .004;bevel.segments=3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for d in o.data.uv_layers.active.data:d.uv=(code/8+.025,0)
    return o
# Seams, chest pocket, front zipper and trouser belt are geometry, not printed shadows.
parts=[obj]
for side in [-1,1]:
    sv=[];sf=[];rings=[(-.245,.012,.035,.045),(-.22,.055,.044,.055),(-.15,.075,.052,.066),(-.045,.072,.065,.08),(.055,.065,.085,.10),(.105,.045,.064,.083),(.12,.012,.025,.05)]
    for y,w,h,z in rings:
        for k in range(16):
            a=k/16*math.tau;sv.append((side*.117+w*math.cos(a),y*.82,max(.015,z+h*math.sin(a))))
    for j in range(len(rings)-1):
        for k in range(16):
            a=j*16+k;b=j*16+(k+1)%16;sf.append((a,b,b+16,a+16))
    sf.append(tuple(reversed(range(16))));sf.append(tuple((len(rings)-1)*16+k for k in range(16)))
    sm=bpy.data.meshes.new('sculpted-shoe-last');sm.from_pydata(sv,[],sf);sm.update()
    shoe=bpy.data.objects.new('closed-rounded-shoe',sm);bpy.context.collection.objects.link(shoe)
    for m in obj.data.materials:sm.materials.append(m)
    layer=sm.uv_layers.new(name='region-and-fabric')
    for p in sm.polygons:
        p.material_index=4;p.use_smooth=True
        for li in p.loop_indices:layer.data[li].uv=(4/8+.025,0)
    parts.append(shoe)
# Real eyeballs and separate irises replace the MakeHuman fitting helpers.
for side in [-1,1]:
    for name,loc,scale,code in [
      ('sclera',(side*.0322,-.137,1.636),(.013,.012,.011),5),
      ('iris',(side*.0322,-.1485,1.636),(.0055,.0017,.0055),11),
      ('pupil',(side*.0322,-.1501,1.636),(.0024,.0008,.0026),12)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=loc)
        eye=bpy.context.object;eye.name=name;eye.scale=scale
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for m in obj.data.materials:eye.data.materials.append(m)
        eye.data.uv_layers.active.name='region-and-fabric'
        for poly in eye.data.polygons:poly.material_index=code;poly.use_smooth=True
        for d in eye.data.uv_layers.active.data:d.uv=(code/8+.025,0)
        parts.append(eye)
# A continuous rolled collar covers the shirt/neck palette boundary.
cv=[];cf=[]
for z,rx,ry in [(1.465,.077,.068),(1.482,.078,.070),(1.505,.073,.064),(1.511,.067,.058)]:
    for j in range(48):
        a=j/48*math.tau;cv.append((rx*math.cos(a),-.005+ry*math.sin(a),z))
for ring in range(3):
    for j in range(48):
        a=ring*48+j;b=ring*48+(j+1)%48;cf.append((a,b,b+48,a+48))
cm=bpy.data.meshes.new('rolled-overall-collar');cm.from_pydata(cv,[],cf);cm.update()
collar=bpy.data.objects.new('continuous-rolled-collar',cm);bpy.context.collection.objects.link(collar)
for m in obj.data.materials:cm.materials.append(m)
layer=cm.uv_layers.new(name='region-and-fabric')
for poly in cm.polygons:
    poly.material_index=13;poly.use_smooth=True
    for li in poly.loop_indices:layer.data[li].uv=(13/8+.025,0)
parts.append(collar)

# Closed collar, reinforced seams, pockets and metallic zipper teeth.
parts.append(patch('zipper-placket',(0,-.166,1.235),(.028,.014,.37),9))
parts.append(patch('front-zipper',(0,-.176,1.235),(.006,.008,.36),7))
for j in range(23):
    parts.append(patch('zipper-teeth',(0,-.181,1.06+j*.015),(.013,.004,.004),7))
for side in [-1,1]:
    collar=patch('folded-workwear-collar',(side*.047,-.132,1.447),(.073,.033,.065),1)
    collar.rotation_euler.y=side*.32;parts.append(collar)
    parts.append(patch('gusseted-chest-pocket',(side*.099,-.171,1.318),(.104,.024,.105),1))
    parts.append(patch('chest-pocket-flap',(side*.099,-.190,1.365),(.11,.014,.025),9))
    parts.append(patch('reflective-chest-stitch',(side*.099,-.200,1.35),(.09,.005,.006),8))
    parts.append(patch('hip-tool-pocket',(side*.14,-.147,.91),(.094,.025,.13),2))
    parts.append(patch('hip-pocket-flap',(side*.14,-.166,.97),(.10,.012,.023),9))
    parts.append(patch('reinforced-knee-pad',(side*.12,-.145,.525),(.12,.024,.155),9))
    # A closed ankle shaft and lugged sole distinguish a safety boot from a slipper.
    parts.append(patch('boot-ankle-shaft',(side*.117,.047,.16),(.125,.13,.19),4))
    parts.append(patch('boot-outsole',(side*.117,-.055,.025),(.154,.285,.039),4))
    for j in range(5):
        parts.append(patch('boot-laces',(side*.117,-.105+j*.022,.139+j*.006),(.088,.006,.006),9))
    # Eyebrows preserve a mature face at close camera distances.
    brow=patch('modeled-eyebrow',(side*.036,-.158,1.656),(.038,.007,.005),3)
    brow.rotation_euler.y=side*.08;parts.append(brow)
parts.append(patch('waist-work-belt',(0,-.154,1.008),(.355,.015,.024),9))
parts.append(patch('belt-buckle',(0,-.166,1.009),(.035,.010,.028),7))
# Original own-team badge, converted to actual geometry.
bpy.ops.object.text_add(location=(-.153,-.205,1.323),rotation=(math.pi/2,0,0))
badge=bpy.context.object;badge.name='PIT-CREW-embroidered-badge';badge.data.body='PIT CREW';badge.data.size=.018;badge.data.extrude=.0007
bpy.ops.object.convert(target='MESH')
for m in obj.data.materials:badge.data.materials.append(m)
layer=badge.data.uv_layers.new(name='region-and-fabric')
for poly in badge.data.polygons:
    poly.material_index=8
    for li in poly.loop_indices:layer.data[li].uv=(8/8+.025,0)
parts.append(badge)
# A forged combination wrench carried by the right gloved hand. All its
# vertices share the hand influence, so it stays rigid through the gesture.
def tool_part(o):
    for d in o.data.uv_layers.active.data:d.uv=(7/8+.025,1)
    parts.append(o)
tool_part(patch('forged-wrench-handle',(.285,-.205,1.115),(.025,.012,.17),7))
for side in [-1,1]:
    jaw=patch('open-wrench-jaw',(.285+side*.021,-.205,1.214),(.016,.015,.043),7)
    jaw.rotation_euler.y=side*.32;tool_part(jaw)
bpy.ops.mesh.primitive_torus_add(major_radius=.022,minor_radius=.006,major_segments=20,minor_segments=8,location=(.285,-.205,1.016),rotation=(math.pi/2,0,0))
ring=bpy.context.object;ring.name='box-end-wrench-ring'
for m in obj.data.materials:ring.data.materials.append(m)
for poly in ring.data.polygons:poly.material_index=7
ring.data.uv_layers.active.name='region-and-fabric'
for d in ring.data.uv_layers.active.data:d.uv=(7/8+.025,1)
parts.append(ring)
bpy.ops.object.select_all(action='DESELECT')
for p in parts:p.select_set(True)
bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.000001);bpy.ops.object.mode_set(mode='OBJECT')
# Merge materials on export; region UVs retain colors and allow a single GPU material.
neutral=bpy.data.materials.new('runtime-region-palette');neutral.diffuse_color=(.7,.7,.7,1)
obj.data.materials.clear();obj.data.materials.append(neutral)
for poly in obj.data.polygons:poly.material_index=0
# Separate palette boundaries before decimation. This prevents the reducer from
# interpolating skin/shirt/pants IDs into jagged triangles at collars and cuffs.
bm=bmesh.new();bm.from_mesh(obj.data);uv_layer=bm.loops.layers.uv.active
boundaries=[]
for edge in bm.edges:
    ids=set()
    for f in edge.link_faces:
        ids.add(int(f.loops[0][uv_layer].uv.x*8))
    if len(ids)>1:boundaries.append(edge)
bmesh.ops.split_edges(bm,edges=boundaries);bm.to_mesh(obj.data);bm.free()
obj.data.validate(clean_customdata=False);obj.data.update()
# Store a human-proportioned rig in the editable source for subsequent authored animation.
rigdata=bpy.data.armatures.new('human-working-rig');rig=bpy.data.objects.new('human-working-rig',rigdata);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;obj.select_set(False);rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,head,tail in [('pelvis',(0,0,.9),(0,0,1.05)),('spine',(0,0,1.05),(0,0,1.43)),('head',(0,0,1.43),(0,0,1.73)),('arm.L',(.18,0,1.43),(.24,0,1.02)),('arm.R',(-.18,0,1.43),(-.24,0,1.02)),('leg.L',(.09,0,.9),(.1,0,.07)),('leg.R',(-.09,0,.9),(-.1,0,.07))]:
    b=rigdata.edit_bones.new(name);b.head=head;b.tail=tail
bpy.ops.object.mode_set(mode='OBJECT');rig.hide_render=True
blend_path=os.path.join(ROOT,'tools/blender/sources/v18/pit-mechanic-v19.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
with open(blend_path,'rb') as source,gzip.open(blend_path+'.gz','wb',compresslevel=9) as destination:
    shutil.copyfileobj(source,destination)
report={}
for name,ratio in [('near',.48),('mid',.13),('far',.035)]:
    o=obj.copy();o.data=obj.data.copy();bpy.context.collection.objects.link(o);o.name='pit-mechanic-'+name
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    dec=o.modifiers.new('anatomical-game-LOD','DECIMATE');dec.ratio=ratio;bpy.ops.object.modifier_apply(modifier=dec.name)
    o.data.validate(clean_customdata=False);o.data.update()
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'mechanic-'+name+'.glb'),use_selection=True,export_format='GLB',export_yup=True,export_materials='EXPORT',export_animations=False)
    report[name]={'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)}
    bpy.data.objects.remove(o,do_unlink=True)
open(os.path.join(OUT,'mechanic-build-report.json'),'w').write(json.dumps(report,indent=2))
print('HUMAN_LOD_REPORT',report)
