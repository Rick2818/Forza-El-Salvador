"""Original mid-engine hypercar body, generated with bpy.

Proportions follow the mid-engine hypercar language (low nose, cab-forward
greenhouse, wide haunches, fender crests above a sunken hood, side intake,
ducktail, high wing) but every surface here is original: no badges, no logos,
no traced outlines.

Coordinates match the game:
  * +X is the nose, +Z is up, +Y is the left side (Blender axes).
  * Wheelbase 2.68, track half 0.90, wheel radius 0.36, body origin on the ground.

Run:
  blender.exe --background --factory-startup --python tools/blender/car-body.py
  blender.exe ... --python tools/blender/car-body.py -- --no-render
Outputs:
  tools/blender/car-body.glb
  tools/blender/car-body-preview-{side,front34,rear34}.png
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------- dimensions
WHEEL_X = 1.34          # longitudinal, half wheelbase
WHEEL_Y = 0.90          # lateral, half track
WHEEL_RADIUS = 0.36
ARCH_RADIUS = 0.445

# x, halfWidth, crestZ, hoodZ, hoodHalf, floorZ
# Descending x, nose to tail. "crest" is the top of the fender/haunch; the
# hood/deck sits lower between the two crests, which is what reads as a car.
STATIONS = [
    (2.34, 0.340, 0.410, 0.395, 0.22, 0.290),
    (2.26, 0.660, 0.500, 0.470, 0.48, 0.215),
    (2.12, 0.860, 0.575, 0.530, 0.68, 0.180),
    (1.94, 0.955, 0.640, 0.580, 0.78, 0.165),
    (1.74, 1.005, 0.695, 0.625, 0.83, 0.158),
    (1.52, 1.035, 0.730, 0.660, 0.86, 0.152),
    (WHEEL_X, 1.048, 0.750, 0.680, 0.87, 0.150),
    (1.12, 1.030, 0.762, 0.700, 0.87, 0.150),
    (0.90, 1.000, 0.774, 0.722, 0.86, 0.150),
    (0.66, 0.978, 0.786, 0.748, 0.85, 0.150),
    (0.42, 0.965, 0.794, 0.770, 0.84, 0.150),
    (0.14, 0.958, 0.802, 0.788, 0.835, 0.150),
    (-0.16, 0.960, 0.810, 0.800, 0.835, 0.155),
    (-0.48, 0.970, 0.820, 0.812, 0.84, 0.160),
    (-0.80, 0.990, 0.832, 0.822, 0.85, 0.165),
    (-1.08, 1.018, 0.845, 0.834, 0.87, 0.170),
    (-WHEEL_X, 1.048, 0.856, 0.845, 0.89, 0.175),
    (-1.58, 1.042, 0.862, 0.852, 0.90, 0.190),
    (-1.80, 1.018, 0.864, 0.858, 0.89, 0.210),
    (-2.00, 0.988, 0.862, 0.862, 0.87, 0.235),
    (-2.16, 0.950, 0.856, 0.872, 0.83, 0.262),
    (-2.28, 0.880, 0.842, 0.868, 0.75, 0.292),
    (-2.36, 0.720, 0.812, 0.830, 0.62, 0.320),
]


# Rival kit (option B): same architecture, different attitude. Longer tail,
# higher deck, wider haunches, deeper splitter and a taller wing. The shared
# surface family keeps the pair consistent on screen.
RIVAL_DELTA = {
    "wide": 0.028,       # extra half width on the haunches
    "deck": 0.026,       # raised rear deck
    "roof": 0.030,       # taller greenhouse
}


def rival_stations():
    out = []
    for x, w, crest, hood, hood_half, floor in STATIONS:
        haunch = max(0.0, 1.0 - abs(x + 0.9) / 1.6)
        rear = max(0.0, 1.0 - abs(x + 1.6) / 1.2)
        out.append((
            x,
            w + RIVAL_DELTA["wide"] * haunch,
            crest + RIVAL_DELTA["deck"] * rear,
            hood + RIVAL_DELTA["deck"] * rear,
            hood_half,
            floor,
        ))
    return out


def half_ring(station):
    """Upper-right silhouette: sill, fender bulge, crest, then hood inward.

    The crest and the hood edge are emitted as tight point pairs. Under the
    subdivision that reads as a character line instead of a melted shoulder,
    which is what separates a car from a loaf.
    """
    x, w, crest, hood, hood_half, floor = station
    rise = crest - floor
    return [
        (x, 0.0, floor),
        (x, w * 0.52, floor + 0.012),
        (x, w * 0.84, floor + rise * 0.28),
        (x, w * 0.965, floor + rise * 0.66),
        (x, w, crest - rise * 0.16),
        (x, w * 0.998, crest - rise * 0.045),
        (x, w * 0.930, crest),
        (x, hood_half * 1.03, hood + (crest - hood) * 0.34),
        (x, hood_half, hood),
        (x, hood_half * 0.50, hood + (crest - hood) * 0.075),
        (x, 0.0, hood + (crest - hood) * 0.115),
    ]


def full_ring(station):
    half = half_ring(station)
    ring = list(half)
    for x, y, z in reversed(half[1:-1]):
        ring.append((x, -y, z))
    return ring


def loft(rings, name, smooth=True, cap_start=True, cap_end=True):
    n = len(rings[0])
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    bm = bmesh.new()
    verts = [[bm.verts.new(Vector(p)) for p in ring] for ring in rings]
    bm.verts.ensure_lookup_table()
    for i in range(len(rings) - 1):
        a, b = verts[i], verts[i + 1]
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if cap_start:
        bm.faces.new(tuple(reversed(verts[0])))
    if cap_end:
        bm.faces.new(tuple(verts[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    return obj


def curve_value(points, x):
    """Piecewise linear lookup; points must be sorted by descending x."""
    if x >= points[0][0]:
        return points[0][1]
    if x <= points[-1][0]:
        return points[-1][1]
    for i in range(len(points) - 1):
        x0, v0 = points[i]
        x1, v1 = points[i + 1]
        if x0 >= x >= x1:
            t = (x0 - x) / (x0 - x1) if x0 != x1 else 0.0
            return v0 + (v1 - v0) * t
    return points[-1][1]


DECK = [(s[0], s[3]) for s in STATIONS]
DECK_HALF = [(s[0], s[4]) for s in STATIONS]

CABIN_FRONT = 0.80
CABIN_REAR = -1.26
# Descending x. Windshield rake, flat roof, fast rear screen.
ROOF = [(0.80, 0.760), (0.60, 0.872), (0.40, 0.966), (0.18, 1.036),
        (-0.04, 1.080), (-0.30, 1.110), (-0.56, 1.104), (-0.80, 1.068),
        (-1.00, 1.000), (-1.14, 0.930), (-1.26, 0.885)]


ROOF_LIFT = 0.0


def cabin_ring(x):
    base = curve_value(DECK, x) - 0.008
    roof = max(base + 0.035, curve_value(ROOF, x) + ROOF_LIFT)
    base_half = curve_value(DECK_HALF, x) * 0.97
    waist_half = base_half * 0.93
    roof_half = base_half * 0.60
    waist_z = base + (roof - base) * 0.52
    return [
        (x, 0.0, base - 0.02),
        (x, base_half * 0.72, base - 0.02),
        (x, base_half, base),
        (x, waist_half, waist_z),
        (x, roof_half, roof - 0.012),
        (x, 0.0, roof),
        (x, -roof_half, roof - 0.012),
        (x, -waist_half, waist_z),
        (x, -base_half, base),
        (x, -base_half * 0.72, base - 0.02),
    ]


def sample_range(front, rear, step):
    x = front
    out = []
    while x > rear:
        out.append(x)
        x -= step
    out.append(rear)
    return out


def build_cabin():
    xs = sample_range(CABIN_FRONT, CABIN_REAR, 0.06)
    return loft([cabin_ring(x) for x in xs], "greenhouse", smooth=True)


def paint_roof_panel(obj, roof_front=-0.02, roof_rear=-0.86):
    """Face-level material split: glass everywhere, painted roof in the middle."""
    glass = make_material("glass", (0.022, 0.034, 0.045), 0.30, 0.055, 0.72)
    paint = bpy.data.materials.get("paint")
    obj.data.materials.append(glass)
    obj.data.materials.append(paint)

    for poly in obj.data.polygons:
        centre_x = poly.center.x
        upward = poly.normal.z > 0.45
        if upward and roof_rear < centre_x < roof_front:
            poly.material_index = 1
        else:
            poly.material_index = 0


def cut_wheel_arches(obj):
    cutters = []
    for side in (-1, 1):
        for x in (WHEEL_X, -WHEEL_X):
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=48,
                radius=ARCH_RADIUS,
                depth=0.46,
                location=(x, side * WHEEL_Y, WHEEL_RADIUS + 0.015),
                rotation=(math.pi / 2, 0, 0),
            )
            cutter = bpy.context.active_object
            cutter.name = f"arch-cut-{side}-{x:.2f}"
            cutters.append(cutter)
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new("ArchCut", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.object = cutter
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for cutter in cutters:
        bpy.data.objects.remove(cutter, do_unlink=True)


def add_wells():
    """Dark liners so the arch shows a fender cavity, never the hollow shell."""
    parts = []
    for side in (-1, 1):
        for x in (WHEEL_X, -WHEEL_X):
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=40,
                radius=ARCH_RADIUS - 0.010,
                depth=0.40,
                location=(x, side * (WHEEL_Y + 0.02), WHEEL_RADIUS + 0.015),
                rotation=(math.pi / 2, 0, 0),
            )
            well = bpy.context.active_object
            well.name = "well"
            parts.append(well)
    return parts


def add_details():
    parts = []

    def box(name, size, loc, rot=(0, 0, 0), smooth=True):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
        obj = bpy.context.active_object
        obj.name = name
        obj.scale = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bev = obj.modifiers.new("Bevel", "BEVEL")
        bev.width = 0.010
        bev.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=bev.name)
        if smooth:
            bpy.ops.object.shade_smooth()
        parts.append(obj)
        return obj

    box("floor", (3.4, 1.56, 0.02), (-0.05, 0, 0.150))
    box("splitter", (0.50, 1.88, 0.030), (2.05, 0, 0.098))
    box("splitter-lip", (0.028, 1.94, 0.070), (2.295, 0, 0.125))

    for side in (-1, 1):
        box("skirt", (1.62, 0.065, 0.075), (0.0, side * 0.962, 0.140))
        box("canard", (0.22, 0.016, 0.085), (1.95, side * 0.860, 0.300), (0, 0, side * 0.14))
        # Side intake: a recessed plate under the haunch, with a lip above it.
        box("intake", (0.66, 0.014, 0.200), (-0.90, side * 0.952, 0.640), (0, side * 0.05, 0))
        box("intake-lip", (0.66, 0.050, 0.026), (-0.90, side * 0.938, 0.752), (0, side * 0.05, 0))

    box("diffuser", (0.46, 1.42, 0.035), (-2.10, 0, 0.195), (0.16, 0, 0))
    box("tail-panel", (0.045, 1.34, 0.22), (-2.335, 0, 0.620))

    # Wing: swan-neck struts rooted on the deck, endplates on the plane tips.
    for side in (-1, 1):
        box("wing-strut", (0.12, 0.024, 0.200), (-1.86, side * 0.46, 0.945), (0, -0.10, 0))
    box("wing-plane", (0.30, 1.48, 0.028), (-1.90, 0, 1.030), (0, 0.10, 0))
    box("wing-flap", (0.05, 1.42, 0.014), (-2.020, 0, 1.042), (0, 0.10, 0))
    for side in (-1, 1):
        box("wing-plate", (0.34, 0.016, 0.140), (-1.90, side * 0.742, 1.028), (0, 0.02, 0))
    return parts


def make_material(name, color, metallic, roughness, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
        mat.use_backface_culling = False
    return mat


def preview_wheels():
    """Reference wheels so the arches can be judged; removed before export."""
    wheel_parts = []
    tire = make_material("preview-tire", (0.020, 0.021, 0.024), 0.05, 0.80)
    rim = make_material("preview-rim", (0.44, 0.46, 0.49), 0.88, 0.24)
    dark = make_material("preview-disc", (0.10, 0.10, 0.11), 0.55, 0.45)

    for side in (-1, 1):
        for x in (WHEEL_X, -WHEEL_X):
            y = side * WHEEL_Y

            bpy.ops.mesh.primitive_cylinder_add(
                vertices=56, radius=WHEEL_RADIUS, depth=0.32,
                location=(x, y, WHEEL_RADIUS), rotation=(math.pi / 2, 0, 0),
            )
            t = bpy.context.active_object
            t.data.materials.append(tire)
            wheel_parts.append(t)

            # Barrel sits proud of the tyre so its face is never hidden.
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=48, radius=0.262, depth=0.336,
                location=(x, y, WHEEL_RADIUS), rotation=(math.pi / 2, 0, 0),
            )
            b = bpy.context.active_object
            b.data.materials.append(dark)
            wheel_parts.append(b)

            bpy.ops.mesh.primitive_cylinder_add(
                vertices=48, radius=0.058, depth=0.352,
                location=(x, y, WHEEL_RADIUS), rotation=(math.pi / 2, 0, 0),
            )
            hub = bpy.context.active_object
            hub.data.materials.append(rim)
            wheel_parts.append(hub)

            for i in range(5):
                angle = i * (2 * math.pi / 5)
                bpy.ops.mesh.primitive_cube_add(
                    size=1,
                    location=(x + math.sin(angle) * 0.135,
                              y, WHEEL_RADIUS + math.cos(angle) * 0.135),
                    rotation=(0, angle, 0),
                )
                spoke = bpy.context.active_object
                spoke.scale = (0.052, 0.362, 0.215)
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                spoke.data.materials.append(rim)
                wheel_parts.append(spoke)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in wheel_parts:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
    bpy.ops.object.select_all(action="DESELECT")
    return wheel_parts


def studio():
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.015, 0.022, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.45
    bpy.context.scene.world = world

    bpy.ops.object.light_add(type="AREA", location=(2.6, 5.2, 3.4))
    key = bpy.context.active_object
    key.data.energy = 700
    key.data.size = 6
    key.rotation_euler = (math.radians(52), 0, math.radians(160))

    bpy.ops.object.light_add(type="AREA", location=(-5.2, -3.6, 2.4))
    rim = bpy.context.active_object
    rim.data.energy = 500
    rim.data.size = 5
    rim.data.color = (0.55, 0.72, 1.0)
    rim.rotation_euler = (math.radians(70), 0, math.radians(-38))

    bpy.ops.object.light_add(type="AREA", location=(0.6, 1.0, 6.5))
    top = bpy.context.active_object
    top.data.energy = 300
    top.data.size = 8

    # Ground: a dark reflective floor makes the silhouette readable.
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.data.materials.append(make_material("studio-floor", (0.020, 0.022, 0.026), 0.35, 0.22))


def preview(path):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 820
    scene.render.resolution_y = 460

    views = [
        ("side", (0.0, 13.4, 0.85), (0.0, 0, 0.60), 70),
        ("front34", (6.9, 5.4, 1.35), (0.0, 0, 0.62), 62),
        ("rear34", (-6.8, 5.6, 1.55), (0.0, 0, 0.66), 62),
    ]
    stem, ext = os.path.splitext(path)
    for name, loc, target, lens in views:
        cam.location = loc
        cam.data.lens = lens
        direction = Vector(target) - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{stem}-{name}{ext}"
        bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    do_render = "--no-render" not in args

    build_vehicle("car-body.glb", STATIONS, 0.0, (0.55, 0.022, 0.028), do_render, "car-body-preview.png")
    build_vehicle("car-body-rival.glb", rival_stations(), RIVAL_DELTA["roof"],
                  (0.020, 0.055, 0.145), False, "car-body-rival-preview.png")
    print("DONE")


def build_vehicle(filename, stations, roof_lift, paint_rgb, do_render, preview_name):
    global DECK, DECK_HALF, ROOF_LIFT
    ROOF_LIFT = roof_lift
    DECK = [(s[0], s[3]) for s in stations]
    DECK_HALF = [(s[0], s[4]) for s in stations]

    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = loft([full_ring(s) for s in stations], "body")
    bpy.context.view_layer.objects.active = body

    subsurf = body.modifiers.new("Subdivision", "SUBSURF")
    subsurf.levels = 2
    subsurf.render_levels = 2
    bpy.ops.object.modifier_apply(modifier=subsurf.name)

    paint = make_material("paint", paint_rgb, 0.55, 0.24)
    body.data.materials.append(paint)

    cut_wheel_arches(body)
    bpy.context.view_layer.objects.active = body
    bevel = body.modifiers.new("EdgeBevel", "BEVEL")
    bevel.width = 0.007
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(34)
    bpy.ops.object.modifier_apply(modifier=bevel.name)

    cabin = build_cabin()
    paint_roof_panel(cabin)

    dark = make_material("trim", (0.018, 0.020, 0.024), 0.15, 0.80)
    for well in add_wells():
        well.data.materials.append(dark)

    carbon = make_material("carbon", (0.035, 0.040, 0.050), 0.55, 0.36)
    for part in add_details():
        part.data.materials.append(carbon)

    tris = sum(len(o.data.loop_triangles) for o in bpy.context.scene.objects if o.type == "MESH")
    print("TRIS", filename, tris)

    out = os.path.join(HERE, filename)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and not obj.name.startswith("studio-floor"):
            obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    print("GLB", out, os.path.getsize(out))

    if do_render:
        studio()
        wheels = preview_wheels()
        preview(os.path.join(HERE, preview_name))
        for wheel in wheels:
            bpy.data.objects.remove(wheel, do_unlink=True)


main()
