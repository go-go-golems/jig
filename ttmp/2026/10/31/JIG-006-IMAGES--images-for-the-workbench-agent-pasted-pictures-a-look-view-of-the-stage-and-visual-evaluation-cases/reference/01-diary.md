---
Title: Diary
Ticket: JIG-006-IMAGES
Status: active
Topics:
    - agent
    - llm
    - testing
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://pkg/sample/gepp/sample.go
      Note: imageBlock, tool images after tool results
    - Path: repo://pkg/server/server.go
      Note: images on start and tool results
    - Path: repo://import/jigcad/src/agent/scope.js
      Note: look()
    - Path: repo://import/jigcad/src/host/host.js
      Note: renderView
    - Path: repo://import/jigcad/tools/agent-eval/chrome-look.mjs
      Note: headless Chrome renderer for the harness
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T22:58:34.643897819-04:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

# Diary

## Step 1: Probe: both models read images, and jigcad serve dropped them

Before designing anything I checked whether the two lunaroute models accept images at all, with a JPEG whose
content is unambiguous. Called directly, both described it exactly. Sent through `jigcad serve`, glm answered
"NO IMAGE" after 49 input tokens. The server's request handler had no `images` field, so the backend's existing image
support was unreachable. That finding reordered the ticket: fix the transport first.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1 ("Do 1, 2, 3, 4. …").
**Assistant interpretation:** Item 3: verify vision through lunaroute; images pasted in the panel; a look() of the stage delivered after tool results; visual harness cases.
**Inferred user intent:** A visual feedback loop for the agent, measured like the rest.

### What I did
- Drew `vision-probe.jpg` (512 × 384: blue triangle bottom left, green circle bottom right, red 7 top right; 9,881 bytes).
- `curl -N -X POST /api/sample` with `{input, options:{modelTier}, images}` → glm: `NO IMAGE … I don't see an image attached`, usage `input 49`.
- Direct `POST https://gw.lunaroute.com/v1/chat/completions` with an `image_url` data URL (key read from `~/.pi/agent/models.json`, never printed): glm-5.3-flash 307 prompt tokens, deepseek-4.1-flash 252, both correct.
- Read the path: geppetto's OpenAI converter emits `image_url` parts for user blocks with images; `gepp.toTurn` attaches request images to the last user turn; `sample.ValidateRequest` checks them; `Server.start` decodes `{input, modelTier, model, effort, tools}` only.
- `scripts/01-vision-probe.py`; design doc §2.

### Why
- A fake-free probe (a picture with known content, a question with a yes/no escape) separates "the model cannot see" from "the image never arrived".

### What worked
- The 49-token count was the decisive evidence: a 9.9 KB image costs ~250–300 tokens.

### What didn't work
- My first probe body used `options.modelTier` (the sample.Request shape) instead of the server's flat `modelTier`; harmless (default tier), but it showed I had not read the handler's input struct before claiming "the backend supports images".

### What I learned
- My earlier statement "the backend already supports up to 4 JPEG images" described `pkg/sample`, not the HTTP API. The design doc records the correction.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- Model ids in `~/.pi/agent/models.json` (`glm-5.2-vision`, `deepseek-v4-flash`) differ from the served ones (`glm-5.3-flash`, `deepseek-4.1-flash`, which report `images: true` through `/api/sample/models`); `glm-5.2-vision` answered 404 `INFERENCE_MODEL_NOT_FOUND`.

### What should be done in the future
- N/A.

### Code review instructions
- `python3 scripts/01-vision-probe.py various/vision-probe.jpg --direct --serve http://127.0.0.1:8787/`.

### Technical details
- Image limits already in `pkg/sample`: 4 per request, JPEG only, 8 MiB together.

## Step 2: Go: request images pass, tool results carry images

The server now decodes `images` on `POST /api/sample` and on tool results (at most 2 per result, 4 MiB). The gepp
backend sends tool-result images as one user message after the round's tool results, because Chat Completions tool
messages are text-only. Tests check the message order against a fake provider.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1.
**Assistant interpretation:** Design §3.1–3.2.
**Inferred user intent:** Images reach the model from the person and from tools.
**Commit (code):** 8bcb879 — "JIG-006: images for the agent — …"

### What I did
- `pkg/sample`: `ToolResult.Images`; `ValidateImages(images, n, limit)`; constants `MaxRequestImages 4`, `MaxToolImages 2`, `MaxCallImages 8`.
- `pkg/server`: `Images` on the start input (body limit + 12 MiB), on the tool-result input (+ 6 MiB) with validation; passed to the backend.
- `pkg/sample/gepp`: `runTools` returns per-call images; `imageBlock` builds `"Images from the tool calls above, in order:\n1. from eval call call_1"` with the images; beyond 8 per call, or for a model without image input, the caption says the image was not attached.
- Tests: `TestToolImagesFollowTheToolResults` (roles `user, assistant, tool, user`; data URL present), `TestToolImagesAreCappedPerCall`, `TestImagesReachTheBackend` (request images arrive; 3 tool images → 400; 2 → passed on).

### Why
- Keeping images in the conversation once attached keeps the prompt prefix stable for lunaroute's cache; dropping old images would re-read everything after them.

### What worked
- `go test ./pkg/...` passed on the first run of the new tests; geppetto already buffers user blocks after pending tool results, so the order was right without changes there.

### What didn't work
- N/A.

### What I learned
- geppetto's `NormalizeImageMap` accepts `{media_type, content: []byte}`, the shape `toTurn` already used.

### What was tricky to build
- Counting images per call across rounds: the count starts at the request's images and lives on the `call`.

### What warrants a second pair of eyes
- The caption names tool call ids (`call_1`); models seem to map them correctly, but ids are opaque to them.

### What should be done in the future
- N/A.

### Code review instructions
- `go test ./pkg/... -run 'Image'`.

### Technical details
- The server's tool-result error message is now `A tool result is {value, isError, images?}: a value of at most 32 KB`.

## Step 3: JavaScript: renderView, look(), the adapter, the panel

`look(view?, {width, height})` in the lab scope asks the host to draw the sheet offscreen and attaches the JPEG to
the step. The eval tool returns `withImages(text, images)`, and `sample-http.js` sends them with the tool result.
The panel accepts pasted or attached images. A name collision with an existing host method broke three tests on the
first run.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1.
**Assistant interpretation:** Design §3.3–3.4.
**Inferred user intent:** The agent can look at its own work; the person can show it pictures.
**Commit (code):** 8bcb879

### What I did
- `host.renderView({ view, width, height, overlays })`: the stage's `draw()` on an offscreen canvas with `dpr: 1`, the person's view untouched, `toDataURL('image/jpeg', 0.85)`; a `renderView` constructor option for hosts without a document.
- `scope.look`: views axo/front/side/plan, 64–1600 px, 2 per step, allowed in read mode; returns `image N: front view, 800 × 600 px, 25 KB, attached after the tool results`.
- `evaltool.js`: `TOOL_IMAGES = Symbol.for('jigcad.toolImages')`, `withImages`; `runEval` returns `images`; steps record `images: n`.
- `sample-http.js`: `o.images` (≤ 4) on the request; tool results with images; only `mimeType` and `data` are sent.
- `images.js`: `prepareImage` (createImageBitmap → canvas, longest side 1568, white background, JPEG 0.85), `imageFiles`; `panel.jsx`: paste handler, `Image…` button with a hidden file input, thumbnails with remove buttons, "· 1 image" on the user message; `turn.js`: `images` option, count stored, bytes not.
- `reference.md`: a row for `await look(…)`.
- Tests: three in eval.test.mjs, one in sample-http.test.mjs, one in turn.test.mjs.

### Why
- The person's view must not move when the agent looks: an offscreen canvas with the same `draw()` gives the same drawing without touching the stage.

### What worked
- After the rename below: eval 17/17, sample-http 6/6, turn 7/7.

### What didn't work
- First run: `AssertionError … Input: "TypeError: Cannot read properties of undefined (reading 'length')"` and an async `TypeError: Cannot read properties of undefined (reading 'width')`. Cause: I named the method `host.snapshot`, which already exists. `takeSnapshot` in evaltool calls `host.snapshot()` (no arguments) to save files for undo, and the mock host defines it. Renamed to `renderView`.

### What I learned
- Grep the existing host vocabulary before adding a member; "snapshot" was taken by undo.

### What was tricky to build
- The tracked-promise wrapper (JIG-004) wraps `look` too; awaiting it consumes the tracker as usual, and an unawaited `look()` gets the same note.

### What warrants a second pair of eyes
- The panel's `fileRef` hook had to move next to the other `useRef` calls; hooks after conditional code would break preact's hook order.

### What should be done in the future
- Drag-and-drop onto the composer (the `imageFiles` helper already accepts drop items).

### Code review instructions
- `node --test test/agent/eval.test.mjs test/agent/sample-http.test.mjs test/agent/turn.test.mjs`.

### Technical details
- `look()` draws `this.program`, or `this.lastGood` when the current program failed, as the stage does.

## Step 4: The harness renders in headless Chrome; first live runs

Node has no canvas, so `--look chrome` starts Chrome headless and speaks the DevTools protocol over Node's built-in
WebSocket to the workbench page. Each `look()` copies the Node host's preset, files and overrides into the page,
compiles there and returns the page's `renderView`. The first render failed on a compile race. After the fix, three
visual cases passed on glm. A probe confirmed that tool-result images reach both models. The same flow worked in the
real panel.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1.
**Assistant interpretation:** Design §3.5 and the first measurements.
**Inferred user intent:** Visual cases measured with the same harness.
**Commit (code):** 8bcb879

### What I did
- `tools/agent-eval/chrome-look.mjs`: `findChrome`, read `DevTools listening on ws://…` from stderr, `Target.createTarget` + `attachToTarget {flatten}`, `Runtime.evaluate {awaitPromise, returnByValue}`; the page script waits for `jigHost.engine.ready`, loads the preset if different, syncs files and overrides, compiles, renders.
- CLI `--look chrome`; cases with `needs: ["look"]` are skipped without it; Host gets `renderView: a => looker.render({ presetId: host.preset?.id, ...a })`.
- Runner: `images` on cases (files in `test/agent-eval/images/`), sent with the first request only; `caseImages`.
- Cases 29–31: `v01-s01-describe` (read mode, look and describe), `v02-a01-engrave-front` (engrave JIG on the −Y face: volume 15,269.27 on the engine, band 15,200–15,335; look at the front), `v03-a01-footprint-drawing` (a dimensioned plan drawing, 80 × 50 → bbox [80,50,30], volume 21,904.27).
- Built dist and a new binary; second server on 127.0.0.1:8788 (the JIG-005 baseline used 8787).
- `scripts/02-tool-image-probe.mjs`; a Playwright session in the real panel.

### Why
- Rendering in the real page means the harness's images are the panel's images, not a second renderer that could drift.

### What worked
- Vision probe through the new server: default 317 input tokens, complex 263, both correct.
- Renders: `axo 640 480 38976 294 ms`, `front … 23 ms`, an engraved plan with an override `h: 20` (sheet shows 60 × 40 × 20, 88 faces).
- Smoke: `PASS default #1 v01-s01-describe · 2 tools · 11.9 s`, `PASS … v02-a01-engrave-front · 5 tools · 15.8 s`, `PASS … v03-a01-footprint-drawing · 6 tools · 25.0 s`, `look: 4 renders, 662 ms`.
- Tool-image probe: default `Blue triangle — lower-left area (~130, 270) … 7 in red, upper-right`; complex `The picture did reach me … Triangle | Blue | Lower left …`.
- Panel (Playwright): attach via `Image…`, request "Change the box's footprint to match this drawing, then look at the plan view…"; the turn ran `files.read`, `files.edit` (80 × 50), `look('plan', { width: 800, height: 560 })` and answered that the plan matches, mentioning the hatched shadow area it saw. Screenshots `various/panel-attached.png`, `various/panel-answer.png`.

### What didn't work
- First render: `Error: look: nothing compiled yet`. `setOverride`/`resetOverrides` call `scheduleCompile()`; the debounced compile started after mine and `compile()` drops a superseded result (`if (seq !== this._seq) return program`) before setting `this.program`. The page script now clears `h._timer` and waits for `!h.compiling` before compiling.

### What I learned
- In v01 the model looked at the front view although the request said "side": the clip's profile is sketched on XZ, which the front elevation shows. It chose the view that answers the question.

### What was tricky to build
- Keeping the page and the Node host in step without serialising programs: files and overrides are small, and the page compiles them itself.

### What warrants a second pair of eyes
- The page script reaches into `h._timer`, a private field; a `host.compileNow()` would be cleaner.

### What should be done in the future
- The full visual run (3 cases × 2 tiers × 3 repeats) after the JIG-005 baseline, to avoid running two loads against lunaroute at once.

### Code review instructions
- `node tools/agent-eval.mjs --base http://127.0.0.1:8788/ --look chrome --cases v0 --tiers default --repeat 1`.

### Technical details
- Chrome flags: `--headless=new --remote-debugging-port=0 --user-data-dir=<tmp> --no-first-run --disable-gpu --window-size=1400,900`.

## Step 5: Measurements: 17/18 visual runs, unprompted looks on 7 of 56 runs, one instructive failure

The visual cases passed 17 of 18 runs. The agent looked without being asked on the drawing case and, rarely, on edits
where shape matters. The failure is the useful result. glm engraved with a negative depth, and the engine warned that
nothing was cut. `run()` returned that warning only as a count. The picture showed imprinted letters that read
correctly, and the model reported success.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1.
**Assistant interpretation:** Design §4: measure the visual cases and look use.
**Inferred user intent:** Know whether a visual loop helps.
**Commit (code):** the commit that adds this step (results, scripts, run records).

### What I did
- `node tools/agent-eval.mjs --base http://127.0.0.1:8788/ --look chrome --tiers default,complex --repeat 3 --cases v0 --out …/2026-11-01-visual` (after the JIG-005 baseline, to keep the loads apart).
- Read the failing record; rendered the model's edit and a correct one in headless Chrome (`scripts/03-render-emboss-variants.mjs`); compiled four emboss variants on the engine.
- `… --look chrome --tiers default,complex --repeat 1 --cases a01-,a03-,s01-,m07-,m08-,m09-,h01-,h04- --out …/2026-11-01-look-available`; counted steps calling `look(`.
- Design doc §5.

### Why
- The failure's image had to be seen to know whether the model's visual claim was invented or true.

### What worked
- Visual: default 8/9, complex 9/9; `look: 24 renders, 2009 ms`. v03 looked unprompted in 5 of 6 runs.
- Look available: glm 24/28, looked in 3 runs; deepseek 27/28, looked in 4 runs; all on shape-changing edits.

### What didn't work
- `FAIL default #2 v02-a01-engrave-front · metric: volume 15344.2654 in [15200, 15335]`. The model's code: `.emboss(j.region.text('JIG', { size: 10, align: 'center' }), mm(-0.6), { on: j.feat('body').sideFace('base.outline.bottom') … })`; run result `warnings: 1 … faces: 22 volume: 15344.265`; answer "volume unchanged … the cut is too small to dent the figure much … JIG reads left to right".
- Engine on the variants: `mm(-0.6) (no op) … warning feature.noEffect: engrave: the join adds no material`; `mm(-0.6), op: 'cut' … the cut removes no material`; `mm(0.6) (no op)` raises the text (bbox depth 40.6); `mm(0.6), op: 'cut'` → 15,269.27, 74 faces.
- Look-available failures: three `rate_limited` (glm), one `authentication_error` (deepseek), and glm m07-tooth-gap answering "backlash 0.4 mm" for a question that also fits the 0.2 mm gap.

### What I learned
- The render of the negative-depth imprint shows the letters in light lines; from the front, an imprint and a cut look alike. The model's description of the picture was true. Its conclusion was wrong because the picture cannot show depth.
- `compileResult` in scope.js returns `warnings` as `filter(...).length`: the agent sees how many warnings, never which.

### What was tricky to build
- Telling "the model hallucinated what it saw" from "the image misled it": only rendering its exact edit could decide.

### What warrants a second pair of eyes
- One failure is one failure; the warning-text change should be measured, not assumed to help.

### What should be done in the future
- `run()` returning warnings as `{ kind, message }`; the `look()` reference entry saying what a drawing cannot show.
- Reword m07-tooth-gap to name the interference gap.

### Code review instructions
- `cat various/runs/2026-11-01-visual/summary.md`; `node scripts/03-render-emboss-variants.mjs` with a server on 8788.

### Technical details
- Renders per run are cheap (24 in 2.0 s); deepseek's visual turns took 47–111 s because of its rounds, not the renders.
