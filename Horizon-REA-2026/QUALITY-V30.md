# V30 — acceptance and evidence
Baseline: 80199f2836c5c245e9f33be752c118964d4272c6 (V29.2.2). Pages run 45500713922 succeeded; 405 unit tests passed. Prior render probe used a reduced scene at 400x300, software WebGL. It did not validate final art or Android FPS.
 
Candidate status: NOT APPROVED. Keep baseline published until independent inspection and physical device tests succeed.
 
The V30 CI workflow captures the real game, all three pickups at grid, green and controlled mud sector, runtime stats and renderer identity. It separately audits ten live GLBs. A green automated workflow is necessary but insufficient.
 
Required before promotion:
- Inspect real screenshots for paint, glass, wheel fidelity, organic splashes and terrain. Compare against the approved assets; no rendered proxy accepted.
- Three complete laps on each enabled track, recovery, touch UI, garage, camera and customization checks; record errors.
- Physical Android GPU benchmark, model/browser/version/quality, average rendered FPS, p95 frame time, minimum and screenshots. Target 60 sustained; no software render result accepted as mobile certification.
- Verify licenses for the two Fab scans before incorporating them. Free listing is not proof of license. No raw assets in public source.
- Record each result with exact commit, date, artifact and reviewer. Do not change RELEASE_LABEL to final V30 or merge into main before acceptance.
 
Known technical risk: prior probe reported 509 mesh draws for Silverado, 31 RAM, 357 Ford before mud. Draw-count reductions and preserved geometry need independent verification; no destructive batching without source-pose audit.
