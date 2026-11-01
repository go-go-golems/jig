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

## Step 4: Phase 2, errors that teach

Phase 2 makes the misuse classes of the failure report loud at the point of the mistake. A name a namespace does
not have is now an error at the read, naming the nearest names and where else the name lives. Values describe
themselves in results. The common runtime errors get a note that says what to do. The 11 functions the message lint
flagged now check their arguments, so the lint's known list is empty.

The two engine fixes from JIG-011 are in. `j.fit.hole('md', …)` inside `.params()` names the param and gives the
expression to write instead of failing as `mm(…) takes a number, got NaN`. `j.lib.magnet` now cuts into the surface,
like `j.lib.dowel`.

### Prompt context

**User prompt (verbatim):** see Step 1 (the "1. do B straightaway … Then mplement" message and "commit at appropriate
intervals and keep a detailed diary as you work").

**Assistant interpretation:** implement phase 2 of the guide's plan (§11), validate it, commit it.

**Inferred user intent:** the agent should learn the API from its errors instead of failing silently.

### What I did
- `src/engine/guard.js` (new): `guard(real, path, opts)` with a shadow target, `closest()` (optimal string alignment distance, half cost for case, prefix and containment bonus), `indexNames`, `guardTree` ("faces is j.sel.faces"). Probes (`then`, `toJSON`, `Symbol.*`, `inspect`, `$$typeof`, …) pass through as undefined; `in`, `Object.keys` and spreading see the real namespace.
- `src/engine/j.js`: `makeJ()` returns `guardTree(j, 'j', { hint })`; the hint says that units are bare (`j.mm` → `mm(…)`). Scripts get the guarded `j` too (decision 2).
- `src/agent/evaltool.js`: `guardScope(scope)` guards the step's namespaces after `trackScope`, on the page (`runEval`) and in the sandbox (`runStep`). `data` is left unguarded so `data.x ?? fallback` still works. The hint names top-level functions near the missing name (`program.facez` → `In scope on its own: faces(…)`). `withHints(text, …)` appends notes.
- `src/agent/hints.js` (new): `hintsFor({ error, text, code, names, j, methods, line })`:
  - not defined → `box is j.box`, nearest scope names, or "Steps do not share variables";
  - `x.m is not a function` → nearest methods of the language's values by kind (part, quantity, sketch, region, selector, assembly, print job, design; `methodTable` is built from sample values in the sandbox);
  - a read of undefined → the expression on the error line that was undefined, and for `.summary`/`.program`/`.metrics` the check()/run() explanation;
  - NaN in a result → where it comes from.
- `src/agent/sandbox/runner.js`: guarded scope; `check().program` guarded as `check().program`; hints with `j` and the method table.
- `src/agent/yaml.js`: a non-plain value with its own `toString` (or `Symbol.for('jig.describe')`) prints as that one line. `toString()` added to Part (`part box: add1 (add) · fillet1 (fillet)`, capped at 12 features), Assembly, PrintJob and Design.
- `src/agent/scope.js`: `textArg` and `optsArg`, used by `faces`, `feature`, `sketch`, `select`, `view.set`, `presets.create/rename/load`, `measure.face/edge/bbox`.
- `src/engine/fit.js`: `lazyFit` refuses a param name outside a feature with the expression to write; param names are quoted in the fit text (`j.fit.hole('md', press)`).
- `src/engine/lib.js`: the magnet pocket runs from z = −(h + 0.2) to +0.01. `test/engine/scripts/19-lib-hardware.js` places it on the floor's top face. `content/docs/reference.md` states the direction for both cutters.
- Tests: `test/agent/guard.test.mjs` (5 tests); `eval.test.mjs` expects the note on an undefined name; `lint.test.mjs` KNOWN is empty.

### Why
- factory-videos and our own history agree: models read errors, not docs. A missing name that becomes `undefined` surfaces two lines later as "undefined is not a function" or a NaN in a metric. At the read, the message can still name the call.

### What worked
- `make test-js`: 74 + 15 + 62 + 42 passing; `tools/preset-check.mjs`: 72/72; `tools/book-check.mjs`: 159 blocks, no problems. Guarding `j` broke no engine test or preset.
- Messages, from the sandbox:
  - `TypeError: j.fit.hol does not exist. Did you mean j.fit.hole? (j.fit has: calibrate, classes, coupon, gap, hole, pin, profile, profileRegister)`
  - `j.fit.faces does not exist. faces is j.sel.faces.`
  - `ReferenceError: box is not defined (line 1)` + `note: box is j.box.`
  - `TypeError: j.part(...).faces is not a function` + `note: … .faces() is a method of a selector; j.part(...) is something else.`
  - `r.summary.name` after a failed `check()` → `note: r.summary is undefined. check() and run() give summary, metrics and program only when the script compiles (ok: true); …`
  - fit in params: `j.fit.hole('md', press): 'md' names a param, which has no value while .params() is read. Inside a feature j.fit.hole('md', press) works; in .params() write the expression 'md + 2 * gap.press', or give a length such as mm(6).` The suggested expression compiles.

### What didn't work
- The first YAML probe used `part('box').box(…)`, which is not a Part method (`TypeError: part(...).box is not a function`): my probe was wrong, not the code.
- `console.debg(…)` is not caught by the guard: in the sandbox, `console` is set after `guardScope`. Dropped that assertion; `console` stays a plain object.
- The first fit test script redeclared `mm` and used `export default`, which the mock host's script format does not take (`Identifier 'mm' has already been declared`, then `Unexpected token 'export'`). Rewritten in the `return j.part(…)` form.
- `eval.test.mjs` "errors name the line" failed once: it expected the bare `ReferenceError` line, and now a note follows. Updated the expectation.

### What I learned
- A Proxy over a frozen namespace cannot return a wrapped value for a frozen property of its own target (proxy invariant), so the guard's target is an empty shadow and every trap forwards. For functions, the shadow's non-configurable `prototype` has to appear in `ownKeys`.
- `j.load` and `j.field` are Proxies of their own, where `k in real` is false. The guard accepts any defined answer from `Reflect.get` as a member.

### What was tricky to build
- Keeping probes working. `await j.fit` reads `then`, test tools read `asymmetricMatch` and `$$typeof`, Node's inspect reads `Symbol(nodejs.util.inspect.custom)`. All of them must stay undefined, not throw.

### What warrants a second pair of eyes
- `Transform` has a `then(u)` method (composition), so `await j.tx.move(…)` would call it as a thenable. This predates JIG-012 and is not caused by the guards.
- Guarding `data` was left out on purpose. A missing data file still reads as undefined.

### What should be done in the future
- Phase 3: `help()`. Then the guard message can end with `help('j.fit')`.

### Code review instructions
- Start with `src/engine/guard.js`, `src/agent/hints.js`, then `guardScope` and `withHints` in `src/agent/evaltool.js`.
- `node --test import/jigcad/test/agent/guard.test.mjs import/jigcad/test/agent/lint.test.mjs`; `make test-js`; `node import/jigcad/tools/preset-check.mjs --quiet`.

**Commit (code):** a1d6890

## Step 5: Phase 3, one documentation registry and help()

The scope table in the lab reference is now generated from a registry, `src/agent/docs.js`. `help(x)` answers from
the same registry for the scope, and from the language reference (`content/docs/reference.md`, parsed by bullet)
for `j`, the units and the methods of the language's values. A test fails when a scope name has no record or a
record names nothing. Guard messages end with `help('path')`, and that call answers. The prompt now says the step
runs in a sandbox with the language in scope.

Phase 2's measured batch ran in the background during this step, from the worktree frozen at a1d6890.

### Prompt context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** phase 3 of the plan (§8 and §11 of the guide).

**Inferred user intent:** the reference, help and errors should never disagree, and every pointer in an error
should lead somewhere real.

### What I did
- `src/agent/docs.js` (new): `SCOPE_DOCS` (one record per row: `names`, `sig`, `group`, `text`, `where`), `GROUPS`, `scopeDoc`, `scopeNames`, `scopeTable`, `renderReference`. New rows: the language (`j` and units; `data`, both sandbox) and `help`.
- `src/agent/reference.md`: the table became `<!-- agent-scope -->`; the intro mentions `help(x)` and the guards. `src/agent/reference.js` (new) renders it. `host.js` and `panel.jsx` import the rendered reference.
- `src/agent/langdocs.js` (new): `parseLangDocs(md)` reads the language reference's bullets into 198 j paths, 25 bare names, and methods by kind (section → kind: Sketches → sketch, Parts → part, …; part 37, quantity 32, sketch 29, selector 26, print job 20, …).
- `src/agent/help.js` (new): `makeHelp({ scope, j, langMd, kinds })`. It answers `help()` (an overview by group), a scope path or a function by identity, a scope namespace, a `j` path or namespace (each member with its line), a unit, a method name, a value of the language (its methods with their lines), and the nearest names for anything unknown. `languageKinds` and `methodsByKind` replace the sample table hints.js used to build.
- `src/engine/guard.js`: `HELP.on` (the sandbox sets it for its whole worker) or `opts.help` (the scope guards) adds `help('path') says what each does.`
- `evaltool.js`: `help` on the page (records only; the language reference comes from `host.referenceDocs()`); `runner.js`: `help` with `j` and the language reference imported as text.
- `prompt.js`: eval runs in a sandbox with its own engine; the language is in scope; `check()` compiles there; steps share nothing; `help(x)`; read the error before retrying.
- `tools/agent-eval/failures.mjs`: `SCOPE_NAMES` comes from the registry; the guarded-name class matches `check().program.x`.
- Tests: `test/agent/docs.test.mjs` (3): coverage both ways, the rendered table, help() answers. Browser check probes `help`, a guard and a hint → `various/04-browser-sandbox-check-phase3.txt`.

### Why
- The registry keeps the reference correct and makes each error's pointer real, even though models rarely call help (4 docs reads in 230 evals at factory-videos).

### What worked
- `make test-js`: 77 + 15 + 62 + 42 passing.
- Browser (separate headless Chrome, temporary profile): `help('j.fit.hole')` answers in the iframe sandbox; guard message with `help('j.fit')`; `note: box is j.box.`; isolation unchanged (fetch, WebSocket, importScripts, storage refused; origin `null`).

### What didn't work
- First wiring imported `content/docs/reference.md` into `evaltool.js`: `node --test` has no `.md` loader (`TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".md"`). The page now reads the text from `host.referenceDocs()`. Only the sandbox runner imports the `.md`; it is loaded through `node-worker.mjs` (loader registered) or bundled.
- `node build.mjs` directly: `Cannot find module '/opt/npm-tools/node_modules/esbuild/lib/main.js'`; `make web` sets `ESBUILD`.

### What I learned
- The language reference's one-bullet-per-name format was regular enough to parse: every unit in `bare` has a line (the test checks that).

### What was tricky to build
- Identity lookups: `help(files.read)` must recognise the tracked wrapper the step holds, not the original function. `help` is therefore built after `trackScope` and `guardScope`, over the final scope. `help(j.fit)` recognises the guard proxy, which is cached per namespace.

### What warrants a second pair of eyes
- I rebuilt `dist/` (`make web`) while the phase 2 batch was running against `jigcad serve --dist import/jigcad/dist`. The batch uses the server only for the model proxy and `look()` renders, and phase 3 changes neither. Recorded in case its look images differ.
- `help` is not in scripts (the guide said "in the sandbox and in scripts"). In a script it has no reader: the agent reads compile results, and the guard's pointer in a compile error inside the sandbox leads to the agent's own `help`.

### Code review instructions
- `src/agent/docs.js`, `src/agent/help.js`, `src/agent/langdocs.js`; `node --test import/jigcad/test/agent/docs.test.mjs`.

**Commit (code):** 6cdc273

## Step 6: Phase 4, one result shape

Every result that describes a compile now has one shape. `run().summary`, `check().summary` and
`program.summary()` are the same object. `program.metrics()` gives plain numbers, and `{ detail: true }` gives
`{ value, unit, fidelity }`. `program.bodies()` names its counts `faceCount` and `edgeCount`. A script can call
`log(…)` (or `console.log`), and the lines come back as `logs` in `run()` and `check()`, so a script can report a
value it computed. This answers JIG-011's finding that the agent encoded answers in a bounding box or an error
message. No backward compatibility is kept (decision 3).

### Prompt context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** phase 4 of the plan (§9 of the guide).

**Inferred user intent:** the agent should not have to learn three shapes for one thing.

### What I did
- `src/agent/scope.js`: `summaryOf(p)` and `logsOf(p)`. `run()`, the page's `check()`, and `program.summary()` use them. `program.metrics(names?, { detail })` or `metrics({ names, detail })`; an unknown name throws with the list of metrics. `program.bodies()` returns `faceCount` and `edgeCount`.
- `src/agent/sandbox/runner.js`: `check()` builds its summary with `summaryOf`, and returns `logs` from a script that failed too (from the error's program).
- `src/engine/worker.js`: `runScript` gets `log` and `console` (log, info, debug, warn: …, error: …) through `extra`. Lines are formatted with the value's own `toString` (quantities as `2.4 mm`), otherwise JSON with numbers to 5 decimals; at most 100 lines of 400 characters. `program.logs` is on every compile result, including error programs.
- `src/agent/hints.js`: `m.volume.value` that reads undefined, or a NaN or undefined in a result from code that reads `metrics(…).x.value`, gets a note saying the metrics are plain numbers now.
- Registry rows (run, check, program.summary, program.metrics, program.bodies), the reference's paragraph on metrics and `log`, and the prompt's fidelity line are updated.
- Tests: `scope.test.mjs` (plain and detail metrics, unknown metric, `faceCount`); `turn.test.mjs` STEP2 reads `.mass`; `sandbox.test.mjs` gains the shape contract (summary equality, plain metrics, `logs` from a passing and a failing script, the `.value` note).

### Why
- In the history, `program.metrics().volume` appears in 355 steps, written with and without `.value`, and `program.bodies()` returned counts under names that suggest lists (`faces: 11`). One shape removes a class of read-of-undefined and NaN results.

### What worked
- `make test-js`: 78 + 15 + 62 + 42 passing; presets 72/72.
- `check()` of a script with `log("wall", mm(2).add(mm(0.4)), { n: 3 })` returns `logs: ['wall 2.4 mm {"n":3}']`. A script that logs and then throws returns `ok: false` with its `logs`.

### What didn't work
- Nothing failed in this step. Note that a script that declares its own `log` or `console` would now fail with "Identifier has already been declared". None of the 72 presets, the book, the guides or the engine scripts do.

### What warrants a second pair of eyes
- On the page, a script that throws loses its logs: the host's compile rejects, and `compileResult` gets no program. Only the sandbox's `check()` keeps them. The agent's `check()` runs in the sandbox, so the agent's path has them.

### Code review instructions
- `summaryOf`/`logsOf`/`metrics` in `src/agent/scope.js`, `scriptLog` in `src/engine/worker.js`; `node --test import/jigcad/test/agent/sandbox.test.mjs import/jigcad/test/agent/scope.test.mjs`.

**Commit (code):** 8ee332b (phase 4); c9df0c0 (two new cases)

## Step 7: Phase 2 measured; a phase 1 bug in the sandbox's j; promise hints

The phase 2 batch (frozen worktree at a1d6890, `--tiers default,complex --repeat 1 --look chrome`) passed 63/66
(`various/runs/2026-11-01-phase2/`, report `various/05-failures-phase2.md`). One of the three failures is an
`authentication_error` from the model proxy, not the agent. The failure report showed what the guards had not
reached. Most of the new `.map is not a function` steps were unawaited `faces()` promises kept in a variable. My
phase 2 hint made them worse with "Nearest methods: .max() (quantity)". One step showed `j.frame.on is not a
function`, which turned out to be a bug from phase 1.

### What I did
- Read every not-a-function step of the batch (script in this step's commands; the steps are in `results.jsonl`).
- `src/agent/sandbox/runner.js`: `j`, the bare units and `data` are added after `trackScope`/`guardScope`. Before, `trackScope` saw `j` as a plain object and replaced it with a shallow copy whose functions were wrappers. That lost the members of `j`'s functions (`j.frame.on`, `j.q.sin`) and the top-level guard (`j.bx`). Present since phase 1.
- `runner.js`: `check()`'s live program is tracked like the scope (`(await check()).program.faces(…)` gets the unawaited-promise note with a runnable fix). It is guarded with `help: true`.
- `src/agent/hints.js`: "not a function" knows array, string and promise methods. A call that answers later (`faces(...)`, `p.faces(...)`, `program.ir(...)`) gets "returns a Promise: write (await …).map(…)". `.then` on a sync value gets "its value is there already". Array and string methods on a non-array/non-text say so, with what to return to look. No note when the step already has the unawaited-promise note. Language-method suggestions only for other names.
- `tools/agent-eval/failures.mjs`: with the promise note, `x.m is not a function` and reads of undefined count as the promise, unless `x` is a scope namespace (`program.metric` stays a wrong name). Test added.
- Recomputed both reports with the corrected classifier: `various/03-failures-baseline.md`, `various/05-failures-phase2.md`.

### What worked
| | baseline (b560730) | phase 2 (a1d6890) |
|---|---:|---:|
| passed | 64/66 | 63/66 (1 auth error) |
| failed steps | 64 of 361 (18 %) | 60 of 386 (16 %) |
| runs with a misuse error | 16 (24 %) | 12 (18 %) |
| misuse steps | 30 | 20 |
| `j`/`mm`/`deg` not defined | 21 steps | 0 |
| never recovered | 5 | 1 |
| stuck loops | 2 | 1 |
- One repeat of 33 cases per tier: pass-rate differences are within noise. The misuse counts and the recovery numbers move the same way.
- `make test-js`: 80 + 15 + 62 + 42 passing.

### What didn't work
- My first classifier change counted `TypeError: program.metric is not a function` + an unrelated promise note as a promise; the existing classifier test caught it (`expected: 'not a function: .metric'`, `actual: 'promise not awaited'`).
- `j.q.sin(deg(30))` is `0.49999999999999994`; the new test rounds.

### What I learned
- The phase 1 tests checked `j.fit.hole` (a member of a plain sub-object), which survived the copy. Nothing exercised a member of one of `j`'s functions.
- Phase 4 removes one failure from this batch by design: `b.faces.map` on `program.bodies()` (`faces` was a count).

### What warrants a second pair of eyes
- The `look()` renders of the phase 2 batch came from a `dist/` I rebuilt mid-batch (Step 5).

### Code review instructions
- `node --test import/jigcad/test/agent/sandbox.test.mjs import/jigcad/test/agent/failures.test.mjs`; `node import/jigcad/tools/agent-eval/failures.mjs <results.jsonl>`.

**Commit (code):** d789833

## Step 8: The batch after phases 3–5

The last JIG-012 batch ran from the worktree frozen at d789833 (phases 3–5, the fixes of Step 7, 35 cases):
68/70 passed (`various/runs/2026-11-02-phase4/`, report `various/06-failures-phase4.md`). Both failures are the
new `a01-magnet-pocket` case.

### What worked
| | baseline | phase 2 | phases 3–5 |
|---|---:|---:|---:|
| passed | 64/66 | 63/66 (1 auth error) | 68/70 |
| failed steps | 18 % | 16 % | 15 % (69 of 450) |
| runs with a misuse error | 24 % | 18 % | 16 % (11 of 70) |
| stuck loops | 2 | 1 | 1 |
| never recovered | 5 | 1 | 0 |
| `help` calls | — | — | 10 |
- The model called `help` 10 times, including `help(j.lib.magnet)` and `help('part.add')`.

### What didn't work
- `promise not awaited` grew to 49 steps in 38 runs. Part of the growth is measurement: since Step 7, calls on `check()`'s live program are tracked (10 of the 49). `check` is still the most forgotten (16), then `faces` 9, `run` 7, `sketch` 7. This is the motivation for JIG-013.
- `a01-magnet-pocket`, default tier: `add magnetPocket failed: Cannot read properties of undefined (reading 'type')` after a sequence of edits. It does not reproduce in the sandbox or on a harness Host replaying the same edits (JIG-013 diary, Step 1).
- `a01-magnet-pocket`, complex tier: the agent's last variant placed the pocket with `j.frame.on(j.sel.faces('+Z and %plane').sortBy(f => f.center[2]).first())`. The engine warned "magnet: the cut removes no material", and the agent answered anyway. With `j.frame.on(j.sel.names('faces', ['shell/inner[body/start]']))` (its earlier variant) the pocket cuts 51.3 mm³. I checked that `j.frame.on(face)` points out of the face and that the magnet cuts into it, from the inner floor and from the outer bottom alike, so the reference's sentence from Step 4 is correct.
- Selector values passed to `faces()` were refused 3 times ("got an object"), and `faces('')`/`faces('*')` 3 times. JIG-013 accepts both.
