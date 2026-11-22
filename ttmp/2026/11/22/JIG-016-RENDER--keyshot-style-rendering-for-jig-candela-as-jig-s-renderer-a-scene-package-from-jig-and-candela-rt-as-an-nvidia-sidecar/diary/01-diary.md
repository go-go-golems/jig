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
