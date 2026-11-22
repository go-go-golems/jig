---
Title: Diary
Ticket: CANDELA-002
Status: active
Topics:
    - pbr
    - gpu
    - webgpu
    - optix
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T19:54:26.75884683-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Step 1: Ticket, hardware probe and measurements on the Spark

Created the ticket for the GPU plan and, before writing any guide, measured what this machine actually does: which
GPU headless Chromium reaches with which flags, how many samples per second the existing renderer gets on it, what
Dawn in Node exposes, and which video encoders exist. The plan pasted earlier was written without access to the
hardware, so its claims are inputs to check, not facts.

Outcome: step 1 of that plan works today with no code changes. Headless Chromium reaches the GB10 for both WebGL2
(ANGLE on Vulkan) and WebGPU, and the existing renderer is 18–50× faster than SwiftShader on the same machine. Dawn
works natively in Node on arm64. Chromium has no hardware video encoders here.

### Prompt Context
**User prompt (verbatim):** "Ok, create a new docmgr ticket. This machine is the spark, you have access to the GPU. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."
**Follow-up (verbatim):** "commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
**Context:** the plan being analysed was pasted in the previous turn (a three-step plan: GPU browser flags, a
native Dawn runner with NVENC, an OptiX backend).
**Assistant interpretation:** Write an intern-level guide to Candela's renderer and the Spark GPU plan, grounded in
measurements on this machine; store it in a new ticket; upload it to reMarkable. Analysis and design, not
implementation of the three steps.
**Inferred user intent:** Someone new should be able to understand the system and start the GPU work.

### What I did
- `docmgr ticket create-ticket --ticket CANDELA-002 …` (topics pbr, gpu, webgpu, optix; added vocab `gpu`, `optix`),
  a design doc and this diary.
- Hardware/toolchain probe → `various/00-hardware-probe.txt`: GB10, driver 580.178.04, compute capability 12.1,
  CUDA 13.0 (`nvcc` V13.0.88), `libnvoptix.so.1` and `libnvidia-encode.so.1` installed, no OptiX SDK headers
  (`optix.h` not found), no system ffmpeg (Ubuntu candidate 6.1.1), 20 cores, 121 GiB.
- `scripts/01-gpu-probe.ts` → `various/01-gpu-probe.txt`: WebGL2 renderer string and WebGPU adapter per flag set.
- `scripts/02-throughput.ts` → `various/02-…`, `03-…`: samples/s of the workbench's own render queue
  (`host.render` → `runRender` → `accumulate`) on `dist/`.
- `scripts/03-webcodecs-probe.ts` → `various/04-webcodecs-probe.txt`: `VideoEncoder.isConfigSupported` at 4K.
- `scripts/04-dawn-probe.mjs` → `various/05-dawn-probe.txt`: `webgpu@0.6.2` adapter in Node.

### Why
- The guide's performance statements should cite numbers from this machine, not the earlier estimate.

### What worked
- Flags `--use-angle=vulkan --enable-features=Vulkan --enable-unsafe-webgpu` with Playwright's default headless
  shell (`chromium_headless_shell-1255`, Chrome 159): WebGL2 = `ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA GB10
  (0x00002E12)), NVIDIA)`; WebGPU adapter vendor `nvidia`, `maxStorageBuffersPerShaderStage: 16`,
  `maxStorageBufferBindingSize: 2147483644`, `maxBufferSize: 4294967292`, no `shader-f16`.
- Throughput at 64 spp (render queue, still, PNG), samples per pixel per second:

  | preset | size | WebGPU (GB10) | WebGL2 (GB10) |
  | --- | --- | --- | --- |
  | B-01 sphere | 640×360 | 190 | 386 |
  | B-01 | 1920×1080 | 94.5 | 92.3 |
  | M-07 car paint | 640×360 | 136 | 151 |
  | M-07 | 1920×1080 | 23.8 | 22.4 |
  | K-01 gear meshes | 640×360 | 32.2 | 21.4 |
  | K-01 | 1920×1080 | 4.5 | 3.2 |
  | K-09 lockstitch (16 spp) | 640×360 / 1080p | 65.7 / 12.4 | – |

- SwiftShader on this machine (20 cores), 640×360, 4 spp: B-01 3.7 spp/s, K-01 1.8 spp/s. GPU/SwiftShader:
  B-01 ≈ 51× (WebGPU), K-01 ≈ 18×.
- Dawn in Node: adapter `nvidia-gb10`, description `NVIDIA: 580.178.04`, `maxBufferSize: 1099511627776`,
  features include `timestamp-query`, `subgroups`, `primitive-index`; no `shader-f16`.

### What didn't work
- `navigator.gpu` was missing in every configuration when the page was `about:blank`: WebGPU is exposed only in
  secure contexts. Serving a blank page from `http://localhost:8791/` fixed it (localhost counts as secure).
- New headless mode (`channel: 'chromium'`) with Vulkan flags: `"webgl": "no webgl2"`, `"webgpu": "null"` — the
  full Chromium binary does not get a GPU process headless here; the headless *shell* does.
- `--use-gl=egl` without Vulkan falls back to SwiftShader.
- WebCodecs: `prefer-hardware` false for H.264, HEVC, AV1, VP9; software only H.264 and VP9; HEVC/AV1 10-bit not
  available at all. NVENC is not reachable from the browser.

### What I learned
- At small sizes WebGL2 can beat WebGPU (B-01 640×360: 386 vs 190 spp/s): per-sample fixed costs dominate
  there (each sample is one dispatch followed by `backend.idle()`; see `accumulate` in `src/engine/output.ts`).
  At 1080p both converge, and on meshes WebGPU wins (K-01: 4.5 vs 3.2).
- The earlier "≈1 s per sample at 640×360" fits SwiftShader on 2 cores; on 20 cores it is ≈0.3–0.55 s.
- The plan's "100×" is not what step 1 delivers on the mesh scenes: K-01 is ≈18× over 20-core SwiftShader.

### What was tricky to build
- `02-throughput.ts` must wait until the build *and* the shader compile are done
  (`vp.compiled && !host.compiling && vp.spp > 0`) or the first render includes pipeline compilation.

### What warrants a second pair of eyes
- One run per configuration, no warm-up repeats: numbers are indicative (±10–20%), not a benchmark suite.
- GPU utilisation during the runs was not recorded; the claim that small sizes are sync-bound is a deduction from
  the code and the size scaling, not a measurement.

### What should be done in the future
- Record `nvidia-smi dmon` alongside throughput runs; add repeats.

### Code review instructions
- `npm run build && npx tsx ttmp/…/CANDELA-002…/scripts/02-throughput.ts B-01 K-01` (env `SIZES`, `SPP`, `CONFIGS`).

### Technical details
- Headless shell launch: `chromium.launch({ args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] })`.

## Step 2: Reading the renderer and writing the intern guide

Read the parts of the engine the GPU work touches (kernel call tree, backends, buffer packing, viewport, output
loop, mesh BVH, lockstitch tooling), measured scene sizes, and wrote the guide
`design-doc/01-candela-on-the-dgx-spark-intern-guide-to-the-renderer-and-the-gpu-plan.md`. Then reviewed the draft
against the source and the intern reader before revising.

Outcome: an ~870-line guide covering a path-tracing primer, the five stages from scene file to pixels with buffer
layouts and kernel pseudocode, the Spark measurements, designs for the three steps (APIs, pseudocode, diagrams),
testing, decision records, open questions, and file/API appendices.

### Prompt Context
**User prompt (verbatim):** (see Step 1)
**Assistant interpretation:** Intern-level analysis/design/implementation guide, evidence-backed, stored in the ticket.
**Inferred user intent:** Onboard someone to do the GPU work without this conversation.
**Commit (code):** see the commit after this entry ("CANDELA-002: intern guide …")

### What I did
- Read `src/engine/kernel.ts` (`renderPixel`, `tracePath`, `traceAll`, `hitMesh`, `cameraRay`), `render.ts`
  (`GPURenderer.create/compile/resize/upload/uploadSD/trace/display/readRGBA8`), `compile.ts` (`compile`, `pack`,
  `SHAPE_TYPE`, object record layout), `viewport.ts` (`frame`, `show`, `meter`), `output.ts` (`runRender`,
  `accumulate`), `mesh.ts` (`blasOf`), `test.ts` (`furnace`), `tools/lockstitch/{README.md,render.js}`.
- `scripts/05-scene-stats.ts` → `various/06-scene-stats.txt` (objects, triangles, buffer sizes per preset).
- Wrote the guide; second pass with review notes before revising (below).

### Why
- The guide had to correct the earlier plan where the code says otherwise; that needed source reading, not just
  the plan's text.

### What worked
- `docmgr doctor --ticket CANDELA-002 --stale-after 30` → all checks passed.

### What didn't work
- No tool failures. Review found draft errors (next section).

### What I learned
- The engine already supports several samples per dispatch (`renderPixel` loops `U(0).w`, `engine.sppPerFrame`);
  the per-sample wait is in `accumulate` (output.ts), not the kernel.
- `GPURenderer.create` caps requested limits at 10 storage buffers and 1 GiB per binding/buffer: the real limit for
  big CAD scenes is the single 1 GiB `sd` binding, not the 8-buffer default the plan named.
- Quantised meshes are a file format only; the GPU gets 112-byte fp32 triangles (`blasOf`).
- `tools/lockstitch/render.js` uses `channel: 'chromium'`, which has no GPU here, and the unported harness.
- The large `sd` heads of K-01/K-09 (17–19 MiB) are mostly the 1024×512 HDRI tables (16 MiB).

### What was tricky to build
- Keeping measured, read and proposed statements separate; the guide labels each.

### What warrants a second pair of eyes
- OptiX API names (OptiX 8/9: `optixModuleCreate`, `optixTraverse`/`optixReorder`/`optixInvoke`, denoiser model
  kinds) are from knowledge, not from installed headers (none installed); the guide says to check them.
- The NVENC capability of GB10 (AV1, 10-bit HEVC) is unverified and marked as an open question.

### What should be done in the future
- Steps 1–3 as tasks 3–5 in `tasks.md`.

### Code review instructions
- Read the guide top to bottom; spot-check §2.6 buffer table against `pack` and §2.8 limits against
  `GPURenderer.create`.

### Technical details
- Second-pass review notes (recorded before revising):
  - Comprehension: BVH, SAH, NEE, MIS, Russian roulette, AOV, EV100, à-trous used before explanation → added
    §2.1 "Path tracing in one page".
  - Fact: B-01 roughness is 0.4 (draft said 0.35).
  - Fact: limits are capped in code (10 buffers, 1 GiB) → rewrote §2.8, added refactor 5.2.3 (lift the cap, split `sd`).
  - Fact: `render.js` default stitch is 2 s → step-1 estimate is ~4 min per stitch at 1080p/64 spp, not 8.
  - Clarity: `vp.seek` in the step-2 sketch is proposed API → labelled; K-09 param ids (`scene`, `stitch`,
    `orbit`) named in step 1; "the earlier plan" defined in §1; section numbers and cross-references renumbered.

## Step 3: Upload to reMarkable (one failure, worked around)

Uploaded the guide as one PDF. The first attempt failed inside remarquee's PDF conversion because its built-in LaTeX
header loads a package this machine's TeX installation does not have; a header file without that package fixed it.

### Prompt Context
**User prompt (verbatim):** (see Step 1)
**Assistant interpretation:** Deliver the stored guide to reMarkable.
**Inferred user intent:** Read the guide on the device.

### Evidence and commits
- Guide commit: `9af5365`.
- Failure: `remarquee upload bundle <guide> --name "CANDELA-002 Candela on the DGX Spark - intern guide"
  --remote-dir /ai/2026/11/21/CANDELA-002 --toc-depth 2 --non-interactive` →
  `Error: pandoc failed: Error producing PDF. ! LaTeX Error: File 'stmaryrd.sty' not found.` (exit status 43).
- Isolation: a two-line Markdown file renders with plain `pandoc --pdf-engine=xelatex`; `kpsewhich stmaryrd.sty`
  finds nothing; `strings $(which remarquee)` shows the built-in header starts with `\usepackage{stmaryrd}` (for
  `\llbracket` in chat math). The guide contains no math, so the package is not needed.
- Fix: `scripts/06-remarquee-header-no-stmaryrd.tex` (the built-in header minus `stmaryrd`) passed as
  `--latex-header-file` → `OK: uploaded CANDELA-002 Candela on the DGX Spark - intern guide.pdf -> /ai/2026/11/21/CANDELA-002`.
- Evidence level: upload result only (cloud delivery; no device listing or rendered-PDF inspection).

### Noteworthy decisions or failures
- Did not install `texlive-science` (system package, needs sudo); the header override is local to this upload.
  Every remarquee upload on this machine will hit the same error until `stmaryrd` is installed or the header is
  overridden.

### Remaining requirements and next action
- Implementation tasks 3–5 (steps 1–3) are open; the guide is a design, not an implementation.

## Step 4: Tooling installed; NVENC verified; OptiX SDK inspected

The user installed `texlive-science`, `ffmpeg`, `vulkan-tools`, `openexr` and `ninja-build`, and downloaded the OptiX
SDK. I verified NVENC on the GB10 and inspected the SDK installer without running it.

### Prompt Context
**User prompts (verbatim):** "install texlive-science", "what do I need to install to go further?", "check ~/DOwnloads",
"all the rest is installed", "it says it should have arm64 too"
**Assistant interpretation:** Confirm the prerequisites for steps 2–3 are in place and check the downloaded SDK.
**Inferred user intent:** Unblock the implementation steps.

### Evidence and commits
- `texlive-science` 2023.20240207-1 installed (by the user; my `sudo -n` failed: `sudo: a password is required`).
- NVENC: `various/07-nvenc-probe.txt` — 4K H.264, HEVC Main 10, AV1 10-bit and HEVC 4:4:4 all encode; this closes
  the guide's NVENC open question (guide §3.5 and §9 updated).
- `~/Downloads/NVIDIA-OptiX-SDK-9.1.0-linux64-x86_64.sh` (sha256 `4902adeb…c8585`), a CPack self-extracting
  archive (payload = `tail -n +216 | gunzip | tar`). Listed without running: 1105 entries — `include/optix*.h`
  (19 headers), `SDK/` (sample sources, CMake, data), `doc/`, licences, and `lib64/libglfw.so.3.4`, the only
  native binary, built for x86_64.

### Noteworthy decisions or failures
- Did not run the installer: it requires accepting NVIDIA's EULA (`--skip-license` would accept it on the user's
  behalf).

### Remaining requirements and next action
- Choose the SDK package (aarch64 installer or this one) and install to `~/opt/`; then build `optixTriangle`
  for `sm_121` (step 3, phase 1).

## Step 5: OptiX SDK 9.1 installed and built; it cannot run on this driver

Installed the aarch64 OptiX SDK and built the `optixTriangle` sample for `sm_121` to verify it. The build works;
running fails because the driver's OptiX runtime is older than the SDK.

### Prompt Context
**User prompt (verbatim):** "ko, downloaded aarch64, install the other one"
**Assistant interpretation:** Install the aarch64 SDK (the one just downloaded, "the other one" relative to the x86_64
file inspected before); the instruction to install covers accepting the licence.
**Inferred user intent:** Get OptiX working so step 3 can start.

### What I did
- Checked the installer: CPack header identical to the x86_64 one apart from the architecture name; the aarch64
  payload bundles no prebuilt libraries. `sha256 bc9fd96f…62b88`.
- `sh NVIDIA-OptiX-SDK-9.1.0-linux64-aarch64.sh --prefix=$HOME/opt --include-subdir --skip-license` →
  `~/opt/NVIDIA-OptiX-SDK-9.1.0-linux64-aarch64` (`OPTIX_VERSION 90100`).
- Configured the SDK samples out of tree in `~/opt/optix-9.1.0-build` with Ninja and `CUDA_MIN_SM_TARGET=sm_121`;
  built `optixTriangle`; ran it with `--file`.

### Why
- Building one sample is the cheapest proof that headers, nvcc and the driver runtime work together.

### What worked
- `ninja optixTriangle` → `[40/40] Linking CXX executable bin/optixTriangle` (OptiX-IR compiled by nvcc 13.0 for sm_121).

### What didn't work
- First configure: `CMake Error at support/glfw-3.4/src/CMakeLists.txt:192 (message): Xinerama headers not found;
  install libxinerama development package`. Worked around with `-DGLFW_BUILD_X11=OFF -DGLFW_BUILD_WAYLAND=OFF`
  (GLFW's null platform; the samples can still write images with `--file`).
- Run: `Caught exception: OPTIX_ERROR_UNSUPPORTED_ABI_VERSION: Optix call 'optixInit()' failed`.

### What I learned
- `strings /usr/lib/aarch64-linux-gnu/libnvoptix.so.1` → `OptiX Version:[9.0002.0.0.0.0] Branch:[r582_73] … ABI
  Version:[110]`. SDK 9.1.0 has `OPTIX_ABI_VERSION 118` (`include/optix_function_table.h`). The guide's earlier
  "driver 580 is new enough for OptiX 9.x" was wrong for 9.1; corrected in §6.1 and §9.

### What was tricky to build
- Nothing beyond the GLFW platform flags.

### What warrants a second pair of eyes
- Whether to update the DGX OS driver (affects the whole machine) or pin SDK 9.0.x.

### What should be done in the future
- Get the OptiX SDK 9.0.x aarch64 installer (NVIDIA's previous-versions page), install beside 9.1, rebuild
  `optixTriangle`, run it. Or update the driver to one whose OptiX runtime reports ABI ≥ 118.

### Code review instructions
- `various/08-optix-sdk-install.txt` has the commands and outputs.

### Technical details
- Interactive SDK samples need `libxinerama-dev libxcursor-dev libxi-dev libxrandr-dev` (and Wayland/xkbcommon
  dev packages) for a windowed GLFW; not needed for `--file` output or for Candela's backend.

## Step 6: OptiX SDK 9.0.0 runs on the GB10 (step 3, phase 1 done)

Installed the 9.0.0 SDK the user downloaded, rebuilt `optixTriangle` for `sm_121`, and ran it: the first OptiX
program on this machine works.

### Prompt Context
**User prompt (verbatim):** "ok, 9.0.0 in ~/Downloads"
**Assistant interpretation:** Install SDK 9.0.0 (licence acceptance covered by the earlier install instruction) and verify.
**Inferred user intent:** Unblock step 3.

### Evidence and commits
- `NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64.sh`, sha256 `2ef1ca95…69fa4b`; header identical to 9.1.0's apart from the
  version; `OPTIX_ABI_VERSION 105` (≤ the driver runtime's 110).
- Install → `~/opt/NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64` (`OPTIX_VERSION 90000`); build dir `~/opt/optix-9.0.0-build`.
- `ninja optixTriangle` → `[44/44] Linking CXX executable bin/optixTriangle`; `./optixTriangle --file out.png` → exit 0,
  1024×768 PNG with the expected gradient triangle (`various/09-optixTriangle-9.0.0.png`).
- Full commands/outputs: `various/08-optix-sdk-install.txt`.

### Noteworthy decisions or failures
- My first parse of the installer's payload offset failed (`tail: invalid number of lines: '+'`) because the 9.0.0 header
  formats the line slightly differently; my fallback diff then dumped binary payload (49 MB output, saved by the
  harness). Read the line directly (`tail … +216`) instead; no effect on the install.
- Standardise on SDK 9.0.0 for the backend; keep 9.1.0 installed for a future driver.

### Remaining requirements and next action
- Step 3 phase 2: the scene package writer (TS) and reader (C++); phases 3–7 per guide §6.8. Steps 1 and 2 are also open.

## Step 7: Step 1 implemented — render any preset (and the lockstitch scenes) on the GPU from the command line

Re-uploaded the corrected guide as a new document (v2, so annotations on v1 survive), then implemented step 1:
`scripts/render-preset.ts` drives the built workbench in Playwright's headless shell with the GPU flags and runs a
job through the workbench's own render queue; `tools/lockstitch/render.ts` replaces `render.js` on top of it. One
1080p lockstitch stitch at 64 spp now takes 3.9 minutes on the GB10.

### Prompt Context
**User prompt (verbatim):** "ok, update, then continue, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
**Assistant interpretation:** Re-upload the revised guide, then implement the plan in order, starting with step 1.
**Inferred user intent:** Turn the design into working tools, with the diary as the record.
**Commit (code):** see the commit after this entry ("CANDELA-002: step 1 …")

### What I did
- `remarquee upload bundle <guide> --name "CANDELA-002 Candela on the DGX Spark - intern guide v2" …` →
  `OK: uploaded … intern guide v2.pdf -> /ai/2026/11/21/CANDELA-002` (default header; `stmaryrd` is installed now).
- Read `host.ts` (`params()`, `onParam` → static params rebuild after 30 ms, `_seq`, `building`/`compiling`, the
  `RenderQueue` job shape `{status, progress, note, files}`), `params.ts` (handle `set`, `isStatic`, choices are
  static), `tools/lockstitch/render.js` (source patching of `scene`/`stitch`/`orbit`, `end: dur - 1/fps`).
- Wrote `scripts/render-preset.ts`: `openSession` (serve `dist/`, launch with `GPU_ARGS`), `renderWith(session,
  opts)` (load `#preset`, refuse non-NVIDIA backends, apply params, `workbench.render({...job, autosave:false})`,
  poll, stream files back in 3 MiB base64 chunks via `page.exposeFunction`), `renderPreset`, `parseArgs`, CLI.
- Wrote `tools/lockstitch/render.ts` (same flags as `render.js`, one session for all scenes, params instead of
  source patching, default output `~/data/pbr-spark/lockstitch`); deleted `render.js`; `reel.sh` default dir; README;
  npm scripts `render`, `lockstitch`; `tools/` added to `tsconfig.json` `include`.
- Committed the `webgpu` dependency the user installed (`package.json`/`package-lock.json`).

### Why
- Going through `workbench.render` reuses `runRender` (seeding, exposure lock, sequences, encoders) instead of
  reimplementing output; the browser is only the GPU host here.
- Default output under `~/data/` per the global instruction for media.

### What worked
- B-01 1080p/64 spp still: 2.0 s; visually correct (red sphere, soft shadow).
- K-09 with `--param "scene=S-03 Rotary hook"`: rebuilt and rendered the rotary hook; 13-frame 720p MP4 (h264).
- Full stitch: `npx tsx tools/lockstitch/render.ts --scenes 7 --size 1920x1080 --spp 64` → 48 frames, 230.5 s render
  (13.3 spp/s), h264 High 1080p (`various/10-step1-render-preset.txt`).
- `npx tsc --noEmit -p .` clean (now including `tools/`).

### What didn't work
- First lockstitch run design flaw (caught before it bit): setting a static param to its current value (K-09's
  default scene `S-07 Whole head`) triggers no rebuild, so waiting for `_seq` to advance would time out after 60 s.
  Fixed by comparing `h.value` first and logging `(unchanged)`; verified by the S-07 still finishing in 2.0 s.

### What I learned
- The render queue's video path (WebCodecs H.264 in the browser) is not the bottleneck at 1080p: 48 frames encode
  inside the 230 s; the path tracer is (~4.8 s per 64-spp frame).
- 13.3 spp/s on the full stitch vs 12.4 in the throughput probe: per-sample overhead is amortised slightly better in
  a sequence.

### What was tricky to build
- Getting files out of the page: `job.files[].data` are `Uint8Array`s inside the page; `page.evaluate` return values
  are JSON-serialised, so a 1080p EXR or MP4 would be a huge array. Chunked base64 through an exposed function keeps
  each message ≤4 MiB and writes straight to disk.

### What warrants a second pair of eyes
- `renderWith` sets `workbench.running = false` before the job so the clock does not advance while a still renders;
  check that sequences still drive time through `seek` (the MP4 frames do animate in the 13-frame test).
- Numeric parsing of `--param`: a choice keeps the string; other string values that parse as numbers become numbers.
  Colour/vector params are not supported from the CLI yet.

### What should be done in the future
- Steps 2 and 3. A comparison against `render.js` on SwiftShader at 1080p/64 spp was not run (estimated >1 h).

### Code review instructions
- Start at `scripts/render-preset.ts` `renderWith`; then `tools/lockstitch/render.ts`.
- Validate: `npm run build && npx tsx tools/lockstitch/render.ts --still --scenes 3,7 --size 960x540 --spp 32`.

### Technical details
- GPU flags: `--use-angle=vulkan --enable-features=Vulkan --enable-unsafe-webgpu --ignore-gpu-blocklist`.
- Backend check: `/nvidia/i` against `vp.backend.name + vp.backend.info` ("WebGPU nvidia").

## Step 8: OptiX traversal spike — Candela's AO on the RT cores is ~16× the WebGPU kernel on K-09

The user asked "what about using optix?" while step 1 was finishing. Rather than argue from the plan, I built the
smallest thing that measures it: a version-0 scene package exported from the real build (triangles, instance
transforms from the packed object records, camera rows) and a C++ OptiX program running Candela's AO integrator on
it. Same scene, camera, radius and estimator as the WebGPU kernel's AO mode, so the two numbers compare directly.

Result: 1,721 vs 105 full-frame samples/s at 1080p (~16×), with matching images (mean AO 0.9894 in both, mean 8-bit
difference 0.10).

### Prompt Context
**User prompts (verbatim):** "you'll need a backend server, right?", "what about using optix?", "install",
"when something is missing, install it", "or tell me how"
**Assistant interpretation:** Show whether OptiX pays off on this machine before building the backend; install
missing dependencies (or give the sudo command) instead of working around them.
**Inferred user intent:** Decide where to invest: the Dawn runner (step 2) or OptiX (step 3).
**Commit (code):** see the commit after this entry ("CANDELA-002: OptiX traversal spike …")

### What I did
- Read how geometry reaches the GPU: `compile` returns `objects` (with `def` for meshes); `pack` writes 24 floats per
  object with the world→object 3×4 row-major matrix at +4 and `origIdx` at +21; `MeshDef.tris` is 24 floats per
  triangle (positions first); `cameraUniforms` gives U rows 1–4; `viewport.repack` passes `animation(t)` poses.
- `scripts/scene-package.ts` (v0): positions per unique mesh def → `geometry.bin`, instances with
  `inv34(Mi)` (= OptiX's instance transform layout), camera; planes/rects/boxes as exact triangles; `--engine` and
  `withEngine()` to override a scene's engine (prepend an import, append `export const engine`).
- `scripts/render-preset.ts`: `--engine` (same override through `setFile` + rebuild), timing from the queue's
  `job.ms` with 100 ms polling, and stills default to the preset's start time.
- `native/optix/`: `params.h`, `ao.cu` (raygen with Candela's camera and cosHemi AO, closest hit using
  `optixGetTriangleVertexData`, two misses), `main.cpp` (GAS per mesh with compaction, IAS, pipeline, SBT, timed
  launches, EXR writer), `CMakeLists.txt` (nvcc `-optix-ir` for sm_121, FetchContent for nlohmann/json), README.
- Ticket script `07-exr-stats.py` (EXR reader, coverage/mean, `--pgm`); run via `uv run --with numpy`.

### Why
- AO isolates traversal (one camera + one occlusion ray, almost no shading), which is exactly what OptiX changes.
- Using the packed object records and `cameraUniforms` means the package is the GPU's own view of the scene, so
  any mismatch would show up as an image difference, not be hidden by a second export path.

### What worked
- First build of `native/optix` compiled and linked cleanly; first run produced a correct image.
- `candela-optix-ao … --spp 1024` → `594.9 ms → 1721.2 full-frame spp/s, 3569 Msamples/s, 7138 Mrays/s`; GAS build
  for 36 meshes 22.6 ms.
- WebGPU: `render-preset.ts K-09 --engine "E.offline().integrator(I.ao({ radius: 0.05 }))" --spp 1024 --time 0` →
  104.7 spp/s; `07-exr-stats.py` mean 0.9894, coverage 1.0.
- Diff: mean 0.101, p99 3.0, 0.016% of pixels > 16 (`various/11-*`).

### What didn't work
- Appending `import … from 'candela'` at the end of `scene.js`: `scene.js: syntax error: Cannot use import
  statement outside a module`. Imports must lead the file → `withEngine` prepends the import.
- The AO PNGs were black: K-09 fixes exposure (EV 9.6 → ×1.07e-3), so AO ≈ 1 maps to black. The EXR comment
  ("beauty × exposure (1.0738e-3)") confirmed it; stats divide it out.
- First timing: 2 s polling made 64 spp and 256 spp look like 31.8 and 63.7 spp/s; switched to the queue's `job.ms`.
- First comparison showed different handwheel/disc angles: the WebGPU still rendered at the time the clock reached
  while loading, the package at t=0. Rerun with `--time 0` matched; fixed the default in `render-preset.ts`.
- `import numpy` failed (not installed; `sudo -n apt-get install python3-numpy` → `sudo: a password is required`).
  Started rewriting the reader without numpy; the user interrupted ("install", "when something is missing, install
  it", "or tell me how"). Used `uv run --with numpy` (no sudo) instead and saved that preference to memory.
- `nlohmann/json` missing → CMake FetchContent of the v3.11.3 release (system alternative noted in the README).

### What I learned
- OptiX's instance transform is the same 3×4 row-major layout Candela's `pack` uses, so instances map one to one.
- K-09's 23.7k triangles compact to a 671 KiB GAS total; building all of them takes ~23 ms, so rebuilding per frame
  is affordable, and animated poses only need an IAS refit/rebuild (7 KiB).
- Earlier step-1 stills without `--time` were rendered at a load-dependent time (not reproducible).

### What was tricky to build
- Making the comparison honest: same estimator (camera jitter, Ng facing the ray, 4·EPS offset, cosine lobe,
  radius), same geometry including the backdrop plane and box, same time; and checking both mean and per-pixel
  difference before believing the ratio.

### What warrants a second pair of eyes
- The 16× is for AO. The path tracer shades every bounce, samples lights and (on WebGPU) waits per sample; its
  OptiX speed-up is not measured yet. Expect less than 16×; how much less is what phases 3–5 will show.
- `main.cpp` leaks device buffers (one-shot benchmark); fine for the spike, not for the backend.

### What should be done in the future
- Step 3 phase 2 proper: package v1 (materials, lights, env, params, normals/uvs, motion) and the WGSL→CUDA translator.
- Decide whether step 2 (Dawn runner) is still worth doing before OptiX (see the reply to the user).

### Code review instructions
- `scripts/scene-package.ts` `scenePackage()`; `native/optix/src/ao.cu`; `native/optix/src/main.cpp` from
  "geometry:" to "launch".
- Reproduce: `npx tsx scripts/scene-package.ts K-09 && cmake -G Ninja -S native/optix -B build/optix && ninja -C
  build/optix && ./build/optix/candela-optix-ao ~/data/pbr-spark/packages/K-09 --spp 1024`.

### Technical details
- Payload: camera ray 4 × u32 (t, Ng.xyz), shadow ray 1 × u32 (visible). SBT: 1 raygen, 2 misses, 2 hit records
  (stride RAY_TYPES = 2), instance sbtOffset 0. Pipeline: single-level instancing, maxTraceDepth 1, stack sizes from
  `optixUtilComputeStackSizes`, max traversable depth 2.
- Build flags: GAS `PREFER_FAST_TRACE | ALLOW_RANDOM_VERTEX_ACCESS | ALLOW_COMPACTION`; geometry `DISABLE_ANYHIT`.
