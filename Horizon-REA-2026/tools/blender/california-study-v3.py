"""Horizon: second convertible modelling study from Rick's front-three-quarter reference.
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
                   "outputs", "california-v3-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
parts = []

def principled(mat):
    p = next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if p is None:
        p = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(p.outputs[0], out.inputs[0])
    return p

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


# V2: analytic panel surfaces; no body booleans and no coarse n-gon smoothing.
# Coordinates: metres, X forward, Z up. Dimensions are design estimates.
from math import sin, cos, pi, sqrt, exp
import bmesh
paint.diffuse_color = (.82,.018,.028,1)
socket(principled(paint),"Base Color").default_value = (.82,.018,.028,1)
socket(principled(paint),"Metallic").default_value = .25
socket(principled(paint),"Roughness").default_value = .26
socket(principled(glass),"Transmission Weight").default_value = .90
socket(principled(glass),"Base Color").default_value = (.70,.82,.88,1)
socket(principled(glass),"Metallic").default_value = 0
socket(principled(glass),"Roughness").default_value = .06
socket(principled(glass),"Alpha").default_value = .32
glass.diffuse_color = (.70,.82,.88,.32)
glass.use_backface_culling = False

# Smooth cubic Hermite interpolation, using tangent averages at control points.
def interp(table,x):
    if x <= table[0][0]: return table[0][1]
    if x >= table[-1][0]: return table[-1][1]
    for i in range(len(table)-1):
        a,b = table[i],table[i+1]
        if a[0] <= x <= b[0]:
            prev = table[max(0,i-1)]
            nxt = table[min(len(table)-1,i+2)]
            m0 = (b[1]-prev[1])/(b[0]-prev[0])
            m1 = (nxt[1]-a[1])/(nxt[0]-a[0])
            d=b[0]-a[0]
            t=(x-a[0])/d
            return ((2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*d*m0+
                    (-2*t**3+3*t*t)*b[1]+(t**3-t*t)*d*m1)

WIDTH=[(-2.27,.76),(-2.08,.89),(-1.48,.98),(-1.05,.96),
       (-.55,.91),(.15,.91),(.72,.95),(1.32,.98),(1.77,.96),(2.27,.85)]
HEIGHT=[(-2.27,.77),(-1.95,.92),(-1.38,1.00),(-.85,.96),
        (-.25,.94),(.45,.99),(1.20,1.02),(1.60,.95),(2.27,.73)]
CENTER=[(-2.27,.77),(-1.60,.91),(-1.1,.89),(-.5,.87),
        (.55,.96),(1.0,.94),(1.5,.89),(1.95,.79),(2.27,.72)]
def width(x): return interp(WIDTH,x)
def height(x): return interp(HEIGHT,x)
def top_z(x,y):
    q=min(1,abs(y)/(.94*width(x)))
    zc=interp(CENTER,x)
    return zc+(height(x)-zc)*sin(pi*q/2)**2
def inner(x):
    # Rounded aperture: narrow ends and a full-width cockpit in the middle.
    if x < -1.20 or x > .58: return 0.0
    if x < -1.02: return .68*sqrt(max(0,1-((x+1.02)/.18)**2))
    if x > .35: return .68*sqrt(max(0,1-((x-.35)/.23)**2))
    return .68
def lower(x):
    z=.245
    for axle in (-1.335,1.335):
        t=(x-axle)/.425
        if abs(t)<1:
            z=max(z,.245+.525*sqrt(max(0,1-t*t)))
    return z
def side_y(x,z):
    lo=lower(x); hi=height(x)
    t=max(0,min(1,(z-lo)/max(.01,hi-lo)))
    # Shoulder to sill with a mild inward sculpt behind the front axle.
    return width(x)*(.94+.055*sin(pi*t))-.028*exp(-((x-.25)/.6)**2)*sin(pi*t)**2

def grid(name,us,vs,fn,mat,flip=False):
    verts=[fn(u,v) for u in us for v in vs]
    nv=len(vs)
    faces=[]
    for i in range(len(us)-1):
        for j in range(nv-1):
            q=(i*nv+j,(i+1)*nv+j,(i+1)*nv+j+1,i*nv+j+1)
            faces.append(tuple(reversed(q)) if flip else q)
    return mesh(name,verts,faces,mat)
xs=sorted(set([-2.27+4.54*i/200 for i in range(201)] +
              [-1.20,-1.02,.35,.58] +
              [a+d for a in (-1.335,1.335) for d in (-.425,0,.425)]))
for s in (-1,1):
    grid("Body side L" if s>0 else "Body side R",xs,
         [i/24 for i in range(25)],
         lambda x,t,s=s:(x,s*side_y(x,lower(x)+(height(x)-lower(x))*t),
                          lower(x)+(height(x)-lower(x))*t),
         paint,flip=(s>0))
    grid("Upper shoulder",xs,[i/24 for i in range(25)],
         lambda x,t,s=s:(x,s*(inner(x)+(.94*width(x)-inner(x))*t),
                         top_z(x,inner(x)+(.94*width(x)-inner(x))*t)),
         paint,flip=(s<0))
    rimxs=[x for x in xs if -1.20<=x<=.58]
    path("Cockpit edge",[(x,s*inner(x),top_z(x,inner(x))+.003) for x in rimxs],
         paint,.012)
    # Inner door surface descends to floor; keeps the opening visibly hollow.
    grid("Cabin side lining",rimxs,[0,.25,.5,.75,1],
         lambda x,t,s=s:(x,s*(inner(x)-.012),
                         .53+(top_z(x,inner(x))-.53)*t),
         tan,flip=(s<0))
    for a in (-1.335,1.335):
        pts=[]
        for i in range(81):
            theta=pi*i/80
            x=a+.425*cos(theta)
            z=.245+.525*sin(theta)
            pts.append((x,s*(side_y(x,z)+.003),z+.003))
        path("Wheel arch rolled edge",pts,paint,.009)

# Curved front and rear bumper skins.
def end_panel(x,q,t):
    y=q*width(x)*.94
    z=.245+(top_z(x,y)-.245)*t
    bow=.085*(1-q*q)*sin(pi*t)
    return (x+(bow if x>0 else -bow),y,z)
for x in (-2.27,2.27):
    grid("Front bumper skin" if x>0 else "Rear bumper skin",
         [-1+2*i/40 for i in range(41)],[i/16 for i in range(17)],
         lambda q,t,x=x:end_panel(x,q,t),paint,flip=(x<0))
box("Cabin floor",(-.30,0,.54),(1.55,1.31,.045),black,.02)
box("Underbody",(0,0,.235),(4.38,1.35,.035),black,.01)

# Distinct panel seams stay flush with the smooth main skin.
for s in (-1,1):
    # Door cut ends above the sill and remains between the axles.
    door=[(.47,.95),(.45,.84),(.39,.66),(.31,.42),
          (.12,.33),(-.62,.33),(-.80,.40),(-.87,.67),(-.88,.93)]
    path("Door panel gap",[(x,s*(side_y(x,z)+.005),z) for x,z in door],black,.0028)
    x=-.64; z=.90
    box("Flush handle",(x,s*(side_y(x,z)+.012),z),(.13,.018,.024),chrome,.009)
    # Side vent at front wing, with three fine horizontal blades.
    vent=[(.69,.81),(.86,.78),(.69,.64),(.59,.65)]
    v=[(x,s*(side_y(x,z)+.009),z) for x,z in vent]
    mesh("Front wing vent",v,[(0,1,2,3)],black)
    for j in range(3):
        z=.68+j*.035
        path("Wing vent blade",[(.63,s*(side_y(.63,z)+.017),z),
                               (.76,s*(side_y(.76,z)+.017),z)],chrome,.003)

# Low reclined and compound-curved windshield, rather than a flat rectangle.
def wind(q,t):
    w=.800*(1-t)+.725*t
    x=.61-.665*t+.085*(1-q*q)
    z=.965+.405*t-.018*q*q*t
    return (x,q*w,z)
windscreen = grid("Curved windscreen",[-1+2*i/32 for i in range(33)],
     [i/12 for i in range(13)],wind,glass,flip=True)
# A full-width windshield must reach BOTH A pillars before any export.
wind_y = [v.co.y for v in windscreen.data.vertices]
assert min(wind_y) < -.79 and max(wind_y) > .79, "Windshield width incomplete"
assert len(windscreen.data.polygons) == 32*12, "Windshield grid incomplete"
for s in (-1,1):
    path("Painted A pillar",[wind(s,i/24) for i in range(25)],paint,.025)
    path("Window rubber seal",[(x-.008,y*.992,z) for x,y,z in
          [wind(s,i/24) for i in range(25)]],black,.008)
for t in (0,1):
    path("Windscreen rail",[wind(-1+2*i/48,t) for i in range(49)],black,.016)
# Shaped dashboard/cowl and two compact wipers.
box("Dashboard main",(.38,0,.91),(.31,1.35,.15),black,.05)
for s in (-1,1):
    path("Wiper",[(.64,s*.17,.985),(.64,s*.53,.980)],black,.006)
    rod("Mirror stalk",(.32,s*.84,.97),(.27,s*1.01,1.015),.018,black)
    ellipsoid("Mirror red shell",(.23,s*1.045,1.035),(.145,.085,.050),paint)
    ellipsoid("Mirror reflecting face",(.115,s*1.045,1.035),(.012,.066,.034),chrome)

# Sculpted seats: separate bolsters, reclined backrests and integrated headrests.
for s in (-1,1):
    y=s*.37
    box("Seat cushion",(-.45,y,.675),(.47,.43,.12),tan,.055)
    for off in (-.205,.205):
        ellipsoid("Seat cushion bolster",(-.43,y+off,.72),(.225,.052,.075),tan)
        o=box("Seat back bolster",(-.72,y+off,.92),(.13,.085,.41),tan,.04)
        o.rotation_euler[1]=-.22
    o=box("Seat back",(-.73,y,.925),(.105,.33,.40),tan,.05)
    o.rotation_euler[1]=-.22
    box("Headrest",(-.79,y,1.175),(.13,.28,.20),tan,.06)
    for dz in (0,.055,.11,.165,.22):
        path("Seat stitch",[(-.795,y-.13,.80+dz),(-.795,y+.13,.80+dz)],tan,.002)
    box("Rear cushion",(-1.02,y,.73),(.22,.40,.10),tan,.035)
    box("Rear backrest",(-1.10,y,.88),(.11,.39,.22),tan,.045)
box("Console",(-.25,0,.70),(.92,.15,.18),tan,.025)
box("Console top",(-.20,0,.80),(.66,.13,.024),black,.014)
for x in (-.14,-.03,.08):
    ellipsoid("Console control",(x,0,.82),(.025,.025,.008),chrome)
# Steering wheel is angled with the dashboard.
steer_c=Vector((.15,-.37,1.005))
def steer_point(t):
    return steer_c+Vector((-.035*sin(t),.143*cos(t),.143*sin(t)))
path("Leather steering rim",[steer_point(i*2*pi/64) for i in range(64)],black,.014,True)
for t in (0,pi,1.5*pi):
    rod("Steering spoke",steer_c,steer_point(t),.013,chrome)
ellipsoid("Steering hub",steer_c,(.025,.045,.045),black)
# Instruments below windscreen, dark surrounds and fine metallic ring.
for y in (-.47,-.29):
    ellipsoid("Instrument binnacle",(.325,y,.97),(.05,.09,.065),black)
    path("Instrument ring",[(.27,y+.049*cos(t),.97+.049*sin(t))
                          for t in [i*2*pi/40 for i in range(40)]],chrome,.003,True)

# Larger independent low-profile wheels with tapered split five-spoke rims.
gold=material("Centre cap yellow",(.8,.52,.015),.35,.35)
for axle,x in (("rear",-1.335),("front",1.335)):
    for s in (-1,1):
        y=s*.875
        wheelparts_start=len(parts)
        bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=16,
            location=(x,y,.365),rotation=(pi/2,0,0),
            major_radius=.303,minor_radius=.062)
        finish(bpy.context.object,"Tyre",rubber)
        # Flattened sidewalls make the tyre look like a tyre rather than a ring.
        for off in (-.073,.073):
            bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=8,
                location=(x,y+off,.365),rotation=(pi/2,0,0),
                major_radius=.312,minor_radius=.032)
            finish(bpy.context.object,"Tyre sidewall",rubber)
        rod("Rim barrel",(x,y-.07,.365),(x,y+.07,.365),.276,black)
        yf=y+s*.100
        rod("Vented brake rotor",(x,y+s*.065,.365),(x,y+s*.078,.365),.222,chrome)
        box("Red brake caliper",(x+.17,y+s*.083,.365),(.075,.037,.20),red,.02)
        for i in range(5):
            a=2*pi*i/5
            # Polygonal tapered spokes, small fork at the polished outer edge.
            for fork in (-1,1):
                pol=[(.050,a-.17),(.17,a-.08),(.268,a+fork*.075-.025),
                     (.268,a+fork*.075+.025),(.14,a+.09),(.05,a+.17)]
                vv=[(x+r*cos(t),yf,.365+r*sin(t)) for r,t in pol]
                obj=mesh("Tapered alloy spoke",vv,[tuple(range(6))],chrome)
                solid=obj.modifiers.new("Spoke thickness","SOLIDIFY");solid.thickness=.018
                bev=obj.modifiers.new("Spoke edge","BEVEL");bev.width=.004;bev.segments=2
        for r,thick in ((.274,.010),(.255,.005)):
            path("Machined rim edge",[(x+r*cos(t),yf+s*.004,.365+r*sin(t))
                 for t in [i*2*pi/72 for i in range(72)]],chrome,thick,True)
        rod("Wheel hub",(x,yf,.365),(x,yf+s*.02,.365),.048,gold)
        for i in range(5):
            t=i*2*pi/5
            ellipsoid("Wheel bolt",(x+.060*cos(t),yf+s*.012,.365+.060*sin(t)),
                      (.009,.006,.009),chrome)
        # Group wheels explicitly for later steering/suspension integration.
        wheelparts=parts[wheelparts_start:]
        empty=bpy.data.objects.new("wheel_"+axle+("_L" if s>0 else "_R"),None)
        bpy.context.collection.objects.link(empty)
        for obj in wheelparts: obj.parent=empty
        parts.append(empty)

# Headlight outline: a curved swept lens, with projectors seated inside its bed.
def closed_catmull(points,steps=8):
    result=[]
    for i,p1 in enumerate(points):
        p0=Vector(points[(i-1)%len(points)]);p1=Vector(p1)
        p2=Vector(points[(i+1)%len(points)]);p3=Vector(points[(i+2)%len(points)])
        for j in range(steps):
            t=j/steps
            p=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+
                  (-p0+3*p1-3*p2+p3)*t*t*t)
            result.append(p)
    return result
def deck_polygon(name,xy,mat,offset):
    boundary=closed_catmull([(x,y,0) for x,y in xy],6)
    cx=sum(p.x for p in boundary)/len(boundary)
    cy=sum(p.y for p in boundary)/len(boundary)
    verts=[(cx,cy,top_z(cx,cy)+offset)]
    verts += [(p.x,p.y,top_z(p.x,p.y)+offset) for p in boundary]
    return mesh(name,verts,[(0,i+1,(i+1)%len(boundary)+1) for i in range(len(boundary))],mat),verts[1:]
for s in (-1,1):
    xy=[(2.105,s*.608),(2.045,s*.742),(1.78,s*.827),
        (1.46,s*.842),(1.59,s*.737),(1.85,s*.650)]
    _,edge=deck_polygon("Recessed dark headlamp housing",xy,black,.012)
    path("Headlamp chrome bezel",edge,chrome,.005,True)
    for x,y,r in ((1.98,.693,.062),(1.82,.755,.047)):
        z=top_z(x,y)+.024
        ellipsoid("Projector black surround",(x,s*y,z),(.075,.055,.014),black)
        ellipsoid("Projector glass",(x,s*y,z+.010),(r,r*.66,.012),lamp)
    ledpts=[]
    for i in range(10):
        x=1.50+.47*i/9
        y=.826-.08*i/9
        ledpts.append((x,s*y,top_z(x,y)+.029))
    path("Headlamp LED strip",ledpts,lamp,.006)
    # Lens remains shallow and aligned to the body surface.
    lensmat=material("Clear headlight lens",(.65,.72,.79),.0,.09)
    socket(principled(lensmat),"Transmission Weight").default_value=.94
    deck_polygon("Curved headlight cover",xy,lensmat,.043)
# Hood panel perimeter follows the deck, avoiding floating zig-zag rods.
for s in (-1,1):
    coords=[(.60+.0,.52),(.90,.52),(1.23,.49),(1.56,.45),(1.89,.40)]
    path("Hood shut line",[(x,s*y,top_z(x,y)+.002) for x,y in coords],black,.0022)
# Hood scoop: broad, low rectangular aperture with a body-colour lip.
scoopxy=[(1.27,-.22),(1.27,.22),(1.10,.21),(1.10,-.21)]
deck_polygon("Low hood scoop opening",scoopxy,black,.012)
for y in (-.14,-.07,0,.07,.14):
    rod("Hood scoop mesh",(1.12,y,top_z(1.12,y)+.018),
                          (1.26,y,top_z(1.26,y)+.018),.0025,chrome)

# Rounded trapezoid front grille is integrated into the bumper silhouette.
outline=closed_catmull([(2.32,-.565,.55),(2.32,.565,.55),
                        (2.32,.60,.46),(2.32,.47,.28),
                        (2.32,-.47,.28),(2.32,-.60,.46)],8)
verts=[(2.32,0,.415)]+[tuple(p) for p in outline]
mesh("Deep front grille",verts,[(0,i+1,(i+1)%len(outline)+1)
                               for i in range(len(outline))],black)
path("Fine chrome grille surround",outline,chrome,.008,True)
for z,w in ((.33,.49),(.40,.545),(.47,.565),(.525,.55)):
    rod("Front grille horizontal",(2.327,-w,z),(2.327,w,z),.005,chrome)
for y in (-.37,-.18,0,.18,.37):
    rod("Front grille vertical",(2.329,y,.30),(2.329,y,.54),.0035,chrome)
for s in (-1,1):
    outline2=closed_catmull([(2.29,s*.64,.32),(2.29,s*.72,.37),
                            (2.29,s*.74,.275),(2.29,s*.63,.255)],6)
    mesh("Lower corner intake",[tuple(p) for p in outline2],
         [tuple(range(len(outline2)))],black)
path("Integrated lower bumper lip",[(2.31-.10*(q*q),q*.73,.225)
      for q in [-1+i/40 for i in range(81)]],black,.012)
# Rear design is still an approximation pending a rear-view reference.
for s in (-1,1):
    rod("Rear circular lamp",(-2.30,s*.57,.74),(-2.32,s*.57,.74),.088,tail)
    rod("Rear inner lens",(-2.325,s*.57,.74),(-2.329,s*.57,.74),.046,lamp)
    for z in (.29,.39):
        rod("Exhaust metal rim",(-2.26,s*.61,z),(-2.39,s*.61,z),.043,chrome)
        rod("Exhaust dark bore",(-2.39,s*.61,z),(-2.395,s*.61,z),.034,black)
box("Rear diffuser",(-2.27,0,.245),(.14,1.1,.07),black,.02)

# Round the complete nose as one continuous shape. Apply the same mapping to
# skins, grille, headlamps and trim; moving only the bumper would leave gaps.
def shape_front(co):
    p = Vector(co)
    if p.x <= 1.68:
        return p
    t = max(0,min(1,(p.x-1.68)/.59))
    t = t*t*(3-2*t)
    q = min(1.25,abs(p.y)/.90)
    p.x += t*(.10*(1-q*q)-.11*q*q-.055*((p.z-.48)/.36)**2)
    p.z += t*(.012-.018*q*q)
    return p
for obj in parts:
    if obj.type not in {"MESH","CURVE"}:
        continue
    world = obj.matrix_world.copy()
    inverse = world.inverted()
    if obj.type == "MESH":
        for vertex in obj.data.vertices:
            vertex.co = inverse @ shape_front(world @ vertex.co)
    elif obj.type == "CURVE":
        for spline in obj.data.splines:
            for point in spline.points:
                old_w = point.co.w
                mapped = inverse @ shape_front(world @ point.co.xyz)
                point.co = (*mapped,old_w)
# Explicit bilateral bumper checks catch the former half-width range error.
for name in ("Front bumper skin","Rear bumper skin"):
    bumper = bpy.data.objects.get(name)
    assert bumper is not None, "Missing bumper"
    ys = [(bumper.matrix_world @ v.co).y for v in bumper.data.vertices]
    assert min(ys)<-.65 and max(ys)>.65, "Bumper width incomplete"
# Recalculate mesh normals, preserve continuous quad surfaces, then export.
for obj in parts:
    if obj.type=="MESH":
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data);bm.free()
for i,obj in enumerate(parts):
    if obj.type=="CURVE":
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target="MESH")
        parts[i]=bpy.context.object
carparts=list(parts)
bpy.ops.object.select_all(action="DESELECT")
for obj in carparts: obj.select_set(True)
bpy.context.view_layer.objects.active=carparts[0]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,"california-study-v3.glb"),
    export_format="GLB",use_selection=True,export_apply=True,export_extras=True)

# Neutral studio preview; hide helpers and remove orange selection from view.
groundmat=material("Studio floor",(.11,.12,.14),.1,.48)
box("Studio floor",(0,0,-.055),(40,40,.08),groundmat,.0)
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1200
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new("Neutral studio")
scene.world.use_nodes=True
bg=next((n for n in scene.world.node_tree.nodes if n.bl_idname=="ShaderNodeBackground"),None)
if bg is None:
    bg=scene.world.node_tree.nodes.new("ShaderNodeBackground")
    wo=scene.world.node_tree.nodes.new("ShaderNodeOutputWorld")
    scene.world.node_tree.links.new(bg.outputs[0],wo.inputs[0])
bg.inputs[0].default_value=(.35,.38,.44,1)
bg.inputs[1].default_value=.45
for loc,power,size in [((2,-4,5),1500,5),((-3,-1,4),1100,4),((0,4,5),1800,4)]:
    bpy.ops.object.light_add(type="AREA",location=loc)
    light=bpy.context.object;light.name="Studio softbox"
    light.data.energy=power;light.data.shape="RECTANGLE";light.data.size=size;light.data.size_y=2
    light.rotation_euler=(Vector((0,0,.65))-light.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.camera_add(location=(6.1,-6.4,2.8))
camera=bpy.context.object;camera.data.lens=52
camera.rotation_euler=(Vector((.1,0,.67))-camera.location).to_track_quat("-Z","Y").to_euler()
scene.camera=camera
bpy.ops.object.select_all(action="DESELECT")
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=="VIEW_3D":
            sp=area.spaces.active
            sp.overlay.show_overlays=False
            sp.region_3d.view_distance=6.5
            sp.region_3d.view_location=(.1,0,.68)
            sp.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            sp.shading.type="MATERIAL"
            sp.shading.studiolight_rotate_z=.7
            worlds = {light.name for light in bpy.context.preferences.studio_lights
                      if light.type == "WORLD"}
            if "studio.exr" in worlds:
                sp.shading.studiolight_rotate_z = 0
                sp.shading.studiolight_intensity = 1.15
                sp.shading.studiolight_background_alpha = 0.0
                sp.shading.studio_light = "studio.exr"
blendpath=os.path.join(OUT,"california-study-v3.blend")
bpy.ops.wm.save_as_mainfile(filepath=blendpath)
# Record mesh counts, without claiming measured FPS or runtime validation.
import json
metrics={"version":"v3","mesh_objects":sum(o.type=="MESH" for o in carparts),
         "base_triangles":sum(sum(max(0,len(p.vertices)-2) for p in o.data.polygons)
                              for o in carparts if o.type=="MESH"),
         "game_integration":"NOT_INTEGRATED","runtime_fps":"NOT_MEASURED",
         "rear_geometry":"APPROXIMATED_FROM_SINGLE_FRONT_REFERENCE"}
with open(os.path.join(OUT,"model-info.json"),"w",encoding="utf-8") as f:
    json.dump(metrics,f,indent=2)
if "--render" in sys.argv:
    scene.render.filepath=os.path.join(OUT,"preview-front.png")
    bpy.ops.render.render(write_still=True)
print("HORIZON_V3_OUTPUT="+OUT)
print("Model is a study. Inspect against the supplied reference before integration.")
