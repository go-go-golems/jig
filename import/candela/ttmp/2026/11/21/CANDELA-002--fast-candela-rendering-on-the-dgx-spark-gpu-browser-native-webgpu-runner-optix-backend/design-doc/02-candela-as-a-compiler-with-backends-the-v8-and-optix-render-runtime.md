---
Title: 'Candela as a compiler with backends: the V8 and OptiX render runtime'
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
    - Path: repo://native/optix/src/main.cpp
      Note: spike patterns reused by candela-rt
    - Path: repo://src/app/host.ts
      Note: clock and behaviours move into SceneSession
    - Path: repo://src/engine/candela.ts
      Note: build sandbox (new Function, async modules, seeded Math)
    - Path: repo://src/engine/compile.ts
      Note: compile/pack to split into lower + targets
    - Path: repo://src/engine/fx.ts
      Note: Gen gains WGSL/CUDA dialects
    - Path: repo://src/engine/kernel.ts
      Note: 'WGSL kernel: traceAll replaced, rest translated to CUDA'
ExternalSources: []
Summary: 'Design and implementation guide for candela-rt: a native process that embeds V8 to run Candela scene files (with their animation, behaviour and param callbacks) and renders them with OptiX, offline and for a live workbench. Splits the engine into a target-neutral front end and two targets (WebGPU, OptiX).'
LastUpdated: 2026-11-21T21:06:25.636514406-05:00
WhatFor: 'Onboarding an intern to build the OptiX backend: what runs where, the interfaces between TypeScript, V8 and C++/CUDA, the phases and their tests.'
WhenToUse: Before changing compile/pack, before writing native/ code, and when deciding where a new piece of scene functionality belongs.
---

# Candela as a compiler with backends: the V8 and OptiX render runtime

## 1. What this document is for

> **Status (2026-11-21):** phase 0 done. `scripts/bundle-core.ts` bundles the engine core (`src/engine/core.ts`,
> 320 KiB, ES2020); `native/rt` builds `candela-rt digest`, which runs it in V8 10.2 embedded through `libnode`.
> All 105 presets build there (6.6 s in total; K-09 487 ms) and 104 match Node 26 byte for byte; the exception is
> D-02, whose `Math.random()` makes it differ between any two runs (`various/13-phase0-v8-embedding.txt`). Embedding
> note: the isolate uses `MicrotasksPolicy::kExplicit`, since the host drives promises itself.
>
> **Phase 1 (partial):** builds are deterministic (scene `Math.random` seeded per build; Node ↔ V8 105/105 identical);
> `tests/golden-pack.test.ts` gates refactors; `src/engine/session.ts` holds the clock, behaviours, poses, the pack
> `env` and the per-frame uniforms, used by the browser and by `candela-rt session` (6/6 moving presets identical to
> Node frame by frame). The `lower`/`SceneIR`/target split is deferred to phase 3, where the OptiX target defines
> what it needs.
>
> **Phase 2 done, with two changes to §5.6.** (1) `Gen` keeps emitting WGSL only: `wgsl2cuda.ts` translates the
> whole program (`compiled.shared`, kernel and generated code), as `wgsl2glsl.ts` already does for WebGL2; the
> generated code is in the same strict subset. (2) The translator sequences side effects: WGSL evaluates arguments
> left to right and `select` evaluates all three, C++ does neither, so calls to functions that write per-thread state
> (`rnd`, `traceAll`, … found by fixpoint) are hoisted into temporaries when a statement has two of them or one in a
> `select`. Without this the random streams diverged (`sampleLobe(L, wo, rnd2(), rnd())`). A plain-CUDA target
> (translated `traceAll` over Candela's BVH) runs in `candela-rt render`; `scripts/wgsl-render.ts` runs the same WGSL
> on Dawn in Node. All 105 presets compile with NVRTC (`--use_fast_math`, 4.5 s mean) and render; at 1 spp, 101/105
> agree with WebGPU on ≥ 99 % of pixels to 0.1 %; the other four differ only where the sine-based noise hash
> amplifies last-bit differences of `sin` (`various/15-phase2-cuda-translation.txt`).

Candela is a renderer whose scenes are JavaScript programs. Today those programs run in a web browser and are drawn
by a path tracer written in WGSL on WebGPU (or WebGL2). This document designs the next step: a native program,
`candela-rt`, that runs the same scene files on the DGX Spark, executes their JavaScript in an embedded V8 engine, and
draws them with NVIDIA OptiX on the GPU's ray-tracing hardware, both for offline renders (stills, animations, video)
and for a live workbench in the browser.

The document is written for an intern who has not worked on Candela, OptiX or V8 before. It explains each part of
the system before using it, then gives the design, the interfaces with pseudocode, the implementation phases with
their exit checks, and API and file references. Statements are labelled by status:

- **Implemented**: code that exists in the repository at commit `a752dd2` or earlier.
- **Measured**: numbers from this machine, with the evidence file in `various/`.
- **Proposed**: this design. Nothing in sections 5–10 exists yet unless it says so.

Read sections 2 and 3 completely before the design. The companion documents are
`design-doc/01-candela-on-the-dgx-spark-intern-guide-to-the-renderer-and-the-gpu-plan.md` (the renderer in depth,
path tracing, the Spark, steps 1–3 of the original plan) and the vault report *Candela on the DGX Spark: From a
JavaScript Scene API to OptiX Ray Tracing* (the OptiX spike and the first version of this design).

## 2. The system in one page

Candela is shaped like a compiler. A *front end* runs the user's scene program and produces an intermediate
representation; *targets* turn that representation into something a GPU can execute. The design makes this structure
explicit and adds a second target.

```text
                       ┌─────────────────────── TypeScript engine (runs in any V8) ───────────────────────┐
 scene.js  ──build──▶  │ front end: builders, fx closures,  ──lower──▶  SceneIR  ──▶ WebGPU target  ──────┼─▶ browser GPU
 (preset or user file) │ params, mesh generators, diagnostics           (data +      (WGSL, BVH, buffers) │
                       │                                                 callbacks)──▶ OptiX target   ──────┼─▶ candela-rt
                       │ per frame: session.frame(t) runs animation(t), behaviours, derived params        │   (C++/CUDA)
                       └──────────────────────────────────────────────────────────────────────────────────┘
```

The key decisions, each argued in section 4:

- The whole TypeScript engine, not only the scene file, runs inside V8 on the backend. C++ does what is
  target-specific and data-heavy: acceleration structures, compilation of CUDA, launches, accumulation, denoising,
  image and video output, serving the browser.
- The OptiX target reuses the WGSL kernel's data layout (its *buffer ABI*) and the kernel's own code, translated to
  CUDA. Only the traversal function `traceAll` is replaced, by `optixTrace`.
- The live workbench sends *inputs* (files, param values, camera, time) to the backend, not GPU buffers. Browser and
  backend each run the same engine on the same inputs; a hash of the resulting IR proves they agree.

Vocabulary used throughout:

| Term | Meaning |
| --- | --- |
| Preset | One of the example scenes in `content/presets/` (for example `B-01`, `K-09`). |
| Scene file | The JavaScript a preset or user provides (`scene.js` plus optional `lib/*.js`). |
| Engine | The TypeScript in `src/engine/`: the API the scene calls, the compiler, the kernel source. |
| Build | Running the scene file against the engine API (`build()` in `src/engine/candela.ts`). |
| Lower | Turning the built scene into target-neutral data (proposed split of today's `compile()`). |
| SceneIR | The target-neutral result of lowering: objects, meshes, materials as expression graphs, lights, camera, params, and the scene's callbacks. |
| Target | A backend of the compiler: WebGPU (today) or OptiX (proposed). |
| Callback | Scene code that runs after the build: `animation(t)`, `.behavior(fn)`, derived params (`P.x.map(fn)`). |
| Frame state | The numbers for one moment: object transforms, light records, uniform values. Produced by running callbacks. |
| Buffer ABI | The layout of the kernel's buffers (`U`, `objs`, `lits`, `sd`): which float means what. |
| Session | One open scene: files, assets, param values, camera, clock, behaviour state. |
| V8 isolate | An independent V8 JavaScript heap; the unit of sandboxing. |
| AOV | An extra per-pixel output (albedo, normal, depth) written next to the colour; the denoiser uses albedo and normal. |
| candela-rt | The proposed native program: V8 + OptiX + output + server. |

## 3. Background

### 3.1 Candela today (implemented)

A scene file is ordinary JavaScript that calls a builder API. The simplest preset, `B-01`, is:

```js
import { scene, shape, material, light, camera, units as u } from 'candela';

export default scene()
  .add(shape.sphere(1).at(0, 1, 0)
    .material(material.pbr().baseColor('#c8553d').roughness(0.4)))
  .add(shape.plane(30)
    .material(material.pbr().baseColor(0.18)))
  .light(light.daylight({ elevation: u.deg(40), turbidity: 3 }))
  .camera(camera.thinLens().at(0, 1.6, 6).lookAt(0, 0.9, 0));
```

The pipeline from that file to pixels has five stages. Each is a function you can find:

1. **`build(files)`** (`src/engine/candela.ts:101`). `runFiles` rewrites `import`/`export` into calls, wraps each
   module body in `async () => { … }`, creates it with `new Function`, and runs it with the API names in scope
   (`candela.ts:72–89`). Because the body is an async function, a scene may use `await`; because modules are created
   with `new Function`, the JavaScript engine must allow code generation from strings. The result is the scene's
   component tree, its optional `animation` export, and diagnostics.
2. **`compile(scene, engine)`** (`src/engine/compile.ts:167`). Lowers components to a list of objects (shape type,
   material, transform recipe), lights, materials and media, and generates WGSL: one function per material
   (`matCode`, `compile.ts:532`), per signed-distance field, per density field, a custom integrator if any
   (`genCustomKernel`, `compile.ts:562`). Expression graphs become WGSL through the `Gen` class (`src/engine/fx.ts:309`,
   `genFunction` at `fx.ts:373`). The generated code is concatenated with the hand-written kernel
   (`src/engine/kernel.ts`: `PRELUDE` line 5, `CORE` line 172, `PATH` line 1081) into `compiled.shared`. `compile`
   also does WebGPU-specific preparation: each mesh's BVH (`blasOf`, `src/engine/mesh.ts:331`), the environment
   sampling tables (`envTables`, `src/engine/hdri.ts:109`), the GGX albedo table (`ggxAlbedoTable`, `kernel.ts:1479`).
3. **`compiled.pack(env)`** (`compile.ts:633`). Evaluates everything that depends on time and params at one moment
   and writes flat `Float32Array`s: `U` (uniforms), `O` (6 rows per object), `LI` (6 rows per light), `BV` (top-level
   BVH), `SDs`/`SDd` (scene data head and tail). It calls the scene's poses (`env.poses`), evaluates transform recipes
   (`evalRecipeOf`, `compile.ts:805`) and param values.
4. **The viewport** (`src/engine/viewport.ts`). `repack(t)` (line 96) computes poses with `posesFor(t)` (line 112,
   which calls `compiled.animation(t)` and external poses) and calls `pack`; `frame()` (line 126) dispatches the
   kernel and counts samples; `show()` (line 171) runs the post pass. The backend objects in `src/engine/render.ts`
   (WebGPU, `GPURenderer.create` at line 101; WebGL2) implement `compile`, `resize`, `upload`, `uploadSD`,
   `setUniforms`, `trace`, `busy`, `display`, `readAccum`, `readBuf`, `idle`.
5. **The app host** (`src/app/host.ts`). Owns files, params and the clock. `build()` (line 126) rebuilds on static
   changes; `runBehaviors(dt)` (line 204) runs `.behavior()` callbacks every tick; `seek(t, dt)` (line 220) moves the
   clock, steps behaviours and repacks. The render queue (`src/engine/output.ts:180`, `runRender` at line 132,
   `accumulate` at line 114) renders stills and sequences through the viewport.

The kernel reads its buffers by index. The layout is the *buffer ABI*; both targets in this design keep it:

| Buffer | Rows (each a `vec4f`) |
| --- | --- |
| `U` | Row 0 `[w, h, frameIndex, samplesPerDispatch]`; rows 1–4 camera (origin + lens radius, right·tanH + focus, up·tanV + blades, forward + time); row 5 integrator; row 19 `[nObj, nLights, nBounded, nNodes]`; row 20 `[bladeRot, aoRadius, clamp, nMedia]`; param slots from row 32. |
| `objs` | 6 per object: `[type, material, light, flags]`, world→object 3×4 matrix (3 rows), shape params `pr`, `[irand, origIdx, motionBase, bound]`. For meshes `pr = [nodeBase, triBase, faceTable, 0]` into `sd`. |
| `lits` | 6 per light. |
| `bvh` | 2 per top-level node (WebGPU only). |
| `sd` | Head: per mesh its BVH nodes (8 floats) and triangle records (28 floats, 112 bytes: positions, normals, UVs), face tables, environment tables. Tail at `dynBase`: media, motion poses. |

### 3.2 What runs as JavaScript, and when (implemented; analysis)

Three groups of JavaScript run when a scene is used. The design depends on telling them apart.

| Group | Examples | Nature |
| --- | --- | --- |
| The scene's own code | Builder calls; K-09 decoding its base64 mesh data (`K-09-lockstitch.js:25–28`); D-02's `Math.random()` jitter | Small; must run wherever the scene is built |
| Engine front-end code the scene calls | `mesh.gear({ teeth })`, params, fx closures traced with proxies (`fx.ts:77`, `128–129`), diagnostics (`callSite`, `src/engine/diag.ts:49`) | Defines what the scene *is*; target-neutral |
| Engine lowering for a target | `blasOf`, `envTables` in the `sd` layout, WGSL generation, the GGX table as WGSL text, `pack`'s layout | Target-specific; partly number-heavy |

The scene's code does not stop running after the build. Four kinds of callbacks run later:

| Callback | Runs | Presets using it |
| --- | --- | --- |
| `export const animation = t => ({ id: pose, … })` | Every frame, once per motion-blur sample (`viewport.ts:99–105`) | K-01, K-02, K-07, K-08, K-09 |
| `.behavior((self, { t, dt, world, state }) => …)` | Every tick, stateful, integrates over `dt` (`host.ts:204–216`) | W-01 |
| Derived params `P.gloss.map(g => 1 - g)` | Whenever the source param changes; each has its own uniform slot (`src/engine/params.ts:99`) | B-02, W-03 |
| Static params (`.pick`, `.build`, choices) and edits | On change: the whole scene file runs again | E-01, E-04, E-07, X-05, K-09 |

External poses (`host.setPoses`, used by K-08) are data pushed from outside, not callbacks.

### 3.3 Measurements that drive the design (measured)

| What | Number | Evidence |
| --- | --- | --- |
| `build + compile`, V8 (Node 26) | B-01 72 ms, K-01 209 ms, K-09 570 ms | `various/12-build-timing-and-profile.txt` (`scripts/08-time-build.mts`) |
| Per-frame `animation(t) + pack` | B-01 0.04 ms, K-01 0.13 ms, K-09 0.24 ms | same |
| K-09 build profile (764 ms sampled) | diagnostics stack capture ~35%; `blasOf` 74 ms; `ggxAlbedoTable` 50 ms; `studioImg` + `envTables` 88 ms | same (`scripts/09-profile-build.mts`) |
| WebGPU path tracer, K-09 1080p | 13.2 full-frame samples/s | `various/11-optix-ao-spike.txt` |
| AO, K-09 1080p: WebGPU vs OptiX | 105 vs 1,721 full-frame samples/s (16×); images agree | `various/11-*` |
| OptiX GAS build, all 34 K-09 meshes | 22.6 ms; IAS 7.2 KiB | `various/11-*` |
| NVENC, 4K | 96 frames HEVC Main 10 / AV1 10-bit in 2.2–3.5 s | `various/07-nvenc-probe.txt` |

Two conclusions follow. JavaScript costs per frame are negligible even in an interpreter; build costs are dominated
by work that belongs to a target (and by diagnostics), not by the scene's code. And the GPU side is where OptiX pays
off, by an amount the full path tracer still has to show.

### 3.4 OptiX in brief

OptiX is NVIDIA's ray-tracing API on CUDA. The programmer supplies small CUDA functions (*programs*) and builds
*acceleration structures*; the GPU's RT cores do the traversal.

| Concept | Role in this design |
| --- | --- |
| GAS (geometry acceleration structure) | One per mesh definition (triangles), plus one per frame over the axis-aligned boxes of analytic objects (custom primitives). |
| IAS (instance acceleration structure) | Over mesh instances (3×4 object→world transform each) and the analytic GAS. Rebuilt per frame. |
| Raygen program | Calls the translated `renderPixel` for its pixel. |
| Closest-hit program | Triangles: reports instance id, primitive index, barycentrics. Analytic: reports the object id and `t` the intersection program found. |
| Intersection program | Analytic objects: calls the translated `hitObj`. |
| Miss program | Reports "no hit". |
| Payload | Registers carrying `t`, object id, triangle index, barycentrics, time. |
| Shader binding table (SBT) | Maps geometry and ray type to programs. |
| Module, pipeline | Compiled programs (OptiX-IR from NVRTC), linked into a pipeline. |
| Denoiser | AI denoiser fed with colour, albedo and normal images (`OPTIX_DENOISER_MODEL_KIND_AOV` in `optix_types.h`). |

The spike in `native/optix/` (implemented) shows each of these in about 300 lines: `src/main.cpp` builds GASes,
an IAS, a pipeline and an SBT; `src/ao.cu` has raygen, closest-hit and miss programs.

### 3.5 V8 embedding in brief

V8 is the JavaScript engine in Chrome and Node. It is a C++ library that a program can embed. Its main concepts:

| Concept | What it is |
| --- | --- |
| Platform | Process-wide services (worker threads for the compiler and GC). Initialised once. |
| `v8::Isolate` | An independent heap with its own garbage collector. Objects never cross isolates. One thread at a time may use an isolate. Memory limits are set per isolate (`ResourceConstraints`). |
| `v8::Context` | A global object (`globalThis`) and its built-ins inside an isolate. The host decides what the global object contains; a context with no host functions can do no I/O. |
| `Local<T>`, `HandleScope` | Handles to JavaScript values, valid while their scope is alive. `Global<T>` keeps a value alive across scopes. |
| `Script::Compile` / `Run` | Compile and run source text in a context. |
| `FunctionTemplate` | Exposes a C++ function to JavaScript (for `console.log`, `performance.now`, `atob`). |
| `ArrayBuffer` backing store | The memory behind typed arrays. C++ can read a `Float32Array`'s bytes directly, without copying. |
| Microtasks | Promise continuations. An embedder that calls an `async` function must run `PerformMicrotaskCheckpoint()` until the promise settles. |
| `TerminateExecution()` | Stops runaway JavaScript, callable from another thread (a watchdog). |

A minimal embedding, in the shape `candela-rt` will use:

```cpp
// once per process
auto platform = v8::platform::NewDefaultPlatform();      // with libnode: node::MultiIsolatePlatform::Create(n)
v8::V8::InitializePlatform(platform.get());
v8::V8::Initialize();

// one isolate per session
v8::Isolate::CreateParams cp;
cp.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();
cp.constraints.ConfigureDefaultsFromHeapSize(0, 2ull << 30);   // 2 GiB heap ceiling
v8::Isolate* iso = v8::Isolate::New(cp);
{
  v8::Isolate::Scope is(iso);
  v8::HandleScope hs(iso);
  auto global = v8::ObjectTemplate::New(iso);
  global->Set(iso, "__log", v8::FunctionTemplate::New(iso, HostLog));      // C++ callbacks
  auto ctx = v8::Context::New(iso, nullptr, global);
  ctx->AllowCodeGenerationFromStrings(true);                              // build() uses new Function
  v8::Context::Scope cs(ctx);
  auto src = v8::String::NewFromUtf8(iso, bundleText.c_str()).ToLocalChecked();
  v8::Script::Compile(ctx, src).ToLocalChecked()->Run(ctx).ToLocalChecked();   // defines globalThis.Candela
}
```

## 4. Design decisions

Each decision states the alternative considered.

**D1. Candela is a compiler with a front end and targets.** `compile()` is split into target-neutral *lowering*
(producing `SceneIR`) and *targets* that prepare GPU-specific data and code. *Alternative:* add an OptiX branch
inside `compile`/`pack`; rejected because every feature would then need to know about both targets.

**D2. The whole TypeScript engine runs in V8 on the backend.** The scene's API is a JavaScript DSL: closures are traced
with proxies, misuse is caught by `Symbol.toPrimitive` traps, diagnostics parse V8 stack traces, the browser needs the
same library. A C++ port would be a second implementation of the language, with drift and no measurable speed gain
(3.3). *Alternative:* run only the scene file in JavaScript and port the library to C++; rejected for these reasons.
C++ gets code by profile, not by layer: a function moves to C++ or CUDA when measurements show it matters
(environment tables are the first candidate).

**D3. V8 is embedded in the native process.** One process holds V8 and CUDA, so per-frame callbacks and typed arrays
cross with function calls and zero copies. *Alternatives:* QuickJS (an interpreter; its stack-trace format differs
from V8's, which `callSite` parses); Node as the outer process with OptiX as an addon (works, but `node:vm` is not a
security boundary and a CUDA fault takes Node with it either way). V8 comes from Ubuntu's `libnode-dev` (Node 18.19,
V8 10.2) in phase 0, behind a thin `JsRuntime` class so a self-built V8 can replace it.

**D4. The OptiX target keeps the buffer ABI and translates the kernel.** The kernel (1,513 lines) reads
`U`/`objs`/`lits`/`sd` by index; the OptiX target fills the same buffers and runs the same kernel, translated to CUDA.
Only `traceAll` (`kernel.ts:523`) is replaced. *Alternative:* a new CUDA kernel; rejected because it would duplicate
materials, lights, media, spectral rendering and post-processing, and every image difference would have many causes.

**D5. Generated code is emitted per dialect; the fixed kernel is translated at build time.** `Gen` and the glue
templates get a dialect parameter (`wgsl` | `cuda`). `kernel.ts` is translated by `wgsl2cuda` when the engine is
bundled, not per scene. The traversal shim is a hand-written CUDA file.

**D6. Triangle order is per target.** `finishHit` (`kernel.ts:456`) indexes triangle records in `sd` with the hit's
triangle index. WebGPU orders records by its BVH (`blasOf` reorders them); OptiX orders them as uploaded to the GAS.
The invariant is "GAS order equals `sd` record order". The OptiX target writes records in the mesh's original order
and never runs `blasOf`.

**D7. The live protocol carries inputs, not buffers.** The browser sends files, assets, param values, camera, time
and external poses; `candela-rt` builds and evaluates the scene itself and streams images back. Callbacks run on the
backend, so animation and behaviours keep running without the browser. This supersedes the buffer-level
`RemoteOptixBackend` sketch in the vault report.

**D8. Builds are deterministic and verified.** Browser and backend run the same engine bundle (checked by hash) on
the same inputs. `Math.random` inside scene code is replaced by a seeded generator (D-02 uses it), so both sides
produce identical scenes. A hash of the `SceneIR` is exchanged after every build; a mismatch is reported, not hidden.

**D9. One native process, supervised.** `candela-rt` holds V8, OptiX, output and the server. A crash loses no user
state: the browser owns files, params and camera, and resends them when it reconnects to the restarted process.
*Alternative:* separate server and GPU processes; rejected as more moving parts once V8 is in C++.

**D10. Step 2 of the original plan (a Dawn runner) is deferred.** `candela-rt` covers server-side jobs. A Dawn
target remains useful only as a fallback on machines without OptiX.

## 5. The TypeScript side (proposed)

### 5.1 The split

```text
today:   build ──▶ compile (lowering + WGSL + blasOf + envTables) ──▶ pack(env) (callbacks + layout) ──▶ viewport
design:  build ──▶ lower ──▶ SceneIR ──▶ target.prepare(ir) ──▶ TargetProgram + TargetStatic
                              │
                session.frame(t, dt): callbacks ──▶ FrameState ──▶ target.frame(ir, state) ──▶ TargetFrame
```

The types, in TypeScript (`src/engine/ir.ts` already exists for printing and explaining scenes; the new types go in
`src/engine/sceneir.ts` to avoid mixing the two):

```ts
// target-neutral: what the scene is
interface SceneIR {
  objects: IRObject[];        // shape type, shape params, material index, light index, flags, transform recipe, mesh ref
  meshes: IRMesh[];           // MeshDef: tris (24 floats/triangle), triFace, faces; content hash
  materials: IRMaterial[];    // expression graphs (fx nodes) + material kind
  lights: IRLight[]; media: IRMedium[]; env: IREnv | null; camera: IRCamera;
  fields: { sdfs: Node[]; heights: Node[]; densities: Node[] };
  params: IRParamSlot[];      // id, slot, type, derived?, static?
  engine: IREngine;           // integrator, sppPerFrame, post passes
  callbacks: { animation: ((t: number) => Poses) | null; behaviors: IRBehavior[] };
  hash: string;               // stable hash of everything above except callbacks' code identity
}

// the numbers for one moment: produced by running callbacks
interface FrameState {
  time: number;
  transforms: Float32Array;       // 12 per object, object→world, after poses and behaviour overrides
  motion: { samples: number; transforms: Float32Array } | null;   // K poses per moving object
  uniforms: Float32Array;         // param slot values, derived params included
  lights: Float32Array;           // evaluated light records
  camera: { U1: number[]; U2: number[]; U3: number[]; U4: number[] };
}

interface Target<P, S, F> {
  name: 'webgpu' | 'optix';
  prepare(ir: SceneIR): { program: P; stat: S };      // once per build
  frame(ir: SceneIR, st: FrameState): F;              // per frame
}
```

Lowering moves out of `compile()` everything that does not depend on the target: the object list, material graphs,
lights, media, param slots, the camera component. `FrameState` is the half of `pack()` that runs callbacks and
evaluates recipes and params; the other half, the buffer layout, moves into the targets.

### 5.2 The session (new: `src/engine/session.ts`)

The clock, behaviour state and external poses live in the app host today (`host.ts:204–232`) and in the viewport
(`posesFor`, `viewport.ts:112`). The backend needs them without a browser, so they move into an engine class that both
the browser host and `candela-rt` use:

```ts
class SceneSession {
  constructor(o: { engineVersion: string; seed: number });
  setFiles(files: Record<string, string>): void;        // scene.js, lib/*.js
  setAsset(name: string, bytes: ArrayBuffer): void;       // dropped .hdr files
  setParam(id: string, value: unknown): 'rebuild' | 'reevaluate';
  setPoses(p: Poses | ((t: number) => Poses) | null): void;
  async build(): Promise<{ ok: boolean; diags: Diag[]; ir: SceneIR | null; params: ParamDef[] }>;
  seek(t: number, dt?: number): void;                    // steps behaviours by dt; dt = 0 and t < now resets them
  frame(): FrameState;                                    // runs animation(t) (and motion samples), applies
                                                          // behaviour overrides, evaluates derived params
}
```

`seek` keeps today's semantics (`host.ts:220–226`): moving backwards with `dt = 0` resets behaviour state; behaviours
see `{ t, dt, world, state }`. The `world()` handle behaviours receive (`host.ts:311`) moves with them. The browser's
host becomes a thin wrapper that forwards to a `SceneSession`; that refactor is checked by the golden tests in 9.1.

### 5.3 Determinism

The build sandbox (`runFiles`, `candela.ts:77`) passes API names as `new Function` parameters. It also passes `Math`,
a copy of the real `Math` whose `random` is a seeded generator (PCG or xorshift) keyed by the session seed and the file
path. Two engines given the same files, seed and params then build identical scenes. `SceneIR.hash` is computed from
the lowered data (object records, mesh content hashes, material graph hashes, light data, param slots, engine
settings) and reported with every build.

### 5.4 The WebGPU target (refactor of existing code)

`WebGpuTarget.prepare` produces what `compile` produces today: `shared` (WGSL), the `sd` head (with `blasOf` and
`envTables`), `nU`. `WebGpuTarget.frame` produces `U`, `O`, `LI`, `BV`, `SDd` from a `FrameState`, exactly as `pack`
does now. The browser keeps working unchanged. The exit check is byte equality with today's `pack` (9.1).

### 5.5 The OptiX target (new: `src/engine/targets/optix.ts`)

```ts
interface OptixProgram {
  cuda: string;            // translated kernel + generated code (CUDA dialect) + traversal shim include
  hash: string;            // module cache key
  nU: number;              // uniform rows
  post: string;            // post pass, CUDA
}
interface OptixStatic {
  sdHead: Float32Array;    // triangle records in original order (no BVH nodes), face tables, env tables
  meshes: { hash: string; vertices: Float32Array; sdTriBase: number; count: number }[];   // 9 floats per triangle
}
interface OptixFrame {
  U: Float32Array; O: Float32Array; LI: Float32Array; SDd: Float32Array;     // the buffer ABI, as WebGPU
  instances: Float32Array;   // per mesh instance: [meshIndex, objectIndex, mask, 0, transform(12)]
  aabbs: Float32Array;       // per bounded analytic object: [minX, minY, minZ, maxX, maxY, maxZ] (swept if moving)
  aabbObjects: Int32Array;   // object index for each AABB
  unbounded: Int32Array;     // objects with no finite box (infinite planes), tested in the shim's loop
}
```

Rules the target follows:

- For mesh objects, `pr = [-1, triBase, faceTable, 0]`: no BVH node base, triangle base into the OptiX-ordered records.
- The instance transform is `inv34` of the world→object matrix it writes into `O` (the spike does this,
  `scripts/scene-package.ts`). OptiX's `OptixInstance::transform` is the same 3×4 row-major layout.
- Glowing objects (`flags & 1`, skipped by shadow rays in `traceAll`) get the camera mask bit but not the shadow
  mask bit.
- AABBs come from the boxes `pack` already computes for its BVH (`localBox`, `worldBox`, `sweptBox` in `compile.ts`).

### 5.6 Code generation: dialects

`Gen` (`fx.ts:309`) emits SSA lines such as `let t3: vec3f = (t1 * t2);`. Its coupling to WGSL is small:

| Piece | WGSL | CUDA |
| --- | --- | --- |
| Type table (`WT`, `fx.ts:34`) | `f32`, `bool`, `vec2f`, `vec3f`, `vec4f` | `float`, `bool`, `vec2f`, `vec3f`, `vec4f` (header structs) |
| Binding | `let t3: vec3f = e;` | `const vec3f t3 = e;` |
| Float literal | `1.0` | `1.0f` |
| Function header | `fn f(a: T) -> R {` | `__device__ R f(T a) {` |
| `select(f, t, c)` | as is | `((c) ? (t) : (f))` |
| Built-ins (`dot`, `mix`, `fract`, `clamp`, `normalize`) | as is | same names, provided by the header |

```ts
interface Dialect {
  type(t: 'f' | 'b' | 'v2' | 'v3' | 'v4'): string;
  bind(name: string, type: string, code: string): string;
  lit(x: number | number[], t: string): string;
  fnHeader(name: string, args: [string, string][], ret: string): string;
  select(f: string, t: string, c: string): string;
}
new Gen({ dialect: CUDA, ctx, uniform });   // default stays WGSL
```

The glue templates in `compile.ts` (`mat_<id>`, `evalMaterial`, `sdUser`, `heightAt`, `densityOf`, `customKernel`,
`metalAt`, `hitAlbedo`, `hitEmission`, `bumpH_<k>`) are rewritten as functions of a dialect.

The hand-written kernel is translated by `src/engine/wgsl2cuda.ts`, modelled on `wgsl2glsl.ts` (59 lines), when the
engine bundle is built. Its rules:

| WGSL | CUDA |
| --- | --- |
| `fn f(a: T) -> R {` | member function `__device__ R f(T a) {` |
| `let x: T = e;` / `var x: T = e;` | `const T x = e;` / `T x = e;` |
| `loop { … }` | `for (;;) { … }` |
| `array<f32, 40>` | `float x[40]` (declaration form) |
| `v.xyz`, `v.xy` | `v.xyz()`, `v.xy()` |
| `i32(x)`, `u32(x)`, `f32(x)` | `(int)(x)`, `(unsigned)(x)`, `(float)(x)`; vector forms via header |
| `bitcast<u32>(x)` / `bitcast<f32>(x)` | `__float_as_uint(x)` / `__uint_as_float(x)` |
| `var<private> g: T = v;` | member `T g = v;` of `struct Kernel` |
| `var<private> ETAB: array<f32, 256> = …` | `__constant__ float ETAB[256] = { … };` |
| storage accessors `U(i)`, `objF(i)`, `litF(i)`, `bvhF(i)`, `sdF(i)` | `params.U[i]`, `params.O[i]`, … (`float4*` in launch params) |

The `struct Kernel` wrapping is what makes per-thread globals correct: a CUDA `__device__` global is shared by all
threads, while a `Kernel` object lives in each thread's registers and local memory.

```cuda
struct Kernel {
  unsigned rngS = 1u; float gTime = 0.f; float gLam = 550.f; float gTau = 0.5f;
  int gTri = -1; vec2f gBary = vec2f(0.f, 0.f);
  #include "kernel.translated.inc"     // every kernel function as a member
  #include "generated.inc"             // materials, fields: emitted in the CUDA dialect per scene
  #include "traversal.inc"             // hand-written traceAll (6.4)
};
```

### 5.7 The engine bundle

`scripts/bundle-core.ts` uses esbuild to produce `dist-core/candela-core.js`: an IIFE that defines `globalThis.Candela`
with `SceneSession`, the targets, and the translated kernel text. It contains no DOM code. The host must provide:

| Global | Used by | Host implementation |
| --- | --- | --- |
| `console` | scene logs, engine warnings | C++ callback into the session log |
| `performance.now()` | `build` timing (`candela.ts:102`) | `std::chrono::steady_clock` |
| `atob` | K-09's data decoding | C++ base64 decoder |
| `new Function` | `runFiles` | `AllowCodeGenerationFromStrings(true)` |
| Promises | `build` is `async` | microtask checkpoints after each call |

No timers, `fetch`, `TextDecoder` or DOM APIs are used by the engine's front end or the presets (checked with `grep`).
The bundle's SHA-256 is its version; browser and backend compare it on connect.

## 6. The C++ side: candela-rt (proposed)

### 6.1 Structure and threads

```text
candela-rt
 ├─ main.cpp              CLI: render | serve | check
 ├─ js/JsRuntime          V8 platform, one isolate per session, host functions, bundle loading, watchdog
 ├─ js/SessionBridge      calls Candela.SceneSession methods; reads typed arrays zero-copy
 ├─ gpu/OptixRenderer     context, NVRTC + module cache, GAS cache, IAS/AABB per frame, SBT, launch,
 │                        accumulation, AOVs, post, denoiser
 ├─ gpu/kernels/          launch params header, raygen/hit/miss/intersection programs, traversal shim, vec header
 ├─ out/                  EXR writer, nvJPEG encoder, ffmpeg NVENC pipe
 └─ net/Server            HTTP (static dist/) + WebSocket protocol (section 7)

threads:  JS thread (owns the isolate: builds, frame evaluation)
          render thread (owns the CUDA stream: launches, accumulation, post, encode)
          net thread (WebSocket I/O)          ── they communicate through queues of small messages
```

V8 isolates are single-threaded, so all JavaScript runs on the JS thread. The render thread never calls V8; it receives
`FrameState`-derived buffers. During an animation job the JS thread evaluates frame *n+1* while the GPU renders
frame *n*.

### 6.2 JsRuntime and the session bridge

```cpp
class JsRuntime {
 public:
  explicit JsRuntime(const std::string& bundleJs, size_t heapLimit);
  // run fn(args...) on Candela.<path>; pump microtasks until a returned promise settles; throw on exception
  v8::Local<v8::Value> call(const char* method, std::initializer_list<v8::Local<v8::Value>> args);
  template <class T> std::span<const T> view(v8::Local<v8::Value> typedArray);   // zero-copy
  void interruptAfter(std::chrono::milliseconds limit);   // watchdog: TerminateExecution on overrun
};

// zero-copy read of a Float32Array
std::span<const float> floats(v8::Local<v8::Value> v) {
  auto a = v.As<v8::Float32Array>();
  auto* base = static_cast<const uint8_t*>(a->Buffer()->GetBackingStore()->Data());
  return { reinterpret_cast<const float*>(base + a->ByteOffset()), a->Length() };
}

// await a promise from C++
v8::Local<v8::Value> settle(v8::Isolate* iso, v8::Local<v8::Promise> p) {
  while (p->State() == v8::Promise::kPending) iso->PerformMicrotaskCheckpoint();
  if (p->State() == v8::Promise::kRejected) throw JsError(p->Result());
  return p->Result();
}
```

`SessionBridge` wraps one `SceneSession` object:

```cpp
BuildResult build(const Files&, const Params&, uint64_t seed);   // → diags, param defs, ir hash, OptixProgram, OptixStatic
FrameBuffers frame(double t, double dt);                          // → OptixFrame arrays (views into V8 memory)
```

The typed arrays a frame returns stay alive (as `v8::Global`) until the render thread has copied them to the GPU. On
the GB10, CPU and GPU share memory; copying is still the simple first version (`cudaMemcpyAsync` from the backing
store). A later optimisation allocates backing stores in CUDA-registered memory (`v8::ArrayBuffer::NewBackingStore`
with a custom deleter) so the GPU reads them directly.

Sandboxing: the session's context has only the host functions in 5.7. Scene code cannot open files or sockets. The
isolate has a heap limit (`ResourceConstraints`, `AddNearHeapLimitCallback` to fail a build instead of the process)
and every call runs under the watchdog (a build that loops forever is terminated with `TerminateExecution` and
reported as a diagnostic).

### 6.3 OptixRenderer

```cpp
class OptixRenderer {
 public:
  void setProgram(const OptixProgram&);   // module cache: hash → OptixModule; NVRTC compile on miss
  void setStatic(const OptixStatic&);      // upload sdHead; GAS per mesh, cached by mesh content hash
  void setFrame(const OptixFrame&);        // upload U/O/LI/SDd; build AABB GAS + IAS; resets accumulation
                                           // unless only the sample index changed
  void resize(int w, int h);
  void accumulate(int spp);                // launches of ~20 ms each (batch size adapts)
  Image post(const PostOptions&);          // exposure, tone map, optional OptiX denoiser
  std::vector<float> readAccum();          // float RGBA for EXR
};
```

Compilation path for a new program:

```cpp
nvrtcCreateProgram(&prog, cuda.c_str(), "candela.cu", nHeaders, headerSrcs, headerNames);
const char* opts[] = { "-optix-ir", "--gpu-architecture=compute_121", "-std=c++17", "-use_fast_math",
                       "-default-device", "-rdc=true", "-I<optix>/include", "-I<kernels>" };
nvrtcCompileProgram(prog, std::size(opts), opts);          // on failure: nvrtcGetProgramLog → diagnostic
nvrtcGetOptiXIRSize(prog, &n); nvrtcGetOptiXIR(prog, ir.data());
optixModuleCreate(ctx, &moduleOpts, &pipelineOpts, ir.data(), n, log, &logSize, &module);
```

The OptiX SDK's samples use these NVRTC options (`SDK/CMakeLists.txt`, `CUDA_NVRTC_FLAGS`); the OptiX runtime also
keeps an on-disk cache (`/var/tmp/OptixCache_<user>`). How long this takes for a 2,000-line kernel is measured in
phase 2.

Acceleration structures:

- **Mesh GASes**: built once per mesh content hash with `PREFER_FAST_TRACE | ALLOW_COMPACTION`, from
  `OptixStatic.meshes[i].vertices`. A static param change that keeps the meshes reuses them.
- **Analytic GASes**: custom-primitive GASes per frame over `aabbs`, with `aabbObjects` as the primitive→object map
  (a device array). Visibility masks apply per instance, not per primitive, so glowing analytic objects (which
  shadow rays skip) go into a second analytic GAS whose instance lacks the shadow mask bit.
- **IAS**: per frame; one instance per mesh object (transform, `instanceId` = object index, mask) plus one identity
  instance per analytic GAS. 36 instances for K-09; rebuilding takes microseconds.

Launch parameters:

```cpp
struct LaunchParams {
  const float4* U; const float4* O; const float4* LI; const float4* SD;     // the buffer ABI
  float4* accum; float4* aovA; float4* aovN;                                 // outputs, as in WebGPU
  const int* aabbObjects; const int* unbounded; int nUnbounded;
  unsigned width, height, frame, spp;
  OptixTraversableHandle ias;
};
```

### 6.4 Device programs and the traversal shim

```cuda
extern "C" __global__ void __raygen__candela() {
  const uint3 ix = optixGetLaunchIndex();
  Kernel k;
  for (unsigned s = 0; s < params.spp; s++) {
    const PixOut o = k.renderPixel(vec2f(ix.x, ix.y), params.frame + s);    // translated, unchanged
    accumulate(ix, o);                                                        // accum += o.c; aovs as in WebGPU
  }
}

// replaces kernel.ts:523; contract unchanged: nearest (t, obj); gTri/gBary set for meshes
__device__ TraceR Kernel::traceAll(vec3f ro, vec3f rd, float tmax, bool shadow) {
  TraceR r{tmax, -1};
  for (int k = 0; k < params.nUnbounded; k++) {            // infinite planes: no box, keep the loop
    const int i = params.unbounded[k];
    if (shadow && glows(i)) continue;
    const float t = hitObj(i, ro, rd, r.t);
    if (t < r.t) { r.t = t; r.obj = i; }
  }
  unsigned p0 = __float_as_uint(r.t), p1 = ~0u, p2 = 0, p3 = 0, p4 = __float_as_uint(gTime);
  optixTrace(params.ias, f3(ro), f3(rd), 0.f, r.t, 0.f,
             shadow ? MASK_SHADOW : MASK_CAMERA,
             shadow ? OPTIX_RAY_FLAG_TERMINATE_ON_FIRST_HIT : OPTIX_RAY_FLAG_NONE,
             0, 1, 0, p0, p1, p2, p3, p4);
  if (p1 != ~0u) { r.t = __uint_as_float(p0); r.obj = (int)p1; gTri = (int)p2; gBary = unpackBary(p3); }
  return r;
}

extern "C" __global__ void __closesthit__triangle() {
  const float2 b = optixGetTriangleBarycentrics();
  optixSetPayload_0(__float_as_uint(optixGetRayTmax()));
  optixSetPayload_1(optixGetInstanceId());                 // = object index
  optixSetPayload_2(optixGetPrimitiveIndex());             // = triangle index in OptiX order (D6)
  optixSetPayload_3(packBary(b));
}

extern "C" __global__ void __intersection__analytic() {
  const int obj = params.aabbObjects[optixGetPrimitiveIndex()];
  Kernel k; k.gTime = __uint_as_float(optixGetPayload_4());   // IS programs cannot see raygen's Kernel
  const float t = k.hitObj(obj, v3(optixGetWorldRayOrigin()), v3(optixGetWorldRayDirection()), optixGetRayTmax());
  if (t >= optixGetRayTmin() && t < optixGetRayTmax()) optixReportIntersection(t, 0, (unsigned)obj);
}
extern "C" __global__ void __closesthit__analytic() {
  optixSetPayload_0(__float_as_uint(optixGetRayTmax()));
  optixSetPayload_1(optixGetAttribute_0());
}
extern "C" __global__ void __miss__candela() { /* p1 stays ~0u */ }
```

Three details deserve attention:

- `hitObj` transforms the world ray into the object's frame itself, from the `O` record, including motion-blur
  poses. The analytic GAS is therefore built in world space without OptiX instance transforms, and motion blur for
  analytic objects needs no OptiX motion structures.
- `hitMesh` and `blasOf`'s node arrays are dead code on OptiX; the translator keeps them (unused) or the shim header
  stubs them.
- Moving meshes are rendered at the frame's time in phase 3: the OptiX target writes `motionBase = 0` for mesh
  objects, so `finishHit` shades with the same transform the GAS instance uses. OptiX SRT motion transforms, which
  interpolate instance transforms during traversal, restore mesh motion blur in phase 6.

### 6.5 Output

- **EXR**: the uncompressed float writer from the spike (`native/optix/src/main.cpp` `writeEXR`), extended with the
  AOV channels Candela's own EXR writer emits (depth, normals, albedo, ids); ZIP compression with zlib later.
- **PNG/JPEG**: nvJPEG (`/usr/local/cuda/lib64/libnvjpeg.so`) encodes the post-processed image on the GPU for the live
  stream; PNG for stills.
- **Video**: frames piped as raw 8- or 10-bit RGB into
  `ffmpeg -f rawvideo -pix_fmt rgb48le -s WxH -r fps -i - -c:v hevc_nvenc -profile:v main10 -pix_fmt p010le out.mp4`.

### 6.6 Command line

```text
candela-rt render <preset-or-dir> [--param id=value]… [--size 1920x1080] [--spp 256] [--time t]
                  [--sequence --start 0 --end 2 --fps 24] [--format exr|png|mp4] [--denoise] [--out dir]
candela-rt serve  [--port 8790] [--bind 0.0.0.0] [--dist dist/] [--token t]
candela-rt check  <preset>…        # build in V8, print IR hash, translate + NVRTC-compile, render 16 spp
```

Outputs default to `~/data/pbr-spark/renders/<preset>/`.

## 7. The live workbench (proposed)

### 7.1 Replicated front end

The browser keeps building scenes itself: the editor needs diagnostics and param definitions immediately, the agent
edits files, and WebGPU remains the preview and the fallback. In OptiX mode the browser also sends the same inputs to
`candela-rt`, which builds the same scene in V8, runs callbacks on its own clock, renders with OptiX and streams
images. Both sides report `SceneIR.hash`; the browser shows a warning if they differ.

### 7.2 Protocol

JSON text messages, binary messages for images and assets. Client to server:

| Message | Fields | Effect |
| --- | --- | --- |
| `hello` | `bundleHash`, `seed` | Refused if the bundle differs. |
| `files` | `files: { path: text }` | Replace the session's files; rebuild. |
| `asset` | `name`, then a binary message | Store a dropped `.hdr` (cached by hash). |
| `param` | `id`, `value` | Static: rebuild. Dynamic: re-evaluate the frame. |
| `view` | `at`, `target`, `focus`, `size` | Camera override and viewport size; resets accumulation. |
| `clock` | `t`, `playing`, `rate` | Seek or play; behaviours step on the server's clock. |
| `poses` | `poses` or `null` | External poses (K-08). |
| `render` | job options (as `render-preset.ts`) | Start a server-side job (section 8). |
| `cancel` | `job` | Stop a job. |

Server to client:

| Message | Fields |
| --- | --- |
| `built` | `ok`, `diags`, `irHash`, `stats`, `compileMs`, `buildMs` |
| `frame` | header `{ t, spp, ev, width, height }` + binary JPEG |
| `job` | `id`, `progress`, `note`, `files` (URLs under `/renders/`) |
| `error` | `code`, `message` (NVRTC log lines mapped back to generated code where possible) |

### 7.3 A session, step by step

```text
browser                                   candela-rt
───────                                   ──────────
hello {bundleHash, seed}       ───────▶   check bundle; create isolate + SceneSession
files {scene.js, lib/…}        ───────▶   JS thread: session.build() → OptixProgram/Static
                               ◀───────   built {ok, irHash, …}     (browser compares with its own irHash)
                                          render thread: NVRTC (cache), GAS per mesh
view {at, target, size}        ───────▶   JS: session.frame() → OptixFrame → render thread: IAS, accumulate
                               ◀───────   frame {spp: 8}, frame {spp: 32}, frame {spp: 128} … (≤ 10/s)
param {id: 'gloss', 0.7}       ───────▶   JS: derived params re-evaluated → frame → accumulation restarts
clock {playing: true}          ───────▶   per tick: seek(t, dt) runs behaviours + animation → frame → restart
param {id: 'scene', 'S-03'}    ───────▶   static: rebuild; NVRTC only if CUDA hash changed; GAS for new meshes
```

### 7.4 Progressive rendering and delivery

After any change the render thread resets accumulation and launches batches sized to about 20 ms. It sends a frame
when at least 100 ms passed since the last one and the sample count grew, so a still converges with fewer, better
frames and an orbiting camera gets about ten frames per second. While playing, each tick restarts accumulation; the
batch size bounds latency. Frames are post-processed on the GPU (exposure metered from the accumulated image the way the viewport's `meter`
does it, `viewport.ts:184`, unless the camera fixes it; tone map; optional OptiX denoiser with `aovA`/`aovN` as
guides) and encoded with nvJPEG.

### 7.5 Browser changes

- A view mode "OptiX" in the viewport UI. In this mode the canvas shows frames from the server; the local WebGPU
  viewport pauses (or keeps rendering at low resolution as a preview while the server compiles).
- The host forwards its inputs: `setFile`, param changes, `setPoses`, asset drops, camera navigation, timeline. These
  already pass through `Host` (`src/app/host.ts`), so the forwarding sits in one place.
- The render dialog gains "render on the Spark", which sends `render` instead of using the local queue.
- On disconnect the mode falls back to WebGPU and retries; on reconnect the host resends `hello`, `files`, assets,
  params, view and clock.

### 7.6 Exposure and security

`candela-rt serve` binds to `0.0.0.0` by default, so the workbench is reachable from other machines as
`http://bling.local:<port>/` (the user's working setup). An optional `--token <t>` restricts access; the browser
passes the token in the WebSocket URL. Scene code runs in a context without I/O, under a heap limit and a
watchdog, so a hostile scene can exhaust its own budget but cannot reach the machine.

## 8. Render jobs on the backend (proposed)

```cpp
// sequence job: callbacks run in V8 in frame order; GPU work overlaps the next frame's evaluation
session.build(files, params, seed);  renderer.setProgram(...); renderer.setStatic(...);
session.seek(start, 0);
for (int f = 0; f < frames; f++) {
  const double t = start + f / fps;
  if (f > 0) session.seek(t, 1.0 / fps);              // behaviours step by exactly 1/fps
  OptixFrame fr = session.frame();                     // animation(t), motion samples, derived params
  renderer.setFrame(fr); renderer.accumulate(spp);
  Image img = renderer.post({ exposure: locked ? ev0 : auto, denoise });
  if (wantExr) writeExr(dir / frameName(f), renderer.readAccum(), aovs);
  if (video) ffmpeg.write(img);
}
ffmpeg.close();
```

Exposure follows `runRender` (`output.ts:132`): metered once at the start of a sequence and locked, so frames do
not flicker. Seeds follow the browser's job seeding (`U` row 24). Because the OptiX target runs the translated kernel, it also
uses the kernel's own random-number generator (`pcgH`, seeded from pixel, frame index and seed in `renderPixel`), so
both targets trace the same random paths; differences come from floating-point details (fused multiply-adds, fast
math, intersection precision) that make individual paths diverge. Parity should therefore be tighter than the AO
spike's, where the RNGs differed.

## 9. Implementation plan

Each phase ends with a check that compares results, not only that code runs.

| Phase | Work | Files | Exit check |
| --- | --- | --- | --- |
| 0. Spikes | V8 embedding with `libnode-dev`: run the engine bundle, build B-01 and K-09, call `animation(t)` | `native/rt/js/`, `scripts/bundle-core.ts` | K-09 builds in embedded V8; the hashes of `compiled.shared` and of `pack`'s buffers equal Node's; per-frame call < 1 ms |
| 1. Engine split | `lower`, `SceneIR`, `FrameState`, `SceneSession`, `WebGpuTarget`; seeded `Math.random`; browser host on top of the session | `src/engine/{sceneir,session}.ts`, `src/engine/targets/webgpu.ts`, `compile.ts`, `host.ts` | 9.1 golden tests pass for every preset; the workbench behaves as before |
| 2. CUDA target | `wgsl2cuda.ts` over the whole program (no `Gen` dialects, see status); vector header; plain-CUDA target; Dawn reference renderer | `src/engine/{wgsl2cuda,headless}.ts`, `src/engine/targets/cuda.ts`, `native/rt/kernels/` | Every preset's program compiles with NVRTC for `sm_121`; compile times recorded; 1-spp parity with WebGPU per preset (done) |
| 3. Offline OptiX | `OptixTarget`; `OptixRenderer`; `candela-rt render` and `check` | `src/engine/targets/optix.ts`, `native/rt/` | Image parity with WebGPU for every preset (9.3); furnace test; path-tracing speed-up measured |
| 4. Jobs | sequences, motion samples, EXR with AOVs, NVENC | `native/rt/out/` | Lockstitch reel rendered by `candela-rt`; time vs the 230 s/stitch WebGPU baseline |
| 5. Live | server, protocol, browser OptiX mode | `native/rt/net/`, `src/app/` | Param edits, camera orbit and playback update the OptiX view; hash handshake green for all presets |
| 6. Production | denoiser, SER (`optixTraverse`/`optixReorder`/`optixInvoke`), SRT motion, `envTables` in CUDA, CUDA-registered backing stores | `native/rt/gpu/` | Measured gains per feature |

Prerequisites to install:

- `! sudo apt install libnode-dev` (V8 headers and `libnode.so.109`; phase 0).
- `nlohmann/json` (already fetched by CMake in the spike) and a WebSocket library: IXWebSocket via CMake
  FetchContent (no sudo; phase 5). Verify its server API in phase 5's first task.
- Already present: CUDA 13.0 with NVRTC and nvJPEG, OptiX SDK 9.0.0 in `~/opt`, ffmpeg with NVENC, OpenEXR tools.

## 10. Testing

### 10.1 Golden tests for the split (phase 1)

Before the refactor, record for every preset and for times `{0, 0.37, 1.5}`: `compiled.shared` and every buffer from
`pack` (hashes plus the raw bytes for a few presets). After the refactor, `WebGpuTarget.prepare` and `.frame` must
produce byte-identical output. Presets with callbacks cover the session: K-09 (`animation`), W-01 (behaviours, stepped
with a fixed `dt` sequence), B-02 and W-03 (derived params), E-07 (static param).

### 10.2 Translation sweep (phase 2)

For every preset: emit CUDA, compile with NVRTC, record pass/fail and milliseconds. The first failures show which
translation rules are missing; the table in 5.6 grows from them.

### 10.3 Image parity (phase 3)

Render each preset on both targets at the same size, time and seed with enough samples that noise is small (for
example 4,096 spp at 480×270). Compare after dividing out exposure (the EXR comment records it;
`scripts/07-exr-stats.py` reads it): mean absolute difference, 99th percentile, and the fraction of pixels above a
threshold. The AO spike passed with mean 0.10 and p99 3.0 (8-bit, gamma-encoded). Candela's furnace test
(`src/engine/test.ts`) checks energy conservation independently of WebGPU.

### 10.4 Determinism (phases 1 and 5)

For every preset, build in Node and in embedded V8 with the same seed and compare `SceneIR.hash`. In phase 5 the same
check runs live in the `built` handshake.

## 11. Risks and open questions

- **Path-tracing speed-up.** AO gave 16×; shading-heavy scenes will gain less. Phase 3 measures it per preset.
- **NVRTC compile time** for 2,000 lines. If it is several seconds, static-param changes in the live workbench show the
  WebGPU preview until the module is ready; module caching by hash makes revisits instant.
- **libnode's V8 (10.2).** Older than Node 26's. The bundle targets ES2020 to stay compatible. If embedding through
  libnode is awkward (platform initialisation, symbol exports), phase 0 switches to a self-built V8; `JsRuntime` hides
  the difference.
- **Translator coverage.** Vector-valued `select`, integer overflow and the spectral code path are untested.
- **Behaviour determinism** depends on identical `dt` sequences; live playback and a job will not produce identical
  behaviour states unless the job's frame rate matches. Jobs always step by `1/fps`.
- **Stack-trace parsing** (`callSite`) assumes V8's format, which embedded V8 keeps; its cost (about a third of a
  K-09 build) is worth reducing in phase 1 by capturing stacks lazily.
- **Large scenes.** The CUDA side has no 1 GiB binding limit, but the V8 heap holds meshes as typed arrays; scenes
  with tens of millions of triangles need backing stores outside the V8 heap (phase 6).

## 12. API reference

**V8** (`v8.h`, `libplatform/libplatform.h`): `v8::V8::InitializePlatform`, `v8::V8::Initialize`,
`v8::platform::NewDefaultPlatform`; `v8::Isolate::New(CreateParams)`, `CreateParams::array_buffer_allocator`,
`ResourceConstraints::ConfigureDefaultsFromHeapSize`, `Isolate::AddNearHeapLimitCallback`,
`Isolate::TerminateExecution`, `Isolate::PerformMicrotaskCheckpoint`; `v8::Context::New`,
`Context::AllowCodeGenerationFromStrings`; `v8::Script::Compile`, `Script::Run`; `v8::FunctionTemplate::New`,
`v8::ObjectTemplate::Set`; `v8::Function::Call`; `v8::Promise::State`, `Promise::Result`; `v8::TryCatch`;
`v8::Float32Array::Buffer`, `ByteOffset`, `Length`; `v8::ArrayBuffer::GetBackingStore`, `NewBackingStore`. With
libnode: `node::MultiIsolatePlatform::Create` as the platform.

**OptiX 9.0** (`optix_host.h`, `optix_device.h`): `optixInit`, `optixDeviceContextCreate`, `optixModuleCreate`,
`optixProgramGroupCreate`, `optixPipelineCreate`, `optixPipelineSetStackSize`, `optixUtilComputeStackSizes`,
`optixAccelComputeMemoryUsage`, `optixAccelBuild`, `optixAccelCompact`, `optixSbtRecordPackHeader`, `optixLaunch`;
device: `optixTrace`, `optixTraverse`, `optixReorder`, `optixInvoke`, `optixGetLaunchIndex`, `optixGetInstanceId`,
`optixGetPrimitiveIndex`, `optixGetTriangleBarycentrics`, `optixGetWorldRayOrigin`, `optixGetWorldRayDirection`,
`optixGetRayTmin`, `optixGetRayTmax`, `optixReportIntersection`, `optixGetAttribute_0`, `optixSetPayload_N`;
denoiser: `optixDenoiserCreate` (`OPTIX_DENOISER_MODEL_KIND_AOV`), `optixDenoiserComputeMemoryResources`,
`optixDenoiserSetup`, `optixDenoiserComputeIntensity`, `optixDenoiserInvoke`.

**NVRTC** (`nvrtc.h`): `nvrtcCreateProgram`, `nvrtcCompileProgram`, `nvrtcGetProgramLogSize`,
`nvrtcGetProgramLog`, `nvrtcGetOptiXIRSize`, `nvrtcGetOptiXIR`, `nvrtcDestroyProgram`.

**CUDA runtime**: `cudaMalloc`, `cudaMemcpyAsync`, `cudaStreamCreate`, `cudaEventRecord`,
`cudaEventElapsedTime`, `cudaHostRegister` (for registering V8 backing stores).

**nvJPEG** (`nvjpeg.h`): `nvjpegCreateSimple`, `nvjpegEncoderStateCreate`, `nvjpegEncoderParamsCreate`,
`nvjpegEncoderParamsSetQuality`, `nvjpegEncoderParamsSetSamplingFactors`, `nvjpegEncodeImage`,
`nvjpegEncodeRetrieveBitstream`.

**ffmpeg/NVENC**: encoders `hevc_nvenc` (`-profile:v main10 -pix_fmt p010le`), `av1_nvenc`, `h264_nvenc`.

## 13. File reference

Existing (implemented):

| File | Role in this design |
| --- | --- |
| `src/engine/candela.ts` | `build`, `runFiles` (sandbox, `new Function`, scope names); gets seeded `Math` |
| `src/engine/compile.ts` | `compile` (167), `pack` (633), `evalRecipeOf` (805), `cameraUniforms` (883), `localBox`/`worldBox`/`sweptBox`; split into `lower` + targets |
| `src/engine/fx.ts` | `WT` (34), `Gen` (309), `genFunction` (373); gains dialects |
| `src/engine/kernel.ts` | WGSL kernel: `traceAll` (523), `hitObj` (365), `hitMesh` (286), `finishHit` (456), `tracePath` (1142), `renderPixel` (1365), `POST` (1407), `ggxAlbedoTable` (1479) |
| `src/engine/mesh.ts` | `MeshDef`, `blasOf` (331) — WebGPU target only |
| `src/engine/hdri.ts` | `envTables` (109), `studioImg` — target-side data |
| `src/engine/params.ts` | params, derived params (99) |
| `src/engine/viewport.ts` | `repack` (96), `posesFor` (112) — move into the session |
| `src/engine/render.ts` | WebGPU/WebGL2 backends |
| `src/engine/output.ts` | `runRender` (132), `RenderQueue` (180) — job semantics to mirror |
| `src/engine/wgsl2glsl.ts` | model for `wgsl2cuda.ts` |
| `src/engine/diag.ts` | `callSite` (49) — V8 stack format |
| `src/app/host.ts` | `build` (126), `runBehaviors` (204), `seek` (220), `world` (311) — move into the session; forwarding for OptiX mode |
| `scripts/scene-package.ts` | spike exporter (transforms via `inv34`, `withEngine`) |
| `scripts/render-preset.ts` | WebGPU renders for parity tests |
| `native/optix/src/{params.h,ao.cu,main.cpp}` | spike: GAS/IAS/SBT/launch/EXR patterns to reuse |
| `ttmp/.../scripts/07-exr-stats.py` | EXR comparison |

New (proposed): `src/engine/sceneir.ts`, `src/engine/session.ts`, `src/engine/targets/webgpu.ts`,
`src/engine/targets/optix.ts`, `src/engine/wgsl2cuda.ts`, `scripts/bundle-core.ts`, `tests/golden-pack.test.ts`,
`tests/translate-sweep.ts`, `native/rt/` (`CMakeLists.txt`, `main.cpp`, `js/`, `gpu/`, `gpu/kernels/`, `out/`, `net/`).

## 14. Where to start

1. Read sections 2–4, then `kernel.ts` `traceAll`, `finishHit` and `renderPixel`, and the spike's `main.cpp`.
2. Phase 0: install `libnode-dev`, write `scripts/bundle-core.ts` (esbuild, IIFE, no DOM), and a 100-line C++ program
   that loads the bundle into an isolate and builds B-01. Record the IR hash and compare it with Node's.
3. In parallel, phase 1's golden recorder: a script that writes `pack` hashes for every preset at three times. It
   must exist before any line of `compile.ts` changes.
