---
Title: Implementation diary
Ticket: JIG-003-AGENT-EVAL
Status: active
Topics:
    - agent
    - llm
    - testing
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/test/agent-eval/harness.test.mjs
      Note: self-test and oracle test
    - Path: repo://import/jigcad/tools/agent-eval.mjs
      Note: CLI
    - Path: repo://import/jigcad/tools/agent-eval/checks.mjs
      Note: check vocabulary
    - Path: repo://import/jigcad/tools/agent-eval/runner.mjs
      Note: runCase and runAll
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T21:58:16.599028199-04:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1: Retrospective report, JIG-002 closed, JIG-003 ticket and intern guide

The request had four parts in order: a vault report about all the work so far, closing JIG-002, a new ticket with
an intern-level guide uploaded to the reMarkable, and the implementation with commits and this diary. The
retrospective went to the vault first; JIG-002 was already at status `complete`, so closing it was a no-op and a
closing changelog entry was added instead. The guide designs an evaluation harness for the agent around the real
production code, which required reading the Host, the engine client, the lab scope and the agent turn closely.

### Prompt Context

**User prompt (verbatim):** "write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). About all the work done so far. Then close JIG-002, and then create JIG-003, Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable. And then implement + commit + keep a diary (using the diary skill format0"

**Assistant interpretation:** Write a retrospective vault report of JIG-001/JIG-002 and push it; close JIG-002; create JIG-003 for the agent evaluation harness proposed in the previous answer; write and upload its guide; implement it in phases with commits and an investigation-format diary.

**Inferred user intent:** Turn the agent from "works in a few demos" into something measured, with documentation good enough for a newcomer.

**Commit (code):** d8fac9a — "JIG-003: ticket and intern guide for the agent evaluation harness" (go-go-parc 1206835 for the retrospective; bce47e1 for the JIG-002 closing entry)

### What I did
- Read both diaries' failure sections and the commit history; wrote `PROJECT REPORT - jigcad - Retrospective of a Rust Compute Core, a Go Agent Backend, and What Measurement Changed.md` (timeline, phase results, a table of seven expectations overturned by measurement, failures and recoveries, state, next steps); pushed.
- `docmgr ticket close --ticket JIG-002-AGENT-LLM-BACKEND` → `Ticket status: complete; operation:  (unchanged)`; added a closing changelog entry.
- `docmgr ticket create --ticket JIG-003-AGENT-EVAL …`; design doc and diary; eight tasks; `docmgr vocab add --category topics --slug testing`.
- Read `src/host/host.js` (constructor, `compile`, `check`, `referenceDocs`, `applyTheme`), `src/host/engine.js` (the client contract), `src/agent/scope.js` (Host members used), `src/agent/turn.js`, `evaltool.js`, `prompt.js`, `test/agent/mock-host.js`, `scripted.js`.
- Computed ground truth with the engine (scratch scripts `report/truth.mjs`, `truth2.mjs`): A-01 wall 2.4 → mass 22.505 g; 2.2 → 20.779; 2.8 → 25.877; h 35 → volume 17,229.93 mm³; 80 × 50 → bbox [80, 50, 30]; wall 3 → `feature.failed`; planted `'height'` → `param.unknown`; 25 mm fillet → `fillet.tooLarge`; A-03 DOF 1 → 0 with `.dim({ h: ['h1.center', 'h2.center'] }, 48)`; S-01 orients −Y.
- Wrote the guide and uploaded it: `remarquee upload bundle … --name "JIG-003 Agent Evaluation Harness Guide" --remote-dir /ai/2026/10/31/JIG-003` → `OK: uploaded JIG-003 Agent Evaluation Harness Guide.pdf -> /ai/2026/10/31/JIG-003`.

### Why
- The real Host, not the mock: the lab scope uses about forty Host members, so a mock would evaluate the mock (D1).

### What worked
- The guide's design held during implementation without structural changes (one addition: oracles, Step 5).

### What didn't work
- `docmgr doctor` warned `unknown_topics — unknown topics value(s): testing`; fixed with `docmgr vocab add`.

### What I learned
- The agent's reference is **about 52 KB**, not 13.6 KB: `host.reference()` joins `content/docs/reference.md` (38,907 bytes) and `src/agent/reference.md` (13,581 bytes). Three vault reports quote 13.6 KB; task `fveo` corrects them.
- A 3 mm wall breaks A-01: the shell cannot offset the 3 mm corner arcs by 3 mm — a good diagnostic case.

### What was tricky to build
- Choosing checks that judge facts with a fixed form (numbers, identifiers) so that answer regexes do not reject correct phrasing.

### What warrants a second pair of eyes
- Exposing token usage to the page (D4): justified for a single-operator server; slop deliberately does not.

### What should be done in the future
- N/A.

### Code review instructions
- Read the guide §3 (orientation) and §6 (decisions).

### Technical details
- Remote: `/ai/2026/10/31/JIG-003/JIG-003 Agent Evaluation Harness Guide.pdf`.

## Step 2: The real Host in Node, and token usage on the wire (phases 1–2)

The harness needs the production Host to run in Node on the production engine. Two Host changes made that
possible: an injected engine client, and a guard around the one `document` access. Loader hooks serve the Host's
`.json` and `.md` imports as modules, and `createNodeEngine()` implements the engine client over
`worker.handle()`. Separately, the server now ends `result` and `error` events with the call's token usage, which
the adapter passes through.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement guide phases 1 and 2.
**Inferred user intent:** A runner that exercises production code end to end.
**Commit (code):** 8a18355 — "JIG-003 phases 1-2: Host runs in Node with an injected engine; usage in result/error events"

### What I did
- `src/host/host.js`: `constructor({ forceMock, forceJsCompute, engine })` uses `engine || createEngine(…)`; `applyTheme` checks `typeof document`.
- `tools/agent-eval/loader.mjs`: re-exports `resolve` from `test/engine/loader.mjs`; `load` returns `export default …` for `.json` and `.md`.
- `tools/agent-eval/node-engine.mjs`: `createNodeEngine({ compute })` → `{ ready, request, compute, initMs, terminate }`.
- Smoke (scratch `report/smoke.mjs`): `engine rust …`; `A-01 true 15344.265 [ 'notes.md', 'script.js' ] ref KB 50.5`; `check true 22.505 current still 19.027`.
- `pkg/server/server.go`: `usageOut { input, cacheRead, cacheWrite, output, rounds, toolCalls, model }`; `resultOut`/`errorOut` embed `*sample.Result`/`*sample.Failure` plus `usage`; `rounds` counts usage events.
- `src/host/sample-http.js`: `res.usage`, `err.usage`. Tests: `server_test.go` (usage on result; error events carry usage) and `sample-http.test.mjs`.

### Why
- Injection instead of a Node-specific Host subclass keeps one Host and changes two lines.

### What worked
- `go test ./pkg/...` → ok; `node --test test/agent/*.test.mjs` → `tests 34, pass 34, fail 0`.

### What didn't work
- No failures in this step.

### What I learned
- The Host's whole engine contract is four members (`ready`, `request`, `compute`, `initMs`), so the in-process engine is 25 lines.

### What was tricky to build
- Go JSON embedding: `resultOut` embeds `*sample.Result` so its fields stay at the top level of the event and `usage` is added beside them; the page sees the old shape plus one field.

### What warrants a second pair of eyes
- `errorOut` embeds `*sample.Failure`, which has an `Error()` method; JSON encoding ignores it, but the type now satisfies `error`.

### What should be done in the future
- N/A.

### Code review instructions
- `git show 8a18355 -- import/jigcad/src/host/host.js pkg/server/server.go`.

### Technical details
- Event example: `event: result` / `data: {"text":"…","truncated":false,"modelTierApplied":"default","modelUsed":"lunaroute/glm-5.3-flash","usage":{"input":107839,"cacheRead":89088,"cacheWrite":0,"output":328,"rounds":6,"toolCalls":5,"model":"lunaroute/glm-5.3-flash"}}`.

## Step 3: Checks, runner, report and a scripted self-test (phase 3)

The check vocabulary, the runner and the report were written as three small modules, then tested on synthetic data
and with a scripted model on the real engine. The scripted model calls the real eval tool, so edits, recompiles,
read-only refusals, Ask-mode approval and deadlines go through production code.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Guide phase 3 (and the report module of phase 5, which is small).
**Inferred user intent:** A harness whose own behaviour is tested before it judges a model.
**Commit (code):** af05a87 — "JIG-003 phase 3: check vocabulary, runner and report, with a scripted self-test on the real engine"

### What I did
- `checks.mjs`: `compiles fails file unchanged metric param sketchDof answer steps stepCode noNote`; `compareValue` for approx/equals/min/max (arrays element-wise); unknown kinds fail with a named detail.
- `runner.mjs`: `loadCases`, `captureUsage`, `noteCode`, `runCase` (loadPreset, resetOverrides, setup, compile, runTurn with deadline and Ask approval, recompile, evaluate), `runAll`.
- `report.mjs`: `wilson`, `summarise`, `markdown`.
- `test/agent-eval/harness.test.mjs`.

### Why
- Ask-mode approval uses `setTimeout(…, 0)` from `onUpdate`: `createEvalTool` calls `onUpdate()` after setting `step.asking` but before the approval promise assigns `step.resolve`.

### What worked
- After one fix (below): `tests 8, pass 8, fail 0`.

### What didn't work
- `AssertionError … The input did not match the regular expression /mass 22\.505/. Input: actual: 'mass 22.5046 ≈ 19.027 ± 0.01'`: the detail prints four decimals; the test regex was too strict. Changed to `/mass 22\.50/`.

### What I learned
- `host.loadPreset` in Node reads no `localStorage`, so every case starts from the published preset — tested by running a no-edit case right after an edit case.

### What was tricky to build
- The deadline: the runner aborts the turn's signal; the adapter turns that into `cancelled`, `runTurn` records the note `Stopped.`, and the runner reports `outcome: 'deadline'` because it knows it aborted.

### What warrants a second pair of eyes
- The judged state is the final files **with** any overrides the agent set through `params.set`; a case that requires a script edit must check the file as well.

### What should be done in the future
- N/A.

### Code review instructions
- `node --test import/jigcad/test/agent-eval/harness.test.mjs`.

### Technical details
- Wilson checks: `wilson(30, 39)` ≈ 0.616–0.873; `wilson(0, 5)` → 0–0.434; `wilson(5, 5)` → 0.566–1.

## Step 4: Fourteen cases with oracle turns, and the CLI (phases 4–5)

The cases cover A-01 (edits, questions, read-only, Ask mode, what-ifs, a planted bug, an impossible fillet), A-03
(a DOF question and a constraining edit) and S-01 (an orientation question). To prove each case can be passed at
all, every case carries an **oracle**: the eval steps and answer of a correct turn. A test runs every oracle
through the scripted model and requires a pass. The first run of that test caught an impossible check.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Guide phases 4 and 5.
**Inferred user intent:** Cases whose expectations are correct before any model is judged by them.
**Commit (code):** c483a32 — "JIG-003 phases 4-5: 14 cases with oracle turns; agent-eval CLI"

### What I did
- `test/agent-eval/cases/01…14-*.json`, each with `oracle: { steps, answer }`.
- Tests "cases are well formed" and "every case passes with its oracle turn".
- `tools/agent-eval.mjs`: flags `--base --tiers --repeat --cases --out --deadline --compute --oracle`; prerequisites check; probes the backend with `httpSample`; writes `meta.json`, `results.jsonl` (one line per run, appended as it goes), `summary.md`, `summary.json`.
- `runAll` gained `sampleFor(case)` so `--oracle` gives each case its own scripted turn.
- `.gitignore`: `test/agent-eval/out`.

### Why
- Oracles separate "the case is wrong" from "the model is wrong" before any model run.

### What worked
- `node tools/agent-eval.mjs --oracle` → 14 PASS; harness tests `tests 10, pass 10`.
- Live smoke (`--tiers default --cases a01-wall-edit,a03-dof`): `PASS … a01-wall-edit · ok · 5 tools · 5.6 s · in 107839 (cached 89088) out 328`; `PASS … a03-dof-question · ok · 2 tools · 5.0 s · in 39392 (cached 17664) out 461`.

### What didn't work
- The oracle test failed: `a01-fix-bug: file: matches /'height'/`. A-01's script legitimately contains `'height'` as the label of `h`, so "no `'height'` in the file" could never pass. The check now targets the extrude argument: `notMatches: "'height',\\s*\\{\\s*id:\\s*'body'"`.
- My first `--oracle` implementation found the current case through the log callback; replaced by `sampleFor(case)`.

### What I learned
- A case without an oracle is an untested test: the impossible check would otherwise have counted as a model failure in every run.

### What was tricky to build
- Answer patterns: numbers are matched loosely (`22[.,]5`, `15[ ,.]?344`) because models write 22.5 g, 22.505 g or 22,505 g.

### What warrants a second pair of eyes
- `a01-wall3-fails` and `a01-fillet-too-large` accept several phrasings of failure; they may still reject unusual but correct answers.

### What should be done in the future
- More presets (gears, print jobs with plates, assemblies) once the baseline shows which skills are weak.

### Code review instructions
- `node tools/agent-eval.mjs --oracle` and `node --test test/agent-eval/harness.test.mjs` in `import/jigcad`.

### Technical details
- Case file names are numbered for a stable order; ids are the stable keys in results.

## Step 5: The first baseline run crashed: unawaited promises in model code

The first full baseline (14 cases × 2 tiers × 3 repeats) stopped after three passing cases. A model step called
`faces('shell/inner*')` without `await`; the call rejected later with nobody listening, and Node's default for an
unhandled rejection is to end the process. The browser workbench only logs such a rejection to the console (the
JIG-002 live turns showed exactly these console errors), so the runner now does the equivalent: it counts the
rejection and records it on the running case.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Make the runner survive model code that a browser survives.
**Inferred user intent:** A baseline that completes.
**Commit (code):** 7bb981b — "JIG-003: count unhandled rejections from eval code instead of ending the run"

### What I did
- `runner.mjs`: `trackUnhandled()` installs `process.on('unhandledRejection', onUnhandled)` once; `runCase` records `unhandledRejections` and `lastUnhandled`, after yielding one macrotask so the last step's rejections surface.
- Test: `onUnhandled` counts and keeps the message.
- Rebuilt `jigcad serve` (usage in events) before the run; documented the harness in `import/jigcad/BUILD.md §9`.
- Corrected the Reference size (52 KB, not 13.6 KB) in two vault reports (go-go-parc 4bb6a27).

### Why
- Matching the browser's behaviour keeps the harness measuring the agent, not Node's defaults.

### What worked
- `node --test test/agent-eval/harness.test.mjs` → `tests 11, pass 11, fail 0`.

### What didn't work
- First run: `Error: faces: selector: unknown token 'shell/inner*' in 'shell/inner*'` at `scope.js:234`, then the process exited (`Node.js v24.18.0`).
- My first test of the fix ran an unawaited `faces(…)` inside `node:test`; node:test attributes any unhandled rejection to the running test and fails it (`✖ a step that leaves a rejected promise unawaited is recorded, not fatal`). Emitting the event by hand failed the same way. The test now calls the exported handler directly; the CLI run covers the real path.
- The background rerun failed at once: `Error: Cannot find module '/home/manuel/code/wesen/go-go-golems/jig/tools/agent-eval.mjs'` — the background shell did not start in `import/jigcad`. Rerun with absolute paths.

### What I learned
- Models omit `await` often enough to matter; the count per case is itself a useful quality signal for the instructions.

### What was tricky to build
- Attribution: a rejection can surface after its case ended; the one-macrotask wait catches the common case, and a later one is counted on the next case.

### What warrants a second pair of eyes
- A global handler in a library module: it is installed only when `runCase` runs, i.e. in the harness process.

### What should be done in the future
- Consider wrapping lab-scope promises so an unawaited rejection becomes part of the step's result text for the model.

### Code review instructions
- `git show 7bb981b`.

### Technical details
- Record fields: `unhandledRejections` (count), `lastUnhandled` (message, ≤ 300 chars).

## Step 6: The baseline: 84 of 84 passed, and what the steps show

The baseline completed: 14 cases on both tiers, three repeats each, 84 turns in 11.5 minutes, all passed. A 100 %
pass rate on both models says more about the cases than about the models: the set is too easy to separate them.
The step records were more informative than the verdicts. About one step in five calls an async lab function
without `await`, which explains most of the long runs.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Guide phase 6: run the baseline and record findings.
**Inferred user intent:** Numbers that steer the next agent changes.
**Commit (code):** see the commit that adds this step — "JIG-003 phase 6: first baseline (84/84) and findings"

### What I did
- `node tools/agent-eval.mjs --tiers default,complex --repeat 3 --out $T/various/runs/2026-10-31-baseline` against a freshly built `jigcad serve`.
- `scripts/01-run-analysis.py`: per-tier medians, the longest runs, unhandled rejections, and a heuristic count of steps that call `faces|why|feature|sketch|check|run|edges` neither awaited nor returned.
- Design doc §11 with the table and five findings.

### Why
- Medians and maxima, not just means: tool calls are skewed (median 3, max 17).

### What worked
- Summary: default 42/42 (CI 92–100 %), 3.6 tools, 5.3 s mean, 98 % cached; complex 42/42 (CI 92–100 %), 5.0 tools, 12.5 s mean, 96 % cached.
- Analysis output: `complex: tools median 3.0 max 17; seconds median 8.1 max 47.2; uncached input median 1309.0 max 25197; rounds max 16; unawaited async calls in 44/211 steps (21%); unhandled rejections 5` and `default: tools median 3.0 max 12; seconds median 3.8 max 25.1; uncached input median 938.5 max 18480; rounds max 13; unawaited async calls in 35/152 steps (23%); unhandled rejections 4`.
- The one run at the 16-round limit (complex #2 `a01-fillet-too-large`) still answered completely in the last round, after `check()` variants: "A 25 mm fillet on the four vertical outside edges cannot be built on this box, whatever the ordering…".

### What didn't work
- Nothing failed in this step; the run itself is evidence, not a gate.

### What I learned
- The 16-round run's steps show the Promise problem directly: `const fs = faces('|Z'); console.log(Array.isArray(fs), typeo…`, then `JSON.stringify(fs)`, then other queries, before an `await faces('#Z')` several rounds later.
- glm answers questions with fewer tool calls; deepseek investigates more before answering (`a01-name-why`: 2.3 vs 10.7 tool calls), at 2× the time and 2.4× the output tokens.

### What was tricky to build
- Counting misuse without parsing JavaScript: the regex excludes calls preceded by `await` or `return`; it can miss calls inside `Promise.all([...])` (counted as misuse) and code past the 400-character cut (not seen).

### What warrants a second pair of eyes
- Finding 1: a perfect score is a property of the case set. Do not read it as "both models are equally good".

### What should be done in the future
- A Promise hint in `runEval`'s result (a pending promise as a value or in a log line), then rerun this set and compare tool calls and seconds.
- A harder case set (multi-feature edits, gears, print jobs, assemblies, refusals).

### Code review instructions
- `cat ttmp/…/various/runs/2026-10-31-baseline/summary.md`; `python3 ttmp/…/scripts/01-run-analysis.py ttmp/…/various/runs/2026-10-31-baseline/results.jsonl`.

### Technical details
- Run metadata: `meta.json` records tiers, case ids, the backend's tier map and max rounds, and the engine.
