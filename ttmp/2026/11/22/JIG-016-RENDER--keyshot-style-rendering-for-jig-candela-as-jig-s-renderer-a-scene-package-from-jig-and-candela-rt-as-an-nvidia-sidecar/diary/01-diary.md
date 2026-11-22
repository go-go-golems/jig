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
