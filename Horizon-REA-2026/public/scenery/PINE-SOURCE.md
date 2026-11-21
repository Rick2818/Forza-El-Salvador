# Suzaka pine asset provenance

Source: Poly Haven, **Pine Tree 01**, variant b.
Asset: https://polyhaven.com/a/pine_tree_01
License: CC0 — https://polyhaven.com/license (verified 21 Nov 2026).

Runtime derivatives: pine-near.glb.gz, pine-medium.glb.gz, pine-far.png.
Editable Blender source: tools/blender/sources/suzaka-pine.blend.gz.
Blender 4.3.2 recipe: tools/blender/suzaka-pine.py.
Original scanned trunk/branch geometry is simplified; lower branch clutter and dead-branch atlas padding are omitted. Needles are reconstructed as crossed, alpha-tested twig clusters at sampled source needle positions. Irregular crown, long bare trunk and measured source branching replace the previous conical/pink trees. Near: 10104 triangles; medium: 4307 triangles; exact exported counts are checked from GLBs in the review report. Far: 6 triangles, 3 views baked in Blender.

No Poly Haven website preview image is shipped. The distant atlas is our own Blender render of the derivative model. No external runtime downloads or paid assets. All runtime textures are embedded/local. The original high-resolution source is a build input and is not shipped to the player.

Rebuild input preparation: `python tools/blender/prepare-pine.py /tmp/horizon-pine`, then run the Blender recipe with that input directory and an output directory. Assemble the three transparent `pine-view-*.png` renders into a 1536×1024 RGBA atlas without resizing or applying a mask twice. Only the two gzipped GLBs and atlas belong in `public/scenery`; the packed source stays under `tools/blender/sources`.
