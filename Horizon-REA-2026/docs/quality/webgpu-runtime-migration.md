# WebGPU runtime migration — stability first

Experimental branch, independent of active full-race WebGL and simplified WebGPU comparisons.

## Module 1 — GPU queue completion
webgpuFrameGate.ts is a native promise-based frame gate. It counts submitted and completed frames separately, prevents multiple outstanding frames, reports stalls and device loss, and never clears a fault to conceal a failed frame. Unit tests model queue completion, errors, timeout, and loss; they are not a real GPU benchmark. Integrate only after native WebGPU laboratory confirms visible rendering. A real race needs renderer initialization before environment construction and a nonblocking runtime scheduler.

## Identified migration areas from source audit
| Source | Current WebGL dependency | Migration / validation |
| --- | --- | --- |
| src/game.ts | WebGLRenderer constructor, getContext, initTexture, preparation fences and profiling | Async renderer factory, queue gate, per-backend capabilities, context/device loss handling |
| src/render/performance.ts | WebGL timer query | Native timing capability checks; wall times and actual queue completion separate |
| src/world/nightSky.ts | ShaderMaterial for dome and stars; WebGL PMREMGenerator | TSL dome, compatible star primitives, verify PMREM and nocturnal visual fidelity |
| src/world/humanPeople.ts | onBeforeCompile for anatomy, atlas impostors, flags; WebGLRenderTarget | TSL/material nodes and renderer-independent atlas baking |
| src/world/monzonBlenderTrees.ts | WebGLRenderTarget, context check | Native render target and async device-safe baking; preserve LODs |
| src/world/monzonFireworks.ts | GLSL point shaders and WebGL render target | Node materials and appropriate billboard/instanced primitives, preserve animation |
| src/render/pickupMud.ts | onBeforeCompile procedural surface coating | TSL color node preserving PBR textures, mud persistence and transparency |

No replacement of approved assets. Retain the current WebGL backend until the complete WebGPU race passes. No claims of 60 FPS from software rendering, mock tests, or queue completion alone.
