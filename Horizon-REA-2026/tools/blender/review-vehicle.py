"""Capture six repeatable review views from a Blender-authored Horizon vehicle.

Run from the Horizon-REA-2026 directory (Blender 4.x):
  blender --background --factory-startup --python tools/blender/review-vehicle.py -- \
    --asset public/models/car-body.glb --out-dir review/california-t

This is a geometry review, NOT a 95/100 likeness certification.
The current GLB exports only a body shell; bounds must not be treated as
complete-vehicle dimensions, and wheels need separate verification.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def cli_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--spec", default=os.path.join(
        os.path.dirname(__file__), "..", "..", "docs", "vehicle-fidelity",
        "california-t-2015.json"))
    parser.add_argument("--full-vehicle", action="store_true",
                        help="Only use when all visible exterior parts, including wheels, are included")
    return parser.parse_args(argv)


def bounds(meshes):
    corners = [obj.matrix_world @ Vector(point)
               for obj in meshes for point in obj.bound_box]
    mins = [min(point[i] for point in corners) for i in range(3)]
    maxs = [max(point[i] for point in corners) for i in range(3)]
    return mins, maxs


def inspect(meshes, spec, full_vehicle):
    mins, maxs = bounds(meshes)
    dimensions = [round(maxs[i] - mins[i], 4) for i in range(3)]
    # In this repository, Blender's +X is forward, +Y is lateral, +Z is up.
    observed = dict(length=dimensions[0], width=dimensions[1], height=dimensions[2])
    expected = spec["officialDimensionsMeters"]
    differences = {key: round((observed[key] / expected[key] - 1) * 100, 2)
                   for key in ("length", "width", "height")}
    mat_names = sorted({mat.name for obj in meshes
                        for mat in obj.data.materials if mat is not None})
    triangles = sum(sum(max(0, len(poly.vertices) - 2)
                        for poly in obj.data.polygons) for obj in meshes)
    warnings = ["Visual resemblance cannot be determined from bounding boxes.",
                "Wheelbase cannot be derived without wheel-center landmarks."]
    if not full_vehicle:
        warnings.append("Shell-only assessment: overall dimension differences are informational, not pass/fail.")
    elif any(abs(d) > spec["tolerance"]["dimensionFraction"] * 100
             for d in differences.values()):
        warnings.append("Full-vehicle dimensions exceed the preliminary tolerance.")
    return {
        "assetType": "full-vehicle" if full_vehicle else "shell-only",
        "status": "REVIEW_REQUIRED",
        "observedBoundsMeters": observed,
        "referenceDimensionsMeters": expected,
        "differencesPercent": differences,
        "meshCount": len(meshes),
        "approximateTriangleCount": triangles,
        "materialNames": mat_names,
        "warnings": warnings,
        "visualFidelityScore": None,
        "approvedForProduction": False
    }


def capture(scene, out_dir, center, dimensions):
    max_dim = max(dimensions)
    dist = max_dim * 2.3
    cam_data = bpy.data.cameras.new("FidelityReviewCamera")
    cam = bpy.data.objects.new("FidelityReviewCamera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100

    views = [
        ("front", (dist, 0, 0), "ORTHO", max(dimensions[1], dimensions[2]) * 1.7),
        ("rear", (-dist, 0, 0), "ORTHO", max(dimensions[1], dimensions[2]) * 1.7),
        ("left", (0, dist, 0), "ORTHO", dimensions[0] * 1.25),
        ("right", (0, -dist, 0), "ORTHO", dimensions[0] * 1.25),
        ("front34", (dist, dist * 0.7, dist * 0.38), "PERSP", None),
        ("rear34", (-dist, dist * 0.7, dist * 0.38), "PERSP", None)
    ]
    for name, offset, projection, ortho_scale in views:
        cam.location = center + Vector(offset)
        cam.data.type = projection
        if projection == "ORTHO":
            cam.data.ortho_scale = ortho_scale
        else:
            cam.data.lens = 55
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.abspath(os.path.join(out_dir, name + ".png"))
        bpy.ops.render.render(write_still=True)


def main():
    args = cli_args()
    asset = os.path.abspath(args.asset)
    output = os.path.abspath(args.out_dir)
    if not os.path.isfile(asset):
        raise FileNotFoundError(asset)
    if not asset.lower().endswith(".glb"):
        raise ValueError("This reviewer expects a GLB; export a GLB from Blender first.")
    os.makedirs(output, exist_ok=True)
    with open(args.spec, encoding="utf-8") as f:
        spec = json.load(f)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=asset)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh objects found in the GLB")
    min_corner, max_corner = bounds(meshes)
    center = Vector([(low + high) / 2 for low, high in zip(min_corner, max_corner)])
    dims = [high - low for low, high in zip(min_corner, max_corner)]
    report = inspect(meshes, spec, args.full_vehicle)
    report["asset"] = asset
    capture(bpy.context.scene, output, center, dims)
    report["reviewImages"] = [
        name + ".png" for name in
        ("front", "rear", "left", "right", "front34", "rear34")
    ]
    with open(os.path.join(output, "geometry-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
