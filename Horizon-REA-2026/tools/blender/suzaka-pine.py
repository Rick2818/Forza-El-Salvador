"""Build runtime pine LODs from Poly Haven Pine Tree 01 (CC0).

Usage: blender -b --python tools/blender/suzaka-pine.py -- SOURCE OUTPUT
SOURCE contains wood.gltf, pine.bin, textures/, needles.png and clusters.json.
The original trunk/branches and measured needle distribution are retained.
No cone primitives are used. Work files and source downloads stay outside Git.
"""
import bpy, bmesh, sys, os, math, json, random, gzip
from mathutils import Vector, Quaternion

source, output = sys.argv[sys.argv.index('--')+1:]
os.makedirs(output, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(source, 'wood.gltf'))
wood = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# Separate material islands before simplifying the scanned branches.
for obj in wood:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.mesh.separate(type='MATERIAL')
wood = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in list(wood):
    name = obj.data.materials[0].name
    if 'dead_branches' in name:
        wood.remove(obj); bpy.data.objects.remove(obj, do_unlink=True); continue
    if name == 'pine_tree_01_bark':
        # Mature high crown; omit the low branch clutter below the living crown.
        bm=bmesh.new(); bm.from_mesh(obj.data)
        remove=[f for f in bm.faces if max(v.co.z for v in f.verts)<7.6]
        bmesh.ops.delete(bm,geom=remove,context='FACES'); bm.to_mesh(obj.data); bm.free()
for obj in wood:
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new('runtime branch budget', 'DECIMATE')
    modifier.ratio = .055
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.name = 'pine-wood-' + obj.data.materials[0].name
    # Retain bark photography but cap embedded texture size and strip unused maps.
    for mat in obj.data.materials:
        principled = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        principled.inputs['Roughness'].default_value = .94
        principled.inputs['Metallic'].default_value = 0
        for node in list(mat.node_tree.nodes):
            if node.type == 'TEX_IMAGE' and node.image:
                if 'diff' not in node.image.name:
                    mat.node_tree.nodes.remove(node)
                else:
                    node.image.scale(512, 512)
                    node.image.pack()

mat = bpy.data.materials.new('pine-needles'); mat.use_nodes = True
shader = mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .93
image = bpy.data.images.load(os.path.join(source, 'needles.png')); image.pack()
tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = image
mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
mat.node_tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
mat.surface_render_method = 'DITHERED'
mat.use_backface_culling = False
mat.alpha_threshold = .4
clusters = json.load(open(os.path.join(source, 'clusters.json')))

def foliage(points, name, scale):
    rng = random.Random(2818)
    vertices, faces, uvs = [], [], []
    for x, y, z in points:
        if y < 7.6: continue # mature, exposed lower trunk like Rick's reference
        center = Vector((x, -z, y)) # glTF Y up -> Blender Z up
        yaw = rng.uniform(0, math.tau)
        tilt = Quaternion(Vector((math.cos(yaw), math.sin(yaw), 0)), rng.uniform(.7, 1.85))
        width = scale * rng.uniform(.75, 1.1)
        height = width * 1.25
        for angle in [yaw, yaw + math.pi/3, yaw + math.pi*2/3]:
            right = Vector((math.cos(angle), math.sin(angle), 0)) * width/2
            up = Vector((0, 0, height/2))
            start = len(vertices)
            vertices.extend([center + tilt @ v for v in [-right-up, right-up, right+up, -right+up]])
            faces.append((start, start+1, start+2, start+3))
            uvs.extend([(0,0),(1,0),(1,1),(0,1)])
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    uv = mesh.uv_layers.new()
    for i, coord in enumerate(uvs): uv.data[i].uv = coord
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

near = foliage(clusters['near'], 'pine-needles-near', .95)
medium = foliage(clusters['medium'], 'pine-needles-medium', 1.5)
medium.hide_render = True; medium.hide_set(True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
scene.cycles.use_denoising = False
scene.render.resolution_x = 512; scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100; scene.render.film_transparent = True
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (.62,.72,.85,1)
bg.inputs['Strength'].default_value = .8
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast' if 'Medium High Contrast' in [] else 'None'
bpy.ops.object.light_add(type='SUN', location=(15,-20,30)); sun=bpy.context.object
sun.rotation_euler=(.5,-.5,-.5); sun.data.energy=3.0; sun.data.angle=.3
bpy.ops.object.light_add(type='AREA', location=(-10,-15,15)); fill=bpy.context.object
fill.data.energy=1800; fill.data.shape='DISK'; fill.data.size=15
fill.rotation_euler=(Vector((0,0,8))-fill.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(); camera=bpy.context.object; scene.camera=camera
camera.data.type='ORTHO'; camera.data.ortho_scale=17.6
for index in range(3):
    angle=index*math.pi/3
    camera.location=(math.sin(angle)*30,-math.cos(angle)*30,8)
    camera.rotation_euler=(Vector((0,0,8))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=os.path.join(output, f'pine-view-{index}.png')
    bpy.ops.render.render(write_still=True)

# Export only runtime meshes. The far atlas is assembled outside Blender.
for name, leaves in [('near',near),('medium',medium)]:
    if name == 'medium':
        for obj in wood:
            bpy.context.view_layer.objects.active=obj
            mod=obj.modifiers.new('distant branch budget','DECIMATE');mod.ratio=.22
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    near.hide_set(True); medium.hide_set(True)
    leaves.hide_set(False); leaves.select_set(True)
    for obj in wood: obj.select_set(True)
    path=os.path.join(output, f'pine-{name}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
        export_image_format='AUTO', export_animations=False, export_cameras=False,
        export_lights=False, export_extras=False, export_yup=True)
    with open(path,'rb') as f, gzip.open(path+'.gz','wb',compresslevel=9) as z:z.write(f.read())
    print('PINE_LOD',name,os.path.getsize(path+'.gz'),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(output,'suzaka-pine-source.blend'))
