---
Title: Diary
Ticket: JIG-016-RENDER
Status: active
Topics:
    - rendering
    - gpu
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/src/ui/views/render.jsx
      Note: the Render view
    - Path: repo://import/jigcad/test/render/bridge.test.mjs
      Note: bridge tests on F-06 and synthetic packages
    - Path: repo://import/jigcad/test/ui/render.cjs
      Note: browser check of the Render view on the GPU
    - Path: repo://pkg/render/render.go
      Note: the candela-rt sidecar (supervision, /rt proxy)
    - Path: repo://ttmp/2026/11/22/JIG-016-RENDER--keyshot-style-rendering-for-jig-candela-as-jig-s-renderer-a-scene-package-from-jig-and-candela-rt-as-an-nvidia-sidecar/scripts/01-f06-face-records.mjs
      Note: 'evidence script: F-06 body and face records from the worker in Node'
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T00:48:09.823113363-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## 2026-11-22 · Step 1: ticket, evidence, first draft

**Request.** An intern-level analysis, design and implementation guide for KeyShot-style rendering in jig with Candela. It should also answer how the two repositories merge, with `candela-rt` as an NVIDIA sidecar, and be uploaded to reMarkable. Two follow-ups arrived mid-turn: "could we link faces / objects and stuff in a JS API that combines the two, or creates bridges?" and "do you have the sewing machine stitch stuff too?".

**Revisions inspected.**

| tree | revision |
| --- | --- |
| jig | `main` at `3873732`, clean apart from the pre-existing `ttmp/vocabulary.yaml` edit |
| pbr-spark | `main` at `db9b0a8` |
| lockstitch | `~/Downloads/lockstitch-project.zip`, extracted to the session scratchpad `z-lockstitch/` |
| compur | `~/Downloads/synchro-compur-0-mxv.zip`, extracted to the session scratchpad `z-compur/` |

**Ticket set-up.**
- Created `JIG-016-RENDER`.
- Added the vocabulary topics `rendering` and `gpu`.

**Evidence run.** `scripts/01-f06-face-records.mjs` compiles preset F-06 (the needle-bar drive) through jig's worker in Node and prints the body and face records the bridge would read. The command was `node 01-f06-face-records.mjs <jig>/import/jigcad`. Results:
- `ok true kind assembly bodies 4`;
- the rod body is `rod/body1`, with 356 triangles and 8 faces;
- face 4 is `body/side[s.big]`, a cylinder with axis (0, 0, −1) and r = 3;
- face 5 is `body/side[s.small]`, with r = 2.5;
- graph nodes are `rod:body` of kind `extrude`.

**First draft.** The design doc was written in full, from jig and Candela source read this session and in the earlier analysis turn.

## Step 2: second-pass review notes (recorded before revising)

Each note says what is wrong, why it matters and the fix applied.

**Accuracy corrections.**
- **§3.1 example script.** The jig script was written from memory: `j.sketch(…, { on: face })` is not the API. Replace it with the real F-06 preset and use the real records from step 1.
- **"jig README §4.4".** No such section exists. `src/engine/body.js:2` still cites it, which is stale. Cite `body.js` `carryNames` instead.
- **Test "script 43".** Unverified. Use preset F-06, which has the study `cycle`, instead.
- **`hdri.studio({ boxes: 3 })`.** `boxes` is an array of light boxes (`hdri.ts:60`). Use `hdri.studio()`.
- **The term "scene package".** It collides with Candela's existing `candela-scene-package` v0 (`scripts/scene-package.ts`), the post-build geometry for `native/optix`. Rename jig's export to *CAD package* and explain how the two differ.
- **The frame conversion was garbled** ("(x, −z… )"). The exact mapping, from `convert.py:177`, is: Candela = 0.001 · (x, z, −y). Transforms are conjugated (C·T·C⁻¹).
- **Candela has no `.find()`.** It is a bridge addition, so say so.
- **candela-rt serve and probe.** `serve` defaults to `--bind 0.0.0.0` and has `--token` (`main.cpp` usage). The sidecar must pass `127.0.0.1` and a random token. No device-probe command exists, so `candela-rt info` is proposed, labelled as new.
- **`candela-rt render <id>`** takes preset ids. A jig model needs a scene-directory form, which is proposed.
- **"SwiftShader" in the test section.** `render-preset.ts` uses Playwright with GPU flags and refuses a software rasteriser unless `--allow-software`. Say that instead.
- **Polymer vocabulary.** Candela's `POLYMERS` has abs, nylon/pa, pom, peek, ptfe, pla, pc, rubber and pu. It lacks petg, asa, pp, tpu and resin; the vocabulary table now says exactly that.
- **Compur.** `material: 'brass'` is only a comment in the jig scripts, because jig's `MATERIALS` has no brass. Use this as the concrete instance of the vocabulary gap.
- **`.color(sel, c)` exists in jig** ("recorded only", `reference.md:183`). `.finish(sel, meta)` should mirror it, and the bridge should honour per-face colours.

**Comprehension gaps.**
- **§6.2 (the user's bridge question).** The section starts from the API rather than the problem. Add the problem first: two namespaces. Then show one face in its three representations: the jig face record, the Candela face table entry and the id-pass pixel. Then add a table of what crosses in each direction.
- **§6.2 jig selector references.** `jig.faces("…")` evaluated in the worker from inside a look build is an unexplained asynchronous round trip in the middle of a scene build. Redesign it: jig selectors live in the jig script (`.finish(sel, meta)`, resolved synchronously in `finalize`), and look.js selects by name, glob or a predicate over the enriched face meta. Record this as decision D9.
- **§4.1 stages.** The draft never shows the stages build → compile → load, so the irHash comparison in §4.5 arrives unexplained. Add the stage line.
- **§4.6 lockstitch.** Say what the seven K-09 scenes and the cloth are (the user asked about the "stitch stuff"). Say that K-09 does not draw the thread.

**Consistency checks to make after revising.**
- The packaging plan in §8 must match the answer given in chat (`import/candela/`, vendor first, then subtree).
- The phase 1 test should use the concrete F-06 values: r = 3 mm becomes 0.003 m, and axis (0, 0, −1) becomes (0, −1, 0).

## Step 3: revision, bookkeeping, delivery

**Revision.** The guide was rewritten against every note in step 2, then reread for consistency:
- §6.2, §6.3 and the phase 1 test use the same F-06 values: `body/side[s.big]`, axis (0, −1, 0), r = 0.003.
- §8 matches the answer given in chat: vendor first, then subtree-merge into `import/candela/`.
- The decision table gained D9 (where each selector language lives).

**Bookkeeping.**
- Related seven files to the guide.
- Filled the index overview.
- Added the phase tasks (0–6) as open: nothing is implemented.
- `docmgr doctor --ticket JIG-016-RENDER --stale-after 30`: all checks passed.

**Delivery.** The command was `remarquee upload bundle <design-doc> --name "JIG-016 Rendering jig with Candela" --remote-dir /ai/2026/11/22/JIG-016-RENDER --toc-depth 2`. It answered `OK: uploaded JIG-016 Rendering jig with Candela.pdf -> /ai/2026/11/22/JIG-016-RENDER`. That is cloud upload evidence, not device sync. The PDF was not rendered locally, so its layout has not been checked.

**Open.** Decisions D6 (orthographic camera), where `look.js` lives, and the agent's tool scope; see guide §11–12. Nothing was committed.

## Step 4: Phase 0 and Phase 1: Candela vendored, the CAD package, the bridge, headless tests

This step starts implementation. Candela's engine is vendored into jig, pinned to a pbr-spark commit, and built into two bundles. jig gained a `candela` export that writes the CAD package. The bridge is a Candela library module, built by Candela's own `build` in Node, and puts every F-06 body at its jig placement with materials joined by jig face names. Twelve Node tests cover it, and the transform test was mutation-checked.

Two design points changed from the guide while building, both for the better:
- **The bridge is a Candela library module.** It is a scene-file source handed to Candela's build as `jig-candela.js`, not part of Candela's core. Candela's core needs no change for it, and the same bytes run in candela-rt.
- **The sidecar needs no new candela-rt command.** Readiness is the localhost port accepting connections, and the GPU comes from the existing `hello` reply.

### Prompt Context
**User prompts (verbatim):**
- "ok let's go"
- "commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
- "you can use subagents if you want and there is opportunity to prallelize"

**Assistant interpretation.** Start implementing the JIG-016 plan phase by phase on a branch. Commit at tested boundaries, keep this diary in the investigation format, and parallelise independent work.

**Inferred user intent.** Working rendering in jig, built incrementally and reviewably.

**Commit (code):** see Step 5 (the Phase 0/1 commit follows this entry).

### What I did
**Branch.** Created `jig-016-render` from `main` (3873732) and committed the ticket docs as `90b26ba`.

**Vendoring.**
- `import/jigcad/tools/vendor-candela.sh <checkout> [ref]` runs `git archive` of `src/engine` and `src/content/catalog.ts` into `vendor/candela/`, then writes `VERSIONS` and `SHA256SUMS`.
- Make target: `make vendor-candela CANDELA=… CANDELA_REF=…`.

**Upstream change.** On a local pbr-spark branch `jig-016-path-ids` (commit `38fc068`, not pushed), widened `.id()` to `^[\w-]+([./][\w-]+)*$` (`src/engine/scene.ts:79`). Vendored from that commit, then switched pbr-spark back to `main`.

**Bundles.** `build.mjs` now builds:
- `dist/candela.js` (ESM, 418 KiB) from `src/render/candela.js`: the core plus Viewport, renderers and RenderQueue, in one module graph;
- `dist/candela-core.js` (IIFE, `globalName: 'Candela'`, ES2020, 370 KiB) plus `.sha256`, for candela-rt's `--bundle`;
- `src/generated/candela-lib.json` holding the bridge's source.

**The CAD package (worker side).**
- New `src/engine/cadpkg.js`:
  - `cadPackage(prog, { quality })` and `encodeCadPackage(pkg)`;
  - `toCandelaMatrix`, `inferProcess` and `appearanceOf`.
- `io.js`: added `exportAs(prog, 'candela')`, which returns `<name>.jigcad.json`.
- `mesh.js`: `meshBody(…, { cache: false })`, so the render tessellation (0.1 rad) does not evict the stage's cached mesh.

**The bridge.** New `src/render/jig-candela.js`:
- `jigScene(pkg, o)` returns an immutable wrapper with `face(sel, m)`, `material(comp, m)`, `faces(sel)`, `components()`, `view(name)`, `center()` and `bounds()`.
- A selector is an address (`comp#face`, with globs), a list of addresses, or a predicate.
- A Proxy forwards symbol lookups to the realised Candela group, so `scene().add(asm)` works.

**Tests.**
- `test/render/bridge.test.mjs`, 12 tests, uses `node:test`.
- Makefile `test-js` now runs `node --test test/render/*.test.mjs`.

**Parallel work.** A subagent in its own worktree is building the Go sidecar (`pkg/render`, `--render` flag, `/rt` proxy, capabilities). Its brief records the verified candela-rt facts.

### Why
- **The bridge as a Candela module.**
  - Candela's `runFiles` resolves only its own libraries plus files in `files` (`candela.ts:74-83`).
  - A file `jig-candela.js` that imports `candela` therefore runs unchanged in the browser and in candela-rt's V8.
  - The page passes the in-memory package through `build(files, { scope: { __jigPackage } })`, where `jig-program.js` is `export const program = __jigPackage;`.
  - Rejected alternative: putting the bridge in Candela's core, which would change candela-core.js and its handshake hash for every jig change.
- **Placement by decomposition.** Candela's placed nodes have `at`, `rotateX/Y/Z` and `scale`, but no matrix (`scene.ts:100-109`). `nodeXf` composes `M = R_n ⋯ R_1 · S` (`compile.ts:68-79`), so `.rotateX(a).rotateY(b).rotateZ(c)` is `Rz·Ry·Rx`, and every rigid rotation decomposes that way.
  - Alternative 1, add `.matrix()` upstream: a second engine change.
  - Alternative 2, bake transforms into the vertices: this breaks shared definitions and makes poses relative.
- **Whole-component materials as `.face(allIds, m)`.** autoFinish dresses each face, and explicit `faceMats` override it in order (`compile.ts:236-251`). A shape material alone would lose to autoFinish.
- **Processes only for metal parts.** fromMetadata defaults a material-less face with a process to steel (`finish.ts:107`). Inferring processes for F-06's material-less frame would have turned it into steel.

### What worked
- **F-06 export.** It took 60 ms, and the package text is 65,210 bytes.
  - `rod/body1` face `body/side[s.big]` came out as: cylinder, axis (0, −1, 0), radius 0.003, `featureType: 'extrude'`, `process: 'ground'`. The concavity test classified it as a bore.
  - The rod's placement (3.87, −43.17, 6) mm became (0.003875, 0.006, 0.0432) m.
- **Candela `build` in Node.** It succeeded in 798 ms, with 5 objects (4 meshes plus the ground) and pose ids `jig, frame, crank, rod, slider, ground`. The only diagnostic was I206, for the material-less frame.
- **`node --test test/render/bridge.test.mjs`:** all 12 pass, including identical `compiled.shared` and packed `O` digests for typed-array versus JSON packages.

### What didn't work
- **Wrong camera method.** The first look used `.target(v.target)`, and Candela reported `E104 'target' is not a method of camera.thinLens`. The method is `.lookAt()` (`scene.ts:399`). The guide's examples have the same mistake (fixed in Step 5).
- **A bore check that failed.** The test asserting "bore material ≠ side material" failed with `Expected "actual" to be strictly unequal to: 9`.
  - Cause: my glob `rod#body/side[s.*]` also matches the outline's sides `body/side[s.r.*]`, so all six side faces got the override.
  - Fix: list selectors (`['rod#body/side[s.big]', 'rod#body/side[s.small]']`), plus a test documenting how the glob behaves. The guide's example used the same glob.
- **A test-only decoding bug.** `new Float32Array(Buffer.from(b64,'base64').buffer.slice(0))` read Node's shared Buffer pool. Fixed by slicing with `byteOffset` and `byteLength`.
- **A blind placement test.** Swapping the rotation order in `place()` still passed it, because F-06's parts only rotate about one axis and single-axis rotations commute. A new synthetic-package test covers a general rotation, ±90° about Y (the gimbal) and a near-180° rotation. It passes on the real code and fails on the mutated one: `✖ placement is exact for general rotations and at the gimbal (90° about Y)`.

### What I learned
- **Candela's module transform is line-based** (`candela.ts:30-47`). `import {…} from` becomes a `const` inside a nested async arrow function, so shadowing the injected scope names is legal. Top-level `await` works.
- **The browser's IR hash** is `digestString(compiled.shared)` (`remote.ts:81`). Mesh data is not in it; it lives in `pack().O` and the scene data.
- **`candela-rt serve`** takes `--token` and checks it as `token=` in the URI, closing with 4401 otherwise (`serve.cpp:369`). It defaults to `--bind 0.0.0.0`. Its protocol is `hello` / `files` / `param` / `view` / `clock`, with no jobs and no file endpoint (`serve.cpp:9-15`).
- **jig's assembly parts are named by component id** (`assembly.js:847`), so `body.part` is the component path.

### What was tricky to build
- **The mesh cache.** `meshBody` caches one tessellation per body (`body._mesh`). A finer render mesh would have evicted the stage's cached one and forced a re-mesh on the next stage draw. `cache: false` keeps the two paths apart.
- **Base64 without `Buffer`.** In the browser worker, `encodeCadPackage` falls back to chunked `btoa`.
- **Bodies placed apart from their component.** Each body's node is placed relative to its component group with `inv(Tc)·Tb`, which is usually the identity and then skipped.

### What warrants a second pair of eyes
- **The inference rules** in `inferProcess` (`cadpkg.js`): extrude side planes are milled along the extrude direction, which is taken from the `<feature>/end` face normal. A cut's `end` face may point the other way; that is harmless for an `along` direction.
- **Mutating vendored code.** `place()`'s gimbal branch sets `z = 0` and folds the rest into `x`. It is covered by the ±90° cases.
- **The cache key.** `DEFS` is a WeakMap on `globalThis` keyed by the package's body object. A page that rebuilds with the same package object reuses the mesh definitions and BVHs. A new package object, for example after every jig compile, re-creates them. That is correct, but costs a BVH build per compile; it is a candidate for a content-hash key.

### What should be done in the future
- `posesAt` and study poses (Phase 4); `.finish()` and one shared vocabulary (Phase 2); the Render view (Phase 3).
- Push pbr-spark `jig-016-path-ids` and open a PR: needs the user's go-ahead, since it is someone else's active repository.
- Fix the guide's examples: `.lookAt`, list selectors, the immutable chain, no `find()`.

### Code review instructions
- **Start with** `import/jigcad/src/engine/cadpkg.js` (the frame conversion and inference), then `src/render/jig-candela.js` (`realize`, `place`, `parse`).
- **Validate:** `cd import/jigcad && make -C ../.. web && node --test test/render/bridge.test.mjs`.

### Technical details
- **Package header:** `{ format: 'jig-cad-package', version: 1, frame: { units: 'm', up: '+y', fromJig: 'p = 0.001 * (x, z, -y)' } }`.
- **Arrays:** `positions` and `normals` are Float32, `indices` and `triFace` are Uint32, base64 in JSON.
- **C** (column-major) is `[S,0,0,0, 0,0,-S,0, 0,S,0,0, 0,0,0,1]` with S = 0.001; T′ = C·T·C⁻¹.
- **Euler extraction** for `Rz·Ry·Rx`: y = asin(−r20), x = atan2(r21, r22), z = atan2(r10, r00).

## Step 5: Phase 2 (appearance in jig) and the candela-rt sidecar merged

This step gave jig's own scripts a say over appearance: a part can be finished where it is defined (`.finish()`), display colours follow a rule, and brass, bronze and copper exist as engineering materials. The Go sidecar built by the first subagent was reviewed and merged.

The phases 0–1 code is commit `65d237d`. This step's commits are `54b4014` (Phase 2) and `619caaf` (the sidecar merge).

### Prompt Context
**User prompt (verbatim):** see Step 4.
**Assistant interpretation:** continue the phases; keep commits and the diary going.
**Inferred user intent:** working rendering, built incrementally.
**Commit (code):** `54b4014` "JIG-016 phase 2: appearance in jig (.finish, display colours, one vocabulary)"; `619caaf` "Merge the candela-rt sidecar (pkg/render, --render, /rt) into jig-016-render".

### What I did
**`Part.finish(meta)` and `.finish(faces, meta)`** (`src/engine/part.js`).
- The keys are `finish`, `process`, `color` and `roughness`. Unknown keys, processes or finishes throw at the call, so the compile fails with `(script.js:3:NN)`.
- Each record carries its line through `stampLine`, as a non-enumerable property, so it never enters a cache key.

**Resolution in the CAD package** (`src/engine/cadpkg.js`, `partOverrides` and `select`).
- `.finish()` and `.color()` selectors are resolved once per part: a persistent name, a `*` glob, or else `selectInPart` (the part's selector engine, as joint ends picked on geometry use).
- A selector that names nothing becomes a `finish.unresolved` warning in `pkg.diagnostics`, with the line and the closest real names. It does not crash the export.

**Colour rule** (`settleColor`).
- jig's display colour dresses plastics.
- On a metal it shows only under a coat: paint, powder coat or anodizing.
- `.finish({ color })` always wins.

**Materials.**
- `MATERIALS` gains brass (C360), bronze (C932) and copper (C110), with density, cost, modulus and strength (`inspect.js`).
- `reference.md` documents `.finish()` and the colour rule.

**Tests.** `test/render/appearance.test.mjs`, 8 tests.

**Sidecar merge.** Reviewed the subagent's diff of `server.go` and `main.go`, then merged `worktree-agent-a6d3627942f15b582` (`0a21626`, `5001158`).
- `GOWORK=off go test ./cmd/... ./pkg/...`: ok for render, gepp and server.
- `gofmt -l`: clean.
- Removed the worktree and the branch afterwards.

### Why
- **Finishes are metadata, not materials.** Candela's `autoFinish` needs the axis jig found to run lathe grooves around it. A Candela material written in jig would lose it.
- **Selectors resolve per part, in the worker.** That is where OpenCascade topology is. The page and candela-rt only see names (decision D9 in the guide).
- **A bad selector is a warning, not a failure.** A typo in a finish should not stop an export or a render.

### What worked
- `node --test test/render/*.test.mjs`: 20 passed.
- Agent and UI: `node --test test/agent/*.test.mjs test/ui/*.test.mjs`, 90 passed.
- Engine core: `node test/engine-core/run.mjs`, 69 passed.
- The "changing a finish re-runs no feature" test passes: the graph shows `rev` with `cached: true`.

### What didn't work
- **A string fell through to the selector engine.** `.finish('rev/end', …)` on a full revolve, which has no `rev/end` face, crashed the export with `expected a selector, got rev/end` (from `compile.js:187`, via `selectInPart`).
  - Fix: a string is a name or glob only, and a miss is a diagnostic.
- **Validation errors were looked for in the wrong place.** The first validation test looked for them in `program.diagnostics`, but a builder throw fails the compile reply itself. The test now asserts `r.ok === false` and the message's `(script.js:3:N)`.
- **The test's `line` check failed** because `callerLine()` returns `{ line, column }`. Switched to `stampLine` and `e.line`.
- **A first fixture made no faces.** It used a hole at the centre of a revolved tube, which is empty space there. Removed it; the revolve's own faces suffice.

### What I learned
- **Display colours on metal parts are the drawing's, not the part's.** The Compur's brass housing is `'#3a3b3f'` in jig. The rule above keeps it brass unless a coat is declared.
- **Candela labels every material `pbr`.** The materials' anisotropy can't be inspected from outside, so the test checks that the faces get distinct materials. The look of each material is Candela's tested `fromMetadata`.

### What was tricky to build
- **Overrides key on `(body, name)`, not the name alone.** One part can have several bodies with equal face names (patterns or splits), so the key is `body.id + NUL + name`.

### What warrants a second pair of eyes
- **The new materials' numbers** (`inspect.js`): C360 yield 310 MPa, C932 125 MPa, C110 70 MPa (annealed). They are typical values; check them before using them for stress results.
- **The sidecar's Origin check on `/rt`.** It rejects a cross-origin `Origin`, as gorilla/websocket does by default. A TLS front end that rewrites `Host` would need to preserve it (see the subagent's report, quoted in Step 6).

### What should be done in the future
- `.finish(component, meta)` on assemblies needs a rule in the subassembly expansion (the FLEXIBLE table) and is deferred.
- Candela's `POLYMERS` could gain petg, asa, pp, tpu and resin upstream. jig maps them to `finish: 'plastic'` meanwhile.

### Code review instructions
- `part.js` `finishMeta` and `finish`; `cadpkg.js` `select`, `partOverrides` and `settleColor`; `pkg/render/render.go` and `proxy.go`.
- Run `node --test test/render/appearance.test.mjs` and `GOWORK=off go test ./pkg/render/ ./pkg/server/`.

### Technical details
- Sidecar API (from the subagent's report and verified by the merged tests):
  - `render.Find(mode)`, `render.New(Config{Mode, DistDir, Dist})`, `(*Sidecar).Run(ctx)`, `Status()`, `ServeRT` and `ServeCapabilities`.
  - Routes: `GET /rt` and `GET /api/render/capabilities` → `{ rt, state, reason, restarts }`. Flag: `jigcad serve --render auto|off|PATH`.
  - The child runs as `candela-rt serve --bind 127.0.0.1 --port <free> --token <random> --bundle <dist>/candela-core.js`, and the proxy adds `token=`.
  - After 5 failed starts in a row it stays down.

## Step 6: Phase 3, the Render view (checked on the GPU); Phase 4 study poses merged; timeline and render jobs

This step built the visible feature. jig's workbench has a Render tab that path-traces the open model with Candela on the page. A click names a face as jig does, and a material from the library becomes one `.meta()` line in `look.js`. A study plays on a timeline, and stills and video render to files. The view was verified in Chromium on this laptop's Intel Iris Xe: 10/10 checks on WebGPU, and the earlier 6/6 suite also on WebGL2.

The headless investigation took most of the effort: software WebGPU loses its device. The second subagent's Phase 4 work (study poses) was merged.

### Prompt Context
**User prompt (verbatim):** see Step 4.
**Assistant interpretation:** build the Render view and the motion pieces; verify in a browser.
**Inferred user intent:** a KeyShot-like experience inside jig.
**Commit (code):**
- `2bc5b73` "JIG-016 phase 3 (first cut): the Render view; .meta() in the bridge"
- `c218987` "Merge study poses (phase 4) into jig-016-render"
- `a1c04de` "JIG-016 phase 3: the Render view, checked in Chromium on a GPU"
- `89ad6fc` "JIG-016: the Render view plays studies and renders stills and video"

### What I did
**`src/render/host.js` (`RenderHost`), the view's controller.**
- Loads `dist/candela.js` on first use (`import(new URL('./candela.js', import.meta.url))`).
- Gets the CAD package with `host.export('candela', { quality: 'render' })`. It does not export while `host.dirty` or `host.compiling`; the compile's `program` event brings it back.
- Builds `{ 'jig-candela.js', 'jig-program.js', 'scene.js': look }` with `scope: { __jigPackage }`.
- Drives a Viewport with a rAF loop that draws no frames while shaders compile, while a job renders, or after the device is lost.
- Camera: orbit, pan and zoom, Y up, ported from Candela's host. Picking uses `rayMesh`, now exported from `dist/candela.js`, against packed meshes, and `faceAt()` maps a hit to `{ component, body, face, address }`.
- `applyMeta(address, patch)` inserts `.meta(…)` before the `;` that ends the chain under the marker line.
- Timeline: `duration()`, `setTime()`, `play()`, and `timeOfDrive()`, which opens at the stage's pose.
- Render jobs: `renderJob(o)` and `cancelJob()` wrap Candela's `runRender`.
- `restart(prefer)` handles a lost device; the backend choice is stored in localStorage `jig.render.backend`.

**The default look.** autoFinish, a studio HDRI, a floor plane at the model's lowest Y, the stage's view as a 100 mm camera (`asm.view()`), and the first study animated over 4 s.

**`src/ui/views/render.jsx`, the view.**
- Toolbar: status, backend and spp; Reset camera; Edit or Make `look.js`; Render PNG and Render video; progress with Cancel.
- Timeline row: play/pause and a time slider.
- Side panel: the picked face (component, persistent name, feature and current look), a "whole component" toggle, the material library (metadata patches) and diagnostics.

**Registration.** `app.jsx` and `layouts.js` (every built-in layout gets `tile(['stage', 'render'], 'stage')`), plus CSS in `jig.css`.

**Bridge.**
- `.meta(sel, patch)`: per face, the last word in call order between an explicit material and a metadata patch decides.
- `animate()` returns a function carrying `duration` and `study`.

**`test/ui/render.cjs`, the Playwright check.**
- Needs `NODE_PATH` set to a playwright install, plus `CHROMIUM` (the scratchpad install of 1.65.1 and the cached `chromium-1254`).
- Uses Vulkan flags so ANGLE and WebGPU use the real GPU; `RENDER_BACKEND=webgl2` forces WebGL2.

**Phase 4 merge.** Merged `worktree-agent-a30d950823c2ddea3`:
- `5827366`: every study keeps its poses on the worker side;
- `a406387`: the package carries them;
- `553bffd`: `asm.studies()`, `posesAt()` and `animate()`;
- `a03b0b3`: tests and docs.

The one conflict was the import line of `jig-candela.js`: their header was kept, plus my `finish` import.

### Why
- **Materials as metadata patches.** A finish keeps the axis jig found; a hard-coded `finish.turned()` would not.
- **The timeline uses Candela's `export const animation`.** It reuses the engine's repack path (no rebuild) and the bridge's interpolation, so the host has no second copy of the pose math.
- **Opening at the drive's value.** Without it the view showed F-06 at the study's 0° while the stage shows 30°.

### What worked
- **`test/ui/render.cjs` on WebGPU:** 10 passed, 0 failed. The adapter is `intel gen-12lp`.
  - Shader compile: 38.8 s cold, then 400–500 ms thanks to Mesa's disk cache.
  - Steps passed: F-06 at 16 spp, timeline opening at t = 0.3333, pick `rod#body/side[s.big]` and stage selection, the Brass line, the rod moving with the clock, a PNG still (12,853 bytes), MP4 (1,655 B) and WebM (4,280 B) sequences, and no console errors.
- **With `RENDER_BACKEND=webgl2`:** the earlier 6/6 suite passed before the timeline checks were added.
- **Screenshots** `test/ui/out/render-f06.png` and `render-f06-brass.png` show the frame plate grey diffuse, the steel parts with studio reflections and floor contact shadows, and the crank-pin bore turning brass after the click.
- **Node render tests:** 36 passed (21 bridge and appearance, 15 poses).
- **Engine suite on the merged tree:** 62 passed, 0 failed (124.3 s).

### What didn't work
- **Waiting for samples timed out headless.** The first headless run (SwiftShader flags) hit `page.waitForFunction: Timeout 120000ms exceeded`. The diagnosis showed `status: building` for 40 s and page errors `TypeError: Cannot read properties of undefined (reading 'U')`.
  - Cause: my loop called `vp.frame()` while `Viewport.loadNow` had set `compiled` but not yet `packed` (`viewport.ts:80-92`).
  - Fix: no frames while `this.loading` or `!vp.packed`.
- **The software adapter lost its device.** On software WebGPU, the shader compile took 33.8 s (`compileMs: 33750`), then accumulation stopped at `spp: 2` with `busy: false`, `metered: 0`.
  - At quarter resolution (102 × 78) it still stopped at 2. `vp.snapshot()` then threw `OperationError: A valid external Instance reference no longer exists.`: the device was lost.
  - Response: detect `backend.lost`, show an error with Restart and Use WebGL2, and test on the real GPU instead. Candela's own `render-preset.ts` refuses a software rasteriser without `--allow-software`.
- **The screenshot at 2 spp was plain white.** That was the lost device; it is not a sign of a broken scene.
- **Your Chrome didn't respond.** I tried to verify there through the Chrome extension, and `tabs_context_mcp` timed out twice; I stopped and used Vulkan instead.
- **No usable Playwright at first.** No playwright package was found, and pbr-spark has no `node_modules`. After `npm install playwright@1` (1.65.1) into the scratchpad, it asked for an uncached browser, so the test takes `CHROMIUM` (the cached chromium-1254).
- **Device probe on `about:blank`.** With the Vulkan flags it said `"no adapter"` because the page was not a secure context. The real page on 127.0.0.1 got `intel gen-12lp`.
- **The "no console errors" check failed** on `Failed to load resource: … 404`. It was the browser's own `/favicon.ico` request, which never shows as a page response. The test now records `m.location().url` and ignores only the favicon, like `shoot.cjs:461`.

### What I learned
- **Viewport needs a loading guard.** `Viewport.load` is chained and async, and `compiled` is set before `packed`. Candela's own host avoids the gap with its `compiling` flag.
- **This laptop's GPU works headless.** It is an Intel Iris Xe (TigerLake GT2), usable with `--enable-features=Vulkan --use-angle=vulkan --use-vulkan --ignore-gpu-blocklist --enable-unsafe-webgpu`.
- **Mesa caches the compiled kernel on disk.** A cold compile of Candela's kernel takes ~39 s on the Iris Xe; warm loads take ~0.4 s.
- **WebCodecs here encodes both H.264 (MP4) and VP8/VP9 (WebM).**

### What was tricky to build
- **Scheduling the package refresh.** Edits emit `files` before the compile runs. Exporting then would export the previous program, so the export is skipped while `dirty` or `compiling`, and look-only edits rebuild at once.
- **Restart.** A canvas that once held a WebGPU context cannot become WebGL2, which is why Candela itself swaps canvases. `restart()` replaces the canvas node before re-attaching, and pointer events live on the wrapper, not the canvas.
- **Writing into a hand-editable file.** Material lines go to the end of the marked chain, so later lines win. If the user removes the marker, `applyMeta` throws with the exact line to paste.

### What warrants a second pair of eyes
- **Exporting after every compile.** `refresh()` re-exports the package after every compile that changes the model: a render-quality re-mesh in the worker plus new mesh definitions (BVHs) on the page. That is fine for F-06 (60 ms export); large assemblies need a cache keyed by body content.
- **World poses.** The timeline's poses are world matrices in the package frame. Moving the whole `jigScene` group in a look would not move the posed components (the subagent documented this in the bridge header).
- **The clock re-packs every frame while playing.** That resets accumulation, which is expected; motion blur is opt-in in the look.

### What should be done in the future
- The Mechanism view could forward drags and study scrubs to the Render view (`vp.setPoses`). The Compur adapter is an example of poses from an outside engine.
- Cache mesh definitions by body content across compiles.
- Push pbr-spark's `jig-016-path-ids` (`38fc068`) and open a PR there, with the user's go-ahead.
- Phase 6 (the subtree merge) waits for the OptiX work, as planned. The sidecar has been tested only against a fake candela-rt, because there is no NVIDIA GPU here.

### Code review instructions
- Start with `src/render/host.js` (`refresh`, `build`, `loop`, `pick`, `applyMeta`, `renderJob`), `src/ui/views/render.jsx`, and the bridge's `meta()` and `realize()` in `src/render/jig-candela.js`.
- Validate:

  ```sh
  make web
  node --test test/render/*.test.mjs
  NODE_PATH=<playwright> CHROMIUM=<chrome> node test/ui/render.cjs
  node test/engine/run.mjs
  ```

### Technical details
- **Look-file contract:**
  - `import { jigScene } from 'jig-candela'` and `import { program } from 'jig-program'`, both resolved as files by Candela's `runFiles`;
  - the marker line `// materials: the Render view adds lines here`, with the chain ending in a line that is just `;`;
  - an optional `export const animation = asm.animate(study, { duration })`.
- **Library patches** include `finish: null` for bare metals, so a jig `.finish()` coat can be removed from the Render view.

## Step 7: the Render view follows the mechanism; motion blur; three agents on the remaining items

The user asked whether the remaining items could be done or whether they needed the repository merge. They don't: they are all jig-side and the vendored engine has everything they use. So the work was split. Three worktree agents took the items with no UI:
- `.finish()` on assemblies and caching render meshes between compiles;
- the lockstitch comparison test;
- the Compur preset with poses baked from its simulation.

I did the two UI items. The Render view now follows the mechanism: drive overrides, live drags on the stage, and a motion-blur control. All 13 browser checks pass on the GPU.

### Prompt Context
**User prompt (verbatim):** "ok can we do any of these?" followed by a paste of my list:
- the Mechanism view driving the Render view's pose;
- the Compur example;
- a motion-blur control;
- the lockstitch comparison test;
- `.finish()` on assemblies;
- caching meshes between compiles, which matters for large models (F-06's export takes 60 ms).

Then: "or do we need th emerge?"

**Assistant interpretation:** do the items now if the merge isn't required. It isn't, so do them, in parallel where the files don't overlap.

**Inferred user intent:** finish the feature set before any repository surgery.

**Commit (code):**
- `3462813` "Render view: project files named *.look.js go to Candela's build with look.js": the contract the Compur agent needs.
- `260d98f` "Render view follows the mechanism: drive overrides, live drags, motion blur".

### What I did
**Contract for baked data.** Project files named `*.look.js` are sent to Candela's build with `look.js`, so a look can `import poses from './x.look.js'`. jig's compile never runs them, and they are not part of the package key. This went in before the Compur agent started.

**Agents.** Three worktree agents with disjoint files:
- **engine:** `assembly.js`, `cadpkg.js`, `part.js`, and the bridge's DEFS cache;
- **lockstitch:** test and fixtures only;
- **Compur:** a new preset directory, `tools/compur-poses.mjs`, and its test.

**Following the drive** (`src/render/host.js`).
- `followDrive(overrides)` listens to the host's `overrides` event. When the study's drive changes (e.g. "90 deg"), it moves the timeline to that drive value at once, using the study's poses.
- After the compile, `build()` re-syncs the timeline whenever the drive's value changed. The key is `study\0value`. The re-sync is skipped while playing.
- `timeAt()` uses `asm.animate()`'s own from/to (now carried on the function) and wraps studies of whole turns.

**Live drag.**
- `stage.js` emits `pose { source: 'drag', transforms }` after each `dragPose` solve, and `{ done, changed }` on commit.
- `livePose()` converts jig transforms to Candela's frame (`src/render/frame.js`, the same C·T·C⁻¹ as `cadpkg.js`) and calls `vp.setPoses(map)`. External poses win over the animation.
- A commit that pinned overrides keeps the pose until the compile's build lands (`_dropPoses`). A drag that pinned nothing lets go at once.

**Motion blur.** `setMotion('look' | 'off' | '180')` sets `vp.motionOverride` (`{ interval: 1/48, steps: 8 }` for 180° at 24 fps). The control is a select in the timeline row, and `attach()` re-applies it after a restart.

### Why
- **Overrides are what the Mechanism view already emits.** Both its slider and a click on a study call `host.setOverride`, so the Render view needs no new channel from it. The instant jump uses poses the package already has, so the user doesn't wait for the re-export.
- **Re-syncing on every value change.** Syncing only when the study changed left the Render view at the old pose after a drag or slider move: the package's rest pose moved, but the animation, which wins, still showed the old time.

### What worked
`test/ui/render.cjs`: 13 passed, 0 failed on the Intel GPU (WebGPU).
- An override of `main` to "90 deg" moves the timeline to t = 1 at once, and t = 0.9999999999998 after the compile.
- A real `dragPose` on `crank:pin` moves the rod in the packed scene. The body-in-component relation W·M stays as at rest within 1e-4, so the pose is placed as jig solved it. A done event with `changed: false` releases it.
- 180° blur sets interval 1/48 and 8 steps, and the still differs from the sharp one with the same seed.

Node tests: `node --test test/render/*.test.mjs` 36 passed, and agent/UI 90 passed.

### What didn't work
- **The first live-drag check failed** with `{"moved":false,"placed":true,"released":true}`. The test dragged the first crank port, `crank:pivot`, which sits on the fixed axis, so the drag moves nothing. It now takes the crank's port farthest from the origin, `crank:pin`.

### What I learned
- **Stage and Render share one tile in every built-in layout.** The live drag pose is visible only after moving the Render tab to another tile. The Mechanism view sits in its own tile, so the override path is the one users see by default.
- **Candela's poses from `setPoses` win over the scene's animation** (`viewport.ts:104-107`), which is what makes a live drag override a playing study.

### What was tricky to build
- **Not flashing back to the old pose on release.** The drag's commit sets overrides, then a compile runs, then the package is exported and the view rebuilt. Clearing the external poses on release would show the old pose for that whole time, so they are cleared just before `vp.load` of the new build. If nothing changed, they are cleared in `refresh()`'s unchanged-key branch.

### What warrants a second pair of eyes
- **The unit match in `followDrive`.** It parses `"<number> deg|°|mm"` and skips other units, leaving them to the compile. A drive given in turns or radians would therefore not jump at once.
- **The frame code is duplicated.** `src/render/frame.js` repeats `cadpkg.js`'s matrices. `cadpkg.js` could import it once the engine agent's changes are merged.

### What should be done in the future
- Point `cadpkg.js` at `src/render/frame.js`.
- A real pointer drag on the stage with Render in a second tile, in the browser test.

### Code review instructions
- Read `host.js` `followDrive`, `livePose`, `setMotion`, `timeAt` and `build()`; `stage.js` `poseStep` and `commitPose`; and the timeline row in `render.jsx`.
- Validate: `make web`, then `NODE_PATH=<playwright> CHROMIUM=<chrome> node test/ui/render.cjs`.

## Step 8: merged the lockstitch comparison and the engine work; fixed the two gaps the comparison found

Two of the three agents reported, and both branches were reviewed and merged. The lockstitch comparison found two real jig gaps in the CAD package's process inference, and I fixed both after the engine branch, which also edits `cadpkg.js`, was in. Process agreement with the converter went from 3 faces to 123, and every remaining disagreement belongs to a named class with its reason.

### Prompt Context
**User prompt (verbatim):** see Step 7.
**Assistant interpretation:** merge the agents' work as it lands, verify it, and fix what it finds.
**Inferred user intent:** the remaining items done and trustworthy.
**Commit (code):**
- `586368c` merge of the lockstitch test;
- `15041cb` merge of assembly finishes and render caching;
- `1358880` "CAD package: processes for .add() primitives and pattern copies";
- `4c3c0d4` "One copy of the jig-to-Candela frame change".

### What I did
**Lockstitch merge** (agent commits `7ef57a2`, `643ed6c`).
- Adds `test/render/lockstitch.test.mjs` and fixtures. `scripts.json` holds the 27 part scripts. `expected.json` was produced by `gen-expected.py`, which runs convert.py itself and reads its `cyl_axis` with `ast`; a rerun gave byte-identical output.
- The test compiles every part with the converter's material, exports, and compares names, axes and processes.

**Engine merge** (`638e293`, `12aac9c`).
- `asm.finish(component[, faces], meta)` takes ids, subassembly ids and globs. Unknown ids are a `finish.unresolved` warning with "did you mean".
- Subassemblies carry finishes under their prefix, and `finishes: 'carried'` is in the FLEXIBLE table.
- **Caching:** the worker keeps render meshes per Body in a WeakMap, and package bodies carry `meshKey` and `key`. The bridge caches definitions by key (LRU, 1M-triangle budget). A finish-only change derives a copy that shares the triangles and the BVH (`withMeta`).
- I reviewed the bridge's cache code before merging. The merge was automatic: my `animate()` line and their cache sit in different hunks of `jig-candela.js`.

**Fixes in `cadpkg.js`.**
- `inferProcess` gets an `'add'` case. Round faces turn about their own axis; a concave one (a bore cut in) is ground. Flats across a round face of the same primitive are faced (`ctx.lathe` comes from `rounds` per feature and copy). Other flats are face-milled.
- `sourceOf(name)` strips pattern and mirror prefixes. `spokes[1]/spoke/end` → feature `spoke`, type `extrude`, `meta.copy = 'spokes[1]'`, and the direction comes from `spokes[1]/spoke/end`.

**Test updates.**
- Lockstitch: the two gap classes are removed and the todo tests are now plain tests. The `not-a-lathe-part` and `off-the-lathe-axis` matchers accept any jig process, because jig now turns added pins. A new class, `add-box-milled` (3 faces), and new counts.
- `appearance.test.mjs` gains two direct tests: `.add(j.cyl)` turned/faced/ground, and pattern copies.

**Frame helpers:** `cadpkg.js` now imports `S`, `R`, `pt` and `toCandelaMatrix` from `src/render/frame.js`, the one copy.

### Why
- **I fixed the gaps myself, after the merges.** Both are in `cadpkg.js`, which the engine agent was editing.
- **A copy's feature is its source.** `spokes[1]` is no node of the graph, so nothing could be inferred. Its source is an extrude, and a selector like `f.meta.featureType === 'hole'` should catch patterned holes. The instance stays readable as `meta.copy`.

### What worked
- **Lockstitch:** 8/8 tests pass. On processes, 123 faces agree on a process and 10 on none; the disagreements are:

  | Class | Faces |
  |---|---|
  | `extrude-side-milled` | 3 |
  | `extrude-end-milled` | 69 |
  | `add-box-milled` | 3 |
  | `not-a-lathe-part` | 231 |
  | `gear-flank` | 312 |
  | `off-the-lathe-axis` | 373 |

  Names: all 1124 faces match. Axes: 108 cylinders exact (5e-5 mm). 44 turned faces agree with the converter's lathe axis exactly, and 153 faced faces too.
- **Suites:**
  - `node --test test/render/*.test.mjs`: 64 passed, 0 failed, 0 todo.
  - `node test/engine/run.mjs`: 62 passed (41.9 s).
  - `node test/engine-core/run.mjs`: 69 passed.
  - `test/ui/render.cjs` on the merged engine work (before the fixes): 13/13. The engine agent had not run it.
- **Engine agent's measurements** (Node, render quality, export / build / new definitions):
  - **M-10, pose override:** 3418 → 19 ms export, 1491 → 89 ms build, 7 → 0 new definitions.
  - **M-10, carrier edit:** 3141 → 47 ms export, 1206 → 95 ms build, 7 → 1 definition.
  - **M-10, finish only:** 2533 → 20 ms, with 1 derived definition sharing its BVH.
  - **F-06, pose override or finish:** 13 → 2–3 ms export.

### What didn't work
- **First run after the fixes:** `✖ 3. processes … AssertionError: a disagreement no class explains`.
  - It listed 33+ faces such as `crank pinHead/side: convert.py polished, jig turned (add cylinder)` and `gate boss/top: convert.py polished, jig faced (add plane)`.
  - Cause: the classes for converter-polished faces only allowed jig `milled` or `ground`. They now allow any process, with the reason extended.
- **Second run** left three faces: `bobbinCase notch/bottom`, `spring/top` and `spring/bottom` (convert.py faced, jig milled, `add plane`). These are boxes added to a FACED part. They got the new class.

### What I learned
- **The converter's cone fit is wrong past a 35.26° half-angle.** The fit takes the smallest eigenvector of NᵀN, so steep cones come out 90° off. Through that, K-09 grooved the tension unit about the wrong axis. This is convert.py's bug, not jig's, and is documented in the test.
- **The process "disagreements" are now mostly the converter's simplification**: one lathe axis per part, and only the parts on its LATHE list. jig infers per feature.

### What was tricky to build
- **"Faced" for an added primitive needs its sibling round face.** A flat face alone can't tell an end of a turned pin from a milled block. The rule looks for a round face of the same feature, within the same copy, whose axis is parallel to the flat's normal.

### What warrants a second pair of eyes
- **The bridge cache relies on Candela internals:** `withMeta` sharing the BVH, and writable `name`, `meta` and `faces` on the copy. `cache.test.mjs` checks both. A Candela upgrade must keep them, or the tests fail.
- **Assembly finishes are not applied to print jobs of assemblies** (agent's note).

### What should be done in the future
- `j.lib.gear` flanks as "hobbed", once the library marks them.
- Fix convert.py's cone fit upstream in pbr-spark: use the eigenvector of the largest separation, or jig's package instead of the fit.

### Code review instructions
- `cadpkg.js` `inferProcess` (the `add` case), `sourceOf`, and `faceRecords` (`rounds`, `across`, `typeOf`).
- `jig-candela.js` `defOf`, `derived` and `evict`; `assembly.js` finishes.
- Run `node --test test/render/*.test.mjs` and `node test/engine/run.mjs`.
