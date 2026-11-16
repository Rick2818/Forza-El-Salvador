"""Smoke test: run Blender headless, build a mesh, export GLB.

Usage:
  blender.exe --background --python tools/blender/pipeline-test.py
"""

import os
import bpy

print("BLENDER_OK", bpy.app.version_string)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=2)
cube = bpy.context.active_object
cube.name = "PipelineTest"

mod = cube.modifiers.new("Bevel", "BEVEL")
mod.width = 0.08
mod.segments = 3

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pipeline-test.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False)
print("GLB_BYTES", os.path.getsize(out))
print("DONE")
