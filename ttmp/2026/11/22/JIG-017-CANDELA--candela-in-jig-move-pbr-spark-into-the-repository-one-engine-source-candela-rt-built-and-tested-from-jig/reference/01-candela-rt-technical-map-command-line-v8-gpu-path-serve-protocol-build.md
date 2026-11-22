---
Title: candela-rt technical map (command line, V8, GPU path, serve protocol, build)
Ticket: JIG-017-CANDELA
Status: active
Topics:
    - rendering
    - gpu
    - build
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T15:47:28.584284378-05:00
WhatFor: ""
WhenToUse: ""
---

# candela-rt technical map (command line, V8, GPU path, serve protocol, build)

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

# candela-rt technical map

This reference maps candela-rt, the native NVIDIA renderer in `import/candela/native/rt`, as it stands at pbr-spark `e3b799e`, which is the commit `git subtree add` brought into jig.
- **Source:** compiled by a read-only research pass over the code, the README, and CANDELA-002's design doc and diary.
- **Line numbers** refer to the files at that commit.
- **Design doc versus code:** where CANDELA-002's design doc 02 and the code differ, the code is what was built; the doc describes the proposal.

## 1. Command line

`native/rt/src/main.cpp`:
- `main()` dispatches at 501–527.
- `arg()` at 48–51 returns the first occurrence of `--name value`. `hasFlag()` is at 285 and `args()`, for repeated options, at 286–290.
- `JsRuntime::initProcess` runs once at 512.
- Exit codes: 1 for usage errors and exceptions, 2 for failed presets or builds.

**Shared flags**
- `--bundle dist-core/candela-core.js` and `--content content` resolve relative to the working directory.
- `--kernels` defaults to `CANDELA_KERNELS_DIR`, an absolute path baked in by CMake.
- `--cache` defaults to `$HOME/data/candela/cubin-cache` (166–171).

| Command | Flags | What it calls |
|---|---|---|
| `digest` (66–112) | `--ids a,b`, `--times 0,0.37,1.5`, `--json out` | `Candela.digestCatalog(content, ids, times)` |
| `session` (115–151) | `--ids`, `--frames 48`, `--fps 24`, `--json` | `Candela.sessionCatalog` |
| `cuda-sweep` (190–283) | `--ids`, `--json`, `--kernels`, `--jobs <cores/2>`, `--backend cuda\|optix` (default cuda), `--cache` | `Candela.cudaCatalog`, then NVRTC on a thread pool |
| `render <id>` (318–499) | listed below | `Candela.openRenderPreset(content, id, opts)` |
| `serve` (`serve.cpp:358–399`) | `--port 8790`, `--bind 0.0.0.0`, `--token` (empty: no check), `--bundle`, `--max-spp 2048`, `--max-width 1920`, `--denoise ai`, `--ser`, `--spheres`, `--jpeg-quality 88`, `--kernels`, `--cache`; no `--content` | `Candela.openRender(files, opts)` |

**`render` flags:**
- `--size 640x360`, `--spp 64`, `--backend auto|cuda|optix`.
- `--format pfm` (a comma list of pfm, png, exr, mp4); `--aov`; `--no-motion-blur`.
- `--sequence`, `--start`, `--end`, `--frames`, `--fps 24`. A sequence is on when any of `--sequence`, `--end` or `--frames` is given. The end is inclusive, and MP4 forces even image dimensions.
- `--time` (stills only), `--seed`, `--fixed-seed`, `--first-frame 1`.
- `--param id=value` (repeatable; JSON values are parsed), `--name`.
- `--out`: `build/parity` when the only format is PFM, else `$HOME/data/pbr-spark/renders/<id>`.
- `--denoise scene|ai|off`, `--codec h264|hevc|av1`, `--quality draft|standard|high|max`.
- `--ser auto|on|off` and `--spheres builtin|custom` become an options fragment through `serOption()` in `common.h:17–20`.

**Not implemented, though design doc 02 §6.6 lists them:** `check`, `render <dir>`, and `serve --dist`.

**`native/optix`** is a separate project. It builds the ambient-occlusion spike `candela-optix-ao <package-dir>`, which reads `scripts/scene-package.ts` output from `~/data/pbr-spark/packages/<id>`. candela-rt does not use it.

## 2. Process structure

**V8.** candela-rt embeds the V8 from Ubuntu's `libnode-dev` (Node 18.19, V8 10.2) through the raw embedder API (`js_runtime.cpp`).
- There is no Node environment: no `require`, `process` or `Buffer`.
- Each `JsRuntime` has one isolate with a 4 GiB heap limit.
- Globals:
  - `console`, `performance.now`, `atob`, `btoa`;
  - a polyfill for `TextEncoder`/`TextDecoder`;
  - `AllowCodeGenerationFromStrings(true)`, which `runFiles`' `new Function` needs.
- Microtasks are run explicitly. `settle()` pumps them until a promise settles.
- There is **no watchdog**: an infinite loop in scene code hangs the session thread.

**Calls into JavaScript.** `rt.runScript(bundle)` defines `globalThis.Candela`. C++ then calls these functions (`src/engine/core.ts:13,53,69,77`, `headless.ts:86`):
- `digestCatalog`, `sessionCatalog`, `cudaCatalog`;
- `openRenderPreset(content, id, opts)`;
- `openRender(files, opts)`.

**The `HeadlessRender` object** (`headless.ts:32–77`) is what those return.
- Methods: `frame()`, `seek(t, dt, seed)`, `meter()`, `display()`, `idUniforms()`, `exr()`, `setParam`, `setView`, `resize`.
- Fields:
  - `version`, `spp`, `time`, `ev`, `irHash`, `target`;
  - `cuda.{source, hash, ser}` and `post.{source, hash}`;
  - `optix.{meshes, instances, srt, motionKeys, aabbs, aabbObjects, spheres, sphereObjects, glowSpheres, motion, builtinSpheres}`;
  - the buffers `O`, `LI`, `BV`, `SD`, which C++ reads without copying (`rt.view<T>()`).

**Scenes.**
- `readContent` reads every file under `--content` into a `{ path: text }` object.
- `openRenderPreset` uses `loadPresets` (`src/content/catalog.ts:54–82`):
  - `presets/<base>.md` (frontmatter `id`, `group`) plus `presets/<base>.js` become `scene.js`;
  - the files in `presets/<base>/*` become `lib/*`.
- `serve` takes the files from its client.

**Threads.**
- `render`, `digest` and `session` use one thread for V8 and CUDA.
- `cuda-sweep` runs V8 on the main thread and NVRTC on `--jobs` worker threads.
- `serve`:
  - IXWebSocket's threads only queue messages.
  - One session thread owns the isolate, the CUDA context, the renderer, the display program, nvJPEG and the denoiser. It alternates between messages and render batches (`Live::run`, 90–115).

## 3. The GPU path

**Translation.** For each scene, at open time and in V8 (`headless.ts:118–119`), `cudaProgram()` and `cudaPostProgram()` (`targets/cuda.ts:25–40`) call `cudaSource()` (`wgsl2cuda.ts:255`). That translates all of `compiled.shared` from WGSL to CUDA. The shape of the output:
- **Layout:** `#include "candela_wgsl.h"`, the target prelude, `namespace wgsl { head; struct Kernel { … } }`, then the epilogue.
- **CUDA target:** `candela_cuda_params.h`, `candela_accessors.inc`, `candela_compute.cuh`. The entry point is `candela_main`, in 8×8 blocks.
- **OptiX target:** `traceAll` is replaced by `candela_traversal.inc`, and the epilogue is `candela_optix_programs.cuh`. `CANDELA_SER 1` is defined when shader execution reordering is on.
- **Display program:** the `candela_post_*` headers, with entry points `candela_denoise`, `candela_display` and `candela_guides`.

**NVRTC** (`cuda_runner.cpp:26–63`).
- Options: `-I<kernels>`, `--gpu-architecture=sm_XY` (from device 0 at run time), `-std=c++17`, `--use_fast_math`, and `$CANDELA_NVRTC_FLAGS`.
- For OptiX, also `--optix-ir` and the OptiX and CUDA include directories. Both are absolute paths baked in at build time.

**Cubin cache** (`main.cpp:173–183`).
- File name: `<JS source hash>-<FNV64 of the kernels dir>-<arch>-<FNV32 of the options>.cubin|.optixir`.
- The key leaves out the NVRTC version, the OptiX SDK and the driver. Writes are not atomic.
- No paths go into the key, so the cache survives the tree's move.

**`--backend auto`** (`headless.ts:109–110`): OptiX when the scene has meshes or more than 64 analytic objects, otherwise CUDA.
- **Motion transforms** need motion blur on, at least 2 keys, and an animation or behaviours.
- **SER under `auto`:** OptiX, no meshes, more than 64 AABB objects.
- **Built-in spheres** are on by default.

**OptiX** (`optix_renderer.cpp`).
- `maxRegisterCount` is 255 (or `CANDELA_OPTIX_MAXREG`), with O3, 8 payload values and 2 attributes.
- Program groups: raygen, miss, triangle hit, custom AABB primitive, and built-in sphere.
- Each mesh gets one compacted GAS (9 floats per triangle).
- Every seek rebuilds the frame: SRT motion transforms for moving meshes, an AABB GAS, two sphere GASes (solid with mask 3, glow with mask 1), and the IAS.
- The traversal shim (`candela_traversal.inc:8–46`) calls `optixTrace`, or `optixTraverse` → `optixReorder` → `optixInvoke` with SER.

**Outputs.**
- **Display:** `post.cpp` runs up to 4 à-trous passes, then display to RGBA8.
- **AI denoiser** (`denoiser.cpp`): the OptiX AOV model with albedo and normal guides, on its own OptiX context.
- **MP4:** `popen` of `ffmpeg … -c:v {h264,hevc,av1}_nvenc -preset p6 -tune hq -rc vbr -cq …` (`image_io.cpp:66–90`). ffmpeg must be on `PATH`.
- **JPEG:** nvJPEG, 4:2:0, quality 88.
- **PFM and PNG** are written in C++. **EXR** bytes come from JavaScript (`passesToEXR`).
- **Files:** `<stem>.pfm|.png|.exr|.mp4`; sequence frames are `<stem>.NNNN.<ext>`; `<stem>.json` holds timings.

## 4. The serve protocol

**Client → server.** JSON text, parsed with V8's `JSON.parse` (`serve.cpp:128–183`).

| Message | Fields | Effect |
|---|---|---|
| `hello` | — | Reply with `hello`. If a scene is already built, resend `built` and start a new epoch. |
| `files` | `files`, `params?`, `time?`, `seed?` | Replace everything and rebuild (193–253). |
| `param` | `id`, `value` | `setParam`, then rebuild or repack; an unknown id is an error ("no param"). |
| `view` | `view` (`{at, target, …}` or null), `width`, `height` | Width capped at `--max-width`, minimum 16; a new epoch. |
| `clock` | `t`, `playing`, `rate` | Seek on a pause or a jump of more than 0.25 s. While playing, the server's clock advances by at most 0.1 s × rate. |

**Server → client.**

| Message | Fields |
|---|---|
| `hello` | `server: 'candela-rt'`, `gpu`, `maxSpp`, `maxWidth` |
| `status` | `state`: `building`, `compiling` (with `target`) or `taken` |
| `built` | `ok`, `irHash`, `target`, `buildMs`, `compileMs`, `pipelineMs`, `motion`, `width`, `height`; or `{ok: false, error}` |
| `error` | `message` |
| frame (binary) | see below |

**A binary frame** (316–331) is a uint32 little-endian header length, then the header JSON, then the JPEG bytes.
- The header is `{type: 'frame', t, spp, ev, width, height, renderMs, epoch, playing, denoise, denoiseMs}`.
- `renderMs` is cumulative over the process's lifetime.

**Pacing** (282–314).
- Batches last about 20 ms (25 ms while playing), with 1–256 launches each.
- Exposure is metered at 1, 8 and 32 samples per pixel after a change.
- While playing, a frame goes out every batch. Otherwise frames are at least 100 ms apart, plus one at `--max-spp`.
- A frame is skipped when more than 8 MiB is buffered. A skipped final frame is never resent.

**Auth.** `--token` is a substring test on the request URI; a mismatch closes with code 4401. There is no TLS.

**One client at a time.** Whoever spoke last owns the session, and the previous owner receives `status: taken`.

**Candela's browser client** (`src/app/remote.ts`).
- The URL is `?rt=`, else `localStorage['candela.rtUrl']`, else `ws://<host>:8790`.
- It sends `hello` and reconnects every 2 s.
- `sendFiles` keeps only string values and drops keys that begin with `__`.
- `view` and `clock` are deduplicated.
- `mismatch` compares `built.irHash` with the page's `digestString(compiled.shared)`.

**What limits a client.**
- **Files.** `files` can hold any JSON value, but `runFiles` only evaluates `.js` keys, and imports resolve to `<spec>.js`.
- **No `scope`.** `openRender` calls `s.build(files)` with no options (`headless.ts:89`), and `HeadlessOptions` has no `scope`.
- **No size limit.** IXWebSocket v11.4.6 has no message cap. A large message is parsed on the session thread and blocks rendering.
- **Not built from design doc 02 §7.2:** `bundleHash`, `asset`, `poses`, `render`, `cancel` and `job`.

## 5. Build

**CMake** (`native/rt/CMakeLists.txt`).
- CMake ≥ 3.24, C++20, `RelWithDebInfo` by default.
- C++ only: no device code is compiled at build time.
- **Dependencies:**
  - V8: `find_path(v8.h /usr/include/node)` and `find_library(node)`;
  - `CUDAToolkit`, linking `cuda_driver`, `nvrtc`, `nvjpeg`, `cudart`;
  - ZLIB;
  - the OptiX SDK headers, through cache variable `OptiX_INSTALL_DIR`, default `$ENV{HOME}/opt/NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64`;
  - IXWebSocket through `FetchContent`, `GIT_TAG v11.4.6` (no hash; needs the network at configure time).
- **Defines baked in as absolute paths:** `CANDELA_OPTIX_INCLUDE_DIR`, `CANDELA_CUDA_INCLUDE_DIR`, `CANDELA_KERNELS_DIR`.

**At run time** candela-rt needs NVRTC, the kernel headers, the OptiX SDK headers, the driver's OptiX, and ffmpeg with NVENC.

**Paths relative to the working directory or home:**
- the `--bundle`, `--content` and parity `--out` defaults;
- `scripts/parity-sweep.ts:34` and `tools/lockstitch/render.ts:55`, which run `./build/rt/candela-rt`;
- `scripts/bundle-core.ts` and `scripts/core-digest.ts`;
- `~/data/candela/cubin-cache`, `~/data/pbr-spark/renders/<id>`, `~/data/pbr-spark/packages`, and `~/opt`.

## 6. Tests and checks

| Check | What it needs |
|---|---|
| `tests/golden-pack.test.ts` (baseline `tests/golden/pack-digests.json`) | Node only |
| `tests/session.test.ts` | Node only |
| `scripts/core-digest.ts --compare rt.json` with `candela-rt digest --json rt.json` | Node vm against embedded V8 |
| `core-digest.ts --session` with `candela-rt session` | as above, frame by frame |
| `candela-rt cuda-sweep [--backend optix]` | the GPU, NVRTC, OptiX headers |
| `scripts/parity-sweep.ts --size 320x180 --spp 1` | the `webgpu` npm package (Dawn on Vulkan), `wgsl-render.ts`, `compare-pfm.ts`, `./build/rt/candela-rt` |
| `scripts/live-client.ts` | a running `serve` |
| `scripts/live-browser-check.ts` | Playwright, Vite and `serve` |

pbr-spark had no CI.

## 7. What a jig CAD package needs that candela-rt lacks

1. **Scope.** jig builds with `scope: { __jigPackage }` (`import/jigcad/src/render/host.js`).
   - Fix: add `scope` to `HeadlessOptions` and call `s.build(files, { scope: o.scope })`; `SceneSession.build` already forwards it (`session.ts:109–110`). Then forward `msg.scope` in serve (`serve.cpp:197–199`).
   - Workaround with no native change: `jig-program.js = 'export const program = ' + JSON.stringify(pkg)`, with the arrays as base64. That is about 0.3–7 MB, resent on every look edit.
2. **Offline render from files.** `render` takes only preset ids from a Candela `content/` tree.
3. **Poses.** There is no `poses` message for jig's live drag (`vp.setPoses`).
4. **Motion blur.** There is no message to override it; headless supports only `motionBlur: false` at open.
5. **Jobs.** There are no `render` or `job` messages, so stills and video stay in the browser.
6. **A client for jig.** `remote.ts` uses the DOM, `localStorage` and `location`, and only one client is served at a time.
7. **Slow edits on the GPU.** CAD packages have meshes, so `auto` picks OptiX. A material edit changes the WGSL, which costs NVRTC 2–8 s plus OptiX 8–17 s on a cache miss.
8. **Untrusted scene code.** There is no watchdog, and the token is a URI substring test without TLS.

The bundle-byte question is settled in §5's build notes: jig's esbuild (0.25.12) and Candela's (0.28.2, through tsx) differ in `/* @__PURE__ */` annotations. Nothing compares bundle bytes, only `irHash`.
