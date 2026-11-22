---
Title: 'Candela on the DGX Spark: intern guide to the renderer and the GPU plan'
Ticket: CANDELA-002
Status: active
Topics:
    - pbr
    - gpu
    - webgpu
    - optix
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://src/engine/compile.ts
      Note: 'compile and pack: objects, generated WGSL, GPU buffers'
    - Path: repo://src/engine/kernel.ts
      Note: The WGSL path tracer (renderPixel, tracePath, traceAll, hitMesh)
    - Path: repo://src/engine/output.ts
      Note: runRender and per-sample accumulate loop
    - Path: repo://src/engine/render.ts
      Note: WebGPU/WebGL2 backends; limits caps
    - Path: repo://tools/lockstitch/render.js
      Note: Lockstitch headless renderer to port for step 1
    - Path: repo://ttmp/2026/11/21/CANDELA-002--fast-candela-rendering-on-the-dgx-spark-gpu-browser-native-webgpu-runner-optix-backend/scripts/02-throughput.ts
      Note: Throughput measurement on the GB10
ExternalSources: []
Summary: 'How Candela turns a scene file into path-traced pixels, what the DGX Spark measures, and a phased plan: GPU browser rendering, a native Dawn runner with NVENC, and an OptiX backend.'
LastUpdated: 2026-11-21T19:54:26.673698373-05:00
WhatFor: Onboarding an intern onto the renderer and the Spark GPU work
WhenToUse: Before touching src/engine render/compile/kernel code or starting any of the three GPU steps
---

# Candela on the DGX Spark: a guide to the renderer and the GPU plan

## 1. What this guide is for

Candela is a physically based renderer with a workbench around it. You write a scene in JavaScript (a sphere, a
light, a camera, materials described with physical quantities), and Candela compiles it into a GPU program that
*path traces* the image: it shoots random light paths from the camera, follows them as they bounce, and averages
many of them per pixel until the noise disappears. This repository holds the TypeScript port of Candela (ticket
`CANDELA-001`). The renderer currently runs only inside a web browser, through WebGPU or WebGL2.

This repository runs on an NVIDIA DGX Spark, a desktop machine with a Blackwell GPU. The work in this ticket is to
make Candela render fast on that machine, first by simply giving the browser the real GPU, then by running the
renderer outside the browser, and finally by writing a second backend on NVIDIA OptiX, which uses the GPU's
hardware ray-tracing units. These three steps come from an earlier plan written without access to this machine ("the
earlier plan" below); this guide checks its claims against measurements and corrects them where they differ. Section 2 explains the system as it is; section 3 reports what was measured on the
Spark; sections 4–6 design the three steps; section 7 covers testing; the appendices list files and APIs.

You should come away able to explain how a scene file becomes pixels, where the time goes, and what each of the
three steps changes. Read section 2 completely before starting any of the steps. Every claim about the code cites a
file; the inspected revision is `4a76f0c` (main).

**What is measured, what is read, what is proposed.** Section 3 contains measurements made on this machine on
2026-11-21 (scripts and raw outputs are in this ticket's `scripts/` and `various/`). Section 2 is derived from
reading the source. Sections 4–6 are proposals; nothing in them is implemented yet.

## 2. How Candela makes an image today

### 2.1 Path tracing in one page

A camera pixel's colour is the light arriving at the lens through that pixel. *Path tracing* estimates it by
random sampling: start a ray at the camera, find the first surface it hits, ask the surface's material (its
*BSDF*, the function describing how it reflects and transmits light) for a random new direction, and repeat. Each
such random path is one *sample*; averaging many samples per pixel (*spp*, samples per pixel) converges to the
correct image, and the leftover error appears as noise that falls with the square root of the sample count.

Four techniques reduce that noise, and the kernel uses all of them:

- **Next-event estimation (NEE).** At every bounce, also pick a point on a light and test whether it is visible
  (a *shadow ray*). Paths no longer need to hit a small light by chance.
- **Multiple importance sampling (MIS).** Light can arrive both through NEE and through the BSDF's own random
  direction; MIS weights the two estimates so neither double-counts and each is used where it is less noisy.
- **Russian roulette.** After a few bounces a path is terminated at random with a probability tied to how much
  light it can still carry, and survivors are weighted up. This keeps the estimate unbiased while saving work.
- **Denoising.** A filter that smooths the remaining noise using extra per-pixel images (*AOVs*, arbitrary output
  variables) such as the surface albedo and normal, which are noise-free and mark edges the filter must keep.

Finding "the first surface a ray hits" is the most expensive step. Testing every triangle would be hopeless, so
renderers group geometry in a *BVH* (bounding volume hierarchy): a tree of axis-aligned boxes, each containing its
children, with primitives at the leaves. A ray visits only the boxes it passes through. Building a good BVH uses
the *SAH* (surface area heuristic) to choose splits. GPUs since NVIDIA's Turing generation have *RT cores*,
fixed-function units that traverse BVHs and test triangles in hardware; they are only reachable through ray-tracing
APIs (OptiX, Vulkan ray tracing, DirectX Raytracing), not through WebGPU compute shaders.

*Exposure* is handled like a camera: the image is scaled by an exposure value in EV100 (the photographic scale at
ISO 100), metered automatically from the scene's luminance unless the camera fixes it. A *tone map* then compresses
the high dynamic range to a displayable image.

### 2.2 The big picture

A render passes through five stages. The first three run on the CPU in JavaScript; the last two run on the GPU.

```text
 scene.js (user code)            CPU (TypeScript, src/engine)                         GPU (WGSL / GLSL)
 ─────────────────────           ───────────────────────────────────────────           ─────────────────────────
 export default scene()   ──1──▶ build(): run the files, collect diagnostics
   .add(shape.sphere(1)…)        (candela.ts: runFiles, build)
                                          │ a scene component tree
                                          ▼
                          ──2──▶ compile(): walk the tree → objects, lights,
                                 materials; generate WGSL for materials/fields
                                 (compile.ts: compile, fx.ts: genFunction)
                                          │ compiled = { shared WGSL, pack(), stats … }
                                          ▼
                          ──3──▶ pack(): flatten into float buffers            ──4──▶ the path-tracing kernel
                                 U, objs, lits, bvh, sd (compile.ts: pack)            renderPixel → tracePath
                                          │                                           (kernel.ts), one dispatch
                                          ▼                                           per sample, accumulates
                                 Viewport.frame(): set uniforms, dispatch    ──────▶ into `accum`
                                 (viewport.ts, render.ts)                                    │
                                                                                     ──5──▶ post: denoise,
                                 runRender(): N samples → PNG / EXR / video  ◀────── tone map, sRGB
                                 (output.ts, video.ts)                                (kernel.ts POST)
```

The rest of this section walks through those stages with one running example, the `B-01` preset (a sphere on a
plane under daylight), and points out where heavier scenes such as `K-01` (gears made of triangle meshes) and `K-09`
(the lockstitch sewing-machine head) differ.

### 2.3 Stage 1: scene files and the build

A *preset* is a small project: notes in Markdown and one or more JavaScript files. `content/presets/B-01-hello-sphere.js`
is the whole scene:

```javascript
import { scene, shape, material, light, camera, units as u } from 'candela';

export default scene()
  .add(shape.sphere(1).at(0, 1, 0)
    .material(material.pbr().baseColor('#c8553d').roughness(0.4)))
  .add(shape.plane(30)
    .material(material.pbr().baseColor(0.18)))
  .light(light.daylight({ elevation: u.deg(40), turbidity: 3 }))
  .camera(camera.thinLens().at(0, 1.6, 6).lookAt(0, 0.9, 0));
```

The scene files are *not* bundled with the app. They are user code: the workbench edits them, and the engine runs
them at build time with its own small module system. `runFiles` in `src/engine/candela.ts` rewrites `import`/`export`
lines into calls on an internal `__req`/`__exports` pair (`transform`), then evaluates each file with
`new Function(...)`, passing the whole Candela API as parameters. `build(files)` then takes the default export (the
scene), an optional `engine` export, and an optional `animation(t)` export, and calls `compile`.

Two properties matter for the GPU work:

- **The build runs in Node unchanged.** `scripts/validate.ts` builds all 105 presets in Node with no browser. A
  native renderer can therefore reuse stages 1–3 exactly.
- **Errors are diagnostics, not crashes.** Builders throw `CandelaError` with a code (`E120` unit mismatch, …), and
  `build` returns `{ ok, diags, compiled, … }`. A native runner should print `formatDiag(d)` for each diagnostic.

### 2.4 Builders, components and fields

Each call such as `shape.sphere(1)` returns an immutable *component* (`Comp` in `src/engine/scene.ts`): a `kind`
string (`'shape.sphere'`), a `props` object, and metadata. Fluent methods return a new component with one property
changed. The compiler only reads the component tree; it never runs user code again.

Some properties are *fields*: values that vary over the surface or in time, such as a marble pattern or a
roughness map. A field is a node in a typed expression graph (`Node` in `src/engine/fx.ts`). The user builds it by
calling methods on a symbolic proxy (`fx.pattern(p => p.mul(10).sin())`), and the engine can evaluate the same
graph four ways: as WGSL code (`Gen`, `genFunction`), as JavaScript on the CPU (`evalNode`), as interval bounds
(`intervalOf`), and as text (`printNode`). This is the reason a CUDA backend is feasible: materials are already an
intermediate representation that a new code generator can print in another language (section 6.4).

*Params* (`src/engine/params.ts`) are named knobs. A dynamic param becomes a uniform slot (moving its slider writes
one float); a static param is baked into the shader (moving it rebuilds the kernel).

### 2.5 Stage 2: compile — from components to objects, lights and shader code

`compile(scene, engine)` in `src/engine/compile.ts` walks the component tree once and fills a compile state `S`:

- **Objects** (`S.objs`): every shape instance, with a type code, a material id, a transform recipe and shape
  parameters. Type codes come from `SHAPE_TYPE` (compile.ts:15): sphere 0, plane 1, rect 2, disk 3, box 4,
  cylinder 5, capsule 6, torus 7, roundbox 8, cone 9, prism 10, SDF 11, heightfield 12, **mesh 13**.
- **Lights** (`S.lights`): emissive shapes, point/spot/area lights; plus at most one sun, sky or environment
  (HDRI) and an optional fog.
- **Materials** (`S.mats`): one WGSL function `mat_<id>(h: Hit, wo: vec3f, u: f32) -> Lobe` per distinct material
  body; identical bodies are deduplicated (the `I205` info message reports this).
- **Generated code**: SDF distance functions, heightfields, medium densities, and a dispatcher
  `evalMaterial(h, wo, u)` that switches on `h.mat`.

The output, `compiled`, contains `shared` (the complete WGSL program text except the binding prelude),
`pack(env)` (a function, see 2.6), `objects`, `materials`, `stats`, the camera component, the engine configuration
and the motion-blur settings. The WGSL program is assembled as (compile.ts, near the end of `compile`):

```text
shared = "const SPECTRAL_ON …" + PRELUDE + SPECTRAL + ggxTable + sdfCode + hfCode + densCode
       + CORE + metalAt + matCode + PATH
```

`PRELUDE`, `SPECTRAL`, `CORE`, `PATH` and `POST` are hand-written WGSL in `src/engine/kernel.ts` (about 1500
lines). Everything else is generated per scene.

**Mesh data is built here too.** For each mesh *definition* (a shape that may be instanced many times),
`blasOf(def)` in `src/engine/mesh.ts` builds a bottom-level BVH (binned SAH, 12 bins, leaves of ≤4 triangles) and
packs it into the *static head* of the scene-data buffer: nodes as 8 floats, triangles as 28 floats (7 `vec4`, 112
bytes) each, in the order the kernel reads them. Per-face material tables and the HDRI environment's texture and
sampling tables also go into the head.

### 2.6 Stage 3: pack — the buffers the GPU reads

`compiled.pack({ time, poses, overrides, motion })` (compile.ts `pack`) turns the compile state into flat
`Float32Array`s. It is re-run whenever the clock ticks or a param moves; it is cheap because geometry lives in the
static head. Every GPU buffer is an array of `vec4<f32>` rows.

| buffer | binding | contents | row layout |
| --- | --- | --- | --- |
| `U` (uniforms) | 0 | camera, integrator settings, counts, fog, params | row 0 `[w, h, frameIx, sppPerFrame]`; rows 1–4 camera; row 5 `[1, maxDepth, rrAfter, flags]`; rows 17–18 fog; row 19 `[nObj, nLights, firstUnbounded, nBvhNodes]`; row 20 `[bladeRot, aoRadius, clamp, nMedia]`; row 21 `[whiteBalance.rgb, mode]`; row 24 `[seed, motion…]`; params from row 32 (`U_BASE`) |
| `objs` | 1 | one record per object, 6 rows | `[type, material, lightIdx, flags]`, inverse 3×4 transform (3 rows), shape params `pr`, `[irand, originalIndex, motionBase, bound]` |
| `lits` | 2 | one record per light, 6 rows | position/shape, power, colour temperature, … |
| `bvh` | 3 | top-level BVH over bounded objects, 2 rows per node | `[min.xyz, left|first]`, `[max.xyz, count]` |
| `sd` | 4 | scene data: static head + dynamic tail | head: mesh BVH nodes and triangles, face tables, HDRI; tail at `dynBase`: media (3 rows each), motion poses (2 rows per key) |
| `accum`, `aovA`, `aovN` | 5–7 | per-pixel sums (read-write) | colour + sample count, albedo, normal + depth |

Concrete sizes from `scripts/05-scene-stats.ts` (`various/06-scene-stats.txt`):

| preset | objects | meshes | triangles | `sd` head | WGSL lines |
| --- | --- | --- | --- | --- | --- |
| B-01 sphere | 2 | 0 | 0 | 0 | 1468 |
| M-07 car paint | 12 | 0 | 0 | 0 | 1518 |
| K-01 gear train | 15 | 7 | 12 024 | 17.2 MiB | 1811 |
| K-09 lockstitch | 36 | 34 | 23 701 | 19.0 MiB | 2078 |

Notice that the large heads are mostly the HDRI tables (a 1024×512 environment stored as two `vec4` per texel is
16 MiB, `envTables` in `src/engine/hdri.ts`); the K-09 triangles themselves are 23 701 × 112 B ≈ 2.5 MiB. The scenes
are small. This matters for the plan in section 3: the problem is not memory capacity.

**A correction to the earlier plan.** The lockstitch converter (`tools/lockstitch/convert.py`) stores meshes
quantised (int16 positions and normals, uint16 indices) *in the data file*, but the preset decodes them into
`Float32Array`s (`content/presets/K-09-lockstitch.js`, `mesh.fromArrays`), and the GPU receives full fp32
triangles. Quantised vertices are a storage format today, not a GPU format.

### 2.7 Stage 4: the path-tracing kernel

The kernel is one compute shader. The WebGPU backend wraps `shared` in an entry point (`GPURenderer.compile`,
`src/engine/render.ts`):

```wgsl
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let o: PixOut = renderPixel(vec2f(f32(gid.x), f32(gid.y)), u32(U(0).z));
  let ix: u32 = gid.y * u32(U(0).x) + gid.x;
  if (U(0).z < 0.5) { accum[ix] = o.c; /* first sample: overwrite */ }
  else { accum[ix] = accum[ix] + o.c; /* later samples: add */ }
}
```

One dispatch = one thread per pixel = `sppPerFrame` new samples for every pixel. The call tree inside the kernel
(all in `src/engine/kernel.ts`):

```text
renderPixel(px, frameIx)                       seed the PCG RNG from pixel, frame and U(24).x
 └─ for s in 0..sppPerFrame
     ├─ spectral? pick a hero wavelength gLam   (SPECTRAL_ON)
     ├─ gTau = shutter time for motion blur
     ├─ cameraRay(px, res)                      pinhole or thin lens (polygonal aperture)
     └─ tracePath(ro, rd)                       or traceAOV / customKernel / id pass (mode)
         for depth in 0..maxDepth
           h = traceScene(ro, rd)               ── traceAll: unbounded objects, then the top-level BVH
           │                                       └─ hitObj(i): transform the ray into object space,
           │                                          analytic intersection, or SDF march, or
           │                                          hitMesh: walk the mesh's BVH, Möller–Trumbore
           media: fog / interior medium, free-flight sampling, phase function
           miss → add environment (sky / studio / HDRI / sun) with MIS weight; stop
           L = evalMaterial(h, wo, u)           generated: material → a Lobe struct
           emission (MIS-weighted)
           neeAt(...)                           next-event estimation: sample one light, shadow ray (occluded)
           bs = sampleLobe(L, wo)               GGX/VNDF, dielectric, conductor, sheen, layers …
           beta *= weight; Russian roulette after rrAfter; optional clamp
```

Key properties to remember:

- **Traversal is software.** `traceAll` and `hitMesh` keep a stack in private memory (`array<i32, 40>` and
  `array<i32, 48>`) and load nodes and triangles from storage buffers with `bvhF(i)` / `sdF(i)`. The GPU's RT
  cores are never used; on the Spark every node and triangle test is ordinary shader arithmetic plus a memory load.
- **A two-level structure already exists.** The top-level BVH (`bvh` buffer) is over object instances; each mesh
  definition has its own BVH in `sd`, traversed in object space after transforming the ray by the instance's
  inverse matrix (`objs` rows 1–3). This is exactly the shape of OptiX's instance/geometry acceleration structures
  (section 6).
- **Motion blur** is per-sample time `gTau`; moving objects get `K` rigid poses (quaternion, translation, scale) in
  the `sd` tail, interpolated in `poseQ`/`poseT`, and their top-level boxes are swept over the shutter
  (`sweptBox` in compile.ts).
- **Global mutable state** (`var<private> rngS, gTime, gLam, gTau, gTri, gBary`) carries the RNG, time, wavelength
  and the last triangle hit between functions. A CUDA port must turn these into per-thread state.
- **Restricted WGSL.** The kernel is written in a subset (explicit types, no overloads, no pointers, no `switch`)
  so `src/engine/wgsl2glsl.ts` can translate it to GLSL ES 3.0 for WebGL2 with regular expressions. The same
  discipline makes a WGSL→CUDA C++ translation mostly mechanical.

### 2.8 The two browser backends

`src/engine/render.ts` has two classes with the same surface: `create`, `compile(compiled, displaySrc)`,
`resize(w, h)`, `upload(packed)`, `uploadSD(packed)`, `setUniforms(U)`, `trace()`, `display(D, denoise)`,
`idle()`, `readAccum()`, `readRGBA8()`, `readPasses` (via the viewport), `dispose()`. `type Backend = GPURenderer | GLRenderer`.

- **`GPURenderer` (WebGPU).** One compute pipeline per distinct `shared` source (cached, up to 24). Eight storage
  buffers, bindings 0–7 (table in 2.6). `trace()` records one compute pass of `ceil(w/8) × ceil(h/8)` workgroups and
  submits it. `display()` runs the post passes (à-trous denoise iterations into ping-pong buffers `tA`/`tB`, then
  tone map into an `rgba8unorm` storage texture) and blits to the canvas.
- **`GLRenderer` (WebGL2).** The same WGSL, translated to GLSL; buffers become float textures (`dataTex`); the kernel
  runs as a full-screen fragment shader accumulating into float render targets. It needs `EXT_color_buffer_float`.

`GPURenderer.create` requests raised limits, but caps them in code: at most 10 storage buffers per stage and at
most 1 GiB per binding and per buffer (`Math.min(adapter.limits…, 1 << 30)`). The "8 storage buffer limit" in the
earlier plan is the WebGPU *default*; the Spark's adapter offers 16 storage buffers and 2 GiB bindings (section 3).
The 1 GiB cap is the one that matters for large CAD assemblies: the whole scene-data buffer (`sd`) must fit in it,
which at 112 bytes per triangle is roughly 9 million triangles minus the HDRI tables. The 128 GiB of memory is not
reachable through one binding.

### 2.9 The viewport, accumulation and exposure

`Viewport` (`src/engine/viewport.ts`) owns a backend and a compiled scene. `load(compiled)` compiles the shaders and
uploads the packed buffers. Each call to `frame()`:

1. sizes the backend (canvas size × device pixel ratio × engine scale, or `fixedSize` for output renders);
2. writes uniform row 0 `[w, h, frameIx, sppPerFrame]` (`frameIx = 0` restarts accumulation), the camera rows and the
   integrator row;
3. `b.setUniforms(U); b.trace();` and adds `sppPerFrame` to `this.spp`;
4. optionally `show()` (post passes), and *meters* exposure after 2, 8 and 32 samples by reading the accumulation
   buffer back to the CPU (`readAccum`) and computing a centre-weighted log-average luminance (EV100).

Engines set the defaults (`engine` in `src/engine/scene.ts`): `realtime` (depth 5, `sppPerFrame` 1, denoise),
`offline` (depth 12, `sppPerFrame` 2), `preview` (half resolution), plus `.spectral()` for wavelength sampling.

### 2.10 Output: stills, EXR and video

`runRender(o, ctx)` in `src/engine/output.ts` is what the Render dialog, the agent and the lockstitch tool use. For
each frame it seeks the clock, sets the seed, and calls `accumulate`:

```typescript
// src/engine/output.ts — one sample per loop, and a full GPU wait each time
async function accumulate(vp, spp, signal, onStep) {
  vp.reset();
  while (vp.spp < spp) {
    vp.frame({ force: true, exclusive: true, display: false });
    await vp.backend.idle();            // queue.onSubmittedWorkDone(): CPU waits for the GPU
    …
  }
}
```

Then it writes PNG (`vp.snapshot`, a DOM canvas), EXR (`passesToEXR`: beauty, albedo, normal, depth, instance and
face ids; **uncompressed**, `writeEXR`), or feeds `VideoWriter` (`src/engine/video.ts`: WebCodecs `VideoEncoder`
plus Candela's own MP4 and WebM muxers). Exposure is metered on the first frame of a sequence and then held.

### 2.11 The lockstitch pipeline

`K-09` is the reason for the performance work. It is a sewing-machine head modelled in CAD (jig, OpenCascade) and
animated by a kinematic rig (kine). `tools/lockstitch/convert.py` turns the CAD tessellation and baked joint frames
into `content/presets/K-09-lockstitch/lockstitch-data.js`; the preset builds one mesh per body, assigns finishes
from CAD face metadata (`autoFinish`, `src/engine/finish.ts`), and exports `animation(t)`.
`tools/lockstitch/render.js` renders the seven scenes headless to MP4/PNG; `reel.sh` joins them with captions.

Two facts about `render.js` in *this* repository:

- It still loads the original harness (`../../test/harness.js`), which was not ported (`CANDELA-001` follow-up), so
  it does not run here as is.
- It launches `chromium.launch({ channel: 'chromium', … })`, the full Chromium in new-headless mode. Section 3
  shows that this binary does **not** get a GPU on the Spark; the headless *shell* does.

## 3. The machine and what was measured

### 3.1 The DGX Spark

From the probe (`various/00-hardware-probe.txt`): NVIDIA GB10 (Blackwell, compute capability **12.1**, so CUDA code
targets `sm_121`), driver 580.178.04, CUDA 13.0 (`nvcc` V13.0.88), Ubuntu 24.04 on aarch64 with 20 CPU cores and
121 GiB of memory shared by CPU and GPU (`Addressing Mode: ATS`). The OptiX runtime (`libnvoptix.so.1`) and the
NVENC library (`libnvidia-encode.so.1`) ship with the driver; the **OptiX SDK headers are not installed**, and there
is no system `ffmpeg`.

From the earlier plan, not verified here: 6144 CUDA cores, 5th-generation tensor cores, 4th-generation RT cores,
LPDDR5x at 273 GB/s. The bandwidth figure is the important one: path tracing reads BVH nodes and triangles in an
incoherent pattern, so memory traffic per ray is the quantity to minimise.

### 3.2 Can the browser reach the GPU? (step 1 of the plan)

`scripts/01-gpu-probe.ts` launches Playwright's Chromium (build 1255, Chrome 159, arm64) with several flag sets and
reads the WebGL renderer string and the WebGPU adapter from a page on `http://localhost` (WebGPU is only exposed in
secure contexts; `about:blank` hides `navigator.gpu`). Results (`various/01-gpu-probe.txt`):

| launch | WebGL2 renderer | WebGPU adapter |
| --- | --- | --- |
| headless shell, `--use-angle=swiftshader` (old harness) | SwiftShader | none |
| **headless shell, `--use-angle=vulkan --enable-features=Vulkan --enable-unsafe-webgpu`** | **ANGLE (NVIDIA, Vulkan 1.4.312, NVIDIA GB10)** | **vendor `nvidia`, 16 storage buffers/stage, 2 GiB bindings, no `shader-f16`** |
| `channel: 'chromium'` (new headless) + Vulkan flags | none | none |
| `channel: 'chromium'`, `--use-gl=egl` | SwiftShader | none |

So step 1 needs a flag change **and** the default headless shell instead of `channel: 'chromium'`.

### 3.3 How fast is the existing renderer on the GB10?

`scripts/02-throughput.ts` loads a preset in the built workbench (`dist/`), waits until the shaders are compiled,
and times a still through the real render queue (`host.render` → `runRender` → `accumulate`). Samples per pixel
per second (one run each, indicative ±10–20%; `various/02-…`, `03-…`):

| preset | size | WebGPU on GB10 | WebGL2 on GB10 | SwiftShader, 20 cores |
| --- | --- | --- | --- | --- |
| B-01 | 640×360 | 190 | 386 | 3.7 |
| B-01 | 1920×1080 | 94.5 | 92.3 | – |
| M-07 | 640×360 | 136 | 151 | – |
| M-07 | 1920×1080 | 23.8 | 22.4 | – |
| K-01 | 640×360 | 32.2 | 21.4 | 1.8 |
| K-01 | 1920×1080 | 4.5 | 3.2 | – |
| K-09 | 640×360 | 65.7 | – | – |
| K-09 | 1920×1080 | 12.4 | – | – |

What the table says:

- The GPU is 18× (K-01) to 51× (B-01) faster than SwiftShader on the same 20 cores; against the 2-core machine the
  earlier renders used, the factor is larger. "100×" is plausible for simple scenes, not for meshes.
- **Small frames are overhead-bound.** B-01 at 640×360 runs 386 samples/s on WebGL2 but only 190 on WebGPU, and
  WebGPU barely slows down from 640×360 to 1080p in absolute time per sample (5.3 ms → 10.6 ms for 9× the pixels).
  Each sample is a separate submit followed by a full CPU–GPU round trip (`accumulate` awaits `idle()`), plus the
  workbench's display and event loop. This is a deduction from the code and the scaling, not a profiler
  measurement.
- **Mesh scenes are traversal-bound.** K-01 at 1080p takes 222 ms per sample. The meshes are small (12k triangles),
  so the cost is software BVH traversal with private-memory stacks and 112-byte triangle loads, i.e. exactly what
  RT cores do in hardware.

One lockstitch stitch at the default 2 seconds (`stitch` param) and 24 fps is 48 frames; at 12.4 samples/s, 64
samples per frame at 1080p is about 4 minutes per stitch with step 1 alone (the zigzag scene is two stitches). That
number is the baseline the other steps must beat.

### 3.4 Native WebGPU in Node (input to step 2)

`scripts/04-dawn-probe.mjs` (`various/05-dawn-probe.txt`): the `webgpu` npm package (Dawn, version 0.6.2) ships a
`linux-arm64` binary and reaches the GB10 directly from Node: adapter `nvidia-gb10`, `maxBufferSize` 1 TiB,
`maxStorageBufferBindingSize` 2 GiB, 16 storage buffers per stage, features include `timestamp-query`, `subgroups`
and `primitive-index`. No `shader-f16`.

### 3.5 Video encoding (input to step 2)

`scripts/03-webcodecs-probe.ts` (`various/04-webcodecs-probe.txt`): Chromium's WebCodecs on this machine offers
**no hardware encoders**; software H.264 and VP9 only; HEVC 10-bit and AV1 10-bit are unsupported. NVENC is
therefore only reachable natively (ffmpeg built with `nvenc`, or the NVIDIA Video Codec SDK). Whether GB10's NVENC
supports AV1 and 10-bit HEVC is **not yet verified**; check with `ffmpeg -h encoder=hevc_nvenc` / a test encode once
an NVENC-enabled ffmpeg is installed.

## 4. Step 1: the existing renderer on the real GPU

**Goal.** Render the lockstitch scenes (and any preset) headless on the GB10 with no renderer changes, and measure.
Effort: a day.

**What changes.** A TypeScript port of `tools/lockstitch/render.js` into `scripts/`, built on the workbench's own
code instead of the unported harness, launching the headless shell with GPU flags.

```text
 scripts/render-preset.ts ──▶ static server for dist/ ──▶ headless shell (ANGLE/Vulkan, WebGPU)
        │                                                     │  workbench page, #K-09
        │  page.evaluate: patch params, host.render(opts)     │  host.render → runRender → accumulate
        ◀──────────────────── files (base64) ─────────────────┘
        write PNG / MP4 to ~/data/pbr-spark/renders/<name>/
```

**API sketch** (proposal):

```typescript
// scripts/render-preset.ts <presetId> [--param id=value …] [--size 1920x1080] [--spp 64] [--still --time 1.2]
//   [--sequence --start 0 --end 4 --fps 24] [--format png|mp4|webm|exr] [--backend webgpu|webgl2] [--out dir]
interface RenderPresetOptions {
  preset: string;                         // e.g. 'K-09'
  params: Record<string, string | number>; // applied with host.params().find(p => p.id === id).set(v)
  job: { kind: 'still' | 'sequence'; width: number; height: number; spp: number; format: string;
         time?: number; start?: number; end?: number; fps?: number; seed?: number };
  backend: 'webgpu' | 'webgl2';
  outDir: string;
}
```

**Pseudocode.**

```text
launch headless shell with GPU_FLAGS                       // see scripts/shot.ts chromiumArgs
page.addInitScript(set localStorage 'candela.v1.backend' = backend)
page.goto(localhost/dist/index.html#<preset>)
wait until workbench.vp.compiled && !workbench.compiling
assert workbench.vp.backend.info mentions 'nvidia' / 'GB10'  // fail loudly on SwiftShader
for each --param: workbench.params().find(id).set(value); wait for rebuild
job = workbench.render({...opts, autosave: false})
poll job.status; print progress
files = job.files → base64 → write to outDir
```

The workbench's `host.render` already does exposure locking, seeding and sequence handling (section 2.10), so the
script stays small. The lockstitch scene choice and timing are ordinary params of K-09 (`scene`, a choice such as
`'S-03 Rotary hook'`; `stitch`, seconds per stitch; `orbit`, degrees per stitch), which removes the source-text
patching `render.js` does.

**Settings to try.** 1920×1080, 64–256 spp, `engine.offline()` (depth 12) and its `.spectral()` variant for finals.
Expect about 4 minutes per K-09 stitch at 1080p and 64 spp (section 3.3).

**Done when.** `vp.backend.info` reports NVIDIA in the script's output; K-09 renders a full stitch to MP4; the
samples/s for K-09 at 1080p are recorded in the ticket.

**Limits that remain.** Software traversal, per-sample round trips, software video encoding, uncompressed EXR.

## 5. Step 2: a native runner on Dawn

**Goal.** Run the same compiler and the same WGSL kernel outside the browser, from a Node command-line tool, and
fix the overheads the browser imposes. Effort: about a week.

### 5.1 What stays and what changes

```text
            browser workbench                             native runner (new)
 ┌────────────────────────────────────┐       ┌───────────────────────────────────────────┐
 │ build()  compile()  pack()   (same)│       │ build()  compile()  pack()          (same)│
 │ Viewport (DOM canvas, metering)    │       │ OfflineViewport (no DOM)                  │
 │ GPURenderer(navigator.gpu, canvas) │       │ GPURenderer(device from `webgpu`, no canvas)│
 │ accumulate: 1 dispatch, then wait  │       │ batch: N dispatches per submit, 1 wait    │
 │ WebCodecs + own muxers             │       │ ffmpeg (NVENC) via stdin pipe             │
 │ uncompressed EXR                   │       │ EXR with ZIP compression (node:zlib)      │
 └────────────────────────────────────┘       └───────────────────────────────────────────┘
```

The scene files, diagnostics, kernel and results are the same; only the host side changes.

### 5.2 Refactors in the engine (small, shared by both)

1. **Inject the GPU.** `GPURenderer.create(canvas)` reads `navigator.gpu` and configures a canvas context. Change it
   to `GPURenderer.create({ gpu, canvas? })`: with no canvas, skip `ctx.configure` and the blit in `display()`; the
   tone-mapped image stays in `outTex`, and `readRGBA8()` already copies from `outTex`.
2. **Remove DOM from the output path.** `Viewport.snapshot`/`snapshotCanvas` and `pngBytes` (output.ts) create a
   `<canvas>`; `readRGBA8()` returns `ImageData`. Return plain `{ width, height, data: Uint8ClampedArray }` from the
   backend and let the caller encode (canvas in the browser; a small PNG encoder over `node:zlib` in Node).
   `Viewport.frame` reads `window.devicePixelRatio` only when `fixedSize` is unset, which an offline render never
   does.
3. **Lift the 1 GiB cap** for the native runner: request the adapter's real `maxBufferSize` and
   `maxStorageBufferBindingSize` (2 GiB per binding on Dawn here), and split `sd` into a geometry buffer and an
   environment buffer so each has its own binding (16 storage buffers are available).
4. **Batch samples.** Replace `accumulate`'s "dispatch, wait" loop with "encode `k` dispatches in one command
   buffer, submit, wait once". Uniform row 0 changes per dispatch (`frameIx`), so either write `k` uniform
   buffers (one per dispatch) or raise `sppPerFrame` so one dispatch computes several samples per pixel
   (`renderPixel` already loops over `U(0).w`). Raising `sppPerFrame` is the smaller change; watch for GPU
   watchdog timeouts on very heavy scenes and cap one dispatch at roughly 100–200 ms.
5. **Meter without stalling.** Metering reads the whole accumulation buffer at 2, 8 and 32 samples; keep it, but
   meter on a downscaled copy or only on the first frame of a sequence (already the rule in `runRender`).

### 5.3 The runner

**API sketch** (proposal):

```typescript
// src/native/run.ts — usage: npx tsx src/native/run.ts K-09 --param scene='S-03 Rotary hook'
//   --size 1920x1080 --spp 128 --sequence 0..4 --fps 24 --format hevc10|av1|exr|png --out ~/data/pbr-spark/renders
import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);                       // GPUBufferUsage, GPUMapMode, … for render.ts

const gpu = create([]);                                   // Dawn instance; options are Dawn toggles
const backend = await GPURenderer.create({ gpu });        // refactor 5.2.1
const r = await build(preset.files);                      // stage 1, same as the browser
if (!r.ok) { r.diags.forEach(d => console.error(formatDiag(d))); process.exit(1); }
const vp = new OfflineViewport(backend);                  // proposed: Viewport without DOM, plus seek(t), which
                                                          // repacks with animation(t)'s poses (today host.seek does this)
await vp.load(r.compiled);
const sink = format === 'exr' ? exrSink(out) : format === 'png' ? pngSink(out) : ffmpegSink(out, codec, W, H, fps);
for (const t of frameTimes) {
  vp.seek(t); vp.seed = seed + f;                         // same seeding rule as runRender
  await vp.accumulateBatched(spp, { perDispatch: 8 });     // refactor 5.2.4
  await sink.add(await vp.readFrame());                   // RGBA8 for video/PNG, float passes for EXR
}
await sink.finish();
```

**The ffmpeg sink.** Frames go to ffmpeg's stdin as raw RGBA; ffmpeg converts and encodes on NVENC:

```text
ffmpeg -f rawvideo -pix_fmt rgba -s 1920x1080 -r 24 -i pipe:0 \
       -c:v hevc_nvenc -profile:v main10 -pix_fmt p010le -preset p7 -rc vbr -cq 16 out.mp4
# AV1 master, if GB10's NVENC supports it: -c:v av1_nvenc -pix_fmt p010le -preset p7 -cq 20 out.mkv
```

Honest 10-bit output needs more than 8 bits per channel from the renderer; the display pass writes `rgba8unorm`.
For 10-bit masters, add a display variant that writes `rgba16float` (or `rgb10a2unorm`) and pipe `rgba64le`/`gbrpf32le`
to ffmpeg. Treat this as a separate task after 8-bit NVENC works.

**EXR.** `writeEXR` in `src/engine/output.ts` writes `NO_COMPRESSION` scanlines. OpenEXR's `ZIP_COMPRESSION`
(16-scanline blocks, byte reorder and delta predictor, then zlib) is simple enough to implement in TypeScript with
`node:zlib`, which avoids a native OpenEXR dependency. Verify files with `exrinfo`/`exrcheck` or Python `OpenEXR`.

### 5.4 Expected gain and its limit

Step 2 removes per-sample round trips, the browser's event loop, and software video encoding. It does not change
the per-ray cost: K-01 at 1080p will stay close to its ~220 ms per sample, because that is spent in software BVH
traversal on the GPU. Measure with `timestamp-query` around the trace dispatch to separate GPU time from overhead.

**Done when.** `src/native/run.ts` renders K-09 to an HEVC (or H.264) NVENC file and to compressed EXR; B-01 at
640×360 reaches at least the WebGL2 browser number (386 samples/s); results match the browser renderer (section 7).

## 6. Step 3: an OptiX backend

**Goal.** Use the RT cores for BVH traversal and triangle tests, OptiX's AI denoiser for clean images at low sample
counts, and OptiX features the WebGPU kernel cannot express (curves for thread, SER for coherence). Effort: 2–4
weeks for a first version. This step needs the OptiX SDK headers (download from NVIDIA; the driver already has the
runtime).

### 6.1 Concepts for a newcomer

OptiX is a ray-tracing framework on top of CUDA. You do not write the traversal loop; you describe geometry and
provide *programs* that OptiX calls:

- **Acceleration structures.** A *GAS* (geometry acceleration structure) holds one set of primitives: triangles,
  curves, spheres, or custom primitives with your own intersection program. An *IAS* (instance acceleration
  structure) holds instances, each pointing to a GAS (or another IAS) with a 3×4 transform. Building and compacting
  them is a host call; traversal and triangle intersection run on the RT cores.
- **Programs.** *Ray generation* (one launch thread per pixel: makes camera rays, runs the path loop), *closest hit*
  (runs at the nearest intersection, reads the hit), *miss* (nothing was hit), *any hit* (may reject a hit, for
  alpha or clipping), *intersection* (for custom primitives). `optixTrace` starts traversal from device code.
- **Shader binding table (SBT).** A table of records; each record names a program group and carries your data
  (for example a material id). The instance's SBT offset and the geometry's SBT index select the record for a hit.
- **Payload.** A few 32-bit registers passed between `optixTrace` and the hit/miss programs.
- **SER (shader execution reordering).** Device calls (`optixTraverse` to find the hit without running programs,
  `optixReorder` with a coherence hint such as the material id, then `optixInvoke`) let the GPU regroup threads that
  will run the same material code. Path tracers with many materials benefit.
- **Motion.** Motion transforms (SRT keys: scale, rotation quaternion, translation) between an IAS and a child,
  with a time range; `optixTrace` takes a ray time.
- **Denoiser.** `optixDenoiserCreate` with a model kind (HDR, AOV, or temporal) and guide layers (albedo, normal,
  and for temporal mode the previous output and a flow field).

API names above follow the OptiX 8/9 SDK; check them against the headers you install (`optix_host.h`,
`optix_device.h`). The installed driver (580) is new enough for the OptiX 9.0 SDK, which requires R570 or later;
confirm the requirement for any later SDK release.

### 6.2 Mapping Candela onto OptiX

| Candela today (file) | OptiX version |
| --- | --- |
| mesh BVH per definition in `sd` (`blasOf`, `hitMesh`) | one triangle GAS per mesh definition, built from the same vertex arrays, compacted (`optixAccelCompact`) |
| top-level BVH over objects (`buildBVH`, `traceAll`) | one IAS; each object is an instance with its 3×4 matrix (inverse of `objs` rows 1–3) |
| analytic shapes (sphere … prism, types 0–10) | custom primitives with an intersection program reusing `hitObj`'s code, or OptiX spheres for type 0 |
| SDFs, heightfields (types 11, 12) | custom primitives whose intersection program sphere-traces the generated SDF/heightfield function |
| face id per triangle → face material table | `optixGetPrimitiveIndex()` → the same per-definition `triFace` array → face table |
| per-sample time `gTau`, K rigid poses per moving object | SRT motion transform per moving instance, keys from the same `{q, t, s}` poses; ray time = `gTau` |
| à-trous denoiser with albedo/normal (`POST`) | OptiX denoiser, HDR/AOV model, albedo + normal guides; temporal model for sequences |
| thread not drawn | curve primitives (round B-spline/Catmull-Rom) for the thread path |
| section cuts not carried over | an any-hit program that calls `optixIgnoreIntersection()` for hits beyond a clip plane |

### 6.3 Process architecture

Keep the scene language and the compiler in TypeScript, and add a native host program in C++ for OptiX. The two
communicate through a *scene package*: everything `compile`/`pack` already produce, plus CUDA source for the
materials.

```text
  TypeScript (Node)                                           C++ host (new: native/optix/)
  ─────────────────                                           ────────────────────────────────────────
  build() → compile() → pack()                                read package
  emitCuda(compiled)  ──▶ materials.cu (generated)            nvcc/NVRTC → OptiX-IR / PTX (sm_121)
  writeScenePackage() ──▶ scene.cdpk:                         optixModuleCreate, program groups, pipeline
       header (JSON): objects, lights, materials, camera,      build GAS per mesh def, IAS over objects,
         engine, motion, uniform layout, param values          motion transforms; compact
       blobs: vertices, normals, uvs, indices, triFace,        upload lights, env tables, uniforms
         face tables, HDRI tables, media, poses                 for each frame: update poses/uniforms,
                                                                 optixLaunch(w × h × 1), denoise, encode
  per frame: pack({time}) → small update (poses, params) ──▶  (stdin JSON lines or a pipe)
```

Alternatives considered: a Node native addon (N-API) calling OptiX directly — tighter integration but a C++ build
inside the Node toolchain on arm64 and harder crash isolation; or porting the compiler to C++ — duplicates the most
complex code. The package boundary keeps both sides testable on their own and lets the C++ side run without Node.

### 6.4 The CUDA emitter

Materials, SDFs, densities and custom kernels are generated from `fx` nodes by `Gen`/`genFunction`
(`src/engine/fx.ts`); the hand-written kernel pieces are WGSL strings in `kernel.ts`. Two routes produce CUDA:

1. **Translate WGSL to CUDA C++ text**, like `wgsl2glsl.ts` does for GLSL: `vec3f` → `float3` (with an operator
   header), `select(a, b, c)` → `(c ? b : a)`, `var x: T = …` → `T x = …`, `fn f(a: T) -> R` → `__device__ R f(T a)`,
   `array<i32, 48>` → `int[48]`, built-ins (`dot`, `cross`, `normalize`, `mix`, `fract`) → helpers in a header.
   The kernel's restricted WGSL subset (no pointers, overloads or `switch`) is what makes this tractable.
2. **Emit CUDA directly from `fx` nodes** by giving `Gen` a second target. Cleaner for generated code, but the
   hand-written kernel still needs route 1.

Proposal: route 1 for everything first (one translator, one source of truth), validated by compiling every
preset's translated code with `nvcc -arch=sm_121`; route 2 later if the translator gets in the way.

The parts that need rewriting rather than translating:

- `traceAll`/`hitMesh`/`hitAABB` → replaced by `optixTrace` (and the custom intersection programs).
- `var<private>` globals (`rngS`, `gLam`, `gTau`, `gTri`, `gBary`) → a per-thread `PathState` struct passed by
  reference, or payload registers where they cross `optixTrace`.
- `U(i)`, `objF(i)`, `litF(i)`, `sdF(i)` accessors → reads from a `LaunchParams` struct in constant memory holding
  device pointers.

### 6.5 Device programs (pseudocode)

```cpp
// sketch — native/optix/device/path.cu (not compiled; names follow OptiX 8/9)
struct LaunchParams {                      // __constant__ params
  float4* U; float4* objs; float4* lits; float4* sd;     // same rows as the WebGPU buffers
  float4* accum; float4* albedo; float4* normal;
  OptixTraversableHandle top;               // the IAS
  uint32_t width, height, frameIx, sppPerFrame;
};

extern "C" __global__ void __raygen__path() {
  uint3 ix = optixGetLaunchIndex();
  PathState st = seedState(ix, params.frameIx);           // same PCG seeding as renderPixel
  float3 sum = {0,0,0};
  for (int s = 0; s < params.sppPerFrame; ++s) {
    Ray r = cameraRay(st, ix);                             // translated from kernel.ts
    sum += tracePath(st, r);                               // the path loop, with optixTrace inside
  }
  accumulate(ix, sum);                                     // same overwrite/add rule as the WGSL entry
}

__device__ Hit traceScene(PathState& st, float3 o, float3 d) {
  HitPayload p;                                            // packed into payload registers
  optixTraverse(params.top, o, d, 1e-4f, 1e30f, st.tau /*ray time*/, 0xFF,
                OPTIX_RAY_FLAG_NONE, 0, 1, 0, p.r0, p.r1, …);
  optixReorder(materialHint(p) /*coherence hint*/, 8);     // SER: group threads by material
  optixInvoke(p.r0, p.r1, …);                              // runs closest-hit or miss
  return unpackHit(p);
}

extern "C" __global__ void __closesthit__mesh() {          // triangles
  uint32_t tri = optixGetPrimitiveIndex();
  float2 bc = optixGetTriangleBarycentrics();
  uint32_t obj = optixGetInstanceId();                     // index into objs
  writePayload(obj, tri, bc, optixGetRayTmax());           // shading happens in raygen (evalMaterial)
}
extern "C" __global__ void __intersection__analytic() {    // types 0–12: reuse hitObj's math in object space
  float t = hitLocal(type(obj), optixGetObjectRayOrigin(), optixGetObjectRayDirection(), params);
  if (t < optixGetRayTmax()) optixReportIntersection(t, 0);
}
extern "C" __global__ void __miss__env() { writeMissPayload(); }
```

Shading in the ray-generation program (rather than in closest-hit) keeps the path loop identical to the WGSL
`tracePath` and keeps payloads small (object id, primitive id, barycentrics, t). SER then sorts by the material the
thread is about to run.

### 6.6 Host program (pseudocode)

```cpp
// sketch — native/optix/host/main.cpp
optixInit();
OptixDeviceContext ctx; optixDeviceContextCreate(cuCtx, &opts, &ctx);
Package pkg = readPackage(argv[1]);                         // header JSON + blobs
std::string cu = pkg.materialsCu + kernelCu;                // generated + translated
OptixModule mod = compileModule(ctx, cu, "sm_121");         // NVRTC → OptiX-IR, then optixModuleCreate
Pipeline pipe = makePipeline(ctx, mod, {raygen, miss, closesthit_mesh, intersection_analytic, anyhit_clip});
for (MeshDef& m : pkg.meshes) m.gas = buildTriangleGAS(ctx, m.vertices, m.indices);   // compacted
OptixTraversableHandle ias = buildIAS(ctx, pkg.objects /* matrices, motion keys */);
Denoiser dn = makeDenoiser(ctx, temporal ? OPTIX_DENOISER_MODEL_KIND_TEMPORAL : OPTIX_DENOISER_MODEL_KIND_HDR);
for (Frame f : pkg.frames) {
  applyUpdate(f);                                           // poses → IAS refit or motion keys; params → U
  for (int done = 0; done < spp; done += perLaunch) optixLaunch(pipe, stream, params, sbt, W, H, 1);
  dn.run(accum, albedo, normal, prev);                      // guides from the same AOV buffers
  encoder.add(tonemap(denoised));                           // NVENC (ffmpeg pipe) or EXR
}
```

### 6.7 Spark-specific notes

- **Unified memory.** CPU and GPU share physical memory (ATS addressing), so large uploads are cheap; bandwidth is
  the limit. Compact acceleration structures; keep per-ray state small; let SER improve coherence.
- **Smaller triangles in the WebGPU path too.** Independently of OptiX, the WebGPU triangle record (112 bytes, with
  normals and UVs loaded during traversal) could be split into a 48-byte intersection record (v0, e1, e2, face) and a
  shading record read once per hit. This is a cheap experiment for step 2.
- **Two Sparks** connected by ConnectX-7 can split a sequence by frame with no renderer changes (the earlier plan's
  suggestion; not tested).

### 6.8 Phases for step 3

1. Install the OptiX SDK; build the SDK sample `optixTriangle` for `sm_121`; record the version.
2. Scene package writer in TypeScript (`src/native/package.ts`) plus a reader in C++; round-trip test on K-01.
3. WGSL→CUDA translator; compile every preset's output with `nvcc -arch=sm_121 -rdc=true` as a CI-style check.
4. Triangles only: GAS per mesh, IAS, raygen + closest hit + miss, path loop translated; K-01 renders.
5. Analytic and SDF shapes as custom primitives; all non-mesh presets render.
6. Motion transforms, SER, the denoiser (HDR then temporal), NVENC output.
7. Curves for the lockstitch thread and clip-plane any-hit for section cuts (new scene features; they need API work
   in `scene.ts` as well).

## 7. Testing and validation

The existing checks and what each step adds:

| check | today | what to add |
| --- | --- | --- |
| `npm run validate` | builds 105 presets in Node, WGSL→GLSL | for step 3: WGSL→CUDA translation and `nvcc` compile of each preset |
| `test.furnace(bsdf)` (`src/engine/test.ts`) | directional albedo of a BSDF, evaluated in JS | a *GPU* furnace scene (a sphere of the material under a uniform white environment) rendered by each backend; the image must be ~uniform 1 for lossless BSDFs |
| determinism (original `test/out.js`, not yet ported) | same seed → same image within one backend | keep per backend; across backends RNG streams differ, so compare statistically |
| throughput (`scripts/02-throughput.ts`) | samples/s per preset/size/backend | a native column (step 2) and an OptiX column (step 3) |

**Cross-backend comparison.** Two backends never produce the same noise, so compare converged images: render each
preset at high sample counts (e.g. 4096 spp at 480×270) on WebGPU and on the new backend, then require the mean
relative difference per 16×16 tile to be within a few percent, and inspect the worst tiles visually. Write the
comparison as a script that takes two EXRs.

**Performance claims** must come from repeated runs with GPU timestamps, reported as samples/s and as
Mrays/s (samples × pixels × average path length).

## 8. Decision records

**D1. Step 1 uses the headless shell, not `channel: 'chromium'`.** Context: the full Chromium binary in new-headless
mode had no GPU process here. Decision: launch Playwright's default (headless shell) with
`--use-angle=vulkan --enable-features=Vulkan --enable-unsafe-webgpu`. Consequence: `render.js` must change both its
flags and its channel. Status: verified by `01-gpu-probe.ts`.

**D2. The native runner reuses the TypeScript compiler and WGSL kernel.** Alternatives: a Rust/wgpu host (needs a
second compiler or a JS runtime anyway). Decision: Node + Dawn (`webgpu` package). Consequence: refactors in 5.2
benefit the browser too. Status: proposed; Dawn verified to reach the GB10.

**D3. OptiX lives in a separate C++ process fed by a scene package.** Alternatives: N-API addon; porting the
compiler. Decision: package boundary (6.3). Consequence: a versioned file format to maintain. Status: proposed.

**D4. CUDA code comes from translating the WGSL.** Alternative: a second `fx` code generator. Decision: translate
first (6.4). Consequence: the restricted-WGSL rule in `kernel.ts` becomes a hard requirement for all future kernel
code. Status: proposed.

## 9. Open questions

- Does GB10's NVENC support AV1 and 10-bit HEVC, and does Ubuntu's arm64 `ffmpeg` package include `nvenc`? Blocks
  the 10-bit master format, not the runner.
- Which OptiX SDK version to standardise on (9.0 or later) and how to distribute it (it requires an NVIDIA developer
  download, so it cannot be an npm dependency). Blocks step 3 phase 1.
- Is it acceptable that the OptiX backend shades in ray generation (simpler, identical path loop) rather than in
  closest-hit programs (more idiomatic, potentially faster with SER)? Decide after phase 4 measurements.
- The lockstitch thread geometry: where does a curve description come from (the kine rig, or a new jig export)?
  Blocks the curves feature, not the backend.

## 10. Where to start

```sh
npm install && npm run build
npx tsx ttmp/2026/11/21/CANDELA-002--*/scripts/01-gpu-probe.ts          # see the GB10 from the browser
npx tsx ttmp/2026/11/21/CANDELA-002--*/scripts/02-throughput.ts K-09    # baseline samples/s
```

Then read, in order: `src/engine/candela.ts` (`build`), `src/engine/compile.ts` (`compile`, `pack`),
`src/engine/kernel.ts` (`renderPixel`, `tracePath`, `traceAll`, `hitMesh`), `src/engine/render.ts`
(`GPURenderer`), `src/engine/viewport.ts` (`frame`), `src/engine/output.ts` (`runRender`, `accumulate`).

## Appendix A. File reference

| file | role |
| --- | --- |
| `src/engine/candela.ts` | public API object, scene-file module loader (`transform`, `runFiles`), `build` |
| `src/engine/scene.ts` | components (`Comp`), shape/material/light/camera/engine builders, `SHAPE_TYPE` users |
| `src/engine/fx.ts` | expression graph (`Node`, `node`, `E`), WGSL generation (`Gen`, `genFunction`), CPU evaluation |
| `src/engine/params.ts` | params and the param store |
| `src/engine/stdlib.ts`, `finish.ts`, `fragments.ts` | standard materials, finishes from CAD metadata, fragments |
| `src/engine/compile.ts` | `compile` (objects, lights, materials, generated WGSL), `pack` (buffers), motion poses, camera uniforms |
| `src/engine/mesh.ts` | mesh definitions, generators (gear, shaft, nut …), `blasOf` (mesh BVH), `rayMesh` (CPU picking) |
| `src/engine/hdri.ts` | HDR parsing, environment importance-sampling tables (`envTables`) |
| `src/engine/kernel.ts` | WGSL: `PRELUDE`, `SPECTRAL`, `CORE` (intersection, BVH, BSDF lobes, lights, media), `PATH` (`tracePath`, `renderPixel`), `POST` |
| `src/engine/wgsl2glsl.ts` | WGSL → GLSL ES 3.0 translation for WebGL2 |
| `src/engine/render.ts` | `GPURenderer` (WebGPU), `GLRenderer` (WebGL2), `type Backend` |
| `src/engine/viewport.ts` | `Viewport`: load, frame/accumulate, metering, display, readbacks |
| `src/engine/output.ts` | `runRender`, `accumulate`, EXR writer/reader, ZIP, `RenderQueue` |
| `src/engine/video.ts` | `VideoWriter` (WebCodecs), MP4 and WebM muxers |
| `src/app/host.ts` | workbench state; `render(opts)` enqueues output jobs |
| `tools/lockstitch/` | `convert.py` (CAD + rig → data module), `render.js` (headless renders, not yet ported), `reel.sh` |
| `content/presets/K-09-lockstitch.js` | the lockstitch scene and `animation(t)` |
| `scripts/validate.ts`, `scripts/shot.ts` | preset build check; headless screenshot (`chromiumArgs`) |
| this ticket's `scripts/01`–`05` | GPU probe, throughput, WebCodecs probe, Dawn probe, scene statistics |

## Appendix B. API reference (external)

| API | used for | entry points |
| --- | --- | --- |
| WebGPU (browser, `@webgpu/types`) | current backend | `navigator.gpu.requestAdapter`, `requestDevice({ requiredLimits })`, `createComputePipelineAsync`, `queue.submit`, `queue.onSubmittedWorkDone`, `buffer.mapAsync` |
| Dawn for Node (`webgpu` npm, 0.6.2) | step 2 | `create(options)` → a `GPU` object; `globals` (constants such as `GPUBufferUsage`) |
| Playwright | steps 1, tests | `chromium.launch({ args })`, `page.evaluate`, `page.waitForFunction` |
| ffmpeg + NVENC | step 2 video | `-f rawvideo -pix_fmt rgba -i pipe:0 -c:v hevc_nvenc|av1_nvenc|h264_nvenc` |
| OpenEXR file format | EXR output | scanline images, `ZIP_COMPRESSION` (zlib over 16-line blocks) |
| CUDA 13.0 | step 3 | `nvcc -arch=sm_121`, NVRTC, driver API `cuCtxCreate`/`cuMemAlloc` |
| OptiX 8/9 host (`optix_host.h`) | step 3 | `optixInit`, `optixDeviceContextCreate`, `optixModuleCreate`, `optixProgramGroupCreate`, `optixPipelineCreate`, `optixAccelBuild`, `optixAccelCompact`, `optixSbtRecordPackHeader`, `optixLaunch`, `optixDenoiserCreate`/`optixDenoiserInvoke` |
| OptiX device (`optix_device.h`) | step 3 | `optixGetLaunchIndex`, `optixTrace`, `optixTraverse`, `optixReorder`, `optixInvoke`, `optixGetPrimitiveIndex`, `optixGetTriangleBarycentrics`, `optixGetInstanceId`, `optixReportIntersection`, `optixIgnoreIntersection` |
