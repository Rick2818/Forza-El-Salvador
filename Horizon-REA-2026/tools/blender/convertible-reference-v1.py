"""Horizon: first editable convertible study from Rick's front-three-quarter reference.
Run in Blender 5.x. Original generated geometry, no downloaded assets.
Hidden/rear surfaces are approximations, not a photogrammetric reconstruction.
Standalone preview: never changes the game or existing GLBs.
"""
import bpy
import math
import os
import sys
from datetime import datetime
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "outputs", "convertible-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
parts = []

def principled(mat):
    node = next((n for n in mat.node_tree.nodes
                 if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if node is None:
        node = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = next((n for n in mat.node_tree.nodes
                    if n.bl_idname == "ShaderNodeOutputMaterial"), None)
        if out is None:
            out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(node.outputs[0], out.inputs[0])
    return node

def socket(node, identifier):
    return next(s for s in node.inputs if s.identifier == identifier)

def material(name, color, metallic=0.0, roughness=0.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = principled(m)
    socket(p, "Base Color").default_value = (*color, 1)
    socket(p, "Metallic").default_value = metallic
    socket(p, "Roughness").default_value = roughness
    return m

paint = material("paint_ruby_red", (0.38, 0.009, 0.018), .72, .22)
socket(principled(paint), "Coat Weight").default_value = .45
black = material("trim_dark", (.012, .015, .019), .15, .3)
rubber = material("rubber", (.014, .016, .019), 0, .65)
chrome = material("alloy_silver", (.52, .56, .6), .86, .22)
tan = material("leather_sand", (.58, .34, .14), 0, .48)
red = material("brake_red", (.65, .015, .008), .3, .3)
lamp = material("headlamp", (.72, .83, .9), .5, .16)
tail = material("tail_lens", (.5, .003, .007), .3, .18)
glass = material("glass", (.055, .11, .14), .1, .12)
socket(principled(glass), "Transmission Weight").default_value = .68

def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = True
        if bevel:
            b = obj.modifiers.new("Edge highlights", "BEVEL")
            b.width = bevel
            b.segments = 3
    parts.append(obj)
    return obj

def box(name, loc, scale, mat, bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, bevel)

def mesh(name, verts, faces, mat):
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    return finish(o, name, mat)

def path(name, points, mat, radius=.012, closed=False):
    d = bpy.data.curves.new(name, "CURVE")
    d.dimensions = "3D"
    d.bevel_depth = radius
    d.bevel_resolution = 2
    s = d.splines.new("POLY")
    s.points.add(len(points)-1)
    for p, co in zip(s.points, points):
        p.co = (*co, 1)
    s.use_cyclic_u = closed
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    return finish(o, name, mat)

def rod(name, a, b, radius, mat):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius,
                                      depth=(b-a).length, location=(a+b)/2)
    o = bpy.context.object
    o.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    return finish(o, name, mat)

def ellipsoid(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat)

# Metres, +X forward, +Z up; ~4.55m length and 2.66m wheelbase.
# Curved cross sections create a shoulder, belt line and rounded sill.
sections = [
    (-2.27,.65,.77),(-2.13,.88,.88),(-1.86,.96,.96),
    (-1.55,.99,1.00),(-1.33,.99,1.00),(-1.08,.94,.94),
    (-.72,.90,.88),(-.30,.89,.87),(.15,.90,.90),
    (.55,.94,.96),(.95,.98,1.01),(1.33,1.00,1.02),
    (1.63,.97,.95),(1.93,.89,.82),(2.16,.78,.65),
    (2.28,.67,.54)]
verts = []
for x,w,h in sections:
    yz = [(-.72*w,.22),(-w,.34),(-w,.59),(-.97*w,h-.08),
          (-.78*w,h),(-.42*w,h-.025),(0,h-.04),
          (.42*w,h-.025),(.78*w,h),(.97*w,h-.08),
          (w,.59),(w,.34),(.72*w,.22),(0,.20)]
    verts.extend((x,y,z) for y,z in yz)
n = 14
faces = [tuple(reversed(range(n)))]
for i in range(len(sections)-1):
    for j in range(n):
        faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
faces.append(tuple((len(sections)-1)*n+j for j in range(n)))
body = mesh("Convertible body", verts, faces, paint)
# Recalculate outward normals before boolean cuts.
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

def subtract(cutter):
    bpy.context.view_layer.objects.active = body
    mod = body.modifiers.new("Body opening", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if cutter in parts:
        parts.remove(cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)

for x in (-1.33,1.33):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.425, depth=3,
                                      location=(x,0,.39), rotation=(math.pi/2,0,0))
    subtract(bpy.context.object)
cutter = box("Cabin cutter",(-.36,0,1.25),(1.73,1.40,1.25),black,.12)
bpy.context.view_layer.objects.active = cutter
bpy.ops.object.modifier_apply(modifier=cutter.modifiers[0].name)
subtract(cutter)
b = body.modifiers.new("Soft panel edges","BEVEL")
b.width = .015
b.segments = 2

# Cabin floor, four seats, dashboard, centre console and steering wheel.
box("Cabin floor",(-.38,0,.60),(1.60,1.33,.08),black)
for y in (-.39,.39):
    box("Front cushion",(-.37,y,.72),(.48,.48,.14),tan,.065)
    o = box("Front seat back",(-.64,y,.99),(.17,.49,.55),tan,.07)
    o.rotation_euler[1] = -.12
    box("Headrest",(-.68,y,1.29),(.15,.30,.23),tan,.06)
    box("Rear seat",(-.99,y,.91),(.24,.44,.23),tan,.04)
    box("Door leather",(-.29,y*1.75,.85),(.95,.035,.23),tan,.015)
box("Centre console",(-.26,0,.78),(.91,.14,.23),black,.025)
box("Dashboard",(.33,0,.96),(.27,1.38,.19),black,.035)
rod("Gear selector",(-.19,0,.90),(-.19,0,1.02),.018,chrome)
ellipsoid("Gear knob",(-.19,0,1.03),(.035,.028,.025),black)
steer = [(.16, -.39+.16*math.cos(t),1.04+.16*math.sin(t))
         for t in [i*2*math.pi/48 for i in range(48)]]
path("Steering wheel",steer,black,.018,True)
for t in (0,2.094,4.188):
    rod("Steering spoke",(.16,-.39,1.04),
        (.16,-.39+.15*math.cos(t),1.04+.15*math.sin(t)),.012,chrome)

wind = [(.62,-.79,.98),(.62,.79,.98),(.05,.69,1.49),(.05,-.69,1.49)]
mesh("Windshield",wind,[(0,1,2,3)],glass)
path("Windshield frame",wind,black,.027,True)
for y in (-1,1):
    rod("Mirror arm",(.35,y*.81,1.01),(.29,y*1.05,1.07),.025,paint)
    ellipsoid("Mirror housing",(.26,y*1.08,1.10),(.17,.09,.065),paint)
    # Door outline and handle, intentionally separate editable curves.
    path("Door shut line",[(.31,y*.923,.90),(.24,y*.934,.48),
                           (-.78,y*.924,.40),(-.90,y*.925,.86)],black,.004)
    box("Door handle",(-.66,y*.925,.86),(.13,.025,.025),chrome,.008)

# Wheels remain independent objects for future game steering/suspension.
for x in (-1.33,1.33):
    for sign in (-1,1):
        y = sign*.94
        bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=12,
            location=(x,y,.38),rotation=(math.pi/2,0,0),
            major_radius=.282,minor_radius=.082)
        finish(bpy.context.object,"Tyre",rubber)
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.245,depth=.13,
            location=(x,y,.38),rotation=(math.pi/2,0,0))
        finish(bpy.context.object,"Wheel barrel",black)
        yf = y+sign*.09
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.19,depth=.015,
            location=(x,y+sign*.065,.38),rotation=(math.pi/2,0,0))
        finish(bpy.context.object,"Brake disc",chrome)
        box("Brake caliper",(x+.13,y+sign*.075,.39),(.08,.04,.18),red,.012)
        for i in range(5):
            t = i*2*math.pi/5
            a=(x+.045*math.cos(t),yf,.38+.045*math.sin(t))
            b=(x+.232*math.cos(t+.12),yf,.38+.232*math.sin(t+.12))
            rod("Alloy spoke",a,b,.023,chrome)
        ellipsoid("Wheel centre",(x,yf+sign*.008,.38),(.055,.015,.055),chrome)
        ring=[(x+.242*math.cos(t),yf,.38+.242*math.sin(t))
              for t in [i*2*math.pi/64 for i in range(64)]]
        path("Polished wheel lip",ring,chrome,.012,True)

# Front fascia, rising headlamps, hood scoop and grille slats.
grille=[(2.245,-.54,.49),(2.245,.54,.49),(2.29,.58,.40),
        (2.29,.45,.24),(2.29,-.45,.24),(2.29,-.58,.40)]
mesh("Front grille",grille,[tuple(range(6))],black)
path("Grille surround",grille,chrome,.009,True)
for z in (.30,.38,.46):
    rod("Grille horizontal",(2.30,-.49,z),(2.30,.49,z),.006,chrome)
for y in (-.3,0,.3):
    rod("Grille upright",(2.30,y,.27),(2.30,y,.48),.005,chrome)
for s in (-1,1):
    lens=[(2.13,s*.66,.66),(1.86,s*.83,.87),
          (1.42,s*.84,1.025),(1.61,s*.65,.94)]
    mesh("Headlamp black bed",lens,[(0,1,2,3)],black)
    path("Headlamp edge",lens,chrome,.009,True)
    for k in range(4):
        f=k/3
        ellipsoid("Headlamp optic",(2.04-.42*f,s*(.70+.06*f),.72+.24*f),
                  (.055,.035,.035),lamp)
    box("Lower air intake",(2.08,s*.70,.27),(.10,.24,.12),black,.04)
    path("Hood crease",[(1.98,s*.47,.81),(1.48,s*.43,1.008),
                        (.69,s*.42,.98)],paint,.009)
box("Hood vent", (1.23,0,1.001),(.22,.39,.025),black,.018)
path("Front splitter",[(2.13,-.83,.20),(2.34,-.50,.17),
                       (2.34,.50,.17),(2.13,.83,.20)],black,.025)

# Rear is a design approximation because no rear reference was supplied.
for s in (-1,1):
    ellipsoid("Rear lamp",(-2.16,s*.64,.78),(.035,.16,.065),tail)
    for z in (.29,.39):
        rod("Exhaust",(-2.12,s*.63,z),(-2.34,s*.63,z),.045,chrome)
box("Rear diffuser",(-2.20,0,.24),(.19,1.2,.09),black,.015)

# Convert trim curves explicitly: glTF exports mesh geometry.
for i, obj in enumerate(parts):
    if obj.type == "CURVE":
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        parts[i] = bpy.context.view_layer.objects.active
# Export only the car.
bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,"convertible.glb"),
                         export_format="GLB",use_selection=True,
                         export_apply=True,export_extras=True)

# Preview studio is retained in the editable .blend, excluded from GLB above.
ground = box("Preview ground",(0,0,-.05),(200,200,.08),
             material("studio_ground",(.065,.075,.09),.1,.5),.0)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1100
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.world.use_nodes = True
world_background = next((n for n in scene.world.node_tree.nodes
                         if n.bl_idname == "ShaderNodeBackground"), None)
if world_background is None:
    world_background = scene.world.node_tree.nodes.new("ShaderNodeBackground")
    world_output = scene.world.node_tree.nodes.new("ShaderNodeOutputWorld")
    scene.world.node_tree.links.new(world_background.outputs[0], world_output.inputs[0])
world_background.inputs[0].default_value = (.23,.26,.32,1)
world_background.inputs[1].default_value = .5
for loc,power,size in [((3,-4,6),1800,5),((-3,-1,4),1300,4),((0,4,5),2000,5)]:
    bpy.ops.object.light_add(type="AREA",location=loc)
    light = bpy.context.object
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (Vector((0,0,.7))-light.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.camera_add(location=(6.3,-6.0,3.2))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,0,.7))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.lens = 48
scene.camera = camera
# Frame the car automatically in every 3D editor, without keyboard navigation.
from mathutils import Quaternion
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.clip_end = 500
            space.region_3d.view_distance = 7
            space.region_3d.view_location = (0,0,.7)
            space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
            space.shading.type = "MATERIAL"
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,"convertible.blend"))
if "--render" in sys.argv:
    scene.render.filepath = os.path.join(OUT,"preview-front.png")
    bpy.ops.render.render(write_still=True)
print("HORIZON_OUTPUT=" + OUT)
