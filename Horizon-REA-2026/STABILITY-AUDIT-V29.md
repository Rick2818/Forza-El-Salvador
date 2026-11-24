# STABILITY AUDIT V29 — Crowd and cinematic VFX candidate
Branch: fix/v29-crowd-fireworks, derived from V28 eb1781bb. No production publication.

## Baseline evidence
V28 run 45445061460 failed TypeScript: bundled Meshopt simplifier lacks declarations and tuple indexing at level 3. Browser run 45445061518 baseline Monzon: browser unresponsive 15 s; Suzaka: actual WebGL draws stopped. Thus V28 cannot be called stable. V29 includes a local typed declaration and safe indexing; validate in CI. The older V26/27 evidence remains 390/390 unit tests, 40/40 radial measurements, pickup flat straight 200 MPH, and 125.88 s physics-only, NOT full wheel visual or graphics acceptance.

## Implemented
- Existing anatomical crowd meshes remain near the camera. Hybrid uses one shared 1024x512 offscreen atlas of those existing characters (4 viewing directions x 4 appearance combinations x 2 animated phases), depth-writing alpha-cutout instanced quads for mid/far crowds, shared materials, no individual physics. 3D and all-impostor comparison modes via crowd query parameter. Existing layouts and staff retained.
- Original procedural Salvadoran civil/checkered cloth flags, instanced flags and poles; no external artwork.
- Existing GPU firework choreography retained (42 bursts, seven patterns). Refined peony/chrysanthemum/palm/willow and colours, trail timing, smoke flipbook generated locally, active chronological draw ranges, bounded point sizes and two lights; four existing particle layers, no per-particle physics. Tiny offscreen pre-upload before race. Same opening controller on Monzon and daytime Suzaka; only Monzon uses its authored camera close-ups, no change to day/night lighting or track design.
- Tests: active-range regression; controlled A/B/C crowd-only benchmark with screenshots, triangle counts, CPU submit times and fence completion latency (not direct GPU execution time); real opening tests on both tracks with image captures and frame/draw watchdog, existing continuity and fleet checks retained.
- Preserve inherited vehicle models, driving/suspension/4WD settings and release gates. No changes to production.

## Asset provenance
Crowd atlas is rendered from existing repository human-near GLB, using existing human shader. Flags and smoke atlas are original procedural source in this change. No downloaded external art or copied Forza/GT/F1 assets. Commercial redistribution rights of pre-existing human/vehicle GLBs are not newly certified; review provenance before commercial release.

## Acceptance pending
Visual realism, atlas angular alignment, flag placement, fireworks cinematography and full game stability must be inspected from actual screenshots and hardware. Near crowd reuses previous anatomy; no new sculpted heads/rigged humans or VAT, far crowd uses individual instanced quads not collective stand impostors. No KTX2 conversion, CPU particle benchmark or new worker separation yet. Current comparison uses 3D/hybrid/2.5D crowd; firework comparison needs matched CPU/GPU workloads. LOD percentage is target, not measured. Need full game A/B, actual GPU profiling and 1% low, memory, all ten vehicles both circuits, 15/30/60-min sessions, collision recovery, independent wheel/rim identity and visual checks. SwiftShader is not physical GPU certification. Do not merge while any critical gate fails.
