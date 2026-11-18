"""Horizon El Salvador — approved circuits in actual Blender.
Run: blender -b -t 2 --python tools/blender/circuits/build_circuits.py
Source coordinates are metres. Outputs editable .blend and importable .glb.
Original circuits, inspired by racing traditions, not official circuit meshes.
"""
from __future__ import annotations
import math, random
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT_BLEND = ROOT / "tools/blender/circuit-sources"
OUT_GLB = ROOT / "public/circuits"
OUT_BLEND.mkdir(parents=True, exist_ok=True)
OUT_GLB.mkdir(parents=True, exist_ok=True)

MONZON = [
    ("S", 1050), ("T", 37, 58, 1), ("T", 74, 58, -1),
    ("T", 37, 58, 1), ("S", 145), ("T", 90, 115, 1),
    ("S", 700), ("T", 36, 72, -1), ("T", 72, 72, 1),
    ("T", 36, 72, -1), ("S", 120), ("T", 90, 130, 1),
    ("S", 1462.81043), ("T", 42, 110, 1), ("S", 110),
    ("T", 48, 110, 1), ("S", 885.584717), ("T", 90, 165, 1),
    ("S", 170)
]

def material(name, rgba, rough=0.8, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgba, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgba, 1)
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Metallic"].default_value = metallic
    return mat

def cube(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    return ob

def surface(name, points, a, b, zoff, mat):
    verts = []
    faces = []
    n = len(points)
    for i, p in enumerate(points):
        prev = points[(i-1) % n]
        nxt = points[(i+1) % n]
        tx, ty = nxt[0]-prev[0], nxt[1]-prev[1]
        norm = max(1e-8, math.hypot(tx, ty))
        rx, ry = ty/norm, -tx/norm
        verts.extend([(p[0]+rx*a,p[1]+ry*a,p[2]+zoff),
                      (p[0]+rx*b,p[1]+ry*b,p[2]+zoff)])
    for i in range(n):
        j = (i+1) % n
        faces.extend([(2*i,2*i+1,2*j),(2*i+1,2*j+1,2*j)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    return ob

def wall(name, points, side, width, mat):
    verts = []
    faces = []
    n = len(points)
    for i,p in enumerate(points):
        prev, nxt = points[(i-1)%n], points[(i+1)%n]
        tx, ty = nxt[0]-prev[0], nxt[1]-prev[1]
        d = max(1e-8, math.hypot(tx,ty))
        rx, ry = ty/d,-tx/d
        x, y = p[0]+rx*side*(width/2+3), p[1]+ry*side*(width/2+3)
        verts.extend([(x,y,p[2]+.18),(x,y,p[2]+1.4)])
    for i in range(n):
        j = (i+1)%n
        faces.extend([(2*i,2*j,2*i+1),(2*j,2*j+1,2*i+1)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)

def monzon_points(step=4.5):
    x=y=heading=0.0
    points=[(x,y,0.0)]
    for segment in MONZON:
        if segment[0]=="S":
            length=segment[1]
            n=max(1,math.ceil(length/step))
            for _ in range(n):
                x+=length/n*math.cos(heading)
                y+=length/n*math.sin(heading)
                points.append((x,y,0.0))
        else:
            _,angle,rad,sign=segment
            n=max(2,math.ceil(math.radians(angle)*rad/step))
            da=math.radians(angle)*sign/n
            for _ in range(n):
                heading+=da
                x+=math.cos(heading)*rad*abs(da)
                y+=math.sin(heading)*rad*abs(da)
                points.append((x,y,0.0))
    gap=math.hypot(x,y)
    if gap>1:
        raise ValueError("Monzon geometry does not close: %.2f m" % gap)
    return points[:-1]

def suzaka_points(n=1800):
    points=[]
    for i in range(n):
        t=2*math.pi*i/n
        x=900*math.sin(t)+20*math.sin(3*t+.1)-20*math.sin(.1)
        y=490*math.sin(2*t)+28*math.sin(6*t)
        delta=math.atan2(math.sin(t-math.pi),math.cos(t-math.pi))
        z=12*math.exp(-.5*(delta/.34)**2)
        points.append((x,y,z))
    return points

def trees(points, count, pink, mat_trunk, mat_crown, seed):
    rng=random.Random(seed)
    for i in range(count):
        p=points[rng.randrange(len(points))]
        distance=rng.uniform(48,155)
        side=1 if i%2==0 else -1
        prev=points[(i*17-1)%len(points)]
        nxt=points[(i*17+1)%len(points)]
        tx,ty=nxt[0]-prev[0],nxt[1]-prev[1]
        norm=max(1e-8,math.hypot(tx,ty))
        x=p[0]+side*distance*ty/norm
        y=p[1]-side*distance*tx/norm
        h=rng.uniform(10,17)
        cube("Arbol-Tronco-%03d"%i,(x,y,h*.27),(.6,.6,h*.54),mat_trunk)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,y,h*.72))
        crown=bpy.context.object
        crown.name=("Sakura" if pink else "Roble")+"-%03d"%i
        crown.scale=(h*.35,h*.36,h*.31)
        crown.data.materials.append(mat_crown)

def build_one(name, points, width):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    mats={
      "road":material("Asfalto PBR",(0.075,.081,.086),.91),
      "line":material("Linea blanca",(.88,.89,.86),.74),
      "kerb_red":material("Piano rojo",(.7,.045,.055),.7),
      "kerb_white":material("Piano blanco",(.92,.92,.89),.7),
      "barrier":material("Barrera acero",(.40,.43,.45),.48,.3),
      "ground":material("Pradera",(.17,.33,.19),.98),
      "roof":material("Cubierta aluminio",(.63,.68,.71),.48,.24),
      "concrete":material("Hormigon",(.47,.50,.52),.9),
      "glass":material("Vidrio azulado",(.16,.37,.53),.19,.65),
      "sakura":material("Flores sakura",(.95,.47,.66),.82),
      "leaf":material("Follaje",(.13,.35,.20),.91),
      "wood":material("Madera",(.34,.23,.13),.95),
      "metal":material("Metal oscuro",(.12,.17,.21),.48,.5)
    }
    minx,maxx=min(p[0] for p in points),max(p[0] for p in points)
    miny,maxy=min(p[1] for p in points),max(p[1] for p in points)
    cx,cy=(minx+maxx)/2,(miny+maxy)/2
    size=max(maxx-minx,maxy-miny)+410
    cube("Terreno-"+name,(cx,cy,-1.35),(size,size,2.1),mats["ground"])
    surface("Asfalto-"+name,points,-width/2,width/2,.04,mats["road"])
    for side in (-1,1):
        lo,hi=sorted((side*(width/2-.65),side*(width/2-.28)))
        surface("Linea-lateral-%s"%side,points,lo,hi,.073,mats["line"])
        lo,hi=sorted((side*width/2,side*(width/2+1.5)))
        surface("Piano-rojo-%s"%side,points,lo,hi,.052,mats["kerb_red"])
        wall("Proteccion-%s"%side,points,side,width,mats["barrier"])
    if name=="monzon":
        cube("Boxes-Monzon",(310,57,8.8),(560,41,17.6),mats["concrete"])
        cube("Ventanas-boxes",(310,36,15),(558,1.6,5.3),mats["glass"])
        cube("Techo-boxes",(310,50,19),(580,58,1.2),mats["roof"])
        for i in range(20):
            cube("Garage-%02d"%i,(50+27*i,35.3,4.75),(20,.75,9),mats["metal"])
        cube("Tribuna-Monzon",(305,-69,4.3),(520,45,8.5),mats["concrete"])
        for i in range(9):
            cube("Fila-%02d"%i,(305,-49-i*4.4,8.8+i*.62),(500,4,.65),mats["roof"] if i%2 else mats["glass"])
        cube("Techo-tribuna",(305,-70,20),(540,67,1.4),mats["roof"])
        cube("Torre-control",(630,63,18),(28,28,36),mats["concrete"])
        cube("Cristales-torre",(630,63,29),(29,29,10),mats["glass"])
        for x,metres in [(760,300),(860,200),(960,100)]:
            cube("Cartel-frenada-%d"%metres,(x,-25,3.1),(.28,3.4,2.8),mats["line"])
        cube("Arco-meta-Monzon",(650,0,9),(2,42,2.2),mats["metal"])
        trees(points,90,False,mats["wood"],mats["leaf"],22)
    else:
        # Suzaka's 12-metre flyover is modelled in the actual road vertices.
        cube("Paddock-Suzaka",(195,145,5),(295,32,10),mats["concrete"])
        cube("Paddock-cristales",(195,126,10.2),(294,1,4.1),mats["glass"])
        cube("Paddock-cubierta",(195,145,11.3),(305,42,.95),mats["roof"])
        cube("Tribuna-Suzaka",(-220,-160,4),(355,47,8),mats["concrete"])
        for i in range(7):
            cube("Tribuna-fila-%d"%i,(-220,-143-i*5.1,8.2+i*.64),(342,4.4,.58),mats["roof"])
        cube("Tribuna-cubierta",(-220,-160,16.7),(380,70,1.1),mats["roof"])
        cube("Torre-japonesa",(400,150,16),(32,26,32),mats["concrete"])
        cube("Torre-vidrio",(400,150,26),(34,28,8.2),mats["glass"])
        cube("Torre-tejado",(400,150,31.3),(46,38,1.9),mats["roof"])
        bpy.ops.mesh.primitive_torus_add(major_radius=32,minor_radius=.7,major_segments=72,minor_segments=8,location=(680,175,40))
        wheel=bpy.context.object
        wheel.name="Noria-Suzaka"
        wheel.rotation_euler[0]=math.pi/2
        wheel.data.materials.append(mats["metal"])
        trees(points,120,True,mats["wood"],mats["sakura"],107)
    # Keep material mesh hierarchy editable in the .blend.
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            obj.display_type='TEXTURED'
    scene=bpy.context.scene
    scene.render.engine='BLENDER_WORKBENCH'
    scene.render.resolution_x=1280
    scene.render.resolution_y=720
    scene.render.resolution_percentage=100
    center=Vector((cx,cy,0))
    bpy.ops.object.camera_add(location=(cx+850,cy-1050,1150))
    camera=bpy.context.object
    camera.name="Camara-inspeccion"
    vector=center-Vector(camera.location)
    camera.rotation_euler=vector.to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=size*1.5
    scene.camera=camera
    scene.world.color=(.55,.69,.87)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND/(name+'.blend')),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT_GLB/(name+'.glb')),export_format='GLB',export_cameras=False,export_lights=False)
    if (OUT_GLB/(name+'.glb')).stat().st_size<50000:
        raise RuntimeError('Export too small for '+name)
    print('CIRCUIT_READY',name,'objects',len(scene.objects),'glb',OUT_GLB/(name+'.glb'),flush=True)

build_one("monzon",monzon_points(),15)
build_one("suzaka",suzaka_points(),14)
print('BLENDER_EXPORTS_COMPLETE',flush=True)
