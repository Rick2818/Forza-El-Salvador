"""Monzón realistic broadleaf forest, three explicit Blender passes.

Usage:
  blender -b -t 2 --python tools/blender/build_monzon_three_pass.py
Outputs:
  public/scenery/monzon-tree-v1.glb, monzon-tree-v2.glb
  review/monzon-blender/pass-{1,2,3}-v{1,2}.blend
Compatible with Blender 3.6+ / 4.x. All textures are locally authored.
"""
from pathlib import Path
import bpy
import math
import random
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[2]
OUT = PROJECT / "public" / "scenery"
REVIEW = PROJECT / "review" / "monzon-blender"
OUT.mkdir(parents=True, exist_ok=True)
REVIEW.mkdir(parents=True, exist_ok=True)

def material(name, image, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.85 if alpha else 0.94
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], principled.inputs["Base Color"])
    if alpha:
        mat.node_tree.links.new(tex.outputs["Alpha"], principled.inputs["Alpha"])
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = 'DITHERED'
        if hasattr(mat, "blend_method"):
            try:
                mat.blend_method = 'CLIP'
            except (AttributeError, TypeError):
                pass
        mat.use_backface_culling = False
    return mat

def make_texture(name, kind, seed):
    path = REVIEW / (name + ".png")
    image = bpy.data.images.new(name, width=128, height=128, alpha=True)
    rng = random.Random(seed)
    pix = []
    for y in range(128):
        v = (y + .5) / 128 * 2 - 1
        for x in range(128):
            u = (x + .5) / 128 * 2 - 1
            noise = rng.uniform(-.085, .085)
            if kind == "leaf":
                # Pointed asymmetrical leaf with midrib and ragged margin.
                width = max(0., 1. - abs(v) ** 1.65)
                alpha = 1. if abs(u + v * .11) < width * .68 + noise * .12 else 0.
                vein = math.exp(-abs(u + v * .11) * 13)
                green = max(.05, min(1., .36 + .13 * v + noise + vein * .16))
                pix.extend((.12 + green * .22, .22 + green * .68, .055 + green * .11, alpha))
            else:
                grain = math.sin(u * 48 + math.sin(v * 19) * 2.) * .10
                furrow = max(0., math.sin(u * 53 + v * 5)) ** 9 * .22
                tone = max(.1, min(.7, .38 + noise + grain - furrow))
                pix.extend((tone * .72, tone * .60, tone * .43, 1.))
    image.pixels.foreach_set(pix)
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image

def create_mesh(name, vertices, faces, uvs):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_i in polygon.loop_indices:
            vertex_idx = mesh.loops[loop_i].vertex_index
            uv_layer.data[loop_i].uv = uvs[vertex_idx]
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    return ob

class Model:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.bark_v, self.bark_f, self.bark_uv = [], [], []
        self.leaf_v, self.leaf_f, self.leaf_uv = [], [], []
        self.tips = []

    def tube(self, begin, end, r0, r1, segments=6):
        begin, end = Vector(begin), Vector(end)
        axis = (end - begin).normalized()
        ref = Vector((0, 1, 0)) if abs(axis.y) < .86 else Vector((1, 0, 0))
        u = axis.cross(ref).normalized()
        v = axis.cross(u).normalized()
        start = len(self.bark_v)
        for level, (center, rad) in enumerate(((begin, r0), (end, r1))):
            for j in range(segments):
                a = 2 * math.pi * j / segments
                q = center + rad * (u * math.cos(a) + v * math.sin(a))
                self.bark_v.append(tuple(q))
                self.bark_uv.append((j / segments, level))
        for j in range(segments):
            k = (j + 1) % segments
            self.bark_f.append((start + j, start + k, start + segments + k, start + segments + j))

    def branch(self, start, end, r0, r1, n=3):
        start, end = Vector(start), Vector(end)
        prev = start
        for k in range(1, n + 1):
            t = k / n
            p = start.lerp(end, t)
            p.x += .09 * math.sin(t * math.pi * 1.7)
            p.y += .06 * math.cos(t * math.pi)
            self.tube(prev, p, r0 * (1-t) + r1*t + .001,
                      r0*(1-t-.001) + r1*(t+.001), 6)
            prev = p

    def pass1_skeleton(self):
        lean = Vector((self.rng.uniform(-.4, .4), self.rng.uniform(-.3,.3), 0))
        for i in range(8):
            a, b = 8.4 * i / 8, 8.4 * (i + 1) / 8
            p = Vector((lean.x * (a / 9)**2, lean.y * (a/9)**2, a))
            q = Vector((lean.x * (b / 9)**2, lean.y * (b/9)**2, b))
            self.tube(p,q,.51*(1-i/11),.51*(1-(i+1)/11),8)
        for j in range(7):
            angle = j * (2 * math.pi / 7) + self.rng.uniform(-.30,.30)
            z0 = 3.4 + j * .48 + self.rng.uniform(-.15,.15)
            start = Vector((lean.x*.25,lean.y*.25,z0))
            reach = self.rng.uniform(2.5,4.5)
            tip = Vector((math.cos(angle)*reach, math.sin(angle)*reach,
                          self.rng.uniform(7.5,10.8)))
            self.branch(start, tip, .16, .025, 4)
            self.tips.append(tip)
            for k in range(3):
                begin = start.lerp(tip, self.rng.uniform(.45,.8))
                theta = angle + self.rng.uniform(-.88,.88)
                sub = begin + Vector((math.cos(theta)*self.rng.uniform(1.,1.7),
                                      math.sin(theta)*self.rng.uniform(1.,1.7),
                                      self.rng.uniform(.6,1.5)))
                self.branch(begin, sub, .06, .008, 2)
                self.tips.append(sub)

    def add_leaf(self, center, size, yaw, pitch):
        center = Vector(center)
        right = Vector((math.cos(yaw), math.sin(yaw), 0)) * size
        up = Vector((-math.sin(yaw)*math.sin(pitch),
                     math.cos(yaw)*math.sin(pitch), math.cos(pitch))) * (size * 1.45)
        start = len(self.leaf_v)
        for corner in (center-right-up,center+right-up,center+right+up,center-right+up):
            self.leaf_v.append(tuple(corner))
        self.leaf_f.append((start,start+1,start+2,start+3))
        self.leaf_uv.extend(((0,0),(1,0),(1,1),(0,1)))

    def pass2_canopy(self):
        for tip in self.tips:
            for j in range(9):
                p = tip + Vector((self.rng.uniform(-1.3,1.3),
                                   self.rng.uniform(-1.3,1.3),
                                   self.rng.uniform(-.9,.9)))
                self.add_leaf(p,self.rng.uniform(.32,.63),
                              self.rng.uniform(0,math.tau),self.rng.uniform(-.9,.9))
        for j in range(70):
            a, elevation = self.rng.uniform(0,math.tau), self.rng.uniform(-.75,.75)
            r = self.rng.uniform(1.4,4.2)
            p = (r*math.cos(a),r*math.sin(a),7.8 + elevation*3.0)
            self.add_leaf(p,self.rng.uniform(.35,.61),a,self.rng.uniform(-1,1))

    def pass3_silhouette(self):
        # Fine outer leaf clusters break up the remaining polygonal outline.
        for j in range(65):
            a = self.rng.uniform(0,math.tau)
            radius = self.rng.uniform(3.1,4.7)
            p = (radius*math.cos(a), radius*math.sin(a),self.rng.uniform(6.1,10.9))
            self.add_leaf(p,self.rng.uniform(.27,.5),a,self.rng.uniform(-.8,.8))


def export_variant(variant):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    model = Model(28182026 + variant * 101)
    model.pass1_skeleton()
    bark = create_mesh("bark",model.bark_v,model.bark_f,model.bark_uv)
    bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW / f"pass-1-v{variant}.blend"))
    model.pass2_canopy()
    leaf = create_mesh("leaves",model.leaf_v,model.leaf_f,model.leaf_uv)
    bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW / f"pass-2-v{variant}.blend"))
    model.pass3_silhouette()
    bpy.data.objects.remove(leaf, do_unlink=True)
    leaf = create_mesh("leaves",model.leaf_v,model.leaf_f,model.leaf_uv)
    bark.data.materials.append(material("bark_PBR", make_texture(f"bark-v{variant}","bark",variant)))
    leaf.data.materials.append(material("leaves_PBR", make_texture(f"foliage-v{variant}","leaf",variant),True))
    bpy.ops.object.select_all(action='DESELECT')
    bark.select_set(True)
    leaf.select_set(True)
    bpy.context.view_layer.objects.active = bark
    bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW / f"pass-3-v{variant}.blend"))
    outfile = OUT / f"monzon-tree-v{variant}.glb"
    bpy.ops.export_scene.gltf(filepath=str(outfile),export_format='GLB',
                              use_selection=True, export_apply=True,
                              export_materials='EXPORT', export_texcoords=True)
    print(f"THREE_PASSES_COMPLETE: variant={variant} output={outfile} bytes={outfile.stat().st_size}")
    if outfile.stat().st_size < 10000:
        raise RuntimeError(f"Export too small: {outfile}")

for variant in (1,2):
    export_variant(variant)
print("THREE_PASSES_COMPLETE: 2 variants, 6 Blender saved checkpoints")
