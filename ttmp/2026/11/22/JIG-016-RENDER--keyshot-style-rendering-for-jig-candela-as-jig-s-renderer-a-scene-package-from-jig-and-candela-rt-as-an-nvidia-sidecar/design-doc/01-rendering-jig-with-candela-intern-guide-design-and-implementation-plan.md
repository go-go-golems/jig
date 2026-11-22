---
Title: 'Rendering jig with Candela: intern guide, design and implementation plan'
Ticket: JIG-016-RENDER
Status: active
Topics:
    - rendering
    - gpu
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: abs:///home/manuel/code/wesen/2026-11-21--pbr-spark/content/presets/K-09-lockstitch.js
      Note: existing jig-to-Candela preset the bridge generalises
    - Path: abs:///home/manuel/code/wesen/2026-11-21--pbr-spark/src/app/remote.ts
      Note: live protocol client the sidecar mode reuses
    - Path: abs:///home/manuel/code/wesen/2026-11-21--pbr-spark/src/engine/finish.ts
      Note: Candela finish vocabulary and fromMetadata used by autoFinish
    - Path: repo://import/jigcad/content/presets/F-06-slider-crank-mechanism/script.js
      Note: running example of the guide
    - Path: repo://import/jigcad/src/engine/assembly.js
      Note: 'structure(), dragPose and study rows: the pose sources'
    - Path: repo://import/jigcad/src/engine/mesh.js
      Note: 'bodyData and faceMeta: the body and face records the bridge reads'
    - Path: repo://import/jigcad/src/engine/program.js
      Note: finalize assembles ProgramData; material and finish metadata join here
ExternalSources: []
Summary: 'How jig (parametric CAD with persistent face names and mechanisms) and Candela (a physically based path tracer with a CAD path and an OptiX runtime) become one product: a bridge API that joins faces and components by name, a CAD package, an appearance layer, a Render view, poses from mechanism studies, candela-rt as an optional NVIDIA sidecar, and how the two repositories merge.'
LastUpdated: 2026-11-22T00:48:09.675589686-05:00
WhatFor: Onboarding an intern to both systems and to the planned integration; the reference for implementing it phase by phase.
WhenToUse: Before touching the jig↔Candela bridge, the Render view, the sidecar launcher, or the repository merge.
---

# Rendering jig with Candela: intern guide, design and implementation plan

## 1. What this document is for

jig is a parametric CAD workbench.
- **Building.** You write a JavaScript script, jig builds solids with OpenCascade, and it names every face so that the name survives edits.
- **Mechanisms.** It assembles parts into mechanisms and solves them.
- **Drawing.** It draws all of this as a crisp technical drawing on a 2D canvas.

What jig cannot do is make a photograph of the part: brushed steel that catches a highlight, black-oxide screws, a studio backdrop, a motion-blurred video of the mechanism running. Product-visualisation tools such as KeyShot exist for that last step. You import a CAD model, drag materials onto parts, pick an environment light, and render stills and animations.

Candela is a physically based renderer written by the same team. It is a progressive path tracer that runs in the browser on WebGPU and, through a native program called `candela-rt`, on NVIDIA GPUs with OptiX. It was built with CAD in mind:
- triangle meshes keep the identity of the CAD face each triangle came from;
- finishes such as "turned steel" or "anodized aluminium" are generated from metadata;
- assemblies can be posed from outside;
- it writes EXR passes and video.

It has already rendered a jig model, the lockstitch sewing-machine head, through a one-off offline conversion.

This document explains both systems well enough that you can work on either. It then describes how they become one product:
- a **bridge API** that joins jig's faces and components to Candela's materials and scene nodes by name;
- a **CAD package** that jig exports;
- an **appearance layer** in jig;
- a **Render view** in jig's workbench;
- **poses from jig's mechanism studies**;
- `candela-rt` as an **optional sidecar** process when the machine has an NVIDIA GPU;
- how the two **repositories merge** without disturbing the OptiX work in progress.

It ends with a phased plan, tests and the decisions still open.

You need ordinary knowledge of JavaScript, of what a triangle mesh and a 4×4 transform are, and a rough idea of what a path tracer does. A path tracer shoots random light paths through the scene and averages them, so the image gets less noisy the longer it runs. Everything project-specific is explained where it is first used.

### How file references are written

Four source trees are involved. References use a short prefix:

| prefix | where | what |
| --- | --- | --- |
| `jig:` | `~/code/wesen/go-go-golems/jig` (github `go-go-golems/jig`, `main` at `3873732`) | the CAD workbench, its engine and its Go server |
| `candela:` | `~/code/wesen/2026-11-21--pbr-spark` (github `wesen/2026-11-21--pbr-spark`, `main` at `db9b0a8`) | Candela: engine, workbench, `candela-rt` |
| `lockstitch:` | `~/Downloads/lockstitch-project.zip`, folder `lockstitch-project/` | the sewing-machine project: kine rig, jig parts, the animation page, the explainer |
| `compur:` | `~/Downloads/synchro-compur-0-mxv.zip`, folder `compur/` | a leaf-shutter model: jig parts, a dynamics engine, a textbook |

`jig:import/jigcad/src/engine/mesh.js:91` means line 91 of that file in the jig repository. Line numbers are for the revisions above.

## 2. The whole picture

```
                 today                                              proposed
 ┌──────────────────────────────┐                ┌─────────────────────────────────────────────────────┐
 │ jig workbench (browser)      │                │ jig workbench (browser)                             │
 │  script ─▶ engine worker     │                │  script ─▶ engine worker (OpenCascade)              │
 │            (OpenCascade)     │                │            │ ProgramData: bodies, faces, assembly   │
 │            │ ProgramData     │                │            ▼                                        │
 │            ▼                 │                │  Stage (drawing)      Render view (Candela)         │
 │  Stage: 2D canvas drawing    │                │                        bridge: jigScene(program)    │
 └──────────────────────────────┘                │                        look.js (materials, lights)  │
                                                 │                        WebGPU path tracer  ◀─┐      │
 ┌──────────────────────────────┐                │                               or frames ─────┤      │
 │ Candela workbench (browser)  │                └──────────────────────────────────────────────┼──────┘
 │  scene.js ─▶ build ─▶ WGSL   │                       │ /rt (WebSocket, same origin)          │
 │  WebGPU path tracer          │                ┌──────▼───────────────┐   spawns   ┌──────────┴────────┐
 │  (OptiX mode ─ ws ─▶ rt)     │                │ jigcad serve (Go)    │ ─────────▶ │ candela-rt serve  │
 └──────────────────────────────┘                │ capabilities, proxy  │            │ V8 + CUDA/OptiX   │
                                                 └──────────────────────┘            │ (only with NVIDIA)│
 offline: lockstitch convert.py ─▶ K-09 preset                                        └───────────────────┘
```

The idea is a division of labour:
- **jig owns geometry and motion.** It owns what the parts are, what each face is called, how they are assembled, and how they move.
- **Candela owns appearance and light.** It owns what the surfaces are made of, the environment, the camera optics and the output.
- **The two are joined by names, not by copies.** A material is attached to the face `body/side[s.big]` of component `rod`. When the part is edited and rebuilt, the name still points at the same face, so the material stays where it was put. That is the practical advantage over importing STEP into a separate renderer, which renumbers faces on every import.

## 3. Background: jig

### 3.1 Scripts, the engine and ProgramData

A jig model is a JavaScript script that returns a part or an assembly. This document uses one example throughout: the needle-bar drive of preset F-06 (`jig:import/jigcad/content/presets/F-06-slider-crank-mechanism/script.js`). It is a slider-crank, the same mechanism that drives the needle of the lockstitch head. Its connecting rod is:

```js
const steel = j.material('steel')
const rodOutline = j.sketch('s', { on: j.plane.XY })
  .rect('r', L + 12, 12, { center: true })
  .circle('big', 3, { at: [-L / 2, 0] })              // the crank-pin hole
  .circle('small', 2.5, { at: [L / 2, 0] })           // the wrist-pin hole
const rod = j.part('rod').material(steel)
  .extrude(rodOutline.profiles(), mm(5), { id: 'body' })
  .port('big', frameAt(j.pt(-L / 2, 0, 0), '+X'))     // ports: named frames that joints connect
  .port('small', frameAt(j.pt(L / 2, 0, 0), '-X'))
```

**The worker.** The browser workbench sends the script to a Web Worker that holds OpenCascade (compiled to WebAssembly).
- **The reply.** The worker runs the script, builds the solids, and answers with **ProgramData**: a plain object that can be sent between threads (typed arrays are transferred, not copied).
- **The protocol.** It is a switch over a handful of operations (`jig:import/jigcad/src/engine/worker.js:241-255`: `init`, `compile`, `call`, `export`, `fea`, `run`, …).
- **Under Node.** The same module runs in Node for tests and batch jobs. The Compur's build script, for example, imports `worker.js` and calls `handle({ op: 'compile', files })` (`compur:cad/build.mjs:15-30`). That call answers `{ id, ok, program }`.

**ProgramData** is assembled by `finalize` (`jig:import/jigcad/src/engine/program.js:55`). For rendering, its `bodies` array matters most. Each record comes from `bodyData` (`jig:import/jigcad/src/engine/mesh.js:91`). Compiling F-06 in Node (`scripts/01-f06-face-records.mjs` in this ticket) gives this record for the rod:

```js
// ProgramData.bodies[2], abridged; real values from F-06 at the drive's default 30°
{
  id: 'rod/body1', part: 'rod', name: 'body1',
  transform: [ …, 3.87, -43.17, 6, 1 ],                          // column-major 4×4 in mm: the rod's world placement
  mesh: { positions, normals, indices,                           // 356 triangles from OpenCascade
          triFace },                                             // triFace[t] = which of the 8 faces triangle t lies on
  faces: [
    { index: 0, name: 'body/side[s.r.bottom]', kind: 'plane', normal: [0, -1, 0], area, center },
    …
    { index: 4, name: 'body/side[s.big]',   kind: 'cylinder', axis: { origin, dir: [0, 0, -1], radius: 3 }, area, center },
    { index: 5, name: 'body/side[s.small]', kind: 'cylinder', axis: { origin, dir: [0, 0, -1], radius: 2.5 }, area, center },
    { index: 6, name: 'body/start', kind: 'plane', normal: [0, 0, -1] },
    { index: 7, name: 'body/end',   kind: 'plane', normal: [0, 0, 1] },
  ],
  edges: [ … polylines, each with the two faces it separates … ], bbox, volume, topology, color: null,
}
```

Notice three things.
- **Each triangle knows its face.** `triFace` maps every triangle to a face of the solid, so the mesh is not an anonymous triangle soup.
- **Each face has a persistent name** built from the feature and sketch entity that made it. `body/side[s.big]` is the side face that extrude `body` made from circle `big` of sketch `s`: the bore of the crank-pin hole. When later features (fillets, booleans, patterns) modify a face, jig carries its name through OpenCascade's history (`carryNames`, `jig:import/jigcad/src/engine/body.js:1-2`), so the name survives edits. It is also how jig explains a face's origin (`why()`).
- **Each face has its geometry.** That means its surface kind (`plane`, `cylinder`, `cone`, `sphere`, `torus`, `bspline`; `kernel.js:222-264`) and, for cylinders, cones and spheres, the exact axis. A renderer needs exactly this to draw lathe marks around the right axis.

Two more facts matter for the bridge:
- **The part's `material` does not reach the body records.** Part `color` is passed into `bodyData` (`program.js:72`). The material only reaches `summary.material`, and only for the first part (`program.js:76`). The bridge needs it per body, which is a one-line change.
- **The feature graph supplies the feature type.** ProgramData's `graph` lists every feature with its type, for example `{ id: 'rod:body', kind: 'extrude' }` (`program.js:147`). Face names start with the feature id, so `body/side[s.big]` on component `rod` belongs to feature `rod:body`, an extrude. §6.4 uses this to infer machining processes.

jig already records a per-face display colour: `.color(sel, c)` (`jig:import/jigcad/content/docs/reference.md:183`, marked "recorded only" because the stage ignores it). §6.4 adds `.finish(sel, meta)` in the same style.

### 3.2 Assemblies and mechanisms

F-06 joins four parts:

```js
const head = j.assembly('needle-bar drive')
  .add('frame', frame, { ground: true }).add('crank', crank).add('rod', rod).add('slider', slider)
  .joint('main', j.joint.revolute(), 'frame:main', 'crank:pivot')     // 'component:port'
  .joint('pin', j.joint.revolute(), 'crank:pin', 'rod:big')
  .joint('wrist', j.joint.revolute(), 'rod:small', 'slider:wrist')
  .joint('guide', j.joint.prismatic(), 'frame:guide', 'slider:guide')
  .drive('main', deg(30))
  .study('cycle', { drive: 'main', from: deg(0), to: deg(360), steps: 360 })
```

**Solving.** `jig:import/jigcad/src/engine/assembly.js` solves all joints together, using the `MechanismSolver` in `mechanism.js`. The body records above already carry each component's world placement at the solved pose. That is why the rod sits at (3.87, −43.17, 6).

**Studies.** A *study* sweeps a drive through a range and records a row per pose: measures, events and forces.

**Subassemblies.** These add a component id path: a part inside subassembly `sub` is `sub/slider`.

**What a solved program offers.**
- `prog.structure()` (`assembly.js:124`) returns the tree of components and subassemblies with world transforms; the STEP exporter uses it.
- `prog.dragPose` (`assembly.js:131`) moves a port toward a target and returns every component's transform.

**What it does not offer today: a study's poses.** Rows keep readings, not placements. A study captures `S.transforms()` per row only when an interference check or a force analysis needs them (`assembly.js:307`). Rendering a study needs those transforms (§6.6).

### 3.3 The stage, the server and the build

jig draws with a **software rasteriser** on a 2D canvas (`jig:import/jigcad/src/stage/raster.js`).
- **Rasteriser.** It keeps a depth buffer and a face-id buffer, which hidden lines and picking read.
- **Camera.** It is **orthographic**, in millimetres with +Z up, and offers the views *axo*, *front*, *side* and *plan* (`stage/camera.js:1-16`). The point is a drawing, not a photograph.
- **Workbench.** The workbench (`src/ui/app.jsx`) is a set of tiled views registered in one table (`app.jsx:26`: `stage`, `params`, `graph`, `mechanism`, …) and arranged by layouts (`src/ui/layouts.js`).

The Go program `jigcad serve` (`jig:cmd/jigcad/main.go:60-70`, `jig:pkg/server/server.go:75-82`) serves the built workbench, either embedded in the binary or from `--dist`, plus a small `/api/` used by the agent's model backend.

**The JavaScript build.**
- `jig:import/jigcad/build.mjs`, run by `make web`, uses esbuild installed into `.bin/`; the repository has no npm dependencies.
- **Vendored artifacts.** Large prebuilt pieces live in `jig:import/jigcad/vendor/` with checksums: OpenCascade in `vendor/occt` (29 MB), TetGen and CalculiX in `vendor/fea` (`SHA256SUMS`, `VERSIONS`). That convention matters for §8.

### 3.4 Materials in jig today

`jig:import/jigcad/src/engine/inspect.js:14` defines `MATERIALS` for engineering, with density, cost, modulus and strength. The table covers PLA, PETG, ABS, ASA, PP, TPU-95A, PA-CF, resin, steel, stainless and aluminium. A part names one, as in `.material(j.material('steel'))`. There is no notion of surface finish, process or appearance beyond the display `color`.

## 4. Background: Candela

### 4.1 Scene files and the stages of a render

A Candela scene is also a JavaScript module, written against a fluent API (`candela:content/docs/24-cad.md` has the CAD-specific parts):

```js
import { scene, shape, light, camera, mesh, hdri } from 'candela';
const rod = mesh.fromArrays({ positions, normals, indices, faceIds,
                              faces: [{ id: 'body/side[s.big]', meta: { kind: 'cylinder', process: 'ground' } }, …],
                              meta: { material: 'steel' } });
export default scene()
  .add(shape.mesh(rod).id('rod').autoFinish())
  .add(light.env.hdri(hdri.studio()))
  .camera(camera.thinLens().at([0.3, 0.2, 0.4]).target([0, 0, 0]));
```

A scene goes through four stages. It helps to keep them apart, because each one is cached separately and the integration hooks into different ones:

```
scene files ──build──▶ scene tree + diagnostics + params ──compile──▶ IR: WGSL kernel + packed buffers ──load──▶ GPU ──accumulate──▶ image
              (runs the JS; codes E1xx/W1xx)              (irHash identifies it)                  (Viewport)
```

- **build** (`candela:src/engine/candela.ts:116`) runs the files with Candela's own small module loader. It produces a tree of scene components plus diagnostics with codes such as `E121` (bad argument) or `W170` (unknown pose id).
- **compile** (`compile.ts`, `kernel.ts`) turns the tree into one GPU program: a WGSL kernel and packed data. Its hash, the `irHash`, identifies the program, so two machines that compile the same files get the same hash.
- **load** uploads the program to a GPU backend, and **accumulate** adds samples until the image is clean enough.

Candela's units are metres. Its CAD path expects +Y up.

### 4.2 Meshes with faces, finishes, and autoFinish

This is the part of Candela that makes it a CAD renderer.
- **`mesh.fromArrays({ positions, indices, normals, faceIds, faces, meta })`** (`candela:src/engine/mesh.ts:287`) builds a *mesh definition*: the triangles, a face index per triangle, and a face table `[{ id, meta }]`. It has a bounding volume hierarchy (BVH) for fast ray intersection, built once per definition and shared by every instance. Normals are smooth within a face and break at face boundaries (`mesh.ts:2`), so machined edges stay crisp.
- **`shape.mesh(def)`** (`candela:src/engine/scene.ts:149`) makes an *instance* of the definition: a scene node with a transform and a material.
- **`.face(selector, material)`** (`scene.ts:157`) binds a material to some of the instance's faces. The selector is an id, a glob (`'body/side[s.*]'`), a RegExp, a list, or a predicate on `{ id, meta }` (`matchFace`, `mesh.ts:53`). A selector that matches nothing is error `E104`, with a did-you-mean suggestion.
- **`.autoFinish()`** (`scene.ts:163`) dresses every face from its metadata via **`finish.fromMetadata(meta)`** (`candela:src/engine/finish.ts:86-110`). It reads:
  - `material`: metals in `METAL_F0`, such as steel, bearing-steel, stainless, aluminium, brass, bronze, copper, titanium, chrome or cast-iron, and polymers in `POLYMERS`;
  - `process`: turned, faced, milled, ground, brushed, hobbed or polished;
  - `finish`: black-oxide, zinc, anodized, paint, powder-coat, chrome or nickel;
  - and `color`, `axis`, `center`, `direction`, `roughness`.
- **Finishes are physical, not painted.** A turned steel face gets the reflectance of steel and anisotropic roughness whose grooves run around the face's axis, so its highlight stretches across the grooves as on a real lathe-turned part (`finish.ts:36-78`).

In short, Candela already consumes the kind of data jig produces: faces with names, kinds and axes. What is missing is the plumbing between them.

### 4.3 Scene nodes, ids and poses

A node gets an id with `.id(name)`. Ids address nodes from outside, either from an `animation(t)` export in the scene or from poses the page sends.
- **Pose formats.** A pose is a column-major 16-number matrix, `{ position, quaternion }` or `{ position, rotation }` (`normPoses`, `candela:src/engine/compile.ts:841`).
- **Applying poses.** A pose update is a *repack*: transforms and the top-level BVH are rewritten, but meshes and shaders are not, so moving a mechanism is cheap.
- **Unknown ids.** An id that names no node is warning `W170`.
- **Merging sources.** `posesAt` (`candela:src/engine/session.ts:38-47`) merges the scene's own animation with external poses, id by id, and external poses win.

One restriction matters for jig: `.id(name)` accepts only `[A-Za-z0-9_-]` (`scene.ts:79`). jig component ids are paths such as `sub/slider`. Candela uses ids only as map keys (`compile.ts:187`, `:814`), so allowing `/` and `.` looks safe; §6.2 proposes that change.

### 4.4 The viewport, picking and output

In the browser, a `Viewport` (`candela:src/engine/viewport.ts:53`) owns a WebGPU or WebGL2 backend and drives it:

```ts
const vp = new Viewport(canvas); await vp.init('auto');
await vp.load(result.compiled, { time: 0 });          // compile shaders, upload the packed scene
vp.setView({ at, target });                           // a free camera; restarts accumulation
vp.setPoses({ rod: matrix16, crank: { position, quaternion } });   // repack, no recompile
await vp.idPass();                                     // per pixel: instance id and face id
```

**The Host.** Candela's own workbench wraps this in a `Host` (`candela:src/app/host.ts`): `build` at `:138`, `attachCanvas` at `:177`, `setPoses` at `:260`, `render` at `:281`.

**Picking.** `pick` (`host.ts:310`) casts a CPU ray against the packed objects and returns the object and the face it hit.

**The render queue.** `RenderQueue` (`candela:src/engine/output.ts:180`) renders stills and sequences at a fixed size, sample count and seed. The seed enters the per-pixel random stream, so identical inputs give identical pixels (`24-cad.md` "Output"). Its outputs are:
- PNG;
- OpenEXR with the passes beauty, albedo, normal, depth, `id.instance` and `id.face` (`output.ts:2`, `:77`);
- MP4 or WebM through the browser's WebCodecs.

**Lighting.** `light.env.hdri(image, { intensity, rotate })` lights the scene with an environment image (`scene.ts:381`). The image is `hdri.studio()` (light boxes), `hdri.outdoor({ sunElevation, sunAzimuth })` or a parsed `.hdr` file. It is importance-sampled, so a small bright light still converges.

### 4.5 candela-rt: the same engine on an NVIDIA GPU

`candela-rt` (`candela:native/rt/`, C++) renders the same scenes much faster on NVIDIA hardware.
- **How a scene gets there.** It embeds V8 and loads `candela-core.js`, the engine's non-DOM part bundled into one file. The source is `candela:src/engine/core.ts`, built by `candela:scripts/bundle-core.ts`; the binary takes it with `--bundle` (`native/rt/src/serve.cpp:98`). It runs build and compile exactly as the browser does, translates the WGSL program to CUDA (`src/engine/wgsl2cuda.ts`), compiles it with NVRTC, and traces on the RT cores through OptiX.
- **What it adds:** the OptiX AI denoiser and NVENC video encoding.
- **Commands** (usage text in `native/rt/src/main.cpp:497-504`):
  - `digest` and `session` check that its builds match the browser's;
  - `cuda-sweep` compiles every preset's program to CUDA;
  - `render <preset id> [--size WxH] [--spp n] [--format pfm,png,exr,mp4] [--denoise ai] …` renders a job;
  - `serve [--port 8790] [--bind 0.0.0.0] [--token t]` runs a WebSocket server for the workbench.
- **Speed.** On a DGX Spark, one 1080p stitch (one machine cycle, as a sequence) of the whole-head scene at 64 samples took 45 s, against 224 s in the browser on the same machine (`candela:tools/lockstitch/README.md:48`).

The live protocol (client: `candela:src/app/remote.ts:21`; design: `candela:ttmp/2026/11/21/CANDELA-002…/design-doc/02-…md` §7.2) is JSON messages plus binary JPEG frames:
- client to server: `hello`, `files`, `param`, `view`, `clock`, `poses`, `render`, `cancel`;
- server to client: `built` (with its `irHash`), `frame`, `job`, `error`.

The browser keeps building the scene itself, because it needs diagnostics and params immediately. It compares its own `irHash` with the server's `built.irHash`, and a mismatch means the two builds disagree (the `mismatch` getter in `remote.ts`). The client finds the server through `?rt=ws://host:port`, then a stored setting, then `ws://<page host>:8790` (`remote.ts:10-18`).

A naming caution: Candela already has something called a **scene package**. `candela:scripts/scene-package.ts` writes `{ format: 'candela-scene-package', version: 0 }`, the geometry and camera *after* compile, for the native OptiX spike in `native/optix/`. The jig export proposed in §6.3 sits *before* build, on the CAD side, so this document calls it the **CAD package**.

### 4.6 What has already been done: the lockstitch head and the Compur

Two real projects have pushed jig models toward rendering. They show that the pieces work, and where the seams are.

**The lockstitch head** (`lockstitch:`) is a sewing-machine head: 27 parts modelled in jig and moved by a separate kinematics library called *kine*. The project has three parts (`lockstitch:README.md`):
- `explainer/`: research and SVG diagrams of how a lockstitch forms. The needle carries the thread down, the rotary hook catches a loop and carries it round the bobbin, the take-up lever pulls the stitch tight, and the feed dog moves the cloth one stitch.
- `jig/`: the four patches that became jig's mechanism work (JIG-014).
- `animation/`: the 3D animation.

Its path into Candela:
1. **The rig.** `lockstitch:animation/src/rig.mjs` is the kine rig: 7 skeletons, 21 joint frames, and loop closures for the needle bar, take-up lever, feed, zigzag gate and check spring. `build/bake.mjs` samples it every 1° into `web/rigdata.json`.
2. **The parts.** `cad/parts.py` writes a jig script per part. `tools/jig_batch.py` compiles them in a served jig workbench into `web/meshes.json`, whose bodies are exactly jig's body records (`id, name, part, transform, bbox, faces, mesh, edges`, arrays in base64).
3. **The conversion.** `candela:tools/lockstitch/convert.py` turns the two JSON files into a Candela module (`candela:content/presets/K-09-lockstitch/lockstitch-data.js`, 1.1 MB). On the way it:
   - converts the frame, recorded at `convert.py:177` as "metres, y up; CAD x = x, CAD z = y, CAD y = −z";
   - quantises the meshes;
   - turns joint frames into a position and quaternion per degree;
   - integrates the cloth's travel from the feed dog;
   - **guesses** each lathe part's axis from the scatter of its normals, calling coaxial cylinders *turned* and flat faces across the axis *faced*.
4. **The preset.** `candela:content/presets/K-09-lockstitch.js`:
   - rebuilds `mesh.fromArrays` per body;
   - groups bodies per part with `.id(part)` and calls `.autoFinish()`;
   - exports `animation(t)`, which interpolates the baked frames (`frameAt`, `K-09-lockstitch.js:36`);
   - has seven scenes chosen by a param: S-01 needle bar, S-02 take-up lever, S-03 rotary hook, S-04 four-motion feed, S-05 thread path, S-06 zigzag, S-07 whole head;
   - moves the cloth with the feed dog. The thread itself is not drawn, and the hook's loop is schematic in the original page.
5. **Rendering.** `candela:tools/lockstitch/render.ts` renders the scenes in a headless browser or on `candela-rt`, and `reel.sh` joins them into a reel.

**The Compur** (`compur:`) is a camera leaf shutter: 29 jig parts declared with `part(id, meta, script)` (`compur:cad/parts.mjs:66`), where `meta = { name, material, color, fixed }`.
- **The material gap.** Its parts are brass, but jig's `MATERIALS` has no brass. So the scripts carry it only as a comment (`return j.part('Housing 101').color('#3a3b3f')  // material: brass`, `parts.mjs:85`), and the material lives in the side table.
- **Building the parts.** `cad/build.mjs` compiles them through jig's worker in Node into `web/meshes.json`, with the same body records.
- **Motion.** Its own planar dynamics engine (`web/snap.js`, `web/sim.js`) produces one coordinate per part per frame, and `partMatrix` turns it into a transform (`compur:web/app.js:520`).
- **Drawing.** It draws with a trimmed copy of jig's stage. It has never been rendered photographically.

Both projects use jig's worker protocol and its body records, and both wrote their own glue. The lockstitch conversion is offline, in Python, and has to guess process and axis, which jig knows exactly. Every part of that glue is generic enough to belong in the product.

## 5. What "KeyShot-style" means here

The goal is a set of capabilities a user would recognise. The table maps each to what exists.

| capability | Candela has | jig has | gap to close |
| --- | --- | --- | --- |
| real-time progressive path-traced view | `Viewport`, WebGPU/WebGL2 | – | a Render view in jig (§6.5) |
| bring the CAD model in with its structure | meshes with face tables, groups, ids | bodies, faces, product tree | the bridge (§6.2), the CAD package (§6.3) |
| drag a material onto a part or a face | `.face(sel, m)`, `finish.*`, picking | face names | material library, writes to `look.js` (§6.5) |
| materials that survive model edits | – | persistent face names | join by name (§6.2) |
| finishes from how a part is made | `finish.fromMetadata`, anisotropy | feature types, exact axes | process inference (§6.4) |
| environment lighting, rotation | `light.env.hdri(…, { rotate })`, `hdri.*` | – | controls in the Render view |
| ground and shadow catcher | `scene().ground(o)` (`scene.ts:448`) | – | in the default look |
| camera views, depth of field, focus pick | `camera.thinLens` (`fstop`, `focus`, `focusOn`) | orthographic views axo/front/side/plan | camera mapping (§6.5) |
| animation of the mechanism | poses, `animation(t)`, `camera.motionBlur` | studies, drag-to-pose | poses per study row (§6.6) |
| render jobs: stills, sequences, passes, video | `RenderQueue`, EXR, MP4/WebM | – | jobs from the Render view |
| fast final renders on an NVIDIA GPU | `candela-rt` render/serve, AI denoiser | Go server | the sidecar (§7) |

Most of what is needed already exists on one side or the other. The work is integration, plus three genuinely new things: the bridge, process inference and the Render view's interactions.

## 6. Design

### 6.1 Principles

1. **jig owns geometry, names and motion; Candela owns appearance, light and output.** Neither re-implements the other.
2. **Join by name.** The link between a material and a surface is jig's component id plus jig's face name. Nothing is joined by triangle index or import order.
3. **The look is text.** Materials, lights and camera live in a Candela scene file, `look.js`, next to the jig script. The Render view's drag-and-drop edits that file, so everything stays diffable, reviewable and editable by the agent, as jig scripts are.
4. **One engine, two hosts.** The browser and `candela-rt` run the same engine source, built once. The sidecar is optional, and the browser path always works.

### 6.2 The bridge API: linking faces and objects across the two systems

**The problem.** The two systems name the same things differently.
- **jig:** a component id (`rod`), a body id (`rod/body1`), a face name (`body/side[s.big]`), and a face index inside the body (4).
- **Candela:** a node id, set with `.id()`; a mesh definition with a face table, where `faceIds[t]` indexes the table; and, after compile, numbered objects. The id pass and picking report those object numbers and face numbers.

Without a bridge, every project writes the translation by hand, as `convert.py` and K-09 do. With one, a user or the agent can say "this face, in steel, ground", and a click on the render can say which jig face it hit.

**One face, three representations.** Here is the crank-pin bore of F-06's rod, followed through the bridge:

```
jig ProgramData            bodies[2] = { id: 'rod/body1', part: 'rod',
                                         faces[4] = { name: 'body/side[s.big]', kind: 'cylinder',
                                                      axis: { dir: [0,0,-1], radius: 3 } } }
                           triFace[t] === 4 for the triangles of the bore
        │ jigScene(program)
        ▼
Candela scene              group 'rod'  ⊃  shape.mesh(def 'rod/body1')
                           def.faces[4] = { id: 'body/side[s.big]',
                                            meta: { kind: 'cylinder', axis: [0,-1,0], radius: 0.003,   ← converted frame (§6.3)
                                                    feature: 'rod:body', featureType: 'extrude',
                                                    process: 'ground', material: 'steel' } }
        │ compile, render, id pass
        ▼
a pixel of the bore        id.instance = 7 (the rod's object number, whatever compile assigned), id.face = 4
        │ bridge.faceAt({ object: 7, face: 4 })
        ▼
back in jig                { component: 'rod', body: 'rod/body1', face: 'body/side[s.big]' }   →  "rod#body/side[s.big]"
```

Candela's face id is jig's face name, and Candela's node id is jig's component id. The bridge's own state is one table built during `jigScene`, *Candela object number → (component, body)*, which is all that is needed to go back.

**Addresses.** Every object the two systems share gets one textual address:

```
component[/component…]            rod, sub/slider          a component; in Candela, a group node with that id
component#face-name               rod#body/side[s.big]     one face of it
component#glob                    rod#body/side[s.*]       faces by glob, as Candela's matchFace already does
#face-name                        #body/end                a face of a single-part model
```

The `#` separates the two halves, because face names themselves contain `/`. Using jig paths as Candela ids needs Candela's id grammar widened to allow `/` and `.` (`scene.ts:79`). That is a one-line change, decision D2.

**What crosses in each direction.**

| from jig to Candela | from Candela to jig |
| --- | --- |
| meshes, face tables with names, kinds and axes, in Candela's frame | a pick or an id-pass pixel, mapped to `component#face` |
| component structure as nested groups with ids | material edits, as lines in `look.js` that name jig addresses |
| part material, finish and colour metadata, merged per face | render outputs, whose EXR id passes can be mapped to names afterwards |
| poses per component, from studies, drags or outside engines | – |
| params: a jig param change triggers a rebuild | – |

**Building the scene: `jigScene(program, options)`.** A look file uses it like this:

```js
// look.js: a Candela scene file that renders the open jig program
import { scene, light, camera, hdri, finish } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig:program';             // the open program's ProgramData, provided by the workbench host

const asm = jigScene(program, { autoFinish: true, quality: 'render' });
asm.face('rod#body/side[s.*]', finish.ground({ metal: 'bearing-steel' }));   // both pin bores
asm.find('crank').material(finish.blackOxide({ process: 'milled' }));        // the whole crank

export default scene()
  .add(asm)
  .ground({ color: 0.18 })
  .add(light.env.hdri(hdri.studio(), { rotate: 30 }))
  .camera(camera.thinLens().at(asm.view('axo').at).target(asm.center()).fstop(5.6));
```

What `jigScene` does, in order:
1. **Group bodies by component.** It groups the bodies by their `part` field, which is the component id, and makes each component a `scene.group([...]).id(componentId)`. Subassemblies become nested groups following `prog.structure()`, so a pose of a subassembly moves everything inside it.
2. **Build one mesh definition per body.** It calls `mesh.fromArrays` with the body's arrays, converted to Candela's frame (§6.3). It passes `faceIds = triFace` and `faces = body.faces.map(f => ({ id: f.name, meta }))`. Each face's `meta` merges, later entries winning:
   - the face's kind and axis;
   - its feature and feature type, from the graph;
   - the inferred process (§6.4);
   - the part's material;
   - the explicit finish and colour recorded in jig (§6.4).
3. **Instance each definition** with `shape.mesh(def)` at the body's transform. It calls `.autoFinish()` when `options.autoFinish` is set, so every face gets a material from its meta unless the look overrides it.
4. **Return the group with the bridge helpers.** These are new, not part of Candela today:

```ts
// jig-candela (TypeScript signatures; a sketch of the API)
export function jigScene(program: ProgramData, o?: { autoFinish?: boolean; quality?: 'preview' | 'render' }): JigGroup;
interface JigGroup extends CandelaGroup {
  find(address: string): CandelaNode;                        // 'rod' → the component's group; E104 with did-you-mean if absent
  face(sel: string | FacePredicate, m: Material): JigGroup;  // 'rod#body/side[s.big]', 'rod#body/side[s.*]', or a predicate
  faces(sel: string | FacePredicate): FaceRef[];             // what a selector matches; for the UI and the agent
  view(name: 'axo' | 'front' | 'side' | 'plan'): { at: Vec3; target: Vec3; fov: number };   // jig's views, §6.5
  center(): Vec3; bounds(): [Vec3, Vec3];
  posesAt(study: string, x: number): Record<string, Pose>;   // §6.6
  faceAt(hit: { object: number; face: number }): { component: string; body: string; face: string } | null;
}
type FacePredicate = (f: { component: string; id: string; meta: FaceMeta }) => boolean;
// FaceMeta: { kind, axis?, center?, radius?, normal?, feature, featureType, process?, material?, finish?, color? }
```

**Two selector languages, each in its own place.** jig users select faces with jig selectors, such as `j.feat('body').sideFaces()` or `.edges('|Z')` (`reference.md:194`). These are evaluated against OpenCascade topology in jig's worker. A look file runs on the page, in Candela's build, and has no OpenCascade. The design therefore keeps each language where its data is:
- **In the jig script, use jig selectors.** `.finish(j.feat('body').sideFaces(), { process: 'ground' })` is resolved in the worker during `finalize` (§6.4). It arrives as face meta, so it works in every renderer and in the CAD package.
- **In `look.js`, use addresses, globs, or predicates over the face meta the bridge provides.** For example, `asm.face(f => f.meta.featureType === 'hole', finish.ground())` selects every face made by a hole feature, and `f.meta.kind === 'cylinder' && f.meta.radius < 0.004` selects small bores.
- **What was rejected.** Evaluating jig selectors from `look.js` (`jig.faces("j.feat('body')…")`) would put an asynchronous worker round trip in the middle of every look build, and two selector languages into one file (decision D9).

**From the render back to jig.** `faceAt` turns a pick (`host.ts:310`) or an id-pass pixel into `{ component, body, face }`. The Render view uses it to:
- highlight the face on jig's stage, which already knows face names;
- open `why()` on the face, jig's explanation of how it came to be;
- offer the material library for exactly that face.

The same mapping applied to a saved EXR's `id.instance` and `id.face` channels turns a render into a per-face mask, for compositing.

**In the agent's hands.** The bridge is plain JavaScript, so jig's agent can use it in its sandboxed eval: `render.faces('rod#body/side[*]')`, `render.setFinish('rod#body/side[s.big]', { process: 'ground' })` (§6.5).

**The live channels.** Each kind of change reruns a different amount of work. Keeping them separate is what makes the view feel live:

| change | what reruns | cost |
| --- | --- | --- |
| a jig param, or an edit to the jig script | jig worker → new ProgramData → `jigScene` → Candela build → BVHs for changed bodies | up to seconds for large assemblies |
| an edit to `look.js` or a Candela param | Candela build; meshes come from the cache | a shader compile only if the program changed |
| a pose (study scrub, drag-to-pose, outside dynamics) | `vp.setPoses(...)`, a repack | milliseconds |
| the camera | `vp.setView(...)` | restarts accumulation only |

To make the first row cheaper, `jigScene` caches mesh definitions by a content hash of the body's arrays, so an edit that leaves a part unchanged reuses its BVH.

### 6.3 The CAD package: the data contract on disk

On the page, the bridge reads ProgramData directly. For `candela-rt`, for files on disk, and for projects like the Compur, the same data needs a stable serialised form. That form is the **CAD package**, written by a new export format, `export('candela')`, added next to `stl`, `step` and `3mf` in the dispatch at `jig:import/jigcad/src/engine/io.js:223`. For F-06 it looks like this:

```jsonc
{
  "format": "jig-cad-package", "version": 1,
  "source": { "name": "needle-bar drive", "hash": "<ProgramData.hash>", "jig": "<version>" },
  "frame": { "units": "m", "up": "+y", "fromJig": "p_candela = 0.001 · (x, z, −y)" },
  "components": [                                                    // the product tree; ids are jig paths
    { "id": "frame", "parent": null, "material": "steel", "color": null },
    { "id": "rod",   "parent": null, "material": "steel", "color": null }
  ],
  "bodies": [
    { "id": "rod/body1", "component": "rod", "transform": [16 numbers, converted],
      "positions": "<base64 f32>", "normals": "<base64 f32>", "indices": "<base64 u32>", "triFace": "<base64 u32>",
      "faces": [ { "id": "body/side[s.big]",
                   "meta": { "kind": "cylinder", "axis": [0, -1, 0], "center": [...], "radius": 0.003,
                             "feature": "rod:body", "featureType": "extrude", "process": "ground", "material": "steel" } } ] }
  ],
  "studies": { "cycle": { "drive": "main", "unit": "deg", "x": [0, 1, …, 360],
               "poses": { "crank": "<base64 f32, 16 per row>", "rod": "<…>", "slider": "<…>" } } },
  "views": { "axo": { "yaw": 0.663, "pitch": 0.471 } }
}
```

**Rules that keep the contract unambiguous.**
- **One frame conversion, applied once, recorded in `frame`.** jig works in millimetres with +Z up. Candela's CAD path works in metres with +Y up, with the machine's front toward +Z, which is what `convert.py:177` uses.
  - Points map as p′ = C·p, with C = 0.001 · R and R(x, y, z) = (x, z, −y), a rotation of −90° about X.
  - Normals, axis directions and other directions use R alone.
  - Radii and lengths are scaled by 0.001.
  - Body transforms are conjugated, T′ = C·T·C⁻¹, because the vertices they act on were converted too.

  Nothing downstream converts again. In the example, axis (0, 0, −1) becomes (0, −1, 0), and r = 3 mm becomes 0.003 m.
- **Ids are jig's**, unescaped. Component ids are assembly paths and face ids are persistent names.
- **Render-quality tessellation.** The stage meshes with a chord deflection of 0.05–0.2 mm and an angular deflection of 0.3 rad (`mesh.js:7-11`). That is fine for a drawing, but shows facets in a close-up of a reflective bore. `quality: 'render'` meshes at a finer angle, around 0.1 rad.
- **Arrays.** They are base64 in JSON, as `meshes.json` already is, and transferable typed arrays in memory.

The package replaces `convert.py` and the Compur's private `meshes.json` writer. A Candela preset can load it with `jigScene(await loadPackage('drive.jigcad.json'))`. That lets `candela-rt render` work on a jig model without a browser once `render` accepts a scene directory as well as a preset id (§7).

### 6.4 Appearance in jig: process inference and explicit finishes

Candela's `autoFinish` needs a `material`, a `process` and an axis per face. jig can supply all three without the user writing anything, and lets the user override any of them.

**Inferred process.** The bridge reads the feature type from the graph (`rod:body` is an `extrude`) and the face kind and axis from the face record:

| face made by (feature type) | face kind | inferred `process` | grooves around / along |
| --- | --- | --- | --- |
| revolve: the turned surface | cylinder, cone, torus | `turned` | the revolve axis |
| revolve: a flat end across the axis | plane | `faced` | the revolve axis |
| hole feature (bore, counterbore, countersink) | cylinder, cone | `ground`, the closest look to a reamed bore | the hole axis |
| extrude: an inner circular loop of the profile (the rod's `body/side[s.big]`) | cylinder | `ground` | the cylinder axis |
| extrude: outer sides, pockets | plane, cylinder | `milled` | the extrude direction |
| gear teeth (`j.lib.gear`) | bspline, plane | `hobbed` | the gear axis |
| fillet, chamfer | any | the process of the faces it joins: `milled` unless both are `turned` | – |
| any face of a polymer part | any | none: the material alone gives a moulded or printed look | – |

These rules are a default, not a model of manufacturing. They encode what `convert.py` guessed from normals, but they work from what jig actually knows.

**Explicit finishes** are a small new API on parts and assemblies, in the style of `.color(sel, c)`:

```js
const crank = bar('crank', r, 14, 6)
  .finish({ finish: 'black-oxide' })                          // the whole part
const rod = j.part('rod').material(steel)
  .extrude(rodOutline.profiles(), mm(5), { id: 'body' })
  .finish(j.feat('body').sideFaces(), { process: 'milled' })  // some faces: overrides the inferred process
const head = j.assembly('needle-bar drive') /* … */
  .finish('slider', { finish: 'paint', color: '#7a1f1f' })    // a component of an assembly
```

How a finish travels:
- **Recording.** `.finish()` records `{ selector, meta }` on the part, as `.material()` and `.color()` do.
- **Resolving.** `finalize` resolves each selector to face names in the worker and writes the merged `meta` into each face record. So a part's finish is visible in ProgramData and in the CAD package, without any renderer present.
- **Caching.** Finishes are excluded from jig's geometry cache key, as colour and material already are (`program.js:192`: `excludes: ['color', 'material', 'display name']`). Changing a finish never re-runs OpenCascade.

**One material vocabulary.** jig's `MATERIALS` and Candela's finish vocabulary overlap but differ:

| jig `MATERIALS` | Candela (`finish.ts`) |
| --- | --- |
| steel, stainless, aluminium | same names in `METAL_F0`; Candela also accepts aliases such as `aluminum`, `inox` and `52100` |
| PLA, ABS | `pla`, `abs` in `POLYMERS` (Candela lower-cases keys, `finish.ts:30`) |
| PETG, ASA, PP, TPU-95A, PA-CF, resin-standard | not in `POLYMERS` (which has abs, nylon/pa, pom, peek, ptfe, pla, pc, rubber, pu); to add |
| – | brass, bronze, copper, titanium, chrome, nickel, zinc, cast-iron, bearing-steel: Candela only |

The fix is one list. Candela's names become the appearance vocabulary. jig's engineering table gains the metals Candela knows, with density, cost and modulus; that alone lets the Compur write `.material(j.material('brass'))` instead of a comment. Candela's `POLYMERS` gains the printing polymers jig knows.

### 6.5 The Render view

The Render view is a new workbench view, registered beside `stage` and `mechanism` (`jig:import/jigcad/src/ui/app.jsx:26`, `layouts.js:16`). It owns:
- a canvas;
- a Candela `Viewport`;
- a small host object, a slimmed version of Candela's `Host`, without its agent and UI.

```
 jig host (program, files, params)                              Render view
 ──────────────────────────────────                            ───────────────────────────────────────────
 engine worker ── ProgramData ─────────────▶ jigScene(program) ─┐
                                                                 ├─▶ Candela build (look.js + bridge)
 look.js (a text file in the project) ───────────────────────────┘          │ compile
                                                                             ▼
                                                          Viewport.load ── WebGPU accumulate ──▶ canvas
 Mechanism view: study scrub, drag ─ poses ─────────────▶ Viewport.setPoses (repack)
 stage camera (yaw, pitch, zoom) ───── view ────────────▶ Viewport.setView
 click on the render ─▶ pick ─▶ faceAt ─▶ rod#body/side[s.big] ─▶ highlight on the stage, material popover
 material popover ─▶ one line added to look.js ─▶ rebuild
```

**What it does.**
- **Rebuilds.** The view rebuilds when ProgramData or `look.js` changes, with the costs of §6.2: geometry changes rebuild, look changes recompile only if needed, and poses only repack.
- **A default look.** A project with no `look.js` gets one generated in memory:
  - `jigScene(program, { autoFinish: true })`;
  - a studio HDRI and a ground;
  - a camera from the stage's current view.

  A new user therefore sees a reasonable render immediately, and the file is written to the project only on the first customisation.
- **The material library.** It is Candela's vocabulary as thumbnails: metals × processes × coatings, polymers, glass, rubber. The thumbnails are rendered once, by WebGPU or `candela-rt`.
- **Dropping a material.** Dropping onto the render picks the face under the pointer; holding a modifier targets the whole component. A drop writes one line to `look.js`, for example `asm.face('rod#body/side[s.big]', finish.ground({ metal: 'bearing-steel' }))`, and rebuilds.

**Cameras.** jig's stage is orthographic; Candela's cameras are perspective (`camera.pinhole`, `camera.thinLens`, `scene.ts:426-427`). The Render view offers:
- **The stage's view as a perspective camera:** the same yaw and pitch, a distance that frames the same box, and a long lens (about 100 mm equivalent), so the render looks close to the drawing. This is `asm.view(name)`.
- **A free orbit camera,** as Candela's Host does (`host.ts` `orbit`).
- **Camera bookmarks** saved in `look.js`, plus a click to set focus, using `focusOn`.

A true orthographic camera in Candela would make the render match the drawing pixel for pixel. That matters only for overlaying jig's hidden-line edges on a render (a "technical illustration" mode), so it is deferred (decision D6).

**What the agent gets.** The view registers `render.*` calls in the agent's sandbox scope:
- `render.still({ size, spp })` and `render.study('cycle', { fps })`;
- `render.pick(x, y)` and `render.faces(sel)`;
- `render.setFinish(address, meta)`;
- `render.screenshot()`.

The agent can then dress and render a model the way it already edits and inspects one.

### 6.6 Motion: poses from studies, drags and outside engines

Candela accepts poses by node id, and the bridge makes node ids equal to jig component ids. Three sources feed the same channel.

1. **Studies.**
   - `.study(name, { …, poses: true })`, or the CAD-package exporter, asks the study to keep `S.transforms()` for every row. `runStudy`'s `onRow` hook already supports this (`assembly.js:307`).
   - Memory is small: 361 rows × 30 components × 16 floats is about 0.7 MB in float32.
   - The package carries them as `studies.<name>.poses` (§6.3).
   - `posesAt(study, x)` interpolates between rows: positions linearly, quaternions linearly with the shorter-arc sign, as K-09's `frameAt` does (`K-09-lockstitch.js:36-41`).
2. **Drag-to-pose.** `prog.dragPose` already returns every component's transform (`assembly.js:131`). The Mechanism view forwards them with `vp.setPoses`.
3. **Outside engines.** The Compur's dynamics give one coordinate per part per frame, and `partMatrix` turns it into a transform. An adapter of a few lines maps `{ partId: matrix }` to poses, and the 1/500 s shutter cycle renders with `camera.motionBlur({ shutter, steps })` (`scene.ts:408`).

A study rendered as a sequence:

```js
// look.js: time in seconds → the drive's value in degrees → poses for every component
const duration = 2;                                                         // one crank turn in 2 s
export const animation = t => asm.posesAt('cycle', (t / duration) * 360);
// Render view or agent:
render.sequence({ start: 0, end: duration, fps: 24, spp: 64, format: 'mp4' });   // with .motionBlur({ angle: 180 }) on the camera
```

This is where the lockstitch head can go next. Today its motion comes from the kine rig, baked to JSON and converted. Since JIG-014, jig solves the same kind of mechanism itself; F-06 is the needle-bar drive with its `cycle` study. A jig version of the whole head with studies would render with no kine bake and no converter, because the poses would come from jig's own solve. The closures the rig solves analytically (the zigzag gate, the check spring) are where to check jig's solver against the rig's frames (§10).

## 7. candela-rt as a sidecar

On a machine with an NVIDIA GPU, final renders and a faster live view should go to `candela-rt`, with no change to what the user writes.

**Discovery and launch.** `jigcad serve` gets a flag `--render auto|off|<path>`. In `auto` mode:
1. It looks for a `candela-rt` binary: the flag's path, then `PATH`, then the repository's build directory.
2. It asks the binary what it can do. No probe command exists today, so this design adds `candela-rt info`. It prints JSON with the CUDA devices, OptiX availability and the bundle hash, and exits non-zero when there is no usable device.
3. If a device is present, it starts the sidecar as a child process:

```go
// pkg/render (proposed): start the sidecar and proxy it (sketch)
token := randomToken()
cmd := exec.CommandContext(ctx, bin, "serve", "--bind", "127.0.0.1", "--port", strconv.Itoa(port),
    "--token", token, "--bundle", filepath.Join(dist, "candela-core.js"))     // serve defaults to --bind 0.0.0.0
cmd.Stdout, cmd.Stderr = logWriter("candela-rt"), logWriter("candela-rt")
// restarted with backoff if it exits; stopped with the server
mux.Handle("/rt", wsProxy("ws://127.0.0.1:"+strconv.Itoa(port), token))     // the proxy adds the token
mux.Handle("/renders/", reverseProxy("http://127.0.0.1:"+strconv.Itoa(port)))  // job outputs
mux.HandleFunc("GET /api/capabilities", caps)   // { rt: true, backends: ['optix', 'cuda'], denoise: 'ai', device: 'GB10' }
```

**Why the sidecar sits behind the proxy.**
- **Same origin.** Candela's workbench connects to `ws://<page host>:8790` by default (`remote.ts:18`). Proxied, the sidecar is reached at `/rt` on the same origin as the workbench, so there is no second port, no cross-origin request, and one TLS front end covers both.
- **The secure-context problem.** That is the problem Candela's README describes: a page served over plain HTTP from another machine loses WebGPU.
- **Nothing exposed.** The sidecar listens only on localhost, with a token the browser never sees.

**The session, step by step.**

```
browser (Render view)                   jigcad serve (Go)                 candela-rt
GET /api/capabilities  ───────────────▶ { rt: true, … }
ws /rt  ──────────────────────────────▶ proxy (+ token) ────────────────▶ hello
files { look.js, drive.jigcad.json } ───────────────────────────────────▶ build + compile in V8 → built { irHash }
                                                                         (the browser compares with its own irHash)
view, poses, clock ─────────────────────────────────────────────────────▶ OptiX accumulate → frame (JPEG) …
render { size, spp, sequence, format: 'mp4', denoise: 'ai' } ──────────▶  job → files under /renders/…
```

The `files` message today carries Candela scene files. A CAD package is one more file, so the bridge module must be inside `candela-core.js`, or sent with the files, for the sidecar to build it (§8.2).

**Failure handling.**
- **No sidecar.** `capabilities.rt` is false and the Render view hides OptiX mode. Everything works on WebGPU or WebGL2.
- **Sidecar crash.** The WebSocket closes, the view falls back to local rendering, and the server restarts the process.
- **Different builds.** If the `irHash` differs between browser and sidecar, the view shows the warning Candela already implements (`remote.ts` `mismatch`), and the local image stays authoritative.

## 8. Packaging and merging the two repositories

### 8.1 What has to be shared, and what does not

Candela's engine (`candela:src/engine`, 7,332 lines of TypeScript) has no runtime npm dependencies.
- **The non-DOM entry already exists.** `core.ts` exports `build`, `SceneSession`, `openRender`, the CUDA and OptiX targets and digests. esbuild bundles it into `candela-core.js`, an IIFE defining `globalThis.Candela`.
- **The browser-only layer is small:** `viewport.ts`, `render.ts`, `output.ts` (with `RenderQueue`) and `video.ts`.
- **A few browser-host pieces live in the app and should move into the engine:** `RemoteRender` (`candela:src/app/remote.ts`) and the picking code (`host.ts:310`).
- **jig does not need the React workbench:** `candela:src/app`, with its agent and UI, together with its Vite, React, Playwright and Dawn dependencies, which are development tooling.

### 8.2 Target layout

```
jig/
  cmd/jigcad, pkg/server             Go: serves the workbench; pkg/render starts and proxies candela-rt
  import/jigcad/                     jig's workbench and engine (JavaScript), as today
    src/render/                      new: the jig-candela bridge, the Render view's host, the material library
  import/candela/                    the pbr-spark repository, moved in whole (history kept, relative paths intact)
    src/engine/core.ts               non-DOM entry (exists); gains the bridge, so candela-rt can build CAD packages
    src/engine/view.ts               new browser entry: Viewport, renderers, RenderQueue, RemoteRender, pick
    src/app, scripts, tests          Candela's own workbench and tools (their own package.json; development only)
    native/rt/                       candela-rt (CMake; built only where there is an NVIDIA GPU)
    content/                         presets and docs
```

**The build.** jig's `build.mjs` gains two esbuild entries that read `import/candela/src/engine` directly. esbuild strips TypeScript, so no new toolchain is needed:
- `dist/candela-core.js`, the same IIFE as today. The page loads it, and the sidecar gets the same file with `--bundle`. Browser and sidecar then run byte-identical engine code from one commit, so an `irHash` mismatch means a real bug rather than version drift.
- `dist/candela-view.js`, ESM that takes the core from `globalThis.Candela`, so the core is loaded exactly once.

**Where the bridge lives.** It is needed by both hosts: the page builds `look.js`, and so does the sidecar. It therefore belongs in the core bundle. The bridge reads only plain records (ProgramData bodies or a CAD package), not jig's engine, so it adds no OpenCascade dependency to Candela.

**Where things run.** jig's worker, which holds OpenCascade, produces ProgramData or the package. The page's main thread runs the Candela build, the bridge and the `Viewport`, because WebGPU draws into the page's canvas.

### 8.3 Order of operations, given the OptiX work in progress

Someone is actively working on `candela-rt` and OptiX in pbr-spark; the JavaScript engine is expected to change little. The merge must not move their repository under them.

1. **Now: vendor, do not move.**
   - A `make vendor-candela REF=<sha>` target copies `src/engine/**` and the docs from a pbr-spark checkout into `import/jigcad/vendor/candela/`.
   - It records the commit in `VERSIONS` and the hashes in `SHA256SUMS`, as `vendor/fea` does.
   - jig's integration work (§9, phases 1–4) is built against that copy, and `candela-rt` is built from pbr-spark.
   - Changes jig needs in the engine (the id grammar, `info`, the bridge in the core) go to pbr-spark as ordinary pull requests and come back with the next vendoring.
2. **When the OptiX branch has landed: `git subtree add --prefix=import/candela`** from pbr-spark, which keeps its history.
   - Until the OptiX developer switches, `git subtree pull` brings their commits into jig, and `git subtree push` sends fixes made in jig back.
   - Then cut over: jig becomes upstream, and pbr-spark becomes read-only, archived or kept as a mirror with `git subtree split`.
3. **CI.**
   - The JS jobs run on every pull request: jig's suites, plus Candela's `validate`, `test:golden` and `test:session` (`candela:package.json` scripts).
   - The native build and the WGSL-versus-CUDA parity sweep (`candela:scripts/parity-sweep.ts`, `candela-rt cuda-sweep`) run only on a self-hosted runner labelled `nvidia`, the DGX Spark.
4. **Releases.** The `jigcad` binary embeds the JavaScript, including Candela's two bundles. `candela-rt` is a separate, optional artifact per platform (arm64 and x86-64 with CUDA), which `jigcad` finds at run time (§7).

**Smaller decisions.**
- Keep Candela in TypeScript.
- Candela's docmgr tickets stay under `import/candela/ttmp`, and new tickets go in jig's `ttmp`.
- Candela's docs become a "Rendering" section in jig's help.

## 9. Implementation plan

Each phase ends with something a user can see and a test that would fail without it.

**Phase 0: vendoring, and a Candela that accepts jig ids.**
- `make vendor-candela REF=…` (`jig:Makefile`, `import/jigcad/vendor/candela/`).
- In Candela, widen the `.id()` grammar to `[\w./-]` (`candela:src/engine/scene.ts:79`), and check that W170 and poses work with path ids.
- Done when `build.mjs` produces `dist/candela-core.js` and `dist/candela-view.js`, and a jig test in Node imports the core and builds a one-box scene.

**Phase 1: the bridge and the CAD package, headless.**
- `bodyData` carries the part's `material` (`jig:…/program.js:72`, `mesh.js:91`).
- `import/jigcad/src/render/bridge.js`:
  - `jigScene(program, o)`, with the frame conversion, face tables, groups per component and the helpers of §6.2;
  - face meta with the inference rules of §6.4.
- `export('candela')` in `io.js`, writing the package of §6.3, with `quality: 'render'` tessellation.
- Tests:
  - **F-06 rod.** Face `body/side[s.big]` of `rod/body1` comes out as a face-table entry with `kind: 'cylinder'`, axis (0, −1, 0), radius 0.003, `featureType: 'extrude'` and process `ground`. The conversion conjugates the transform, so the rod's bounding box in Candela equals 0.001 · R applied to jig's bounding box.
  - **Lockstitch.** Compile the lockstitch parts (`lockstitch:animation/cad/scripts.json`) through the worker, build a package, and compare face counts and names with `lockstitch-data.js`. For lathe parts, jig's exact axes must agree with the converter's fitted axes within a degree.

**Phase 2: appearance in jig.**
- `.finish()` on parts and assemblies, with selectors resolved in `finalize`, merged into face meta, and excluded from the geometry cache key.
- One vocabulary: add PETG, ASA, PP, TPU, PA-CF and resin to Candela's `POLYMERS`; add brass, bronze and copper to jig's `MATERIALS`, with density, cost and modulus.
- Tests:
  - a finish change does not re-run OpenCascade (the trace shows `cached`);
  - `autoFinish` on an inferred turned face gives an anisotropic material whose tangent runs around the revolve axis;
  - the Compur's housing can say `.material(j.material('brass'))`.

**Phase 3: the Render view.**
- Register the view (`app.jsx`, `layouts.js`), with its canvas and `Viewport`.
- A host following `candela:src/app/host.ts` (build, load, setView, setPoses), the default in-memory `look.js`, and the camera from the stage's view.
- Picking through `faceAt` to highlighting on the stage; the material library; drop-to-edit `look.js`.
- Tests:
  - a headless screenshot of F-06 in the Render view;
  - a scripted drop on the rod's bore writes `asm.face('rod#body/side[s.big]', …)` to `look.js` and triggers a rebuild.

**Phase 4: motion.**
- `.study(…, { poses: true })` keeps transforms; `posesAt`.
- The Mechanism view forwards drags, and the Render view renders sequences with motion blur.
- The Compur adapter, as an example in `content/`.
- Tests:
  - the rod's pose from `posesAt('cycle', 30)` equals its transform in a plain compile at the default drive of 30°;
  - a 4-frame sequence encodes to MP4.

**Phase 5: the sidecar.**
- In Candela: `candela-rt info`; `render` also accepting a scene directory; the bridge in the core bundle.
- In jig: `pkg/render`, with detection, the child process, restart, the `/rt` and `/renders/` proxies and `/api/capabilities`. The Render view's OptiX mode uses `RemoteRender`, moved into `view.ts`.
- Tests:
  - Go tests with a fake sidecar (a WebSocket echo server) for proxying, the token and restart;
  - on the `nvidia` runner, one 1080p still of F-06 through `/rt`, with `irHash` equal to the browser's.

**Phase 6: the merge.** `git subtree add`, the CI jobs, the release artifact for `candela-rt`, and the docs in jig's help.

## 10. Testing strategy

- **The contract.**
  - The CAD package has a JSON schema and golden files: one part, F-06 (an assembly), one assembly with a subassembly, and one study. A bridge change that alters output fails them.
  - The bridge tests run in Node with no GPU, because Candela's build and compile do not need one.
- **Two reference projects as integration tests.**
  - The **lockstitch head** checks face names, axes and process inference against what `convert.py` produced. Later, once the head is a jig assembly with studies, it checks jig's study poses against the kine bake (`rigdata.json`) within a tolerance.
  - The **Compur** checks brass, many small parts, and poses from an outside engine.
- **Image checks.**
  - Candela already has the tooling: `scripts/render-preset.ts` renders a preset headless through the workbench's own render queue, and `scripts/compare-pfm.ts` and `parity-sweep.ts` compare images.
  - Render tests compare PFMs at low sample counts with fixed seeds, by statistics such as the mean and a few region means, not by exact pixels, across WebGPU and OptiX.
  - `render-preset.ts` refuses a software rasteriser unless given `--allow-software`. CI machines without a GPU use that flag at small sizes, and the OptiX comparisons run only on the `nvidia` runner.

## 11. Decisions

| id | decision | alternatives | why | status |
| --- | --- | --- | --- | --- |
| D1 | Join materials to geometry by jig component id + persistent face name | triangle ranges; import order; a separate id map | the names already survive edits; a map would be a second source of truth | proposed |
| D2 | Widen Candela's node id grammar to allow `/` and `.` | escape jig paths (`sub__slider`) | escaping leaks into every pose, pick and message; ids are map keys only (`compile.ts:187`, `:814`) | proposed |
| D3 | The look is a Candela scene file (`look.js`), edited by the UI | appearance stored in jig scripts; a JSON look format | Candela's API already expresses everything; text stays diffable and agent-editable | proposed |
| D4 | Infer `process` from feature type and face kind; `.finish()` overrides | always explicit; fit axes from normals, as `convert.py` does | jig knows how a face was made and its exact axis | proposed |
| D5 | One frame conversion, p′ = 0.001 · (x, z, −y), in the exporter, recorded in the package | convert in Candela; render in jig's frame | one place to get it right; matches K-09 | proposed |
| D6 | Perspective camera from the stage view now; an orthographic camera in Candela only if the technical-illustration overlay is wanted | add orthographic first | not needed for photographic renders | open |
| D7 | Vendor Candela's engine now; subtree-merge pbr-spark after the OptiX work lands | merge now; two repositories with a published package | does not disturb active work; one repository afterwards keeps browser and sidecar on one commit | proposed |
| D8 | `candela-rt` is an optional sidecar behind `jigcad serve`, on localhost with a token, proxied on the same origin | the browser connects to port 8790; link candela-rt into jigcad | same origin avoids cross-origin and secure-context problems; a separate process keeps CUDA out of the Go binary | proposed |
| D9 | jig selectors belong in jig scripts (`.finish(sel, meta)`); `look.js` selects by address, glob or face-meta predicate | evaluate jig selectors from `look.js` through the worker | no worker round trip inside a scene build; the face meta makes predicates expressive enough | proposed |

## 12. Risks and open questions

- **Bundle size.** The `jigcad` binary already embeds OpenCascade (29 MB). Candela's engine is small, but HDRIs and presets are not, so HDRIs should be fetched on demand rather than embedded.
- **Main-thread load.** In this design, Candela's build and BVH construction for a large assembly run on the main thread. If that blocks the UI for big models, BVH building can move to a worker, since mesh definitions are plain arrays.
- **Precision.** Candela is single precision, without camera-relative coordinates (`24-cad.md` "Not here"). Machine-sized assemblies in metres are fine; a factory floor is not.
- **No surface textures.** Knurling (the Compur's speed ring) and engraved text must be geometry, which jig can emboss, or procedural.
- **Two pose sources.** When a scene has both `animation(t)` and external poses, the external ones win id by id (`session.ts:38-47`). The Render view must show which one is active.
- **Open: where `look.js` lives** for single-part scripts versus assemblies, and how it is named in a project with several models.
- **Open: whether jig's agent also gets Candela's agent tools** (an eval in a Candela scope, screenshots), or only the `render.*` calls of §6.5.

## 13. File reference

| file | what to read it for |
| --- | --- |
| `jig:import/jigcad/content/presets/F-06-slider-crank-mechanism/script.js` | the running example: parts, ports, joints, the `cycle` study |
| `jig:import/jigcad/src/engine/mesh.js:7-100` | tessellation (`meshBody`), `triFace`, `faceMeta`, `bodyData` |
| `jig:import/jigcad/src/engine/program.js:55-150` | `finalize`: what ProgramData contains; bodies; the feature graph |
| `jig:import/jigcad/src/engine/body.js`, `kernel.js:222-264` | persistent names (`carryNames`); `faceInfo` kinds and axes |
| `jig:import/jigcad/src/engine/assembly.js:79-140`, `:307` | `programOf`: `structure()`, `dragPose`, studies' `onRow` |
| `jig:import/jigcad/src/engine/io.js:223` | the export dispatch, where `candela` goes |
| `jig:import/jigcad/src/engine/worker.js:160-255` | the worker protocol: ops and `call` methods |
| `jig:import/jigcad/src/engine/inspect.js:14` | `MATERIALS` |
| `jig:import/jigcad/content/docs/reference.md:183` | `.color(sel, c)`, the model for `.finish(sel, meta)` |
| `jig:import/jigcad/src/ui/app.jsx:26`, `layouts.js` | registering a workbench view |
| `jig:pkg/server/server.go:75-82`, `jig:cmd/jigcad/main.go:60-70` | server routes and flags |
| `candela:content/docs/24-cad.md` | the CAD path in prose: meshes, faces, finishes, poses, motion blur, output |
| `candela:src/engine/mesh.ts:53, 287` | `matchFace`, `mesh.fromArrays` |
| `candela:src/engine/scene.ts:79, 147-165, 381, 408, 426-448` | `.id`, `shape.mesh` / `.face` / `.autoFinish`, HDRI light, motion blur, cameras, ground |
| `candela:src/engine/finish.ts` | the finish vocabulary (`METAL_F0`, `POLYMERS`) and `fromMetadata` |
| `candela:src/engine/viewport.ts`, `candela:src/app/host.ts` | driving a viewport: build, poses, pick, render |
| `candela:src/engine/output.ts:180` | `RenderQueue`, EXR passes |
| `candela:src/engine/core.ts`, `scripts/bundle-core.ts` | the non-DOM bundle `candela-rt` loads |
| `candela:native/rt/src/main.cpp`, `serve.cpp`; `src/app/remote.ts` | `candela-rt` commands, the live server and its client |
| `candela:scripts/scene-package.ts` | Candela's post-compile scene package (not the CAD package) |
| `candela:tools/lockstitch/README.md`, `convert.py`; `content/presets/K-09-lockstitch.js` | the existing jig → Candela path |
| `lockstitch:README.md`, `animation/src/rig.mjs`, `animation/web/meshes.json` | the lockstitch project's rig and body records |
| `compur:README.md`, `cad/build.mjs`, `cad/parts.mjs`, `web/sim.js`, `web/app.js:520` | a jig project with its own dynamics |
| this ticket's `scripts/01-f06-face-records.mjs` | prints F-06's body and face records from jig's worker in Node |

**Where to start.**
1. Run jig's engine tests: `cd import/jigcad && node test/engine/run.mjs`.
2. Run this ticket's `scripts/01-f06-face-records.mjs` to see real body records.
3. Open `candela:content/presets/K-09-lockstitch.js` and read how it turns body records into `mesh.fromArrays` calls and groups. That loop is what the bridge automates.
