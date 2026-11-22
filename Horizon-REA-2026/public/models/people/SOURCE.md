# Horizon V18 people

The anatomical base mesh is MakeHuman `makehuman/data/3dobjs/base.obj`:
https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj

Downloaded 2026-11-22. Its header explicitly releases the graphical asset as CC0
(September 2020). The upstream license is included as MAKEHUMAN-LICENSE.md.
No MakeHuman application code is included or executed.

The retained mesh is `tools/blender/sources/v18/makehuman-base.obj.gz`.
`tools/blender/v18-people.py` rebuilds the clothed mesh, detail, neutral pose,
editable Blender source and three GLB LODs locally with Blender 4.3+.
Only the dressed derivative is exported to the game. Runtime code varies skin,
clothing, body width, height, hair, animation phase and posture per person.

The shader uses shoulder and elbow deformation rather than per-person skeletons;
this is an optimization for thousands of spectators. The editable Blender source
also contains a reference rig, not a fully weighted exported animation rig.
Near LOD preserves 5,309 triangles; mid 1,079; far 282 (see build-report.json).
LOD is selected by camera distance, independently for each spectator.

Editable source: `tools/blender/sources/v18/horizon-people.blend.gz` (gzip-compressed Blender file). Decompress before opening in Blender.
