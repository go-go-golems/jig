---
Title: Implementation diary
Ticket: JIG-001-RUST-WASM
Status: active
Topics:
    - wasm
    - rust
    - cad
    - performance
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/rust/jig-compute/src/lib.rs
      Note: Rust C ABI
    - Path: repo://import/jigcad/src/engine/rs/index.js
      Note: bridge and TriSoup
    - Path: repo://import/jigcad/test/rs/bench.mjs
      Note: benchmark
ExternalSources: []
Summary: Chronological record of moving jigcad numeric hot paths into a Rust WebAssembly core.
LastUpdated: 2026-10-31T19:54:48.641907695-04:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1: Orientation, profiling, ticket and design guide

I started by finding out what "the CAD tool" is in this repository and where its computation actually runs. The
repository holds an imported jigcad workbench (`import/jigcad`), its language spec (`import/jig`) and a workspace of
transcripts. jigcad already uses OpenCascade compiled to WebAssembly, so the first job was to measure how much of the
work is already in wasm before designing anything.

The profile answered it: compiling all 72 presets spends 89 % of CPU time inside the OpenCascade wasm module. The
remaining JS heavy lifting is concentrated in mesh analyses (`inspect.js`), mesh slicing (`print.js`) and the sketch
solver. That turned the request from "port the CAD tool to Rust" into "keep OCCT as the B-rep kernel, move every
numeric hot path we own into a Rust wasm core", which the design guide records as decision D1.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to make this CAD tool run using webaseembly and rust or so to do all computations and heavy lifting. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"

**Assistant interpretation:** Create ticket JIG-001-RUST-WASM, write an intern-level design guide for moving jigcad's computation to Rust/wasm, upload it to reMarkable, then implement it in phases with commits and this diary.

**Inferred user intent:** Get a faster, more native-code engine for the jigcad workbench, plus documentation good enough for someone new to continue the work.

### What I did

- Read `import/jigcad/BUILD.md`, `INTEGRATION.md`, `BUILD-LOG.md`, `src/engine/CORE-API.md`, `src/engine/KERNEL-API.md`, `src/engine/worker.js`, `src/host/engine.js`, `src/engine/oc.js`, `src/engine/mesh.js`, `src/engine/inspect.js`, `src/engine/print.js`, `src/engine/sketch/{linalg,solver,constraints,system}.js`.
- Ran the baseline suites:
  - `node test/engine-core/run.mjs` → `62 passed, 0 failed · 7 files · 137 ms`.
  - `gunzip -k vendor/occt/replicad_single.wasm.gz && node test/engine/run.mjs` → `42 passed, 0 failed · 15.6 s`.
- Profiled: `node --cpu-prof --cpu-prof-dir=$SCRATCH/prof tools/preset-check.mjs --quiet` → `72/72 presets compile cleanly`, 36 s wall. Grouped with the new ticket script `scripts/01-prof-summary.mjs`:
  - OCCT wasm 32,055 ms (89.0 %), `inspect.js` 1,657 ms (4.6 %), `sketch/*` 467 ms (1.3 %), `kernel.js` 379 ms (1.1 %), GC 264 ms.
  - Top JS function: the grid builder in `meshGap` (`inspect.js:147`).
- Installed the Rust target: `rustup target add wasm32-unknown-unknown` (rustc 1.88.0).
- `build.mjs` imported esbuild from `/opt/npm-tools/...`, which does not exist here. Installed esbuild 0.25.12 into the scratchpad and made `build.mjs` read `process.env.ESBUILD` first. `node build.mjs` → `dist/app.js 1618 KiB · dist/worker.js 1460 KiB`.
- `.gitignore`: added `vendor/occt/replicad_single.wasm` (22.9 MB unzipped copy needed by Node tests), `rust/*/target`, `src/generated` (build output).
- Created the ticket, vocabulary (`wasm rust cad performance`, doc type `diary`), the design doc and this diary; added phase tasks.
- Uploaded the guide: `OK: uploaded JIG-001 Rust WASM compute core guide.pdf -> /ai/2026/10/31/JIG-001-RUST-WASM`.

### Why

- Measuring first avoided a plan that ports cheap code (hashing is 0.1 %) and ignores the expensive JS paths.
- The raw C ABI (D2) and no crates (D3) follow the project's vendored, npm-free build.

### What worked

- All baseline suites green; the profile was decisive.

### What didn't work

- `which esbuild` → `esbuild not found`; `ls /opt/npm-tools/node_modules/esbuild` → `No such file or directory`. Fixed with the `ESBUILD` env override.
- `npm i esbuild` printed `npm warn allow-scripts ... Run npm approve-scripts` (install scripts blocked), but the platform binary was present and `esbuild.transformSync` worked, so nothing else was needed.

### What I learned

- jigcad is already "mostly wasm"; the Rust work is about the JS numeric remainder and about having a native-code home for future numeric features.
- The sketch solver's residuals are JS closures, so moving only the linear algebra would not pay; the whole loop has to move on a residual tape (D6).

### What was tricky to build

- Nothing built yet; the tricky part was interpretation: the literal request ("all computations in Rust") would mean replacing OCCT, which the evidence argues against. Recorded as decision D1 with rationale rather than silently narrowing scope.

### What warrants a second pair of eyes

- Decision D1 (keep OCCT). If the intent really was a pure-Rust kernel, that is a different, much larger project.

### What should be done in the future

- Phase 1 onward (tasks list).

### Code review instructions

- Read the design doc sections 3–6. Re-run the profile with the command above to verify section 4.2.

### Technical details

- Profile categories: `wasm-function[*]` frames and `replicad_single.js` glue are counted as OCCT.

## Step 2: The jig-compute crate and the JS bridge (Phases 1–2)

I wrote the Rust crate `import/jigcad/rust/jig-compute` as a literal port of the JS hot paths, so that a parity
test could compare the two function by function. Same operation order, same tolerances, same quantisation of
dedupe keys. The C ABI is about 15 exported functions over linear memory; the JS side is `src/engine/rs/wasm.js`
(loader + marshalling) and `src/engine/rs/index.js` (the TriSoup type and the dispatching functions).

Everything worked on the first build: five native `cargo test` tests passed, and the wasm came out at 94 KB with
**no imports**. Instantiation is just `WebAssembly.instantiate(bytes, {})`.

### Prompt Context

**User prompt (verbatim):** (see Step 1)
**Assistant interpretation:** Implement Phases 1–2 of the guide.
**Inferred user intent:** The numeric hot paths really run in Rust/wasm, with no behaviour change.

### What I did

- `rust/jig-compute/Cargo.toml`: `crate-type = ["cdylib", "rlib"]`, no dependencies, release profile `opt-level 3, lto, codegen-units 1, panic = "abort", strip`.
- `src/vec3.rs` (V helpers incl. a scaled `hypot3` like `Math.hypot`), `src/mem.rs` (alloc/free, thread-local result buffer and error string), `src/mesh.rs` (FaceGeo decode/transform, `exact_normal`, `TriMesh::append`, generation-tagged handle registry), `src/orient.rs`, `src/gap.rs`, `src/section.rs` (meshSection, loopsProps, loop encoding), `src/linalg.rs` (qrcp rank, FactorJ, chol_solve), `src/lib.rs` (C ABI).
- `tests/core.rs`: box orientation, box section + second moments, loops with a hole, gaps (separated, touching, overlapping, contained), linalg rank/min-norm/null basis/Cholesky.
- Commands: `cargo test --release` → `5 passed`; `cargo build --release --target wasm32-unknown-unknown` → `jig_compute.wasm` 94,330 bytes; `WebAssembly.Module.imports` → `[]`.
- Bridge: `src/engine/rs/wasm.js` (Node reads the cargo output or `dist/jig_compute.wasm`; the worker fetches `./jig_compute.wasm`; ABI major check; `JIG_COMPUTE=js` / `{ compute: 'js' }` forces JS; a `WebAssembly.RuntimeError` disables Rust for the session), `src/engine/rs/index.js` (TriSoup, catTris, resetArena, orientationScore, meshGap, meshSection, loopsProps, factorSolve, cholSolve, qrcpRank).

### Why

- Handles with a generation in the high 16 bits make a double free or a stale handle harmless, which is what makes the per-compile arena safe.
- TriSoup instead of "array + hidden handle": `flatMap` would drop a property on the array, and materialising records was the very allocation cost we were removing.

### What worked

- First build and all native tests green.

### What didn't work

- No failures in this step.

### What I learned

- The engine's `tris` arrays never escape to user code: every consumer is one of the four analyses, so a non-array TriSoup is safe once the two `flatMap` call sites use `catTris`.

### What was tricky to build

- Memory growth: any `jc_alloc` can grow memory and detach existing `Float64Array` views. `put()` creates each view right after its own allocation and writes immediately; `result()` builds its view after the call and copies (`slice()`), so no view outlives a call.
- JS truthiness: `l ? … : …` treats NaN as false. The Rust port uses `l != 0.0 && !l.is_nan()` so degenerate triangles behave the same.
- Dedupe keys: JS uses `toFixed(5)` / `toFixed(6)` strings; Rust uses `(x * 1e5).round()` integers. They can differ only on exact rounding ties, which only changes which duplicate vertex is skipped; parity confirms identical results on real meshes.

### What warrants a second pair of eyes

- `src/engine/rs/wasm.js` marshalling (pointer/offset math, detachment).
- `mesh.rs` registry: slot reuse with 15-bit generations wraps after 32k reuses of one slot. A very old stale handle could then alias a new mesh; in practice the arena frees every compile.

### What should be done in the future

- Cache the TriSoup per (display mesh, placement) to avoid re-copying the same body for print orientation, re-scoring and slicing.

### Code review instructions

- Start at `rust/jig-compute/src/lib.rs`, then `src/engine/rs/index.js`. Run `cargo test --release` in the crate.

### Technical details

- Face geometry stride 13: `[kind, hasNormal, n(3), hasAxis, origin(3), dir(3), semiAngle|NaN]`; kinds 1 plane, 2 cylinder, 3 cone, 4 sphere.
- Records stride 17: `a b c n area face cen`.

## Step 3: Wiring, parity, benchmark, build and browser smoke (Phase 3)

I switched the engine over: `inspect.js` and `print.js` keep their exported names and dispatch to Rust when it is
active, and the JS bodies remain exported as `meshTrisJS`, `orientationScoreJS`, `meshGapJS`, `meshSectionJS` and
`loopsPropsJS`. The worker loads jig-compute in `init`, frees mesh handles at the start of every compile, and
reports `compute: { kind: 'rust' | 'js', … }` in `init` and `stats`. The workbench header names jig-compute when
it is active, and `#js-compute` forces the JS path.

The parity test passed: 3,784 checks, 0 failures. The benchmark shows 2.6–7.4× on every ported path. The surprise
was the first end-to-end timing, which looked *slower* with Rust; the profile showed that was OCCT run-to-run
noise, not the new code.

### Prompt Context

**User prompt (verbatim):** (see Step 1)
**Assistant interpretation:** Phase 3: integrate, prove parity, measure, ship in `dist/`.
**Inferred user intent:** A working workbench whose heavy numeric work runs in Rust.

### What I did

- `src/engine/inspect.js`: dispatching `meshTris`, `orientationScore`, `meshGap`, `loopsProps` (Rust for ≥ 64 points); re-exports `catTris`, `freeTris`; registers `meshTrisJS` for TriSoup fallbacks.
- `src/engine/print.js`: `catTris` at the two `flatMap` sites; `meshSection` exported and dispatching.
- `src/engine/worker.js`: `RS.loadCompute` in `init` (failure → warning, JS path), `RS.resetArena()` in `compileFiles`, `compute` in `init`/`stats` replies.
- `src/host/engine.js`, `src/host/host.js`, `src/main.jsx`, `src/ui/app.jsx`: `#js-compute`, `engine.compute`, header and toast text.
- `build.mjs`: `buildCompute()` runs `cargo build --release --target wasm32-unknown-unknown` (skip with `JIG_SKIP_CARGO=1`) and copies the result to `dist/jig_compute.wasm`.
- Tests: `test/rs/presets.mjs` (shared preset compile), `test/rs/parity.mjs`, `test/rs/bench.mjs`.
- Results:
  - `node test/rs/parity.mjs` → `3784 checks passed, 0 failed · 44314 triangles`.
  - `node test/engine-core/run.mjs` → `62 passed`; `node test/engine/run.mjs` → `42 passed, 0 failed · 14.6 s` (Rust active).
  - `node tools/preset-check.mjs --quiet` → `72/72 presets compile cleanly`, in both Rust and `JIG_COMPUTE=js` modes.
  - `node test/rs/bench.mjs 5` → e.g. M-10 rank orientations 1941 → 445 ms (×4.4), X-08 200 sections 207 → 28 ms (×7.4), M-06 gap 156 → 44 ms (×3.6), factorJ 24×30 ×200 12.2 → 4.2 ms (×2.9).
  - `ESBUILD=… node build.mjs` → `dist/app.js 1618 KiB · dist/worker.js 1470 KiB · dist/jig_compute.wasm 92 KiB`.
  - Browser (Playwright, `node test/ui/serve.cjs 8765`): `engine.compute = { kind: 'rust', version: '1.1', ms: 9.8 }`; M-07, M-10 (assemblies) and X-08 (print job, 1 plate, `+Z`) compile with 0 errors; screenshot `various/01-browser-smoke-x08-rust.png`. After a real reload with `#js-compute`: `kind: 'js'`, the same X-08 volume 31412.263 and orientation `+Z`. The only console error is the existing `favicon.ico` 404.

### Why

- Keeping the JS bodies exported makes parity testable and gives the fallback.

### What worked

- Parity first time; all suites green in both modes; dist loads Rust in the browser worker.

### What didn't work

- End-to-end timing looked worse: `rust: 44.32 s` vs `js: 39.51 s` for `tools/preset-check.mjs`. Profiling both runs and splitting wasm self time by module URL showed: Rust run, OCCT `wasm://wasm/057a9aae` 33,415 ms, jig-compute `wasm://wasm/0005c1ea` 513 ms; JS run, OCCT 39,908 ms, `inspect.js` 2,210 ms. The same OCCT work varied by about 20 % between runs, so whole-suite wall clock is noise; the function-level benchmark is the real measurement.
- My first profile grouping lumped both wasm modules together as "occt-wasm". Fixed in `scripts/01-prof-summary.mjs` (groups by module URL; OCCT's JS glue is now its own category).
- First `#js-compute` browser check was invalid: navigating to the same URL with only a new hash does not reload the document, so the old worker (Rust) answered. Re-ran with `location.reload()`.

### What I learned

- D6's assumption was wrong: even 8×10 matrices are 2.5× faster in Rust including the copies. Recorded in the design doc.
- The remaining Rust time in "rank orientations" (445 ms for M-10) is mostly support columns: a grid rebuilt for each of the 14 candidate directions. That is the next optimisation target.

### What was tricky to build

- Hash-only navigation (above), and the noise problem: on this machine only function-level benchmarks give stable numbers.

### What warrants a second pair of eyes

- `RS.resetArena()` at compile start: anything keeping a TriSoup across compiles silently rebuilds it (correct, but it costs a copy).

### What should be done in the future

- Phase 4 (solver), TriSoup caching, a batched `rankCandidates` in Rust that projects once per direction and reuses grids.

### Code review instructions

- `git show` the Phase 1–3 commit; run `node test/rs/parity.mjs` and `node test/rs/bench.mjs`.

### Technical details

- Build: `ESBUILD=/path/to/esbuild/lib/main.js node build.mjs`; Node tests need `gunzip -k vendor/occt/replicad_single.wasm.gz` once.

## Step 4: Hairline sliders (side request)

While Phase 3 was being committed, the user asked for the slider styling from a design note to be applied too.
I restyled both range inputs in jigcad (the Params rows and the stage zoom) as Kiln hairline sliders and checked
them in the browser in both themes. This step is a milestone entry: no failures, one design choice.

### Prompt Context

**User prompt (verbatim):** "Apply @~/Downloads/Hairline sliders for the Kiln workbench.md to the styling for the sliders as well"
**Assistant interpretation:** Apply the note's CSS and `--p` fill helper to jigcad's range inputs.
**Inferred user intent:** Sliders that match the Kiln rules (1 px rules, square marks, tokens only).

### Evidence and commits

- Commit `08247b5` "Hairline sliders for the Kiln workbench": `src/ui/jig.css` (hairline rules appended; `jig.css` loads after `kiln.css`), `src/ui/kiln.css` (removed `accent-color` and the fixed 16 px height from the three range rules), `src/ui/common.jsx` (`pct(v, lo, hi)`), `src/ui/views/params.jsx` and `src/ui/views/stage.jsx` (`style={pct(…)}`).
- Browser: all five sliders on A-01 are 18 px tall with `accent-color: auto`; an override set from code (`w = 100` in a 30–120 range) gives `--p: 77.8%`. Screenshots `various/02-hairline-sliders-light.png`, `various/03-hairline-sliders-dark.png`.

### Noteworthy decisions or failures

- The note's vertical-fader rules were left out: jigcad has no vertical sliders.
- Only Chromium was checked (Playwright). Firefox (`::-moz-range-progress`) and Safari are untested.

### Remaining requirements and next action

- Firefox/Safari visual check when available.

## Step 5: Solver linear algebra in Rust (Phase 4, first slice)

The Phase 3 benchmark showed `factorJ` + solve is 2.5–2.9× faster in Rust even for 8×10 and 24×30 matrices,
copies included. So I routed the sketch solver's `factorJ` and `cholSolve` (`src/engine/sketch/linalg.js`)
through jig-compute when it is loaded, keeping `factorJJS`/`cholSolveJS` as the reference. The residuals and
finite-difference Jacobians stay in JS; the residual tape (D6) is still the next step.

### Prompt Context

**User prompt (verbatim):** (see Step 1)
**Assistant interpretation:** Start Phase 4 with the part the measurements justify.
**Inferred user intent:** More of the numeric work in Rust, with no behaviour change.

### What I did

- `linalg.js`: `factorJ` dispatches to `factorJRust` (same `{ rank, solve, nullBasis, rowBasis }` shape; the rank comes from the first request; `nullBasis` is one request with `want_null`); `cholSolve` dispatches with the JS body as fallback.
- `test/rs/parity.mjs` and `test/rs/bench.mjs` now compare against `factorJJS`/`cholSolveJS` explicitly.
- New `test/rs/sketch-dump.mjs`: dumps solved sketch data (entities, constraint status and values, DOF, conflicts) rounded to 1e-9.

### Why

- Measured win at solver sizes, and a small, reversible change.

### What worked

- `node test/engine-core/run.mjs` → `62 passed` (JS: the core harness does not load Rust).
- `node test/engine/run.mjs` → `42 passed` with Rust kernels, including 13 (conflict diagnostic), 25 (drag), 41 (sketch lines).
- `node test/rs/parity.mjs` → `3784 checks passed, 0 failed`.
- `node tools/preset-check.mjs --quiet` → `72/72`.
- `sketch-dump.mjs` for A-03, M-03, W-07, H-11, S-10: Rust and `JIG_COMPUTE=js` outputs byte-identical (34,616 bytes each, empty diff).

### What didn't work

- No failures.

### What I learned

- Results are identical after rounding to 1e-9, so the Rust QR follows the same pivot order as the JS one.

### What was tricky to build

- JS `factorJ` factors once and solves many times; the C ABI factors and solves in one call. The solver loops do one solve per factorisation, so the wrapper re-runs the factorisation only when `nullBasis` is also needed (in `dragCluster`). That is acceptable at these sizes but would be wasteful for many solves per factorisation.

### What warrants a second pair of eyes

- `factorJRust.rowBasis` falls back to the JS factorisation (nothing uses it today).

### What should be done in the future

- Residual tape + dual-number Jacobians in Rust (D6), then move `dogleg`/`levenbergMarquardt`/`dragCluster` wholesale.
- Load jig-compute in `test/engine-core/harness.mjs` too, so the core suite exercises both paths.

### Code review instructions

- `src/engine/sketch/linalg.js` top; run the commands above.

### Technical details

- `jc_factor_solve(J, m, n, b, tol, want_null) → rank`; result layout `h (n)` then `(n − rank) × n` null-basis entries.
