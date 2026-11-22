# Dedicated pit mechanic refinement

Base: approved/published V18 `887d8238001bd8f8e567e7ef5ad19811401a1f7b`.
Branch: `quality/v19-mechanics`. Visual approval is required before publication.

The previous staff reused the spectator mesh. This correction loads dedicated
`mechanic-near/mid/far.glb` assets only for workers in both Monzón and Suzaka.

The Blender model has a broader adult torso, a loose work overall, folded collar,
zippered chest pockets, hip pockets, reinforced knee pads, padded gloves with
individual fingers, safety boots with ankle shafts/laces/outsoles, a PIT CREW
badge and a rigid combination wrench linked to the hand influence. Region UVs
are unified before joining so the accessory palette cannot turn into skin.
The source is based on the existing CC0 MakeHuman anatomical mesh; no paid
service, new plugin connection or third-party character generator is used.

Runtime workers use separate role caching, metal/cloth surface responses,
subtle jaw stubble, different left/right arm gestures and the approved instance
positions. The crowd, vehicles, circuits, opening and fireworks are preserved.
Near/mid/far budgets: see `public/models/people/mechanic-build-report.json`.

Editable source: `tools/blender/sources/v18/pit-mechanic-v19.blend.gz`.
Rebuild: `blender -b --python tools/blender/v19-mechanics.py`.

Local validation: 14 targeted tests passed, including actual GLB loading,
geometry budgets, gloves/metal/workwear palette and rigid tool influence;
TypeScript/Vite compilation passed. The dedicated Actions review captures
full-body, face, tool and daylight garage views plus a short actual-engine clip.
These controlled captures do not measure hardware FPS or certify photorealism.

Close-up pass: replaced fitting-helper eyes with modeled sclera/iris/pupil,
smoothed the hairline and glove cuffs in the role material, added a continuous
rolled collar, removed the hard-edged stubble tint, flattened the coverall front
and moved knee padding outside the trouser surface. Targeted 14 tests and build
pass again; the new actual-engine review supersedes the initial close-up pass.
