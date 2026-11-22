"""Rebuild clothed game humans from the CC0 MakeHuman anatomical mesh.
Blender 4+: blender -b --python tools/blender/v18-people.py
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
    if g not in ['body','helper-l-eye','helper-r-eye']: continue
    c=sum((points[i] for i in f),Vector())/len(f)
    if g.startswith('helper-'):
        code=5
    elif c.z>1.495: code=0 # neck and fully modeled face
    elif c.z<.12: continue # feet replaced by sculpted closed shoes
    elif c.z<.95: code=2
    elif abs(c.x)>.372 and c.z<1.30: code=0 # fingers, palms, wrists
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
# One UV palette: the integer region drives per-instance skin / clothing variation.
uv=mesh.uv_layers.new(name='region-and-fabric')
colors=[(.68,.39,.25,1),(.65,.67,.68,1),(.045,.07,.11,1),(.035,.018,.01,1),(.025,.028,.035,1),(.8,.8,.76,1)]
for i,c in enumerate(colors):
    m=bpy.data.materials.new(['skin','shirt','trousers','hair','shoes','eyes'][i]);m.diffuse_color=c;obj.data.materials.append(m)
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
    fold=.0028*math.sin(z*115+abs(x)*37)*math.sin(z*43)
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
    layer=o.data.uv_layers.active
    for d in layer.data:d.uv=(code/8+.025,0)
    bevel=o.modifiers.new('tailored-edge','BEVEL');bevel.width=.003;bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return o
# Seams, chest pocket, front zipper and trouser belt are geometry, not printed shadows.
parts=[obj]
for side in [-1,1]:
    sv=[];sf=[];rings=[(-.245,.012,.035,.045),(-.22,.055,.044,.055),(-.15,.075,.052,.066),(-.045,.072,.065,.08),(.055,.065,.085,.10),(.105,.045,.064,.083),(.12,.012,.025,.05)]
    for y,w,h,z in rings:
        for k in range(16):
            a=k/16*math.tau;sv.append((side*.105+w*math.cos(a),y,max(.015,z+h*math.sin(a))))
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
parts.append(patch('shirt-front-placket',(0,-.125,1.24),(.014,.008,.30),2))
parts.append(patch('stitched-chest-pocket',(-.075,-.137,1.31),(.075,.009,.075),1))
parts.append(patch('pocket-trim',(-.075,-.145,1.343),(.077,.008,.006),2))
parts.append(patch('waistband',(0,-.108,.96),(.31,.016,.024),2))
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
blend_path=os.path.join(ROOT,'tools/blender/sources/v18/horizon-people.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
with open(blend_path,'rb') as source,gzip.open(blend_path+'.gz','wb',compresslevel=9) as destination:
    shutil.copyfileobj(source,destination)
report={}
for name,ratio in [('near',.22),('mid',.045),('far',.012)]:
    o=obj.copy();o.data=obj.data.copy();bpy.context.collection.objects.link(o);o.name='human-'+name
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    dec=o.modifiers.new('anatomical-game-LOD','DECIMATE');dec.ratio=ratio;bpy.ops.object.modifier_apply(modifier=dec.name)
    o.data.validate(clean_customdata=False);o.data.update()
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'human-'+name+'.glb'),use_selection=True,export_format='GLB',export_yup=True,export_materials='EXPORT',export_animations=False)
    report[name]={'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)}
    bpy.data.objects.remove(o,do_unlink=True)
open(os.path.join(OUT,'build-report.json'),'w').write(json.dumps(report,indent=2))
print('HUMAN_LOD_REPORT',report)
