# Textured workshop staff — review candidate

Source: [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox),
MIT, pinned commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9`.
Original characters: Construction_Male_02 and Construction_Male_05.
The included MIT notice applies to the models, textures and motion source.
No Forza models or proprietary assets are included.

Changes: remove hardhat geometry; preserve UVs and skin weights; rebuild PBR
materials with 2048-pixel albedo and 1024-pixel tangent normal maps; retarget
Rocketbox breathing and work clips into each original 80-bone character rig;
export Y-up GLB with embedded textures. Runtime applies a masked team-color
tint to blue cloth only. Camera culling and distant animation throttling reduce
cost. These 7k-triangle workers are independent skinned actors, not instanced
crowd geometry. 60 FPS still requires measurement on the target hardware.

Rebuild with Pillow and Blender 4.3:

```sh
python tools/blender/prepare-realistic-crew.py /tmp/horizon-rocketbox
blender -b --python tools/blender/build-realistic-crew.py -- /tmp/horizon-rocketbox
```

The preparer validates Git blob checksums from `rocketbox-sources.json`. The
builder also writes editable, packed Blender files under
`tools/blender/sources/realistic-crew/`; those large derived caches are excluded
from git because the pinned sources and build scripts reproduce them.
