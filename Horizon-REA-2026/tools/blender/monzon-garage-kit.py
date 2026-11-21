"""Metre-scale pit equipment; Blender Z-up exports to glTF Y-up.
Shared kit is instanced across four bays by the game. No vehicle substitutes.
"""
import bpy, math, os, random, gzip
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
materials={}
def mat(name,color,metal=0,rough=.65,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
    if emission:s.inputs['Emission Color'].default_value=(*color,1);s.inputs['Emission Strength'].default_value=emission
    materials[name]=m;return m
steel=mat('brushed-steel',(.25,.29,.32),.7,.34)
dark=mat('graphite',(.045,.057,.064),.3,.55)
rubber=mat('tire-rubber',(.012,.015,.018),0,.92)
red=mat('toolbox-red',(.34,.018,.026),.25,.42)
blue=mat('workshop-blue',(.025,.09,.18),.3,.5)
gold=mat('warm-alloy',(.39,.28,.10),.65,.4)
wood=mat('workbench',(.22,.145,.085),0,.78)
white=mat('ceramic',(.61,.65,.64),.15,.45)
light=mat('work-lamp',(.82,.88,.9),0,.4,2)

def finish(obj,name,material,detail=False):
    obj.name=('detail-' if detail else 'large-')+name;obj.data.materials.append(material)
    return obj

def box(name,loc,size,material,detail=False,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('rounded edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,material,detail)
def cyl(name,a,b,r,material,detail=False,vertices=12):
    a,b=Vector(a),Vector(b);delta=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=delta.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return finish(o,name,material,detail)
def torus(name,loc,major,minor,material,rotation=(0,0,0),detail=False):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=24,minor_segments=8,location=loc,rotation=rotation)
    return finish(bpy.context.object,name,material,detail)

# Right wall: workbench, cabinets and recognisable drawer trolley.
box('bench-top',(4.8,-5.4,1.02),(2.8,1.0,.10),wood,bevel=.025)
for x in [3.65,5.95]:
 for y in [-5.05,-5.75]:box('bench-leg',(x,y,.50),(.07,.07,1),dark)
box('drawer-trolley',(4.8,-2.6,.56),(1.45,.68,.92),red,bevel=.045)
box('trolley-top',(4.8,-2.6,1.05),(1.52,.75,.065),dark)
for z in [.29,.45,.61,.77,.93]:
 box('drawer-gap',(4.8,-2.245,z),(1.31,.012,.012),dark,True)
 box('drawer-handle',(4.8,-2.21,z+.05),(.83,.035,.025),steel,True)
for x in [4.25,5.35]:
 for y in [-2.85,-2.35]:cyl('caster',(x,y-.03,.12),(x,y+.03,.12),.105,rubber,True,10)
box('cabinet',(5.7,-7.2,1.16),(1.25,.7,2.2),blue,bevel=.03)
box('cabinet-split',(5.7,-6.84,1.16),(.014,.02,2.05),dark,True)
for x in [5.56,5.84]:box('cabinet-handle',(x,-6.8,1.1),(.025,.045,.25),steel,True)
# Back wall shelving, fluids and small parts.
for x in [-5.8,-3.3]:
 for y in [-7.9,-7.25]:box('shelf-upright',(x,y,1.3),(.055,.055,2.6),steel)
for z in [.22,.88,1.54,2.2]:
 box('shelf',(-4.55,-7.58,z),(2.65,.8,.055),steel)
 for x in [-5.25,-4.55,-3.85]:
  box('parts-bin',(x,-7.55,z+.16),(.52,.42,.25),blue,True)
for i in range(4):
 box('fluid-can',(3.8+i*.43,-7.7,.68),(.27,.18,.4),gold,True,bevel=.025)
 box('can-handle',(3.8+i*.43,-7.7,.92),(.14,.08,.05),dark,True)
# Pegboard and actual wrench silhouettes above the bench.
box('pegboard',(4.8,-6.0,1.88),(2.8,.055,1.3),dark)
for i in range(7):
 x=3.7+i*.34;z=1.82
 box('wrench-shank',(x,-5.95,z),(.035,.025,.34),steel,True)
 torus('wrench-ring',(x,-5.94,z+.20),.054,.012,steel,(math.pi/2,0,0),True)
 for side in [-1,1]:box('wrench-jaw',(x+side*.034,-5.94,z-.20),(.018,.025,.09),steel,True)
# Tool silhouettes on the bench: vice, sockets and a drill.
box('vice',(4.1,-5.4,1.17),(.32,.27,.24),blue,True)
for x in [3.98,4.22]:box('vice-jaw',(x,-5.4,1.32),(.06,.28,.08),steel,True)
for i in range(5):cyl('socket',(4.6+i*.17,-5.4,1.08),(4.6+i*.17,-5.4,1.17+i*.01),.045,steel,True)
box('impact-wrench',(5.6,-5.3,1.18),(.3,.12,.13),red,True)
box('impact-grip',(5.58,-5.3,1.10),(.08,.09,.18),dark,True)
# Left side: tyre rack with mounted rims and two floor stacks.
for x in [-5.9,-3.5]:
 for y in [-4.8,-4.15]:box('wheel-rack-post',(x,y,1.03),(.07,.07,2.06),steel)
for z in [.18,1.20]:
 for y in [-4.8,-4.15]:box('wheel-rack-rail',(-4.7,y,z),(2.55,.06,.07),steel)
for level in [0,1]:
 for x in [-5.5,-4.7,-3.9]:
  z=.63+level*1.03;y=-4.46
  torus('spare-tire',(x,y,z),.285,.105,rubber,(math.pi/2,0,0))
  torus('rim-lip',(x,y+.10,z),.225,.02,steel,(math.pi/2,0,0))
  cyl('wheel-hub',(x,y-.11,z),(x,y+.12,z),.065,steel,vertices=10)
  for spoke in range(5):
   t=spoke*2*math.pi/5
   cyl('wheel-spoke',(x,y+.12,z),(x+.21*math.cos(t),y+.12,z+.21*math.sin(t)),.018,steel,True,6)
for x in [-5.4,-4.4]:
 for level in range(3):torus('stacked-tire',(x,-1.5,.12+level*.23),.285,.105,rubber)
# Air compressor: real horizontal tank, motor, wheels and handle.
cyl('air-tank',(-5.5,-6.4,.48),(-4.3,-6.4,.48),.29,blue,vertices=20)
for x in [-5.35,-4.45]:
 cyl('compressor-wheel',(x,-6.60,.18),(x,-6.72,.18),.15,rubber,vertices=12)
box('compressor-motor',(-4.9,-6.4,.94),(.48,.37,.28),dark)
cyl('air-gauge',(-4.4,-6.42,.86),(-4.4,-6.34,.86),.075,white,True)
# Floor jack: low rolling base, lifting arm, saddle and long handle.
box('jack-base',(3.2,-1.6,.13),(.40,1.05,.13),red)
for x in [3.0,3.4]:
 for y in [-1.15,-2.05]:cyl('jack-wheel',(x-.035,y,.12),(x+.035,y,.12),.09,dark,True,10)
cyl('jack-lift',(3.2,-1.9,.17),(3.2,-1.2,.35),.075,steel)
cyl('jack-saddle',(3.2,-1.2,.31),(3.2,-1.2,.39),.13,dark)
cyl('jack-handle',(3.2,-2.0,.20),(3.2,-2.85,1.25),.028,steel)
cyl('jack-grip',(3.2,-2.7,1.06),(3.2,-2.85,1.25),.044,rubber)
# Engine: V8 block, two angled cylinder banks, heads, intake and exhaust headers.
ex,ey=-1.65,-2.4
box('engine-stand-foot',(ex,ey,.11),(1.05,.95,.12),red)
cyl('engine-stand-column',(ex,ey,.16),(ex,ey,.78),.075,red)
box('engine-crankcase',(ex,ey,.94),(.66,.88,.38),dark,bevel=.055)
for side in [-1,1]:
 bank=box('V8-cylinder-bank',(ex+side*.26,ey,1.16),(.35,.96,.4),steel,bevel=.035);bank.rotation_euler[1]=side*.44
 cover=box('V8-valve-cover',(ex+side*.31,ey,1.40),(.28,1.02,.12),red,bevel=.04);cover.rotation_euler[1]=side*.44
 for i in range(4):
  y=ey-.36+i*.24
  cyl('exhaust-header',(ex+side*.38,y,1.20),(ex+side*.66,y,.98),.038,steel,vertices=8)
  cyl('exhaust-drop',(ex+side*.66,y,.98),(ex+side*.66,y+.24,.82),.038,steel,vertices=8)
  cyl('spark-plug',(ex+side*.33,y,1.45),(ex+side*.36,y,1.53),.025,white,True,8)
box('intake-plenum',(ex,ey,1.53),(.25,.73,.20),steel,bevel=.035)
cyl('throttle-body',(ex,ey+.36,1.54),(ex,ey+.55,1.54),.09,dark)
cyl('alternator',(ex+.39,ey+.42,1.01),(ex+.39,ey+.56,1.01),.12,steel)
# Freestanding transmission, exhaust and brake rotors on a parts table.
box('parts-table',(1.35,-6.8,.86),(2.4,.9,.08),steel)
for x in [.3,2.4]:
 for y in [-6.5,-7.1]:box('parts-table-leg',(x,y,.43),(.06,.06,.86),dark)
cyl('transmission-bell',(.8,-6.7,1.16),(1.0,-6.7,1.16),.25,steel,vertices=16)
cyl('gearbox',(1.0,-6.7,1.16),(1.65,-6.7,1.16),.14,steel,vertices=12)
for y in [-6.50,-7.0]:
 cyl('brake-disc',(2.0,y,.92),(2.0,y,.96),.23,steel,True,24)
 cyl('rotor-hub',(2.0,y,.96),(2.0,y,1.02),.075,dark,True,12)
cyl('exhaust-pipe',(.6,-4.8,.13),(2.0,-4.8,.13),.065,steel)
cyl('muffler',(1.1,-4.8,.13),(1.5,-4.8,.13),.13,dark)
# Visible inspection lamps, without per-prop shadow maps.
for x in [-2.5,2.5]:box('ceiling-light',(x,-4.5,4.30),(2.0,.18,.045),light)

# Bake static props by material, keeping small details separate for distance LOD.
for detail in [False,True]:
 for material in materials.values():
  objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('detail-' if detail else 'large-') and o.data.materials[0]==material]
  if not objects:continue
  bpy.ops.object.select_all(action='DESELECT')
  for obj in objects:obj.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
  obj=bpy.context.object;obj.name=('Detail_' if detail else 'Large_')+material.name
  bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  for poly in obj.data.polygons:poly.use_smooth=False
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
os.makedirs(os.path.join(root,'public/scenery'),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'public/scenery/monzon-garage-kit.glb'),export_format='GLB')
with open(os.path.join(root,'public/scenery/monzon-garage-kit.glb'),'rb') as source:
    with gzip.GzipFile(os.path.join(root,'public/scenery/monzon-garage-kit.glb.gz'),'wb',mtime=0) as target:target.write(source.read())
bpy.ops.wm.save_as_mainfile(filepath='/tmp/monzon-garage-kit.blend')
