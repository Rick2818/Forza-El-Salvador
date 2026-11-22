# V18 event opening review

Base: `a28e4c148a37d22853a8de0018e9230433536b6e` (V16).
Branch: `quality/v18-event-opening`. Production remains unchanged pending visual approval.

## Changes

- A separate 19-second `opening` game state for Monzón, with no Race.update,
  physics integration, elapsed race time or countdown decrement.
- Button, Enter and Space skip to the original countdown; repeated skip is
  idempotent. Pause retains opening time, resume continues, restart/menu cancel.
- Scheduled pyrotechnic sources are tracked and cancelled on skip/pause/menu.
- 384 particles per shell and two closely spaced trail samples replace the
  sparse 96-particle bursts. Seven patterns include a camera-facing five-point
  star and ring; coherent shell velocities preserve legibility.
- Wide aerial view, crowd and mechanic close-ups, finale and camera return.
- Continuous bounded airship oval (66 by 10 metres) with tangent-based turns;
  separate fitted port/starboard lettering and red/yellow fittings above it.
- Anatomical MakeHuman CC0 mesh dressed/posed in Blender. Three exported LODs,
  camera-dependent instance partitioning, shader-based applause/waves and work
  gestures, skin/shirt/hair/height/width variation. Added staff to Suzaka bays.

## Validation

`tools/review-v18.mjs` runs the actual executable in Chromium/WebGL, rejects
JavaScript/shader/load errors, checks frozen vehicle positions and race clocks,
full/omitted/paused/restarted openings, no race fireworks and daylight startup.
It exports actual engine PNGs and 405 frames for a 27-second silent video at
15 FPS. The encoding rate and fixed simulation steps are not measured performance.

Local targeted tests: 30/30 passed. Full local regression: 294/294 passed.
The browser regression, screenshots and artistic evaluation are recorded
in the Actions artifact and must be checked before final approval.

## Limits

People use an anatomical mesh with procedural cloth color rather than scanned
facial/cloth textures. Shader joint deformation is optimized for crowds and is
not equivalent to a fully weighted individual character rig. Face variety is
limited; current variations change skin, hair color, stature and body width.
The reference rig is retained in the Blender source. Close-up evidence must be
reviewed honestly rather than labeling this AAA quality.

Balanced quality reduces shaded firework density. Hardware FPS, driving feel,
manual audio evaluation and commercial art quality remain user-side checks.
No new plugin connection, asset purchase or production deployment is claimed.

## Visual correction after the first executable review

The first actual-engine review passed all state/clock/input and no-error checks,
but exposed a one-frame LOD upload lag on camera cuts and shoulder deformation
that distorted fans. These are corrected by updating all crowd batches in the
scene's pre-render hook (before WebGL uploads) and exporting anatomical arm
influence in UV.y. Matching shoulder normal rotation, seated hip/knee placement
and palette-boundary splitting replace the previous positional approximation.

Pyrotechnic points now use sRGB conversion, larger luminous cores and 80%
balanced density. The review pipeline installs FFmpeg explicitly and records
JPEG intermediate frames for the final 27-second silent engine video.
After visual-only changes, the 30 relevant tests and compilation pass again.
The previous complete 294-test regression remains recorded; physics/car assets
were unchanged by these visual corrections. Production still requires approval.
