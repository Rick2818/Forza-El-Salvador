"""Build Horizon El Salvador's original mountain/night circuits in REAL Blender.
Run:
    blender -b -t 2 --python tools/blender/circuits/build_international.py
Outputs:
    tools/blender/circuit-sources/sparda.blend
    tools/blender/circuit-sources/sakhir-horizon.blend
    public/circuits/sparda.glb
    public/circuits/sakhir-horizon.glb
Editable surfaces are reference geometry. Three.js + Rapier own in-game roads.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
SOURCES=ROOT/'tools/blender/circuit-sources'
ASSETS=ROOT/'public/circuits'
SOURCES.mkdir(parents=True,exist_ok=True)
ASSETS.mkdir(parents=True,exist_ok=True)

def point(circuit, t):
    if circuit=='sparda':
        r=930+160*math.sin(3*t+.45)+75*math.cos(5*t-.2)
        h=30*(1-math.cos(t))+5*(1-math.cos(3*t+.2))
    else:
        r=780+110*math.sin(4*t+.3)+45*math.cos(6*t)+35*math.sin(9*t+.6)
        h=0
    # Blender uses Z-up, while the game uses Y-up and flipped second axis.
    return (r*math.cos(t),-r*math.sin(t),h)

def mat(name, rgb, metallic=0, rough=.8, glow=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*rgb,1)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=rough
    if glow:
        p.inputs['Emission Color'].default_value=(*rgb,1)
        p.inputs['Emission Strength'].default_value=glow
    return m

def box(name, xyz, dims, material, yaw=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz)
    o=bpy.context.object
    o.name=name
    o.dimensions=dims
    o.rotation_euler.z=yaw
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    return o

def ribbon(name,points,start,end,height,material):
    verts=[]
    faces=[]
    n=len(points)
    for i,p in enumerate(points):
        a=points[(i-1)%n]
        b=points[(i+1)%n]
        tx,ty=b[0]-a[0],b[1]-a[1]
        length=max(1e-6,math.hypot(tx,ty))
        rx,ry=-ty/length,tx/length
        verts.extend([(p[0]+start*rx,p[1]+start*ry,p[2]+height),
                      (p[0]+end*rx,p[1]+end*ry,p[2]+height)])
    for i in range(n):
        j=(i+1)%n
        faces.extend([(2*i,2*j,2*i+1),(2*i+1,2*j,2*j+1)])
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    ob=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    return ob

def wall(name,points,offset,material):
    verts=[]
    faces=[]
    n=len(points)
    for i,p in enumerate(points):
        a,b=points[(i-1)%n],points[(i+1)%n]
        tx,ty=b[0]-a[0],b[1]-a[1]
        d=max(1e-6,math.hypot(tx,ty))
        rx,ry=-ty/d,tx/d
        x,y=p[0]+rx*offset,p[1]+ry*offset
        verts.extend([(x,y,p[2]+.05),(x,y,p[2]+1.55)])
    for i in range(n):
        j=(i+1)%n
        faces.extend([(i*2,j*2,i*2+1),(j*2,j*2+1,i*2+1)])
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.materials.append(material)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)

def near_track(points, index, lateral, along, upward):
    n=len(points)
    center=points[index%n]
    a,b=points[(index-1)%n],points[(index+1)%n]
    dx,dy=b[0]-a[0],b[1]-a[1]
    d=max(1e-6,math.hypot(dx,dy))
    tx,ty=dx/d,dy/d
    rx,ry=-ty,tx
    location=(center[0]+rx*lateral+tx*along,
              center[1]+ry*lateral+ty*along,
              center[2]+upward)
    # Blender local Y is the building's length axis, aligned with tangent.
    yaw=math.atan2(-tx,ty)
    return location,yaw

def build(circuit):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    random.seed(19 if circuit=='sparda' else 29)
    mountain=circuit=='sparda'
    materials={
        'road':mat('Asfalto',(.075,.081,.090),rough=.92),
        'line':mat('Pintura vial',(.93,.94,.94),rough=.73),
        'kerb':mat('Pianos rojo',(.73,.08,.09),rough=.72),
        'guard':mat('Guardarrailes acero',(.47,.50,.53),metallic=.3,rough=.62),
        'earth':mat('Vegetacion de montaña',(.2,.34,.22),rough=1) if mountain else mat('Arena desertica',(.51,.41,.29),rough=1),
        'walls':mat('Hormigon',(.59,.61,.60) if mountain else (.6,.56,.5),rough=.84),
        'glass':mat('Vidrio polarizado',(.17,.39,.56),metallic=.4,rough=.25),
        'roof':mat('Tejado de aluminio',(.79,.81,.81),metallic=.25,rough=.52),
        'tree':mat('Pino',(.10,.29,.19),rough=1),
        'trunk':mat('Tronco',(.34,.24,.14),rough=1),
        'rock':mat('Rocas',(.43,.43,.39) if mountain else (.65,.52,.35),rough=1),
        'light':mat('Iluminacion calida',(.98,.82,.56),rough=.35,glow=3.5),
        'steel':mat('Acero oscuro',(.15,.18,.21),metallic=.6,rough=.56)
    }
    points=[point(circuit,i*2*math.pi/1800) for i in range(1800)]
    width=14 if mountain else 16
    distance=sum(math.dist(points[i],points[(i+1)%len(points)]) for i in range(len(points)))
    if not (6300<distance<6600 if mountain else 5400<distance<5700):
        raise ValueError('Longitud invalida '+circuit+': '+str(distance))
    minx,maxx=min(p[0] for p in points),max(p[0] for p in points)
    miny,maxy=min(p[1] for p in points),max(p[1] for p in points)
    mid=((minx+maxx)/2,(miny+maxy)/2)
    box('Terreno-'+circuit,(mid[0],mid[1],-3.5),(max(maxx-minx,maxy-miny)+520,)*2+(6,),materials['earth'])
    ribbon('Asfalto-'+circuit,points,-width/2,width/2,.03,materials['road'])
    for side in (-1,1):
        from_,to_=sorted([side*(width/2-.58),side*(width/2-.2)])
        ribbon('Linea-%s'%side,points,from_,to_,.055,materials['line'])
        from_,to_=sorted([side*width/2,side*(width/2+1.2)])
        ribbon('Piano-%s'%side,points,from_,to_,.05,materials['kerb'])
        wall('Proteccion-%s'%side,points,side*(width/2+5.5),materials['guard'])
    # Pit complex near the first sector, outside the drivable asphalt.
    index=80
    for name,side,along,z,w,l,h,matkey in [
        ('Paddock-principal',49,0,7.0,27,170,14,'walls'),
        ('Paddock-vidrio',32.8,0,11.2,.8,168,5,'glass'),
        ('Paddock-techo',49,0,14.8,33,184,1.2,'roof'),
        ('Tribuna-central',-57,0,5.5,34,240,11,'walls'),
        ('Tribuna-cubierta',-57,0,15.8,44,250,1.1,'roof'),
        ('Torre-control',95,100,17,28,25,34,'walls'),
        ('Torre-cristales',95,100,27,31,28,10,'glass')
    ]:
        loc,yaw=near_track(points,index,side,along,z)
        box(name,loc,(w,l,h),materials[matkey],yaw)
    for row in range(9):
        loc,yaw=near_track(points,index,-47-row*2.5,0,9+row*.65)
        box('Grada-fila-%02d'%row,loc,(3.1,210,.55),
            materials['roof'] if row%2 else materials['glass'],yaw)
    for i in range(20):
        loc,yaw=near_track(points,index,33.0,(i-10)*8,5)
        box('Garage-puerta-%02d'%i,loc,(.35,6.4,8.2),materials['steel'],yaw)
    if mountain:
        for i in range(65):
            p=points[random.randrange(len(points))]
            idx=random.randrange(len(points))
            lateral=random.choice((-1,1))*random.uniform(52,175)
            loc,_=near_track(points,idx,lateral,0,0)
            baseh=loc[2]-random.uniform(1,3)
            treeh=random.uniform(12,22)
            box('Pino-tronco-%03d'%i,(loc[0],loc[1],baseh+treeh*.25),
                (.8,.8,treeh*.5),materials['trunk'])
            bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=treeh*.24,depth=treeh*.76,
                                            location=(loc[0],loc[1],baseh+treeh*.69))
            ob=bpy.context.object
            ob.name='Pino-copa-%03d'%i
            ob.data.materials.append(materials['tree'])
        for i in range(18):
            idx=random.randrange(len(points))
            loc,_=near_track(points,idx,random.choice((-1,1))*random.uniform(90,220),0,-.4)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(4,9),location=loc)
            bpy.context.object.name='Roca-montaña-%03d'%i
            bpy.context.object.data.materials.append(materials['rock'])
        for i in range(6):
            loc,yaw=near_track(points,100+i*60,26,0,2.1)
            box('Panel-frenada-%02d'%i,loc,(.4,3.0,4.2),materials['line'],yaw)
    else:
        # Distinctive night-race floodlight gantries; emissive meshes export in GLB.
        for i in range(34):
            index=i*50
            lateral=25 if i%2 else -25
            loc,yaw=near_track(points,index,lateral,0,11.5)
            box('Poste-luz-%02d'%i,loc,(.55,.55,23),materials['steel'])
            lamp=(loc[0],loc[1],loc[2]+12)
            box('Reflector-%02d'%i,lamp,(3.4,2.5,.6),materials['light'],yaw)
        for i in range(36):
            idx=random.randrange(len(points))
            loc,_=near_track(points,idx,random.choice((-1,1))*random.uniform(70,240),0,-1.5)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(3,8),location=loc)
            bpy.context.object.name='Duna-roca-%03d'%i
            bpy.context.object.scale.z=.35
            bpy.context.object.data.materials.append(materials['rock'])
        for i in range(6):
            loc,yaw=near_track(points,120+i*15,-38,0,4)
            box('Carpa-desierto-%02d'%i,loc,(11,16,8),materials['roof'],yaw)
    # Keep source inspectable in Blender as a complete scene.
    scene=bpy.context.scene
    scene.render.engine='BLENDER_WORKBENCH'
    scene.render.resolution_x=1440
    scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    target=Vector((mid[0],mid[1],0))
    bpy.ops.object.camera_add(location=(mid[0]+900,mid[1]-1150,1250))
    camera=bpy.context.object
    camera.name='Camara-inspeccion'
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=max(maxx-minx,maxy-miny)*1.4
    scene.camera=camera
    scene.world.color=(.46,.63,.77) if mountain else (.06,.10,.18)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/(circuit+'.blend')),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(ASSETS/(circuit+'.glb')),
        export_format='GLB',export_cameras=False,export_lights=False)
    if (ASSETS/(circuit+'.glb')).stat().st_size<40000:
        raise RuntimeError('GLB too small '+circuit)
    print('CIRCUIT_READY',circuit,'objects',len(scene.objects),'metres',round(distance),
          'bytes',(ASSETS/(circuit+'.glb')).stat().st_size,flush=True)

for name in ('sparda','sakhir-horizon'):
    build(name)
print('INTERNATIONAL_CIRCUITS_COMPLETE',flush=True)
