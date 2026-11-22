# Candela

A physically based rendering workbench: a fluent JS API for scenes and engines, compiled to a
progressive path tracer that runs on WebGPU (compute) or WebGL2 (fragment), in a tiling workbench
with a chat agent that drives the API.

## Layout

| path | what |
| --- | --- |
| `src/` | the engine: units, diagnostics, `fx` expression graph, params, scene builders, stdlib materials, fragments, compiler, WGSL kernel, WGSL→GLSL translator, GPU backends, viewport, IR, CPU tests; `mesh.js` (CAD meshes, BLAS), `hdri.js` (HDRIs, alias tables), `finish.js` (finishes from metadata), `output.js` (EXR, ZIP, render queue), `video.js` (WebCodecs encoding, MP4 and WebM muxers) |
| `app/` | the workbench UI (React): host, dock/tiles, viewport, code editor, params, console/IR/graph/shader/lab panels, render queue, notes, agent, workbench capture |
| `content/presets/` | 105 presets: `<ID>-<slug>.md` (notes) + `.js` (the scene) + an optional `<ID>-<slug>/` folder of `lib/` files; `K-*` are the Machines group (meshes, poses, motion blur, finishes, HDRIs, output; K-09 is the lockstitch head) |
| `content/gen/` | the Python scripts that generated the presets (`python3 b1.py` … `b5.py`, run from that folder) |
| `content/docs/`, `content/reference.md` | docs and the API reference the agent reads |
| `build/build.js` | bundles everything into one HTML file |
| `vendor/` | React, ReactDOM, KaTeX (inlined by `--local` builds) |
| `dist/` | `index.html` (React/KaTeX from cdnjs, minified) and `local.html` (fully self-contained) |
| `test/` | Node validation, headless render harness, gallery and screenshot scripts |
| `tools/lockstitch/` | the lockstitch head: `convert.py` (jig meshes + kine rig → a Candela data module), `render.js` (its seven scenes, headless, to MP4/PNG) |

## Commands

```sh
npm install                      # esbuild (+ playwright for the browser tests)
node build/build.js              # → dist/index.html  (add --min to minify)
node build/build.js --local      # → dist/local.html  (no network needed)
node test/validate.js [IDs…]     # build every preset in Node, translate its GLSL
node test/gallery.js [prefixes…] # render presets headless → ~/shots/g/<ID>.png (FRAMES, BACKEND env)
node test/shot.js <ID> <out.png> [w h waitMs light|dark webgl2|webgpu]   # screenshot the workbench
node test/out.js <scene.js> [webgl2|webgpu]   # output path: still, EXR passes, determinism, sequence
node test/video.js <scene.js> [webgl2|webgpu] # MP4 + WebM headless, checked with ffprobe/ffmpeg
```

The browser tests launch Chromium with SwiftShader for WebGL2 and WebGPU. Some test scripts write
screenshots to `/home/claude/shots`; change the paths there if you run them elsewhere.

## The agent

The chat agent runs only where the page can reach Claude (a published claude.ai artifact with the
`sample` capability, images enabled). It calls the API through an `eval` tool and can take
screenshots of the viewport or the whole workbench; Save PNG uses the `downloads` capability.
