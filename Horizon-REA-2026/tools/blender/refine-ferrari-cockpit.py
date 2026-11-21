"""Refine the approved GLB in place; never regenerate its exterior shell.
Blender X forward, Y lateral, Z up. Generic interior finishing, not an OEM scan.
Usage: blender -b -t 2 --python tools/blender/refine-ferrari-cockpit.py
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
asset=ROOT/'public/models/selected/ferrari-california-t.glb'
source_hash=hashlib.sha256(asset.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset))
if any(o.name.startswith('Cockpit_V11') for o in bpy.data.objects):
 raise RuntimeError('Cockpit refinement already present; use the recorded approved source')
paint=bpy.data.materials['paint'];paint_before=list(paint.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)
leather=bpy.data.materials['leather']
def material(name,rgb,metal=0,rough=.5,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF')
 b.inputs['Base Color'].default_value=(*rgb,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 if emission:b.inputs['Emission Color'].default_value=(*rgb,1);b.inputs['Emission Strength'].default_value=emission
 return m
trim=material('cabin_matte_trim',(.009,.012,.016),0,.65)
alloy=material('cabin_brushed_alloy',(.2,.22,.24),.65,.32)
stitch=material('cabin_stitch',(.16,.17,.18),0,.9)
face=material('cabin_instrument_face',(.018,.024,.03),0,.7)
needle=material('cabin_instrument_needle',(.6,.09,.025),0,.5,.4)
def box(name,loc,dims,mat,bevel=.01):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='Cockpit_V11_'+name;o.dimensions=dims
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Soft upholstery edges','BEVEL');mod.width=bevel;mod.segments=3
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def tube(name,points,radius,mat):
 data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=1
 spline=data.splines.new('POLY');spline.points.add(len(points)-1)
 for p,co in zip(spline.points,points):p.co=(*co,1)
 o=bpy.data.objects.new('Cockpit_V11_'+name,data);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
 return bpy.context.object
# Lower only the connected, broad lining sheet into a cabin tub. Keep the
# existing seats, parcel shelf, dashboard and every exterior/wheel vertex.
o=bpy.data.objects['body_leather'];adj=[set() for _ in o.data.vertices]
for e in o.data.edges:
 a,b=e.vertices;adj[a].add(b);adj[b].add(a)
seen=set();sheet=[]
for vertex in o.data.vertices:
 if vertex.index in seen:continue
 stack=[vertex.index];component=[]
 while stack:
  i=stack.pop()
  if i in seen:continue
  seen.add(i);component.append(i);stack.extend(adj[i]-seen)
 if len(component)>100:sheet=component;break
if len(sheet)!=273:raise RuntimeError('Approved cabin sheet changed; inspect before editing')
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
for i in sheet:
 v=o.data.vertices[i];world=o.matrix_world@v.co
 weight=smooth(-1.08,-.82,world.x)*(1-smooth(.40,.62,world.x))*(1-smooth(.50,.63,abs(world.y)))
 world.z=world.z*(1-weight)+.62*weight;v.co=o.matrix_world.inverted()@world
for side in [-1,1]:
 y=side*.34
 box('seat_cushion',(-.32,y,.695),(.44,.36,.12),leather,.04)
 box('headrest',(-.585,y,1.105),(.105,.235,.09),leather,.035)
 for offset in [-.12,.12]:
  tube('seat_stitch',[(x,y+offset,.762+.003*math.sin(i*math.pi/10)) for i,x in enumerate([-.49+i*.033 for i in range(11)])],.0017,stitch)
 # Inset door tops below the glass, with a distinct armrest/handle.
 box('door_armrest',(-.12,side*.59,.80),(.48,.055,.055),trim,.015)
 box('door_handle',(.015,side*.565,.84),(.095,.014,.018),alloy,.005)
box('center_console',(-.04,0,.735),(.62,.15,.09),trim,.025)
box('console_alloy',(.06,0,.785),(.20,.105,.009),alloy,.008)
for x in [-.01,.045,.10]:box('console_switch',(x,0,.794),(.022,.04,.01),trim,.004)
# A three-spoke wheel and a recessed instrument binnacle: authored detail,
# deliberately not represented as a certified factory dashboard.
center=Vector((.26,-.34,.965))
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,major_radius=.11,minor_radius=.014,location=center,rotation=(0,math.pi/2,0))
wheel=bpy.context.object;wheel.name='Cockpit_V11_steering_rim';wheel.data.materials.append(trim)
for angle in [math.pi/2,math.pi*7/6,math.pi*11/6]:
 endpoint=center+Vector((0,.095*math.cos(angle),.095*math.sin(angle)))
 tube('steering_spoke',[center,endpoint],.009,alloy)
box('steering_hub',center,(.036,.066,.060),trim,.012)
box('instrument_binnacle',(.48,-.34,.965),(.07,.29,.19),trim,.025)
for y in [-.412,-.268]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.058,depth=.006,location=(.437,y,.971),rotation=(0,math.pi/2,0))
 gauge=bpy.context.object;gauge.name='Cockpit_V11_gauge_face';gauge.data.materials.append(face)
 for n in range(9):
  a=math.radians(35+n*28);r=.045
  tube('gauge_tick',[(.433,y+r*math.cos(a),.971+r*math.sin(a)),(.432,y+(r-.006)*math.cos(a),.971+(r-.006)*math.sin(a))],.0013,stitch)
 tube('gauge_needle',[(.430,y,.971),(.430,y-.027,.995)],.0016,needle)
for obj in bpy.data.objects:
 if obj.type=='MESH' and obj.name.startswith('Cockpit_V11'):
  for poly in obj.data.polygons:poly.use_smooth=True
assert paint_before==list(paint.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)
bpy.context.scene['cockpitRefinement']='V11 generic finishing; original shell, paint and wheel pivots preserved'
bpy.context.scene['sourceApprovedGLBSha256']=source_hash
bpy.context.preferences.filepaths.save_version=0
blend=ROOT/'tools/blender/selected-sources/ferrari-california-t-art-v11.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',export_extras=True,export_animations=False)
report={'sourceSha256':source_hash,'outputSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'paintLinearRGBA':paint_before,'cabinSheetVertices':len(sheet),'status':'implemented; engine visual review required','factoryDashboardReplica':False}
out=ROOT/'docs/quality/v11';out.mkdir(parents=True,exist_ok=True);(out/'ferrari-cockpit.json').write_text(json.dumps(report,indent=2)+'\n')
print('FERRARI_COCKPIT',json.dumps(report))
