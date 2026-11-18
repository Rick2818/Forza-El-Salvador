"""Build seven editable, reference-guided driving prototypes, not certified replicas.

blender -b -t 2 --python tools/blender/selected-vehicles.py -- [--only ID]
Shared source of geometry/physics dimensions: src/vehicle/vehicle-designs.json.
Coordinates: Blender X = forward, Y = right, Z = up. Wheel pivot names are
part of the runtime contract. No wheels or accessories are supplied at runtime.
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
DESIGNS = json.loads((ROOT / 'src/vehicle/vehicle-designs.json').read_text())


def material(name, color, metal=0, rough=.35, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    if glow:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = glow
    if name == 'paint':
        bs.inputs['Coat Weight'].default_value = .9
        bs.inputs['Coat Roughness'].default_value = .1
    return m


def color(hex_value):
    # Convert photographed finish swatches (sRGB) to Blender's linear values.
    srgb = [int(hex_value[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in srgb)


def mesh(name, vertices, faces, mat, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data); bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in data.polygons: poly.use_smooth = smooth
    return obj


def box(name, loc, size, mat, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Edge radii', 'BEVEL'); mod.width = bevel; mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def tube(name, points, radius, mat, cyclic=False):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    curve.bevel_depth = radius; curve.bevel_resolution = 2
    line = curve.splines.new('POLY'); line.points.add(len(points)-1)
    for p, co in zip(line.points, points): p.co = (*co, 1)
    line.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, curve); bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def panel(name, points, mat):
    return mesh(name, points, [tuple(range(len(points)))], mat, False)


def on_coachwork(shell, x, y, offset=.006):
    """Locate a detail on the actual upper surface, after arch/intake cuts."""
    hit, location, normal, _ = shell.ray_cast(Vector((x,y,3)), Vector((0,0,-1)))
    if not hit:
        raise RuntimeError(f'Coachwork detail has no supporting surface at {x}, {y}')
    return tuple(location + normal * offset)


def fitted_lamp(shell, name, outline, mat):
    """Tessellated lens follows the curved fender instead of bridging over it."""
    cx=sum(p[0] for p in outline)/len(outline)
    cy=sum(p[1] for p in outline)/len(outline)
    perimeter=[]
    for a,b in zip(outline, outline[1:]+outline[:1]):
        for step in range(8):
            t=step/8
            perimeter.append((a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))
    vertices=[on_coachwork(shell,cx,cy)]
    # Radial subdivisions prevent a large planar face from cutting into a fender.
    n=len(perimeter)
    for ring in range(1,5):
        for x,y in perimeter:
            vertices.append(on_coachwork(shell,cx+(x-cx)*ring/4,cy+(y-cy)*ring/4))
    faces=[(0,1+i,1+(i+1)%n) for i in range(n)]
    for ring in range(3):
        a=1+ring*n;b=a+n
        faces.extend((a+i,b+i,b+(i+1)%n,a+(i+1)%n) for i in range(n))
    return mesh(name,vertices,faces,mat)


def front_recess(name, points, shell, mat, depth=.18):
    """Cut a real opening through the coachwork, with a recessed dark backing.

    Points describe the aperture in Y/Z; the cutter extends beyond the nose.
    A flat black decal on the uncut body is not an intake.
    """
    nose=max(p[0] for p in points)
    back=nose-depth
    outline=[(nose+.12,p[1],p[2]) for p in points]
    inside=[(back,p[1],p[2]) for p in points]
    n=len(points)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    cutter=mesh(name+' cutter',outline+inside,faces,mat,False)
    def volume(obj):
        bm=bmesh.new();bm.from_mesh(obj.data)
        result=abs(bm.calc_volume());bm.free();return result
    original_volume=volume(shell)
    bpy.context.view_layer.objects.active=shell
    mod=shell.modifiers.new(name+' cavity','BOOLEAN')
    mod.operation='DIFFERENCE';mod.solver='FAST';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    if volume(shell)<original_volume*.80:
        raise RuntimeError(name+': intake Boolean removed too much coachwork; refusing export')
    # The Boolean leaves a coachwork face at the cut depth. Keep the dark
    # backing just in front of it, avoiding coplanar paint/lens flicker.
    panel(name+' backing',[(x+.004,y,z) for x,y,z in inside],mat)
    # The cavity walls follow the opening to keep the backing visibly inset.
    mesh(name+' reveal',[(nose-.01,p[1],p[2]) for p in points]+inside,
      [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,False)


def catmull(a,b,c,d,t):
    return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)


def round_ring(ring, steps=3):
    out=[];n=len(ring)
    for j in range(n):
        a,b,c,d=[ring[k%n] for k in (j-1,j,j+1,j+2)]
        for i in range(steps):
            out.append(tuple(catmull(a[k],b[k],c[k],d[k],i/steps) for k in range(3)))
    return out


def ellipse(name, center, rx, ry, mat, plane='YZ', radius=.012):
    pts=[]
    for i in range(49):
        a=i*math.tau/48
        if plane == 'YZ': p=(center[0], center[1]+rx*math.cos(a), center[2]+ry*math.sin(a))
        elif plane == 'XY': p=(center[0]+rx*math.cos(a), center[1]+ry*math.sin(a), center[2])
        else: p=(center[0]+rx*math.cos(a), center[1], center[2]+ry*math.sin(a))
        pts.append(p)
    return tube(name, pts, radius, mat)


def body(d, mats):
    L, W = d['length'], d['width']/2
    # Distinct longitudinal surfaces, not recolored copies of the old hypercar.
    profiles={
      'ferrari': [(-.5,.70,.66),(-.45,.92,.82),(-.32,1,.86),(-.15,.97,.82),(.07,.95,.79),(.28,1,.81),(.42,.93,.70),(.5,.70,.58)],
      'u9': [(-.5,.78,.70),(-.43,.99,.84),(-.29,1,.86),(-.06,.94,.77),(.16,.95,.77),(.30,1,.81),(.43,.96,.64),(.5,.72,.49)],
      'jesko': [(-.5,.69,.67),(-.43,.94,.81),(-.30,1,.85),(-.10,.89,.71),(.14,.93,.69),(.29,1,.78),(.43,.89,.56),(.5,.54,.39)],
      'chiron': [(-.5,.70,.73),(-.44,.94,.84),(-.30,1,.87),(-.1,.98,.76),(.14,.95,.72),(.3,1,.78),(.44,.92,.64),(.5,.76,.54)],
      'porsche': [(-.5,.77,.65),(-.43,.94,.78),(-.28,1,.85),(-.10,.95,.78),(.12,.91,.73),(.29,.98,.79),(.42,.91,.75),(.5,.72,.49)],
      'aventador': [(-.5,.81,.65),(-.44,.98,.80),(-.29,1,.82),(-.10,.92,.71),(.15,.92,.65),(.29,1,.78),(.43,.90,.51),(.5,.72,.39)],
      'amg': [(-.5,.70,.64),(-.44,.95,.82),(-.29,1,.87),(-.10,.94,.77),(.12,.94,.76),(.29,.98,.80),(.44,.94,.68),(.5,.78,.58)]
    }
    profile=profiles[d['style']]
    if d['style']=='ferrari':
        cad=json.loads((Path(__file__).parent/'ferrari-freecad-sections.json').read_text())
        profile=[(.5-x/cad['length'], min(1,w/(2000*W)), z/1000-.035)
                 for x,w,z in reversed(cad['body'])]
    rings=[]
    for x,w,h in profile:
        floor=.15
        rings.append([(x*L, -w*W*.82, floor),(x*L,-w*W,floor+.19),
          (x*L,-w*W,h-.06),(x*L,-w*W*.89,h),
          (x*L,-w*W*.60,h-.020),(x*L,0,h-.025),
          (x*L,w*W*.60,h-.020),(x*L,w*W*.89,h),
          (x*L,w*W,h-.06),(x*L,w*W,floor+.19),(x*L,w*W*.82,floor)])
    # Subdivide the loft along its length for smooth fenders and arch cuts.
    dense=[]
    for j,(a,b) in enumerate(zip(rings,rings[1:])):
        for i in range(5):
            t=i/5
            prev=rings[max(0,j-1)];nxt=rings[min(len(rings)-1,j+2)]
            ring=[tuple(p[k]*(1-t)+q[k]*t if k==0 else catmull(prev[v][k],p[k],q[k],nxt[v][k],t)
                for k in range(3)) for v,(p,q) in enumerate(zip(a,b))]
            dense.append(round_ring(ring))
    dense.append(round_ring(rings[-1])); n=len(dense[0])
    verts=[p for r in dense for p in r]
    # Cross-section runs clockwise in Y/Z. Reversing the strip winding gives
    # outward normals. Otherwise Three.js culls the exterior, creating an
    # apparent transparent/hollow car despite fully opaque paint materials.
    faces=[(i*n+k,(i+1)*n+k,(i+1)*n+(k+1)%n,i*n+(k+1)%n)
      for i in range(len(dense)-1) for k in range(n)]
    faces.extend([tuple(range(n)),tuple((len(dense)-1)*n+k for k in range(n-1,-1,-1))])
    obj=mesh('coachwork',verts,faces,mats['paint'])
    for x in [-d['wheelbase']/2,d['wheelbase']/2]:
        for s in [-1,1]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=d['wheelRadius']+.032,
              depth=.64, location=(x,s*d['track']/2,d['wheelRadius']),rotation=(math.pi/2,0,0))
            cutter=bpy.context.object
            bpy.context.view_layer.objects.active=obj
            mod=obj.modifiers.new('Open wheel arch','BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cutter
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter,do_unlink=True)
    bpy.context.view_layer.objects.active=obj
    bevel=obj.modifiers.new('Coachwork edge radii','BEVEL'); bevel.width=.012; bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    # Planar UVs make the packed carbon pattern usable in glTF as well as Blender.
    uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            p=obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv=(p.x*5,p.y*5+p.z*3)
    return obj


def cabin(d,m,shell):
    L,W,H=d['length'], d['width']/2, d['height']
    # Rear glass base, rear roof, front roof, windshield base (longitudinal fractions).
    poses={'ferrari':(-.3009,-.15,-.02,.1597),'u9':(-.30,-.15,.075,.22),
      'jesko':(-.28,-.13,.065,.22),'chiron':(-.29,-.14,.065,.22),
      'porsche':(-.39,-.17,.045,.20),'aventador':(-.28,-.13,.04,.21),
      'amg':(-.38,-.25,-.095,.055)}
    rear,rb,rf,front=poses[d['style']]
    belt=.77 if d['style']!='aventador' else .70
    wid=W*.74
    if d["style"] == "ferrari":
        H -= .075
        wid = W * .79
    def arch(x,top,w):
        # Smooth the original landmarks, keeping the glazing against its rails.
        # At the lower windshield/rear window, fixed offsets inverted the
        # arch below the beltline. Scale the curvature with the local height.
        shoulder=belt+(top-belt)*.73
        crown=belt+(top-belt)*.94
        anchors=[(x*L,-w,belt),(x*L,-w*.97,shoulder),
          (x*L,-w*.70,crown),(x*L,0,top),(x*L,w*.70,crown),
          (x*L,w*.97,shoulder),(x*L,w,belt)]
        result=[]
        for j,(a,b) in enumerate(zip(anchors,anchors[1:])):
            prev=anchors[max(0,j-1)];nxt=anchors[min(len(anchors)-1,j+2)]
            for step in range(4):
                result.append(tuple(catmull(prev[k],a[k],b[k],nxt[k],step/4) for k in range(3)))
        return result+[anchors[-1]]
    rings=[arch(rear,belt+.035,wid*.94),arch(rb,H-(.038 if d['style']=='ferrari' else .018),wid),
      arch((rb+rf)/2,H,wid),arch(rf,H-(.045 if d['style']=='ferrari' else .025),wid*.96),arch(front,belt+.035,wid*.91)]
    if d['style']=='aventador':
        # Windshield only; the cockpit remains open.
        rings=rings[-2:]
    dense=[]
    for j,(a,b) in enumerate(zip(rings,rings[1:])):
        for step in range(6):
            t=step/6
            prev=rings[max(0,j-1)];nxt=rings[min(len(rings)-1,j+2)]
            dense.append([tuple(catmull(prev[v][k],p[k],q[k],nxt[v][k],t)
              for k in range(3)) for v,(p,q) in enumerate(zip(a,b))])
    dense.append(rings[-1]);n=len(dense[0])
    closed=d['style']!='aventador'
    mesh('glazing',[p for r in dense for p in r],
      [(j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i)
       for j in range(len(dense)-1) for i in range(n-1)
       if not (closed and 6<=j<18 and 4<=i<20)],m['glass'])
    if d['style']=='ferrari':
        for i in [4,20]:
            tube('Pillar and roof rail', [ring[i] for ring in dense], .016, m['paint'])
        for i in [0,n-1]:
            tube('Window sill', [ring[i] for ring in dense], .014, m['trim'])
    for side in ([] if d['style']=='ferrari' else [-1,1]):
        tube('A pillar',[(front*L,side*wid*.91,belt),(rf*L,side*wid*.93,H-.14),
          (rf*L,side*wid*.70,H-.035)],.022,m['paint'])
        if d['style']!='aventador':
            tube('Window frame',[(front*L,side*wid*.92,belt),
              (rf*L,side*wid*.97,H-.14),(rb*L,side*wid,H-.14),
              (rear*L,side*wid*.94,belt)],.018,m['paint'])
            tube('Window sill',[(rear*L,side*wid,belt),(front*L,side*wid*.92,belt)],.012,m['trim'])
    if d['style']!='aventador':
        # Reuse the glazing landmarks, remove glass under the opaque roof and
        # cover both shoulders. The previous narrow patch lay below the glass.
        roof=[[(x,y,z+.003) for x,y,z in ring[4:21]] for ring in dense[6:19]]
        nr=len(roof[0])
        mesh('roof',[p for r in roof for p in r],[(j*nr+i,j*nr+i+1,(j+1)*nr+i+1,(j+1)*nr+i) for j in range(len(roof)-1) for i in range(nr-1)],m['trim'] if d['style'] in ('u9','amg') else m['paint'])
    else:
        box('Open cockpit',(L*(-.065),0,.74),(L*.29,W*1.37,.025),m['trim'])
        for s in [-1,1]:
            box('Seat cushion',(-.30,s*.36,.77),(.4,.35,.12),m['leather'],.05)
            back=box('Seat back',(-.58,s*.36,.9),(.12,.36,.38),m['leather'],.05)
            back.rotation_euler.y=-.15
        tube('Windshield upper rail',[(rf*L,-wid*.7,H-.045),(rf*L,0,H-.027),(rf*L,wid*.7,H-.045)],.027,m['paint'])
    if d['style']=='ferrari':
        x_positions=[rear*L+(front-rear)*L*i/20 for i in range(21)]
        ys=[j*.105 for j in range(-6,7)]
        lining=[on_coachwork(shell,x,y,.008) for x in x_positions for y in ys]
        n=len(ys)
        mesh('Dark cabin deck',lining,[(i*n+j,(i+1)*n+j,(i+1)*n+j+1,i*n+j+1)
             for i in range(len(x_positions)-1) for j in range(n-1)],m['leather'])
        box('Dashboard',(front*L-.25,0,.82),(.32,1.20,.09),m['trim'],.04)
        for side in [-1,1]:
            seat=box('Seat back',(-.56,side*.34,.93),(.16,.34,.28),m['leather'],.06)
            seat.rotation_euler.y=-.15
    # Door seams, handles, mirror stems and mirror housings.
    for s in [-1,1]:
        y=s*(W*.965)
        seam=[(front*L,y,.73),(.10*L,y,.36),(-.20*L,y,.27),(-.24*L,y,.72)]
        if d['style']=='ferrari':
            seam=[(.13*L,y,.79),(.121*L,y,.60),(.09*L,y,.32),
                  (.068*L,y,.27),(-.14*L,y,.26),(-.17*L,y,.30),
                  (-.19*L,y,.43),(-.195*L,y,.68),(-.19*L,y,.80)]
        if d['style']=='ferrari':
            def side_point(x,z):
                hit,loc,normal,_=shell.ray_cast(Vector((x,2*s,z)),Vector((0,-s,0)))
                if not hit:
                    raise RuntimeError(f'No side surface at {x:.3f}, {z:.3f}')
                return tuple(loc+normal*.002)
            seam=[(x,y,min(z,.76)) for x,y,z in seam]
            fitted=[]
            for (x0,_,z0),(x1,_,z1) in zip(seam,seam[1:]):
                for i in range(8):
                    t=i/8
                    fitted.append(side_point(x0+(x1-x0)*t,z0+(z1-z0)*t))
            fitted.append(side_point(seam[-1][0],seam[-1][2]))
            seam=fitted
            hx,hy,hz=side_point(-.12*L,.72)
            handle=(hx,hy+s*.006,hz)
        else:
            handle=(-.12*L,y+s*.012,.72)
        tube('Door shut line',seam,.0038,m['trim'])
        box('Door handle',handle,(.12,.018,.025),m['accent'],.008)
        tube('Mirror stem',[(front*L-.06,s*wid,.79),(front*L-.02,s*(W+.025),.88)],.015,m['trim'])
        box('Mirror',(front*L-.04,s*(W+.07),.90),(.19,.15,.085),m['paint'],.034)


def wheels(d,m):
    for end,x in [('f',d['wheelbase']/2),('r',-d['wheelbase']/2)]:
        for side,s in [('r',1),('l',-1)]:
            pivot=bpy.data.objects.new('wheel_'+end+side,None)
            bpy.context.collection.objects.link(pivot)
            pivot.location=(x,s*d['track']/2,d['wheelRadius'])
            parts=[]
            R=d['wheelRadius']
            bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=12,
              major_radius=R-.065,minor_radius=.065,rotation=(math.pi/2,0,0))
            tire=bpy.context.object; tire.name='tire'; tire.scale.z=1.6
            tire.data.materials.append(m['rubber']); parts.append(tire)
            bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=R-.105,depth=.22,rotation=(math.pi/2,0,0))
            hub=bpy.context.object; hub.name='brake_disc'; hub.data.materials.append(m['disc']); parts.append(hub)
            for outside in [-1,1]:
                y=outside*.135
                for radius in [R-.080,R-.110]:
                    bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=6,
                      major_radius=radius,minor_radius=.009,location=(0,y,0),rotation=(math.pi/2,0,0))
                    rim=bpy.context.object; rim.name='rim_lip'; rim.data.materials.append(m['rim']);parts.append(rim)
                count=5 if d['style'] in ('ferrari','jesko','aventador') else 10
                for i in range(count):
                    for twin in ([-.045,.045] if count==5 and d['style']!='jesko' else [0]):
                        a=i*math.tau/count+twin
                        spoke=box('Spoke',(.13*math.sin(a),y,.13*math.cos(a)),(.025,.025,.24),m['rim'],.005)
                        spoke.rotation_euler.y=a;parts.append(spoke)
                bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.044,location=(0,y,0))
                center=bpy.context.object;center.name='wheel_lock';center.data.materials.append(m['accent']);parts.append(center)
            for p in parts: p.parent=pivot
            for o in parts:
                for poly in o.data.polygons: poly.use_smooth=True
            # Calipers do not spin with the wheels.
            box('Brake caliper',(x+.15,s*(d['track']/2+.10),R+.06),(.07,.05,.20),m['accent'])


def details(d,m,shell):
    L,W,S=d['length']/2,d['width']/2,d['style']
    # Front and rear carbon undertrays stay inside body width.
    box('Front splitter',(L-.15,0,.155),(.30,W*1.86,.035),m['trim'])
    box('Rear diffuser',(-L+.15,0,.16),(.30,W*1.7,.07),m['trim'])
    for s in [-1,1]:
        box('Side skirt',(0,s*W*.94,.19),(d['wheelbase']-.65,.10,.06),m['trim'])
    if S=='ferrari':
        for side in [-1,1]:
            intake=[(L+.012,side*.57,.24),(L+.012,side*.70,.28),
                    (L+.012,side*.65,.37),(L+.012,side*.58,.34)]
            front_recess('Outer bumper intake',intake,shell,m['trim'])
        grille=[(L+.005,-.57,.44),(L+.005,-.40,.48),(L+.005,.40,.48),(L+.005,.57,.44),(L+.005,.51,.31),(L+.005,.37,.27),(L+.005,-.37,.27),(L+.005,-.51,.31)]
        front_recess('Ferrari grille',grille,shell,m['trim']);tube('Grille surround',grille,.012,m['chrome'],True)
        for z in [.32,.37,.42]: tube('Grille slat',[(L+.015,-.49,z),(L+.015,.49,z)],.005,m['trim'])
        for s in [-1,1]:
            outline=[(L-.17,s*.59),(L-.31,s*.71),(L-.77,s*.81),
                     (L-.78,s*.71),(L-.37,s*.59)]
            fitted_lamp(shell,'Fender-mounted headlamp',outline,m['trim'])
            # A slim rising LED strip and a projector inside the lamp lens.
            line=[on_coachwork(shell,L-.29-i*.018,s*(.68+i*.004),.017) for i in range(26)]
            tube('headlight',line,.008,m['headlight'])
            cx,cy=L-.33,s*.64
            projector=[on_coachwork(shell,cx+.046*math.cos(a),cy+.038*math.sin(a),.016)
                       for a in [i*math.tau/32 for i in range(32)]]
            tube('Projector bezel',projector,.005,m['chrome'],True)
            fitted_lamp(shell,'Projector lens',[(cx+.025,cy-.02),(cx+.025,cy+.02),
                (cx-.025,cy+.02),(cx-.025,cy-.02)],m['headlight'])
            ellipse('taillight',(-L+.015,s*.55,.58),.09,.09,m['taillight'])
            for yy in [.57,.75]: ellipse('Exhaust',(-L-.006,s*yy,.27),.065,.055,m['chrome'])
    elif S=='chiron':
        # Horseshoe grille and four modules on each side.
        pts=[(L+.01,.27*math.cos(a),.39+.29*math.sin(a)) for a in [i*math.pi/24 for i in range(25)]]
        pts.extend([(L+.01,-.23,.21),(L+.01,.23,.21)])
        front_recess('Horseshoe grille',pts,shell,m['trim']); tube('Horseshoe surround',pts,.018,m['accent'],True)
        for s in [-1,1]:
            box('Lamp black surround',(L-.08,s*.67,.60),(.10,.55,.10),m['trim'])
            for i in range(4):
                yy=s*(.46+i*.12)
                tube('headlight',[(L-.018,yy-.037,.57),(L-.018,yy+.037,.57),(L-.018,yy+.037,.64),(L-.018,yy-.037,.64)],.009,m['headlight'],True)
            # Side C line curves around the door opening and the rear intake.
            points=[(.45,s*(W*.975),.75),(.05,s*W,.92),(-.50,s*W,1.08),(-.99,s*W,.93),(-1.22,s*W,.66),(-1.1,s*W,.31),(-.6,s*W,.25),(.35,s*W,.28)]
            tube('Copper C signature',points,.018,m['accent'])
            panel('Rear side intake',[(-.85,s*(W+.003),.38),(-1.1,s*(W+.003),.82),(-.75,s*(W+.003),.89),(-.5,s*(W+.003),.50)],m['trim'])
        tube('taillight',[(-L-.005,-W*.8,.68),(-L-.005,W*.8,.68)],.017,m['taillight'])
    elif S=='porsche':
        for s in [-1,1]:
            # Oval lamps lean back with the front fenders rather than sitting on the bumper.
            c=(L-.42,s*.70,.76)
            points=[(c[0]+.19*math.cos(a),c[1]+.14*math.sin(a),c[2]-.085*math.cos(a)) for a in [i*math.tau/48 for i in range(48)]]
            panel('Oval lamp lens',points,m['trim']);tube('headlight',points,.012,m['headlight'],True)
            for xx,yy in [(-.06,-.05),(-.06,.05),(.06,-.05),(.06,.05)]:
                box('Four point LED',(c[0]+xx,c[1]+yy,c[2]+.006-xx*.44),(.035,.033,.014),m['headlight'],.005)
            front_recess('Front side intake',[(L+.01,s*.67-.175,.245),(L+.01,s*.67+.175,.245),(L+.01,s*.67+.175,.455),(L+.01,s*.67-.175,.455)],shell,m['trim'])
            panel('Turbo side intake',[(-.72,s*W,.46),(-.89,s*W,.77),(-.65,s*W,.83),(-.51,s*W,.67)],m['trim'])
        front_recess('Central cooling',[(L+.01,-.38,.26),(L+.01,.38,.26),(L+.01,.38,.42),(L+.01,-.38,.42)],shell,m['trim'])
        tube('taillight',[(-L+.02,-W*.83,.70),(-L+.02,W*.83,.70)],.016,m['taillight'])
        box('Rear lip spoiler',(-L+.30,0,.88),(.20,W*1.4,.04),m['paint'])
    elif S=='amg':
        front_recess('Panamericana grille',[(L+.008,-.73,.62),(L+.008,.73,.62),(L+.008,.67,.24),(L+.008,-.67,.24)],shell,m['trim'])
        for i in range(-6,7): tube('Vertical grille slat',[(L+.022,i*.105,.27),(L+.022,i*.105,.60)],.009,m['chrome'])
        ellipse('Grille emblem frame',(L+.035,0,.44),.12,.12,m['chrome'])
        for s in [-1,1]:
            panel('AMG lamp',[(L-.08,s*.56,.63),(L-.45,s*.88,.74),(L-.48,s*.57,.73)],m['trim'])
            tube('headlight',[(L-.10,s*.54,.65),(L-.35,s*.81,.74),(L-.43,s*.62,.76)],.014,m['headlight'])
            box('Hood extraction vent',(.95,s*.45,.77),(.60,.28,.018),m['trim'])
            box('Safety beacon',(-.55,s*.36,1.24),(.27,.08,.045),m['amber'])
            box('Front fender louvre',(1.20,s*.85,.80),(.36,.12,.028),m['trim'])
            tube('taillight',[(-L+.01,s*.3,.68),(-L+.01,s*.79,.68)],.025,m['taillight'])
        # Readable safety-car text; livery is intentionally a first-pass simplification.
        text=bpy.data.curves.new('Safety Car label','FONT');text.body='SAFETY CAR';text.align_x='CENTER';text.size=.19;text.extrude=.0003
        ob=bpy.data.objects.new('Safety Car label',text);bpy.context.collection.objects.link(ob)
        ob.location=(.65,0,.79);ob.rotation_euler.z=math.pi/2;ob.data.materials.append(m['white'])
    else:
        for s in [-1,1]:
            if S=='aventador':
                pts=[(L-.22,s*.50,.49),(L-.69,s*.85,.64),(L-.65,s*.54,.62)]
                panel('Angular headlamp',pts,m['trim'])
                tube('headlight',[(L-.25,s*.54,.52),(L-.52,s*.64,.60),(L-.60,s*.79,.655)],.012,m['headlight'])
                tube('Y lamp branch',[(L-.52,s*.64,.60),(L-.60,s*.59,.63)],.012,m['headlight'])
            elif S=='u9':
                tube('headlight',[(L-.11,s*.50,.52),(L-.45,s*.80,.68),(L-.72,s*.83,.76)],.015,m['headlight'])
                tube('U9 lower light signature',[(L-.13,s*.50,.51),(L-.04,s*.63,.29),(L-.19,s*.82,.25)],.014,m['headlight'])
            else:
                pts=[(L-.18,s*.43,.43),(L-.56,s*.86,.66),(L-.80,s*.77,.71)]
                panel('Jesko lamp housing',pts,m['trim']);tube('headlight',pts[:2]+[pts[2]],.012,m['headlight'])
            panel('Side intake',[(-.35,s*(W*.96),.29),(-.75,s*(W*1.003),.77),(-1.14,s*(W*1.003),.80),(-1.05,s*(W*.97),.32)],m['trim'])
            front_recess('Lower front intake',[(L+.01,s*.18,.22),(L+.01,s*.78,.24),(L+.01,s*.75,.40),(L+.01,s*.27,.38)],shell,m['trim'])
            tube('taillight',[(-L+.01,s*.32,.69),(-L+.01,s*.78,.69)],.020,m['taillight'])
            if S=='jesko':
                tube('Golden front lip',[(L-.1,s*.16,.17),(L-.02,s*.55,.18),(L-.24,s*.87,.19)],.012,m['accent'])
    if d['wing']:
        z=d['height']-.12 if S=='jesko' else .99
        for s in [-1,1]:
            box('Wing upright',(-L+.35,s*.48,(z+.70)/2),(.075,.04,z-.70),m['trim'])
            box('Wing endplate',(-L+.32,s*W*.91,z+.035),(.40,.025,.15),m['accent'] if S=='jesko' else m['trim'])
        box('Rear wing',(-L+.32,0,z),(.35,W*1.83,.04),m['trim'])
    for s in [-1,1]:
        for i in range(4):
            box('Diffuser fin',(-L+.16,s*(.22+i*.15),.18),(.32,.018,.14),m['trim'],.004)


def build(d):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats={
      'paint':material('paint',color(d['paint']),.45,.22),
      'accent':material('accent',color(d['accent']),.6,.27),
      'trim':material('carbon_trim',(.009,.012,.016),.25,.35),
      'glass':material('glass',(.012,.024,.032),.35,.13),
      'rubber':material('rubber',(.008,.009,.011),0,.85),
      'rim':material('rim',(.07,.08,.095) if d['style']!='ferrari' else (.55,.57,.6),.8,.25),
      'disc':material('disc',(.15,.16,.17),.8,.5),
      'chrome':material('chrome',(.65,.68,.72),.9,.18),
      'headlight':material('headlight',(.7,.88,1),.1,.18,3),
      'taillight':material('taillight',(.8,.006,.008),.2,.2,2),
      'amber':material('amber',(1,.42,.005),.1,.2,3),
      'white':material('white',(.9,.9,.9),0,.4),
      'leather':material('leather',(.035,.025,.02),0,.65)
    }
    if d['style']=='jesko':
        size=128
        image=bpy.data.images.new('Packed carbon weave',width=size,height=size)
        pixels=[]
        for y in range(size):
            for x in range(size):
                v=.025 if ((x//8)+(y//8))%2 else .06
                v*=.8+.2*math.sin((x+y)*math.pi/8)**2
                pixels.extend([v,v,v*1.04,1])
        image.pixels=pixels;image.pack()
        n=mats['paint'].node_tree.nodes.new('ShaderNodeTexImage');n.image=image
        mats['paint'].node_tree.links.new(n.outputs['Color'],mats['paint'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    if d['style']=='ferrari':
        paint=mats['paint'].node_tree.nodes.get('Principled BSDF')
        paint.inputs['Base Color'].default_value=(.46,.005,.012,1)
        paint.inputs['Metallic'].default_value=0
        paint.inputs['Specular IOR Level'].default_value=.17
        paint.inputs['Roughness'].default_value=.44
        paint.inputs['Coat Weight'].default_value=.10
        paint.inputs['Coat Roughness'].default_value=.42
        glass=mats['glass'].node_tree.nodes.get('Principled BSDF')
        glass.inputs['Base Color'].default_value=(.75,.81,.85,1)
        glass.inputs['Metallic'].default_value=0
        glass.inputs['Alpha'].default_value=.07
        glass.inputs['Specular IOR Level'].default_value=.05
    shell=body(d,mats);cabin(d,mats,shell);wheels(d,mats);details(d,mats,shell)
    for obj in list(bpy.context.scene.objects):
        if obj.type in ('CURVE','FONT'):
            bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
            bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
        if obj.type=='MESH':
            mod=obj.modifiers.new('Export triangles','TRIANGULATE')
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.modifier_apply(modifier=mod.name)
    # Batch draw calls by material, independently for each wheel pivot.
    # Wheel nodes survive for steering, suspension and spin in Three.js.
    buckets={}
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH':
            key=(obj.parent.name if obj.parent else None,obj.data.materials[0].name)
            buckets.setdefault(key,[]).append(obj)
    for (parent,mat),objects in buckets.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        bpy.context.object.name=(parent or 'body')+'_'+mat
    bpy.context.scene['vehicleId']=d['id']
    bpy.context.scene['status']='PROTOTYPE_REVIEW_REQUIRED'
    bpy.context.scene['visualFidelityApproved']=False
    folder=ROOT/'public/models/selected';folder.mkdir(parents=True,exist_ok=True)
    # Editable source files stay next to the generator rather than in the web bundle.
    source=ROOT/'tools/blender/selected-sources';source.mkdir(exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(source/(d['id']+'.blend')),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(folder/(d['id']+'.glb')),export_format='GLB',export_extras=True,export_animations=False)
    print('BUILT',d['id'],flush=True)


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    p=argparse.ArgumentParser();p.add_argument('--only');opts=p.parse_args(args)
    for design in DESIGNS:
        if not opts.only or opts.only==design['id']:build(design)
