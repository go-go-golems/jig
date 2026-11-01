---
Title: 'Rust WebAssembly compute core: analysis, design and implementation guide'
Ticket: JIG-001-RUST-WASM
Status: active
Topics:
    - wasm
    - rust
    - cad
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/src/engine/inspect.js
      Note: mesh analyses ported to Rust
    - Path: repo://import/jigcad/src/engine/print.js
      Note: orientation ranking and meshSection
    - Path: repo://import/jigcad/src/engine/sketch/solver.js
      Note: solver loop for Phase 4
    - Path: repo://import/jigcad/src/engine/worker.js
      Note: init loads the Rust module
ExternalSources: []
Summary: How jigcad is built today, where its computation actually runs, and how a Rust crate compiled to WebAssembly takes over the numeric heavy lifting next to OpenCascade.
LastUpdated: 2026-10-31T00:00:00Z
WhatFor: Onboarding guide and implementation plan for the jigcad Rust/WebAssembly compute core.
WhenToUse: Read before touching src/engine/rs/*, rust/jig-compute/*, or any engine module that calls into the Rust core.
---

# Rust WebAssembly compute core: analysis, design and implementation guide

## 1. Executive summary

jigcad is a browser CAD workbench for 3D-printable parts. A user writes a short JavaScript program against a
builder language called **jig** (`j.part(...).extrude(...).shell(...)`); a background Web Worker evaluates
the program, builds solid geometry with **OpenCascade** (a C++ CAD kernel compiled to WebAssembly), and returns a
plain-data description of the result (`ProgramData`) that the UI draws as a technical drawing.

The request behind this ticket is to make the tool "run on WebAssembly and Rust, doing all computations and heavy
lifting there". The first finding of this analysis changes the shape of that request: **most of the heavy lifting
already runs in WebAssembly**. A CPU profile of compiling all 72 bundled presets (section 4.2) attributes **89 %
of the time to the OpenCascade wasm module**. What remains in JavaScript is about 10 %, and it is concentrated in
a handful of numeric loops: mesh analyses for 3D printing (overhang, support volume, bed contact, mesh
clearance), layer slicing of meshes, polygon section properties, and the sketch constraint solver's linear algebra.

The design therefore is:

1. Keep OpenCascade as the boundary-representation (B-rep) kernel. Rewriting a B-rep kernel in Rust is a
   multi-year project and is explicitly out of scope (decision record D1).
2. Add a new Rust crate, `rust/jig-compute`, compiled to `wasm32-unknown-unknown` with **no dependencies and no
   wasm-bindgen** — a plain C ABI over linear memory (D2, D3). It is loaded inside the same engine worker as
   OpenCascade.
3. Move every non-B-rep numeric hot path into it, behind a thin JS bridge `src/engine/rs/` that keeps the existing
   JS function signatures, so the language, the worker protocol and the UI do not change (D4).
4. Keep the original JS implementations as a **reference and fallback**: if the Rust module fails to load, or a
   parity test disagrees, the engine still works (D5).
5. Prove each move with parity tests (Rust result equals JS result within tolerance) and with the existing engine
   and preset suites, and measure it.

The result is an engine in which the B-rep kernel (C++) and the numeric core (Rust) both run as WebAssembly, and
JavaScript is reduced to what it is good at here: the user-facing language, orchestration, naming and
data shaping.

## 2. Problem statement and scope

### 2.1 What is asked

- Make jigcad do its computations and heavy lifting in WebAssembly, written in Rust where we own the code.
- Produce an onboarding-quality guide that lets a new intern understand the system and continue the work.
- Implement the plan in phases, with commits and a diary.

### 2.2 In scope

- A Rust crate compiled to wasm, its JS loader, and the build integration (`build.mjs`, `dist/`).
- Porting these JS hot paths to Rust, with parity tests:
  - `meshTris` (world-space triangle soup with exact surface normals) — `src/engine/inspect.js`.
  - `orientationScore` and its support-column estimate — `src/engine/inspect.js`.
  - `meshGap` (mesh-to-mesh clearance with crossing and containment tests) — `src/engine/inspect.js`.
  - `meshSection` (plane ∩ triangle mesh → closed loops) — `src/engine/print.js`.
  - `loopsProps` (area, centroid, second moments of nested loops) — `src/engine/inspect.js`.
  - The dense linear algebra of the sketch solver (`qrcp`, `factorJ`, `cholSolve`) — `src/engine/sketch/linalg.js`.
- A design (and first slice) for moving the whole sketch solve loop into Rust via a residual "tape".

### 2.3 Out of scope (for this ticket)

- Replacing OpenCascade. It stays the B-rep kernel (D1).
- Changing the jig language, the worker protocol (`BUILD.md` §2) or `ProgramData` (`BUILD.md` §3).
- Moving the UI (preact) or the agent into Rust.
- The stage renderer's software rasteriser (`src/stage/raster.js`) runs on the **main thread**; it is a good
  later candidate and is designed in section 9 (Phase 5) but not implemented here.

## 3. System orientation (read this first)

### 3.1 What jigcad is, in one paragraph

A **preset** is a folder with a `script.js` (plus notes and data files). The script is the body of a function
that returns a *builder* — a description of a part, sketch, assembly or print job. Nothing is computed while the
script runs; the builder only records intent. **Compiling** the builder walks its feature timeline (sketch →
extrude → shell → fillet …), asks OpenCascade to build solids, names every face persistently, meshes the bodies
for display, runs print analyses, and packs everything into `ProgramData`. The UI (the "Kiln" workbench) shows
the code, parameters, a feature graph, a trace of compile passes, and a "stage" that draws the part like a
drafting sheet.

Here is the smallest real example (`content/presets/A-01-box/script.js`):

```js
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2), r: mm(3) })
  .extrude(
    j.sketch('base', { on: j.plane.XY })
      .rect('outline', 'w', 'd', { center: true, r: 'r' })
      .profiles(),
    'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
```

### 3.2 Essential terms

| Term | Meaning |
|---|---|
| **B-rep** | Boundary representation: a solid described by faces, edges and vertices with exact curves and surfaces. OpenCascade's native model. |
| **OpenCascade (OCCT)** | Open-source C++ CAD kernel. jigcad uses the `replicad_single` build compiled with Emscripten to a 22.9 MB wasm (`vendor/occt/`). |
| **replicad** | A JS convenience layer over OCCT (vendored in `vendor/replicad/`); jigcad uses it sparingly. |
| **Builder** | Immutable JS value produced by the script (`j.part`, `j.sketch`, …) that records what to build. |
| **Compile** | Turning a builder into `ProgramData` (worker side). Layers L0–L6 in the IR view. |
| **ProgramData** | The plain, structured-cloneable result of a compile: bodies with meshes, faces, edges, params, diagnostics, print info (`BUILD.md` §3). |
| **Sketch / solver** | 2D geometry with constraints (`coincident`, `distance`, …) solved numerically: dog-leg / Levenberg–Marquardt with rank-revealing QR. |
| **Mesh / triangle soup** | Triangles OCCT produces for display (`positions`, `indices`, `triFace`). Print analyses run on these. |
| **Overhang / support** | Faces pointing downward more than 45° from vertical need support material when printed; the support volume is estimated by casting columns down. |
| **Linear memory** | A wasm module's single `ArrayBuffer`. JS passes data to Rust by copying into it and passing offsets (pointers). |
| **C ABI** | Exported functions that only take and return numbers (`i32`, `f64`). No glue generator needed. |

### 3.3 Architecture today

```
 main thread (dist/app.js)                         engine worker (dist/worker.js)
 ─────────────────────────                         ──────────────────────────────────────────────────
 src/main.jsx          mount                       src/engine/worker.js   message loop: init, compile,
 src/host/host.js      state, files, compile  ──►                         call, solveSketch, export, run
 src/host/engine.js    promise RPC client     ◄──  src/engine/program.js  builder → ProgramData
 src/ui/*              Kiln workbench (preact)     src/engine/compile.js  feature timeline + cache
 src/stage/*           drafting-sheet renderer     src/engine/features.js extrude, shell, fillet, …
   raster.js           software depth buffer       src/engine/kernel.js   OCCT helpers (gp_*, topology)
 src/agent/*           coding agent panel          src/engine/mesh.js     tessellation → typed arrays
                                                   src/engine/inspect.js  mass, sections, overhang, gap
                                                   src/engine/print.js    orientation, plates, slicing
                                                   src/engine/sketch/*    sketch builder + solver
                                                   src/engine/oc.js       loads OCCT wasm  ──►  [OCCT wasm]
```

Evidence: `BUILD.md` §1 (architecture), `src/engine/worker.js:1-220` (protocol), `src/host/engine.js` (client).

### 3.4 Architecture after this ticket

```
 engine worker (dist/worker.js)
 ──────────────────────────────────────────────────────────────────────────────────────
 JS: language (j.*), compile orchestration, naming, selectors, ProgramData shaping
       │                                   │
       │ OCCT objects (embind)             │ typed arrays in / numbers out (C ABI)
       ▼                                   ▼
 [OpenCascade wasm, C++]            [jig-compute wasm, Rust]  ← new: rust/jig-compute
   B-rep modelling, booleans,         mesh registry, meshTris, orientation score,
   fillets, tessellation,             support columns, mesh gap, mesh sections,
   STEP export                        loop properties, dense linear algebra,
                                      (next) sketch solve loop on a residual tape
```

The new module is small (tens of KB), loads synchronously after a fetch, and has no imports except a trap
handler. JS keeps the function names it already uses (`meshTris`, `orientationScore`, `meshGap`, …); their
bodies call the bridge when it is available and the original code when it is not.

### 3.5 How data flows during one compile (what happens over time)

1. `host.compile()` posts `{ op: 'compile', files }` to the worker.
2. `worker.js:compileFiles` evaluates `script.js` → a builder.
3. `program.js:compile` → `compile.js:compilePart` walks features; each feature calls OCCT through `kernel.js`.
4. `mesh.js:meshBody` asks OCCT for a triangulation and copies it out of OCCT's heap into JS typed arrays.
5. Print analyses (`print.js`, `inspect.js`) turn the mesh into triangles and score build directions.
   **After this ticket:** the typed arrays are copied once into jig-compute's memory as a *mesh handle*; all
   per-direction scoring, support columns, sections and gaps run in Rust against that handle.
6. `ProgramData` is posted back; typed arrays are transferred, not copied.

## 4. Current-state analysis (with evidence)

### 4.1 The engine's compute is spread across three runtimes

| Runtime | What runs there | Files |
|---|---|---|
| OCCT wasm (C++) | solids, booleans, fillets, shells, sections, distances, tessellation, STEP | `vendor/occt/replicad_single.*`, called from `src/engine/kernel.js`, `features.js`, `mesh.js`, `inspect.js:35` (`sectionLoops`) |
| JS in the worker | language, params/units/expressions, sketch solver, profiles arrangement, mesh analyses, slicing, packing, hashing, IR text | `src/engine/*.js`, `src/engine/sketch/*.js` |
| JS on the main thread | UI, stage rasteriser, hidden-line drawing | `src/ui/*`, `src/stage/*` |

### 4.2 Measured profile

Command (from `import/jigcad`, after `gunzip -k vendor/occt/replicad_single.wasm.gz`):

```bash
node --cpu-prof --cpu-prof-dir=$SCRATCH/prof tools/preset-check.mjs --quiet   # 72/72 presets, 36 s wall
node ttmp/.../scripts/01-prof-summary.mjs $SCRATCH/prof                       # groups self time by module
```

| Category (self time) | ms | share |
|---|---:|---:|
| OCCT (wasm functions + its JS glue) | 32,055 | 89.0 % |
| `src/engine/inspect.js` (meshGap, orientation, support) | 1,657 | 4.6 % |
| `src/engine/sketch/*` (solver, linalg, profiles) | 467 | 1.3 % |
| `src/engine/kernel.js` (JS side of OCCT calls) | 379 | 1.1 % |
| garbage collector | 264 | 0.7 % |
| everything else in `src/engine` | < 0.2 % each | |

The top JS function overall is the grid builder inside `meshGap` (`src/engine/inspect.js:147`), followed by the
3-vector helpers it and `orientationScore` call (`cross`, `sub`, `dot` in `kernel.js`'s `V`). These are
allocation-heavy: every triangle becomes an object with seven arrays (`meshTris`, `inspect.js:108-128`), every
grid key is a string (`inspect.js:146`), every vertex dedupe uses `toFixed(5)` strings.

### 4.3 Why these JS paths are slow

- **Allocation per element.** `meshTris` creates `{a, b, c, n, area, face, cen}` with fresh arrays per
  triangle; `V.sub/V.cross` allocate per call. A 20k-triangle mesh produces ~200k short-lived arrays per call,
  and `rankCandidates` calls `orientationScore` for every candidate direction (`print.js:268-281`).
- **String keys.** Spatial grids use `"i,j,k"` keys (`inspect.js:146`), vertex dedupe uses `toFixed` strings.
- **Repeated work.** The same mesh is re-turned into triangles for each analysis (`program.js:103`,
  `print.js:145`, `print.js:164`, `rules.js:28`).

Rust over flat `f64` buffers removes all three: no per-element allocation, integer grid keys in a `HashMap<u64,_>`
or sorted cell lists, and one mesh handle reused across analyses.

### 4.4 The sketch solver

`src/engine/sketch/solver.js` solves each connected cluster of parameters with dog-leg (Gauss–Newton step from a
minimum-norm solve through QR of Jᵀ, `linalg.js:factorJ`) and falls back to Levenberg–Marquardt
(`cholSolve` on the normal equations). Jacobians are 4-point finite differences of JS closures
(`solver.js:makeProblem`, lines 11-39). Each constraint's equations are closures built in
`sketch/constraints.js:equations` over handles from `sketch/system.js`.

Consequence for the port: **the residual functions are JS closures**, so Rust cannot evaluate them directly.
Moving only the matrix factorisation to Rust would pay a copy per iteration for small matrices (n is typically
≤ 40) and is unlikely to win. The whole loop must move, which requires the equations as data — a *residual tape*
(section 6.6, Phase 4).

### 4.5 Build and test infrastructure

- `build.mjs` bundles `src/main.jsx` → `dist/app.js` and `src/engine/worker.js` → `dist/worker.js` with esbuild,
  copies the gzip OCCT wasm to `dist/occt/replicad_single.gz.wasm` (the artifact host serves `.wasm` but not
  `.gz`). It imported esbuild from a hard-coded `/opt/npm-tools` path that does not exist on this machine.
- Tests are plain Node scripts: `node test/engine-core/run.mjs` (62 core tests),
  `node test/engine/run.mjs` (42 engine tests, needs the unzipped OCCT wasm), `node tools/preset-check.mjs`
  (72 presets). All pass at the start of this ticket (diary step 1).
- No npm: dependencies are vendored. The Rust crate follows the same rule — no crates.io dependencies.

## 5. Gap analysis

| Need | Today | Gap |
|---|---|---|
| Rust toolchain for wasm | `cargo 1.88`, target `wasm32-unknown-unknown` installed during this ticket | none |
| Crate and build step | none | create `rust/jig-compute`, add `cargo build --target wasm32-unknown-unknown --release` to `build.mjs`, ship `dist/jig_compute.wasm` |
| Loader usable in Node tests and in the worker | `oc.js` pattern exists for OCCT | `src/engine/rs/wasm.js` with the same Node/browser split |
| Data marshalling | ad hoc per function | a small arena API (`jc_alloc`, `jc_free`) plus typed-array views refreshed after memory growth |
| Mesh analyses in Rust | JS only | mesh registry + four analyses + parity tests |
| Fallback | n/a | JS kept; `JIG_COMPUTE=js` (Node env) or `#js-compute` (URL hash) forces it |
| Measurement | ad hoc | `test/rs/bench.mjs` comparing JS and Rust on real preset meshes |

## 6. Proposed architecture and APIs

### 6.1 Crate layout

```
import/jigcad/rust/jig-compute/
  Cargo.toml            crate-type = ["cdylib", "rlib"]; no dependencies; opt-level = 3, lto, panic = "abort"
  src/lib.rs            module wiring + exported C ABI (all `#[no_mangle] pub extern "C" fn jc_*`)
  src/mem.rs            jc_alloc / jc_free, last-error string
  src/vec3.rs           [f64; 3] helpers (inline, no allocation)
  src/mesh.rs           TriMesh: world-space triangles, normals, areas, face ids; registry of handles
  src/orient.rs         orientation_score + support columns
  src/gap.rs            mesh_gap: grid, point–triangle distance, segment–triangle crossing, containment
  src/section.rs        mesh_section: plane ∩ mesh → chained loops
  src/loops.rs          loops_props: nested-loop area, centroid, second moments
  src/linalg.rs         qrcp, factor_j (min-norm solve, null basis), chol_solve
  tests/                native `cargo test` unit tests (run on the host, no wasm needed)
```

`rlib` lets `cargo test` run the same code natively; `cdylib` produces the wasm.

### 6.2 The C ABI contract

All exports take and return `i32`/`u32` (pointers, lengths, handles) or `f64`. Conventions:

- **Memory.** JS calls `jc_alloc(nbytes) → ptr` (8-byte aligned), writes into `new Float64Array(memory.buffer,
  ptr, n)`, calls the function, then `jc_free(ptr, nbytes)`. Views must be re-created after any call that may
  grow memory, because growth detaches the old `ArrayBuffer`.
- **Results.** Variable-length results are written to an internal result buffer; the function returns the number
  of `f64`s and JS reads them from `jc_result_ptr()`. The buffer is valid until the next call.
- **Errors.** Functions that can fail return a negative number; `jc_error_ptr()/jc_error_len()` give a UTF-8
  message. Rust panics abort (trap); the bridge catches the trap, marks the module unusable, and falls back to JS.
- **Handles.** Long-lived objects (meshes) live in a registry `Vec<Option<TriMesh>>`; a handle is the index + 1.
  `jc_mesh_free(h)` releases it. JS wraps handles in a `FinalizationRegistry` as a safety net and frees eagerly.

API reference (first implementation slice):

| Export | Signature | Meaning |
|---|---|---|
| `jc_version` | `() → u32` | ABI version (major·1000 + minor) |
| `jc_alloc` / `jc_free` | `(n) → ptr` / `(ptr, n)` | scratch memory |
| `jc_result_ptr` | `() → ptr` | f64 result buffer |
| `jc_error_ptr` / `jc_error_len` | `() → ptr` / `() → u32` | last error |
| `jc_mesh_new` | `(pos_ptr: *f32, nverts, idx_ptr: *u32, ntri, triface_ptr: *u32 \| 0, m_ptr: *f64[16], geo_ptr: *f64 \| 0, nfaces) → handle` | world-space triangles; optional face geometry for exact normals |
| `jc_mesh_append` | `(h, …same…) → ntri` | concatenate another body (print items have several bodies) |
| `jc_mesh_len` / `jc_mesh_free` | `(h) → ntri` / `(h)` | |
| `jc_mesh_tris` | `(h) → n` | writes 16 f64 per triangle: a, b, c, n, area, face, cen — the JS `meshTris` record |
| `jc_orientation_score` | `(h, ux, uy, uz, maxAngle, bedTol, supportFactor) → n` | result: `[overhangArea, bedContact, height, supportVolume, lo, hi, nFaces, faces…]` |
| `jc_mesh_gap` | `(hA, hB, maxD) → f64` | `+∞` when nothing within maxD (JS: `Infinity`) |
| `jc_mesh_section` | `(h, z) → n` | result: `[nLoops, len₀, x, y, x, y, …, len₁, …]` |
| `jc_loops_props` | `(ptr: *f64, n) → n` | input in the same loop encoding; result `[area, cx, cy, Ixx, Iyy, regions, holes]` |
| `jc_qrcp_rank` | `(A: *f64, m, n, tol) → rank` | rank of a row-major matrix |
| `jc_factor_solve` | `(J: *f64, m, n, b: *f64, tol, want_null) → rank` | min-norm `h` with `J h ≈ b`; result: `h` then `(n − rank)·n` null-basis entries |
| `jc_chol_solve` | `(A: *f64, n, b: *f64, mu) → ok` | result: `x` or 0 when not positive definite |

Face geometry encoding (`geo_ptr`, 12 f64 per face): `[kind, nx, ny, nz, ox, oy, oz, dx, dy, dz, semiAngle,
hasNormal]` with `kind` 0 none · 1 plane · 2 cylinder · 3 cone · 4 sphere. Normals and axes are body-local;
Rust applies the transform as `meshTris` does (`inspect.js:108-115`).

### 6.3 The JS bridge

```
src/engine/rs/
  wasm.js      loadCompute(opts) → Promise; compute() → instance exports or null; Node reads the file,
               the worker fetches ./jig_compute.wasm next to worker.js
  mem.js       withF64(arr, fn), withF32, withU32, readResult(n): marshalling helpers
  mesh.js      RsMesh class: fromMesh(mesh, m, faces), append, tris(), orientationScore(u, o), section(z), free()
  index.js     public API used by the engine: rsMeshTris, rsOrientationScore, rsMeshGap, rsMeshSection,
               rsLoopsProps, rsFactorJ, rsCholSolve; `enabled()` reports whether Rust is active
```

The engine modules change minimally. Example (`inspect.js`):

```js
import * as RS from './rs/index.js';

export function meshTris(mesh, m = K.IDENTITY, faces = null) {
  if (RS.enabled()) return RS.meshTris(mesh, m, faces);   // same records, built from one Rust pass
  return meshTrisJS(mesh, m, faces);                      // the original body, renamed
}
```

**TriSoup (as built).** With Rust active, `meshTris` returns a `TriSoup` (`src/engine/rs/index.js`) instead of an
array of records. Every consumer of `tris` in the engine is one of the analyses (`orientationScore`,
`rankCandidates`, `meshGap`, `meshSection`), so records are never materialised on the hot path:

```js
class TriSoup {
  parts            // [{ mesh, m, faces }]: what it was built from
  handle()         // live Rust handle; rebuilt from `parts` when stale (after resetArena) — never dangling
  length           // jc_mesh_len
  records()        // JS records { a, b, c, n, area, face, cen } on demand (from Rust, or meshTrisJS if Rust is off)
  free()           // jc_mesh_free; a second free is harmless (handles carry a generation)
}
catTris(list)      // replaces `bodies.flatMap(b => meshTris(…))`: a TriSoup over all parts, or a flat array in JS mode
resetArena()       // worker.js compileFiles: frees every handle of the previous compile
```

The only caller changes are the two `flatMap` sites in `print.js` (now `catTris(bodies.map(…))`). Handle lifetime
is per compile (the arena); because a stale TriSoup rebuilds itself, an arena reset can never break a caller.

### 6.4 Loading and fallback

```js
// worker.js:init
await loadOC(opts);
await loadCompute(opts).catch(e => console.warn('jig-compute unavailable, using JS:', e.message));
```

- Node: reads `rust/jig-compute/target/wasm32-unknown-unknown/release/jig_compute.wasm` or `dist/jig_compute.wasm`.
- Browser worker: `fetch(new URL('./jig_compute.wasm', self.location.href))` + `WebAssembly.instantiate`.
- Forcing JS: `process.env.JIG_COMPUTE === 'js'` in Node; `#js-compute` in the page URL is forwarded as an
  `init` option.
- `init` replies `{ ms, version, compute: 'rust' | 'js' }` so the UI trace can show which path ran.

### 6.5 Decision records

#### D1: Keep OpenCascade as the B-rep kernel

- **Context:** "Do all computation in Rust" could mean replacing OCCT. OCCT provides exact booleans, fillets,
  shells, sections, STEP I/O and tessellation; the engine depends on it in ~20 modules.
- **Options considered:** (a) port to a Rust B-rep kernel (truck, fornjot); (b) keep OCCT; (c) hybrid with SDF/mesh
  kernels in Rust for some features.
- **Decision:** (b) now; (c) as a later research ticket for lattices/fields (`j.field.*` is unimplemented).
- **Rationale:** OCCT is already wasm (89 % of time). The Rust B-rep kernels lack robust fillets/shells and STEP
  parity with what presets use; a port would regress correctness that the book and tests verify to many digits.
- **Consequences:** "All heavy lifting in wasm" is satisfied; Rust owns the numeric core we write ourselves.
- **Status:** accepted.

#### D2: Raw C ABI instead of wasm-bindgen

- **Context:** The project vendors everything and builds without npm; `wasm-bindgen-cli`/`wasm-pack` are not
  installed and would add a generated JS glue file and a version lock between CLI and crate.
- **Options considered:** wasm-bindgen; raw `extern "C"` exports; WASI.
- **Decision:** raw `extern "C"` exports over linear memory, hand-written bridge in `src/engine/rs/`.
- **Rationale:** our data are flat numeric arrays; a C ABI is ~100 lines of bridge, has zero tooling, and the
  wasm stays tiny. wasm-bindgen's value (strings, closures, classes) is not needed.
- **Consequences:** marshalling is manual and must handle memory growth (views re-created after calls). Errors are
  returned as codes plus a message buffer.
- **Status:** accepted.

#### D3: No crates.io dependencies

- **Context:** offline-friendly vendored builds; small module size.
- **Decision:** std only (no `nalgebra`, no `glam`). The linear algebra needed is small and already specified by
  the JS code.
- **Consequences:** we port algorithms literally, which also makes parity testing straightforward.
- **Status:** accepted.

#### D4: Keep JS signatures; switch inside the functions

- **Context:** callers of `meshTris/orientationScore/meshGap` are spread over `print.js`, `program.js`,
  `rules.js`, `assembly.js`, `inspect-api.js`; user lambdas may receive candidate records.
- **Decision:** the public functions keep their names and return shapes; they dispatch to Rust when enabled.
- **Consequences:** no caller changes; `ProgramData` identical; parity is testable function by function.
- **Status:** accepted.

#### D5: JS stays as reference and fallback

- **Context:** a wasm load failure must not break the workbench; the book and tests depend on exact numbers.
- **Decision:** keep the JS bodies (renamed `*JS`), add parity tests that run both, and fall back on load
  failure or trap.
- **Consequences:** two implementations to maintain until the Rust path has been the default for a while; the
  parity tests catch drift.
- **Status:** accepted.

#### D6: Solver moves as a whole loop on a residual tape (not just the matrix kernels)

- **Context:** residuals are JS closures; matrices are small. Copying J into wasm per iteration costs about what
  the factorisation does.
- **Decision:** expose the linalg kernels now (useful for tests and for the analysis passes), but make the
  solver's Rust path a **tape**: each constraint emits its equations as a small expression program over parameter
  indices (ops: `x[i]`, const, `+ − × ÷`, `sqrt`, `sin`, `cos`, `atan2`, `hypot`), evaluated with forward-mode
  dual numbers in Rust to give exact Jacobians. Constraints without a tape keep the JS loop.
- **Status:** proposed (Phase 4).
- **Measurement update (Phase 3):** `test/rs/bench.mjs` shows the Rust `factorJ`+solve is 2.5–2.9× faster than JS
  even at 8×10 and 24×30 *including* the copies, so the "boundary cost eats the win" assumption was wrong for these
  sizes. The tape is still the better end state (it removes the 4-point finite differences of JS closures), but a
  kernel-only first step is now justified.

## 7. Pseudocode and key flows

### 7.1 Building a mesh handle (Rust)

```rust
pub struct TriMesh { a: Vec<[f64;3]>, b: Vec<[f64;3]>, c: Vec<[f64;3]>, n: Vec<[f64;3]>,
                     area: Vec<f64>, face: Vec<u32>, cen: Vec<[f64;3]> }

fn append(&mut self, pos: &[f32], idx: &[u32], tri_face: Option<&[u32]>, m: &[f64;16], geo: &[FaceGeo]) {
    let rot = |d| unit(sub(apply(m, d), apply(m, [0.,0.,0.])));
    let geo_w: Vec<FaceGeo> = geo.iter().map(|g| g.transformed(m, rot)).collect();
    for t in 0..idx.len()/3 {
        let (a, b, c) = (apply(m, p(idx[3t])), apply(m, p(idx[3t+1])), apply(m, p(idx[3t+2])));
        let cr = cross(sub(b,a), sub(c,a)); let l = len(cr);
        let face = tri_face.map_or(0, |f| f[t]); let cen = (a+b+c)/3;
        let mut nrm = if l > 0 { cr / l } else { [0,0,1] };
        if l > 0 { if let Some(g) = geo_w.get(face) { nrm = exact_normal(g, cen, nrm).unwrap_or(nrm) } }
        push(a, b, c, nrm, l/2, face, cen);
    }
}
```

### 7.2 Orientation score (Rust, mirrors `inspect.js:220-263`)

```
u ← unit(u); lo, hi ← min/max over vertices of dot(p, u)
s ← sin(maxAngle + 0.5°)
for each triangle t:
    d ← −dot(n_t, u); hmax ← max dot(vertex, u)
    if d > 1 − 1e-6 and hmax − lo < bedTol: bedContact += area; continue
    if d > s + 1e-9: overhangArea += area; over.push(t); faces.insert(face_t)
supportVolume ← supportColumns(over) × supportFactor     // 2 mm grid on the plane ⟂ u, ray down
return { overhangArea, bedContact, height: hi − lo, supportVolume, faces (sorted by first appearance), lo, hi }
```

Faces are reported in first-appearance order (JS `Set` insertion order) so `overhangFaces` is identical.

### 7.3 Mesh gap (Rust, mirrors `inspect.js:145-218`)

```
h ← max(maxD, 0.25)
best ← min over (vertex of A, triangles of B near it) ∪ (vertex of B, triangles of A) of pointTri distance
if best > 1e-9 and (edgesCross(A, B) or edgesCross(B, A)): best ← 0
if best > 1e-9 and (inside(A₀, B) or inside(B₀, A)): best ← 0
return best ≤ maxD ? best : +∞
```

Grid cells are keyed by `(i, j, k)` packed into a `u64`; vertex dedupe uses the same 1e-5 quantisation as the JS
`toFixed(5)` keys so the sets of tested points match.

### 7.4 Mesh section (Rust, mirrors `print.js:387-420`)

```
z ← z + 1e-7
for each triangle: if vertices straddle z, emit segment with endpoints interpolated on ordered edge endpoints
chain segments into loops through a map keyed by endpoints quantised to 1e-6
```

### 7.5 Bridge call (JS)

```js
export function orientationScore(tris, u, o = {}) {
  const h = tris[HANDLE];
  if (!h) return orientationScoreJS(tris, u, o);
  const X = compute();
  const n = X.jc_orientation_score(h.id, u[0], u[1], u[2], o.maxAngle ?? Math.PI / 4, o.bedTol ?? 1e-3, o.supportFactor ?? 1);
  const r = readResult(n);                    // Float64Array view, copy what we keep
  return { dir: unit(u), overhangArea: r[0], bedContact: r[1], height: r[2], supportVolume: r[3],
           overhangFaces: Array.from(r.subarray(7, 7 + r[6])), lo: r[4], hi: r[5] };
}
```

## 8. Implementation phases

| Phase | Content | Exit criterion |
|---|---|---|
| 0 | Ticket, guide, toolchain (`wasm32-unknown-unknown`), esbuild path fix, `.gitignore` for the unzipped OCCT wasm and Rust `target/` | build and all suites green on the unchanged engine |
| 1 | Crate skeleton, C ABI memory/results/errors, `rs/` loader, `build.mjs` builds and copies the wasm; smoke test from Node | `node test/rs/smoke.mjs` loads the module in Node |
| 2 | Mesh registry, `meshTris`, `orientationScore`, support columns, `loopsProps`, `meshSection`, `meshGap` in Rust; parity tests on synthetic and real preset meshes | parity within 1e-9 relative; engine 42/42, presets 72/72 |
| 3 | Wire into `inspect.js`/`print.js` with fallback; `init` reports `compute`; benchmark; rebuild `dist/` | benchmark recorded; browser smoke test of `dist/` |
| 4 | Linalg kernels exported; solver residual tape (D6) for the common constraint kinds; Rust solve loop with dual-number Jacobians; JS loop kept for untaped constraints | core 62/62 and engine 42/42 with Rust solver on |
| 5 | (later) Stage rasteriser in Rust on the main thread; profile-driven moves of remaining JS (profiles arrangement, packing) | separate ticket |

## 9. Test strategy

1. **Native unit tests** (`cargo test` in `rust/jig-compute`): vector helpers, a unit cube's overhang/bed contact,
   a tetrahedron gap, a cube section at mid height, loops with a hole, QR rank of known matrices.
2. **Parity tests** (`node test/rs/parity.mjs`): for synthetic meshes and for meshes from real presets compiled with
   the engine, call both the JS and the Rust implementation and compare every field
   (`|a − b| ≤ 1e-9·max(1, |b|)`; face lists equal; loop counts equal and loop areas equal).
3. **Existing suites** with Rust on (default) and with `JIG_COMPUTE=js`: `test/engine-core/run.mjs`,
   `test/engine/run.mjs`, `tools/preset-check.mjs`.
4. **Benchmark** (`node test/rs/bench.mjs`): JS vs Rust time for `rankCandidates`, `meshGap` and 200-layer
   `meshSection` on the largest preset meshes; the whole-preset run time before/after.
5. **Browser smoke** of `dist/`: serve and load the page with Playwright, check the worker reports
   `compute: 'rust'` and a preset compiles.

## 10. Risks, alternatives, open questions

- **Floating-point parity.** Rust `f64` and JS numbers are both IEEE-754 doubles, but operation order matters.
  The port keeps the JS operation order; `Math.hypot` vs `f64::hypot` and `sin`/`cos` may differ in the last ulp,
  so parity uses a relative tolerance, not bit equality. The book's printed numbers are rounded to ≤ 6 digits.
- **Memory growth.** Any `jc_*` call may grow memory and detach existing views. The bridge never caches views
  across calls.
- **Handle leaks.** Meshes are freed when analyses finish; a `FinalizationRegistry` frees forgotten handles.
- **Small inputs.** For tiny meshes the copy may cost more than it saves; measured in the benchmark, and a size
  threshold can route small meshes to JS if needed.
- **Open question:** whether to move OCCT's tessellation extraction (`mesh.js:meshRaw`) to copy straight from the
  OCCT heap into jig-compute memory (one copy instead of two). Needs a shared-memory trick or an extra copy; later.
- **Open question:** whether a Rust B-rep or SDF kernel should take `j.field.*` (lattices); separate ticket.

## 11. References

Files (all under `import/jigcad/`):

- `BUILD.md` — architecture, worker protocol, ProgramData, ownership.
- `src/engine/CORE-API.md`, `src/engine/KERNEL-API.md` — what the engine implements.
- `src/engine/worker.js` — protocol; init is where the Rust module loads.
- `src/engine/oc.js` — the OCCT loader pattern copied for the Rust loader.
- `src/engine/inspect.js:101-278` — `polyArea`, `meshTris`, `exactNormal`, `meshGap`, `orientationScore`,
  `supportColumns`, `rayDown`; `inspect.js:79-100` — `loopsProps`.
- `src/engine/print.js:268-420` — `rankCandidates`, orientation choice, packing, `sliceItems`, `meshSection`.
- `src/engine/assembly.js:132-140` — where `meshGap` runs for interference.
- `src/engine/program.js:101-106` — overhang/bed-contact metrics.
- `src/engine/sketch/linalg.js`, `sketch/solver.js`, `sketch/constraints.js`, `sketch/system.js` — solver.
- `build.mjs` — bundling and asset copy.
- `test/engine/run.mjs`, `test/engine-core/run.mjs`, `tools/preset-check.mjs` — validation.
- Ticket script `scripts/01-prof-summary.mjs` — profile grouping used for section 4.2.

External:

- WebAssembly JS API (`WebAssembly.instantiate`, `Memory.grow` detaching buffers): MDN.
- Rust target `wasm32-unknown-unknown`: `rustup target add wasm32-unknown-unknown`; `cargo build --target
  wasm32-unknown-unknown --release` produces `target/wasm32-unknown-unknown/release/jig_compute.wasm`.

## 12. Results so far (Phases 1–3)

| Path (real preset meshes, median of 5) | JS | Rust | speed-up |
|---|---:|---:|---:|
| M-10 planetary gearbox, 38,810 tris: rank 14 orientations with supports | 1,941 ms | 445 ms | 4.4× |
| M-07 spur gears, 22,228 tris: rank orientations | 658 ms | 160 ms | 4.1× |
| X-08 Pi case: 200 mesh sections | 207 ms | 28 ms | 7.4× |
| M-06 threaded jar: mesh gap | 156 ms | 44 ms | 3.6× |
| factorJ + solve 24×30, ×200 | 12.2 ms | 4.2 ms | 2.9× |

- Parity: `node test/rs/parity.mjs` → 3,784 checks, 0 failures, 44,314 triangles over 8 presets.
- Whole preset run, profiled: the jig-compute module accounts for 513 ms where `inspect.js` took 2,210 ms; non-wasm
  JS self time fell from 7.6 s to 4.2 s. End-to-end wall time is dominated by OCCT, whose time varied ±20 % between
  identical runs on this machine, so whole-suite wall clock is not a useful metric here.
- Module: 92 KiB, no imports, instantiates in 3 ms (Node) / 10 ms (browser worker).
