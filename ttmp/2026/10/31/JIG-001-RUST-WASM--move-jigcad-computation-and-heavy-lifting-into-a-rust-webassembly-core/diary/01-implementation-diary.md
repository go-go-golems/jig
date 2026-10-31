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
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of moving jigcad numeric hot paths into a Rust WebAssembly core."
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
