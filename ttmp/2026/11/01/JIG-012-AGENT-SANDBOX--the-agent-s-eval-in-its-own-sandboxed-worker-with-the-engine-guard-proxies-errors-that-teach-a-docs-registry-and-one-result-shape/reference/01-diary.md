---
Title: Diary
Ticket: JIG-012-AGENT-SANDBOX
Status: active
Topics:
    - agent
    - api
    - sandbox
    - docs
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-01T17:23:01.136429142-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Step 1: Research, design and the intern guide

The person asked for improvements to the jig API as the agent meets it, with feedback through proxies and ad-hoc
help, and pointed at three earlier workbenches. I read Form Skate's and Kiln's evaluators in isolated folders and
factory-videos' agent tickets on bling, counted API-misuse errors across every recorded run, and wrote an intern
guide that explains the current system and the JIG-012 design. The person chose option B (a sandboxed worker with its
own engine) straight away, guards in scripts too, result-shape changes without compatibility, and measurement first.

### Prompt Context
**User prompt (verbatim):** "1. do B straightaway.
2. yes
3. yes, no backwards compatibility needed in any sense
4. yes

Create a new docmgr ticket if you haven't already, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Then mplement"
Later: "commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
**Assistant interpretation:** New ticket JIG-012 for the implementation (JIG-011 stays the analysis); a long intern guide; reMarkable upload; then phases 0–5 with commits and this diary.
**Inferred user intent:** An agent API that teaches through errors and gives the model the language directly, built and measured.

### What I did
- Read Form Skate (`app/host.js` labScope, `app/ui/agent.jsx`, `src/core.js`), Kiln (`apps/workbench/src/agent/{sandbox,frame,encode,inspect,gateway,agent}.js`, `agent-guidelines.txt`, `reference.txt`, `build.mjs`) from zips extracted into the scratchpad; nothing was run.
- On bling, read factory-videos FACTORY-AGENTERR-001 (§5–6), AGENTERR-002 (§4.5, diary steps 9–10), JSDRILL-001, REPORTFIX-002 Phase 5 and `docs/agent-evaluation-playbook.md`.
- Counted misuse errors in all 11 `results.jsonl` files: 517 runs, 2,697 steps; `j is not defined` 73, `mm is not defined` 39, unawaited promises 83, `undefined.volume` 15, `b.faces.map` 9; 182 runs (35 %) affected.
- Read the code the design touches: `evaltool.js`, `scope.js`, `worker.js`, `host.js` engine calls, `engine.js`, `oc.js` and `rs/wasm.js` (both accept wasm bytes), `build.mjs`, `node-engine.mjs`, server headers (no CSP).
- Created JIG-012, wrote the guide (`design-doc/01-…`, 585 lines), uploaded it: `OK: uploaded JIG-012 Agent sandbox intern guide.pdf -> /ai/2026/11/01/JIG-012`.
- Started the baseline batch from a frozen worktree at b560730 (`$S/wt012-base`): 33 cases × 2 tiers, `--look chrome` → `various/runs/2026-11-01-baseline`.

### Why
- factory-videos measured that models learn from error messages and rarely read docs; the design orders the work accordingly (errors before docs) and keeps guards on namespaces only.
- Kiln's construction (sandboxed srcdoc frame, CSP, blob worker, one port, allowlisted calls) gives isolation and the language in the worker; jigcad adds a long-lived worker because OpenCascade's start-up is too slow to pay per eval.

### What worked
- The engine already has everything the sandbox needs: `loadOC({ wasmBinary })`, `loadCompute({ computeBinary })`, `runScript`, `compileFiles`, and a `run` op that runs code with `j` in scope.

### What didn't work
- `~/Downloads/kiln-workbench.html` does not exist; the file is inside `kiln-aispe-full.zip` (`kiln/apps/workbench/dist/kiln-workbench.html`); I read the sources instead of the 3.5 MB build.

### What I learned
- The worker keeps one engine per module instance (`J`, `current`), so a second engine needs a second worker (in Node: `worker_threads`).
- A `srcdoc` iframe inherits its parent's CSP; `jigcad serve` sends none, claude.ai does: to be checked there.

### What was tricky to build
- Deciding what runs locally vs on the page: bridged calls keep today's semantics (the person's workbench, its last compile); local calls (`j`, `check()`) never touch it. That keeps `program.*` meaning "the last compile" and gives live objects through `check()`.

### What warrants a second pair of eyes
- Memory of two OpenCascade instances; guards inside `makeJ()` against engine code that probes `j` for optional members.

### What should be done in the future
- Check the sandbox inside claude.ai before release.

### Code review instructions
- Read the guide; the plan is §11.

## Step 2: Phase 0, the failure report and the message lint

Before changing the API I wrote the two measuring tools the guide asks for. The failure report reads any number of
`results.jsonl` files and classifies every step; the lint calls every scope function with junk and reads the
message. Both are model-free.

### What I did
- `tools/agent-eval/failures.mjs`: classes (not defined, read of undefined, not a function, guarded name, NaN, promise not awaited, timeout, syntax, other), runs affected, steps to recover, stuck loops (≥ 3 failures in a row), scope coverage. `test/agent/failures.test.mjs` tests the classifier.
- `test/agent/lint.test.mjs`: 9 junk argument lists against every scope function on the mock host; a message must name the call and must not contain NaN, "Cannot read properties", "is not a function", "[object Object]". KNOWN lists the offenders; the test fails on a new one and on a fixed one still listed.
- Ran the report on the 11 historical files → `various/01-failures-history-517-runs.md`.

### What worked
- History: 517 runs, 2,697 steps, 444 failed (16 %), 136 runs (26 %) with a misuse error, 15 stuck loops; recovery after a failed step: next step 325, second 70, third 14, never 30. `j`/`mm` not defined: 72 + 39 steps.
- The lint found 11 offenders: `[object Object]` echoed back by faces, feature, sketch, select, presets.rename/load, measure.face/edge/bbox; `view.set(null)` and `presets.create(null)` throw "Cannot destructure property …".

### What didn't work
- The first classifier counted a step with an unrelated error plus an unawaited-promise note as a promise problem (`program.metric is not a function` + note), and missed pre-JIG-004 runs where the promise showed as `faces(...).map is not a function`. Fixed: the note decides only when the error is `x(...).m is not a function` or a read of undefined; `x(...).m` on an async scope function counts as a promise without the note.
- zsh did not split `$F` into words for `node failures.mjs $F`; used `find -print0 | xargs -0`.

### What I learned
- My earlier "35 %" counted unawaited promises as misuse; the report keeps them separate (26 %).

**Commit (code):** 38186f3

## Step 3: Phase 1, the sandbox

The agent's steps now run in a worker with its own engine. In the browser it is Kiln's construction (a sandboxed
srcdoc frame with a CSP that refuses connections, a blob: worker, one port); in Node it is a worker_threads Worker.
The decisive design change came from the first smoke test: bridging every scope call made synchronous calls
asynchronous, which would break `files.read(...).split()` (992 calls in history) and `program.metrics().volume`
(355). The sandbox therefore runs the same `labScope` code over a mirror of the page state, and only effects and
engine queries cross the port.

### What I did
- `src/engine/worker.js`: the message loop moved to `src/engine/worker-main.js` (the dist/worker.js entry), so other bundles can import the engine; `lang()` and `currentProgram()` accessors.
- `src/agent/scope.js`: `makeProgram`, `makeMeasure`, `compileResult` exported; `makeQueries(host)` factored out of `labScope`.
- `src/agent/sandbox/`: `ports.js` (browser and Node MessagePorts alike), `serve.js` (ctxOf: files, edited flags, overrides, program, lastGood, selection, view, preset, presets; the bridge of effect paths plus `__call` for engine queries), `client.js` (one channel per eval, timeout and Stop end the worker), `runner.js` (mirror host, labScope over it, stubs for effects, file changes applied locally then sent in order, local `j`/units/`data`/`check()` with a live program, globals removed after a step), `worker-main.js`, `frame.js`, `node.js`, `node-worker.mjs`.
- `build.mjs`: `dist/agent-worker.js` (iife, 1,601 KiB).
- `evaltool.js`: `compileStep` exported; `createEvalTool(host, { sandbox })` runs in the sandbox and falls back to the page with a note when the sandbox cannot run a step. `turn.js`, `panel.jsx` (frame sandbox per page session, warmed when a model is found; `window.jigSandbox` for checks), harness (`--no-sandbox`; Node sandbox by default).
- `reference.md`: the sandbox paragraph; `check(variant?)` with a live `program`.
- Tests: `test/agent/sandbox.test.mjs` (6). Browser check script `scripts/01-browser-sandbox-check.mjs` (separate headless Chrome, temporary profile) → `various/02-browser-sandbox-check.txt`.

### Why
- The mirror keeps every call's synchronous/asynchronous shape as on the page, so prompts, reference and habits stay valid; the page's own `labScope` executes every effect, which is where read-only is enforced, so code in the sandbox cannot get around it.

### What worked
- Oracle cases through the Node sandbox: 31/31, no fallback, no step errors.
- Browser: engine ready in ~150 ms (first start with fetching ~0.3–0.4 s); `j` in scope; `check()` live program; sync `files.read`; `fetch` refused ("Failed to fetch"), WebSocket refused by CSP (`connect-src`), `importScripts` refused (NetworkError), no `localStorage`, no `document`, `indexedDB` SecurityError, origin `null`; a runaway loop restarts the sandbox and the next step works (~0.4 s with a new engine).
- `make test-js`: 69 + 15 + 62 + 42 passing.

### What didn't work
- Node: `start()` never resolved because I had `unref()`'d the worker and port; the process exited with "unsettled top-level await". Removed the unrefs; the harness closes the sandbox.
- Browser: "Failed to construct 'URL': Invalid URL": the OpenCascade glue resolves `new URL("replicad_single.wasm", import.meta.url)` even with `wasmBinary`, and `import.meta.url` is empty in an iife. Fixed with `define: { 'import.meta.url': '"https://sandbox.invalid/agent-worker.js"' }` for that bundle.
- Timeout path: `restart()` before `end(resolve)` let the worker's exit callback reject the eval first ("the sandbox worker ended"). Resolve, then restart.
- The panel module loads only when the Agent tab opens; the check script clicks it with real pointer events.
- `location.origin + '/api/…'` in the fetch probe failed on URL parsing (`null` origin), not on CSP; probed the absolute URL. WebSocket construction does not throw under CSP; a `securitypolicyviolation` listener shows the refusal.
- My local `check()` first applied the page's overrides by default; the page's `check()` compiles at the script's own values. Restored.

### What I learned
- ProgramData reaches 6.3 MB (M-10, bodies with typed arrays); structured clone per step is acceptable, so no cache yet.

### What was tricky to build
- File changes: applied to the mirror synchronously (so the next line sees them and `check()` compiles them), then sent to the page in a queue that every bridged call and the end of the step wait for; a refusal from the page becomes a note.

### What warrants a second pair of eyes
- Code in the sandbox can patch `MessagePort.prototype` for later steps (only own globals are removed). The page still validates every call, so this affects only the sandbox's own steps.

### Code review instructions
- `node --test test/agent/sandbox.test.mjs`; `node tools/agent-eval.mjs --oracle`; `node ttmp/…/JIG-012…/scripts/01-browser-sandbox-check.mjs` with `jigcad serve` on :8787.
