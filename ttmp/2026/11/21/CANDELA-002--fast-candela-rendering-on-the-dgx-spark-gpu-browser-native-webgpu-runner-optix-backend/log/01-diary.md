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
