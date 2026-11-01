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
