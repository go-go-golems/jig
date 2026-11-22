# Candela


A physically based rendering workbench: a fluent, unit-aware JavaScript API for scenes and engines, compiled to a
progressive path tracer that runs on **WebGPU** (compute) or **WebGL2** (fragment), in a tiling React workbench
with params as sliders, IR/graph/shader views, physical diagnostics, a render queue (PNG, EXR passes, MP4/WebM)
and a chat agent that drives the API.

This is the standalone TypeScript port of the Candela workspace that originally shipped as a single claude.ai
artifact page. The import, the porting decisions and a step-by-step diary are in the docmgr ticket
[`CANDELA-001`](../../ttmp/2026/11/21/CANDELA-001--standalone-typescript-port-of-the-candela-pbr-workspace/index.md);
the original sources are under that ticket's `sources/candela/`.

## Candela inside jig

Candela lives in jig at `import/candela` (it was the repository `wesen/2026-11-21--pbr-spark`, merged with its
history by `git subtree` in JIG-017). jig renders its CAD models with this engine: the workbench's Render view, the
CAD-package bridge `import/jigcad/src/render/jig-candela.js`, and `jigcad serve`, which starts `candela-rt` and
proxies it at `/rt`. The intern guide to all of it is JIG-017's design doc
(`../../ttmp/2026/11/22/JIG-017-CANDELA--…/design-doc/01-…`).

What jig builds and runs from this directory, with no npm install (jig's own esbuild, from the repository root):

| from jig's root | what it does |
| --- | --- |
| `make web` | jig's `dist/`, including `dist/candela.js` (engine + browser layer) and the core, written to `import/candela/dist-core/candela-core.js` and copied to jig's `dist/` |
| `make test-candela` | `tests/session.test.ts` and `tests/golden-pack.test.ts` through `scripts/node-tests.mjs` (about 13 s; part of `make test-js`) |
| `make candela-rt [OPTIX_DIR=…]` | `import/candela/build/rt/candela-rt` (NVIDIA machine; prerequisites below) |
| `make serve RENDER=import/candela/build/rt/candela-rt` | jig with the native renderer behind `/rt` |

`scripts/node-tests.mjs --run <script.ts> -- <args>` runs any Node-only script the same way, e.g.
`node scripts/node-tests.mjs --run scripts/core-digest.ts -- --ids B-01 --compare rt.json` (set `ESBUILD` to jig's
`.bin/esbuild/node_modules/esbuild/lib/main.js`, as `make test-candela` does).

The golden baseline is per CPU architecture: `tests/golden/pack-digests.json` was recorded on the DGX Spark
(arm64) and `tests/golden/pack-digests.x64.json` on x86-64; the buffers of 10 of the 105 presets hash differently on
the two at the same commit.

Everything below — the React workbench, `npm run …`, the screenshot and parity tools — is Candela's own development
setup, and still works as before after `npm install` in this directory. jig does not build or ship the workbench.
Tickets are in jig's `ttmp/` (CANDELA-001 and CANDELA-002 under `2026/11/21/`); this directory is no longer a
docmgr root. Some defaults still carry the old repository name: render and package outputs go to
`~/data/pbr-spark/…` (cubins are cached in `~/data/candela/cubin-cache`).

## Quick start

```sh
npm install
npm run dev            # http://localhost:5173 — the workbench
npm run build          # → dist/ (index.html + assets)
npm run build:single   # → dist-single/index.html, one self-contained file (opens from file://)
```

Open a preset directly with its id in the hash: `http://localhost:5173/#K-01`.

## Checks

| command | what it checks |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over everything (`strict`, `noImplicitAny` off) |
| `npm run typecheck:strict` | the ratchet: files listed in `scripts/typecheck-strict.ts` must also pass `noImplicitAny` |
| `npm run validate [IDs…]` | builds every preset in Node (no GPU): diagnostics, stats, WGSL→GLSL translation |
| `npm test` | the agent's tool loop against a scripted fake API (no network, no key) |
| `npm run shot -- <ID> <out.png> [w h waitMs light\|dark webgl2\|webgpu]` | screenshots `dist/` in headless Chromium (SwiftShader) and prints console errors; `CLICK=Agent` clicks UI text first |

`npm run validate` reproduces the original JavaScript's output exactly (baseline in the ticket's `various/`).

## Layout

| path | what |
| --- | --- |
| `src/engine/` | the library: units, diagnostics, the `fx` expression graph, params, scene builders, stdlib materials, fragments, compiler, WGSL kernel, WGSL→GLSL, WebGPU/WebGL2 renderers, viewport, IR, meshes/BLAS, HDRIs, finishes, EXR/ZIP output, WebCodecs video |
| `src/app/` | the workbench (React 18): `host.ts` (state, build, clock, picking), `ui/*` views, `claude.ts` (the agent's model connection), markdown/highlighting |
| `src/content/` | `catalog.ts` turns `content/` into presets/docs/reference; `browser.ts` (Vite `import.meta.glob`) and `node.ts` (fs) feed it |
| `content/presets/` | 105 presets: `<ID>-<slug>.md` (notes, frontmatter) + `.js` (the scene, run by the engine's own module loader — scene files stay JavaScript) + optional `<ID>-<slug>/` lib files |
| `content/docs/`, `content/reference.md` | the docs and the API reference (also the agent's reference) |
| `content/gen/` | the Python scripts that generated the presets |
| `scripts/`, `tests/` | validation, screenshots, typing ratchet, agent loop test |
| `tools/lockstitch/` | the lockstitch-head converter and renderer (from the original workspace); `render.ts --engine rt` renders the reel with candela-rt |
| `spec/` | the API design spec |
| `native/rt/` | `candela-rt`, the native render runtime (C++): embedded V8, CUDA/OptiX renderers, render jobs, live server — see below |
| `native/optix/` | the standalone OptiX ambient-occlusion spike |
| `../../ttmp/2026/11/21/CANDELA-00{1,2}--…/` | tickets (in jig's `ttmp/`): design docs, the implementation diaries, measurement evidence |

## candela-rt: rendering on an NVIDIA GPU (DGX Spark)

`candela-rt` runs Candela's engine unchanged in embedded V8, translates each scene's WGSL program to CUDA
(`src/engine/wgsl2cuda.ts`), compiles it with NVRTC at run time, and renders it either as plain CUDA or on the RT
cores through OptiX (`--backend auto` picks per scene). It renders stills and sequences (PNG, EXR, PFM, MP4 through
NVENC), denoises with the OptiX AI denoiser (`--denoise ai`), and serves the workbench's **OptiX** viewport mode
(`serve`). Design: `../../ttmp/2026/11/21/CANDELA-002…/design-doc/02-…`; history and measurements: that ticket's `log/01-diary.md`.

Prerequisites (tested on a DGX Spark: GB10 `sm_121`, Ubuntu arm64, CUDA 13.0, driver 580):

- `sudo apt install libnode-dev zlib1g-dev cmake ninja-build ffmpeg` — V8 comes from Ubuntu's libnode; ffmpeg must
  have `h264_nvenc` (Ubuntu's arm64 build does).
- CUDA toolkit 13 (NVRTC, nvJPEG, the driver API).
- The **OptiX SDK 9.0.0** headers, unpacked to `~/opt/NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64` (or pass
  `-DOptiX_INSTALL_DIR=…`). The SDK version must match the driver's OptiX ABI: SDK 9.1 fails on driver 580 with
  `OPTIX_ERROR_UNSUPPORTED_ABI_VERSION`.
- IXWebSocket is fetched by CMake (FetchContent).

```sh
make -C ../.. web candela-rt                          # from jig: dist-core/candela-core.js and build/rt/candela-rt
# or, standalone: npm install && npm run bundle:core && cmake -S native/rt -B build/rt -G Ninja && ninja -C build/rt

./build/rt/candela-rt render K-09 --size 960x540 --spp 256            # still → PFM; add --format png,exr
./build/rt/candela-rt render K-09 --param "scene=S-07 Whole head" --sequence --start 0 --end 1.9583 \
    --size 1920x1080 --spp 16 --denoise ai --format mp4                # NVENC video, one stitch
./build/rt/candela-rt serve --bind 0.0.0.0 --port 8790                # then toggle "OptiX" in the workbench
```

Job outputs go to `~/data/pbr-spark/renders/<preset>/` (a plain PFM still, used for parity checks, to
`build/parity/`) unless `--out` is given. Compiled programs are cached in
`~/data/candela/cubin-cache` (first compile of a scene: NVRTC 2–8 s, OptiX module 8–17 s; later runs: milliseconds).
The workbench finds the server at `ws://<page host>:8790`, or at `?rt=ws://host:port` in the page URL. Over plain
HTTP from another machine the browser has no WebGPU (not a secure context) and falls back to WebGL2 for its local
view; the OptiX view is unaffected.

Checks for this part: `make test-candela` from jig (or `npm run test:golden`, `npm run test:session`), `npx tsx scripts/parity-sweep.ts --size 320x180
--spp 1` (WGSL on Dawn vs CUDA), `./build/rt/candela-rt cuda-sweep`.

## The agent

The Agent view talks to Claude through the Anthropic TypeScript SDK, called from the browser. Open
**Agent → Connection** and enter an Anthropic API key, or the base URL of a proxy that adds the key server-side.
The key is stored in this browser's `localStorage` and sent only to the API (or the proxy) — fine for a local
tool, but do not host a public build with a key configured. Model tiers: Fast `claude-haiku-5-5`, Balanced and
Deep `claude-opus-5-5` (Deep at higher effort); each is overridable in the form.

The agent has two tools: `eval` (runs JavaScript in the page with the Candela API and the workbench in scope) and
`screenshot` (the viewport or the whole workbench, sent back to it as an image).

## Differences from the artifact build

- React, ReactDOM and KaTeX come from npm instead of script tags; content is bundled by Vite instead of being
  inlined as `window.CANDELA_DATA`.
- The agent uses your API key instead of the artifact's `sample` capability.
- Files are saved as ordinary downloads (no `.zip` wrapping of `.exr`/video files).
