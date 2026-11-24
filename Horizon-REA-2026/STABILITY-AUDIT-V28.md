# V28 — graphics optimization candidate
Base: V26/27 wheel and driving candidate d9df7bec. V27 branch and PR #52 are unchanged. V28 remains separate from main, but depends on that candidate. Not a release.

## Implemented
- Meshopt body-only index simplification for rivals and traffic, target 70/35/10% of eligible indices at distance bands 30/75/150 m with 12% hysteresis and bounded simplification error. Actual ratios may exceed targets to preserve seams. Player, wheel assemblies and transparent surfaces not simplified. Variants prepared before racing.
- Conservative whole-vehicle frustum culling, near 30 m protected; only active rivals/traffic, collision unchanged.
- Telemetry: triangles, LOD budgets, actual rendered FPS, callback FPS, culled rivals, GPU draw age.
- Browser A/B: same Monzon configuration with and without LOD, Suzaka baseline, physics-only, adaptive resolution, fleet audit.
- Texture inventory for original GLBs: file bytes, embedded image bytes, encodings and KHR_texture_basisu usage. Does not assert GPU memory or implement KTX2 conversion.

## Evidence from d9df7bec
390/390 unit tests, physics-only 125.88 s, three pickups reached 200 MPH on flat straight. GPU continuity failed in SwiftShader and full wheel/rim component audit failed despite radial alignment of 40/40. No release.

## Pending
Run V28 CI, inspect exact version, compare actual rendered FPS and draw age, investigate GPU saturation at countdown (LOD alone may not fix near-grid stall). Review actual geometry budgets and images for each LOD, measure on hardware GPU. KTX2 encode copies (never overwrite GLBs before validation), wire KTX2Loader and validate decoded colors/normal maps; investigate spatial batching of circuit geometry and a worker architecture with deterministic input snapshots and physics state exchange. Moving Rapier to a worker is a separate architectural change and does not by itself fix WebGL stalls. Do not integrate into main until graphics, wheels and extended driving acceptance pass.
