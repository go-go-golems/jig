---
Title: Diary
Ticket: JIG-013-AWAIT-RULE
Status: active
Topics:
    - agent
    - sandbox
    - api
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-01T18:39:17.772992345-05:00
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

## Step 1: Ticket and intern guide

JIG-012's phase 2 batch showed that unawaited promises are the largest failure class: 31 steps in 29 of 66 runs,
and the only class that grew. A look at the docs explained why. The reference and prompt never say which calls
return a Promise, the prompt writes `run()` and `check()` as if synchronous, and the split between synchronous
and asynchronous calls follows plumbing (which thread holds the Program), not meaning. I created JIG-013 and
wrote the intern guide: a rule ("reading is synchronous; anything that compiles, draws or changes the workbench is
awaited"), synchronous reads in the sandbox from a shadow of the page's program, loud promises for the rest, and
the rule in the docs.

### Prompt context

**User prompt (verbatim):** "Ok, creat ea new docmgr ticket and a design document guide implementationo guide for
the intern, and then implement, commit at appropriate intervals and keep a detailed diary as you work (using the
diary format from the skill)

When done,  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post
using a textbook writing style (no analogies, see skill).
 Commit and push the bsidian vault when done (go-go-parc vault)."

The "Ok" approves the proposal from the conversation just before it, quoted here from my own message: "I'd build
it as one more phase (loud promises, synchronous reads in the sandbox, the docs rule), after the current batch
finishes. Then I'd measure with `--repeat 2`".

**Assistant interpretation:** a new ticket (JIG-013) with a guide, then the implementation in phases with commits
and a diary, then a measured batch, then a vault report pushed to go-go-parc.

**Inferred user intent:** remove the largest failure class structurally, and keep a record that teaches.

### What I did
- `docmgr ticket create-ticket --ticket JIG-013-AWAIT-RULE …`; `docmgr doc add` for the design doc and the diary.
- Read the code paths the design depends on:
  - `Program.faces/why/feature/sketch` in `src/engine/program.js` are synchronous; `genealogy()` is pure string parsing.
  - `worker.js` `call` is async only because of `evalArg` (selector text `j.…` through `runScript`).
  - `releasePrograms(keepOnly)` and `gc()` keep only one Program's bodies alive.
  - `host.compile` records `_compiled` (the key) but not the inputs of the last good compile.
- Investigated the one failure so far in the running JIG-012 batch (`a01-magnet-pocket`, default tier): `add magnetPocket failed: Cannot read properties of undefined (reading 'type')` after a sequence of `files.edit` + `run()`. I replayed the same edit sequence in the sandbox (`check()`) and on a harness Host with the Node engine (`createNodeEngine`, `host.loadPreset('A-01')`, `setFile`, `compile`). Every variant compiled (volume 15292.94), so I could not reproduce it. Logged in the guide (§9) with a plan to put engine stack frames into such diagnostics.
- Wrote the guide (`design-doc/01-…`, 13 sections) and `tasks.md`.

### Why
- A note after the fact cannot prevent the first mistake. The rule removes most of the cases, and loud promises turn the rest from silent `undefined` into an error at the right line.

### What didn't work
- Replaying the magnet failure (above).
- My first frontmatter edit wrote an empty body (I piped nothing into a heredoc); I appended the body afterwards.

### What I learned
- In the failing case the agent called `help(j.lib.magnet)` and `help('part.add')`: the first `help()` calls seen in a batch.

### What warrants a second pair of eyes
- The shadow depends on the page and the sandbox compiling identical inputs to identical programs. The guide makes a mismatch an error, not a wrong answer.

**Commit (docs):** 285fa5a

## Step 2: Phases 1 and 2, engine slots and synchronous reads in the sandbox

The engine worker can now keep named Programs beside its current one, and answer on any of them synchronously
(`callSync`). The sandbox uses that for a shadow: it compiles the inputs of the page's last good compile into its
`shadow` slot, and `faces`, `why`, `feature`, `sketch`, `measure.area`, `params.get` and `program.ir` answer from
it without a Promise. `check()`'s live program answers the same way from the `check` slot. `faces()` with no
selector lists every face, and in the sandbox a selector can be a value (`faces(j.sel.faces('>Z'))`).

### What I did
- `src/engine/program.js`: `releasePrograms(...keep)`; `Program.faces()` with no selector, `''` or `'*'` returns every face.
- `src/engine/worker.js`: `slots` (`setSlot`, `keepAll` keeps the current Program and every slot alive through `gc()`), `compileFiles` `options.slot`, `callSync(slot, method, args)`, `evalArgSync` (selector text `j.…` as a plain function over `j`, the bare names and the slot's data), `slotData`, `dropSlot`; `call` and `callSync` share `answer(P, method, a)`.
- `src/host/host.js`: `goodInputs = { files, override }` on every successful compile. `serve.js` `ctxOf` sends it. The mock host records it too.
- `src/agent/sandbox/runner.js`: `ensureShadow(ctx)` before each step and after each bridged call that returned a new `ctx`. It compiles `goodInputs` into the `shadow` slot when the page's `lastGood.hash` changed, and checks that the shadow's hash equals the page's (engine hashes `h:…`; the mock host's fake hash is not compared). `mirror.callSync` answers from the shadow, or throws the reason it cannot. `check()` compiles into the `check` slot; `liveProgram`'s host has `callSync` with the staleness check.
- `src/agent/scope.js`: `ask(host, method, verb, args, shape)`, one query path that gives a value when the host has `callSync` and a Promise otherwise (the page). `why`, `faces`, `feature`, `sketch`, `program.ir`, `measure.area`, `params.get` use it. `faces(sel?)` accepts nothing, `''`, `'*'`, text, or (sandbox) a selector value. `why` and `params.get` check their argument. A message that already starts with the verb is not prefixed again (`faces: faces: …`).
- `serve.js`: `params.get` is no longer bridged (it is a read; the sandbox answers it).
- Tests: `test/agent/slots.test.mjs` (two slots and the current Program after three compiles; `callSync` equals `call`; selector text equals selector value; `faces()` counts every face; the same inputs give the same hash in any slot, for A-01 with an override and the two-body X-05). `sandbox.test.mjs`: reads are values, not Promises; `faces()`/`'*'`/`''`; `why`, `feature`, `params.get`, `measure.area`, selector values, `check().program`; `await` on a value; reads follow `await run()` (top face 30 → 20).

### Why
- These reads were asynchronous only because the Program was in another thread. A copy of it in the sandbox's own engine removes the port from the read path.

### What worked
- `make test-js`: 83 + 15 + 62 + 42 passing. `node tools/agent-eval.mjs --oracle`: 33/33 through the Node sandbox (two cases need `look()` and are skipped without `--look`).

### What didn't work
- My first read test assumed the mock box has non-planar faces (`faces().length > faces('%plane').length` was false: 11 and 11) and that `params.get('wall').value` is a number (it is a quantity record). It also expected `- 30\n- 20` where the YAML writes short number lists inline: `[30, 20]`.

### What I learned
- `select`, `view.set`, `presets.rename` and `lab.follow` have been asynchronous in the sandbox since JIG-012, because they are bridged to the page. They change the workbench, so they belong with the awaited calls. The rule in the guide's §3 table becomes: *reading (and editing files) is synchronous; compiling, drawing and changing the workbench — params, presets, selection, view, links, exports — is awaited.* I corrected the guide.

### What warrants a second pair of eyes
- The shadow compile happens before the step's timer matters to the person, but it counts toward the step's 25 s. A large preset adds about a second after each successful `run()`.
- On the page (the fallback), reads stay Promises: `ask()` keeps the page's contract.

**Commit (code):** 8db4985

## Step 3: Phase 3, loud promises, awaited return values, finished pending calls

The calls that stay asynchronous now fail where they are misused. A tracked Promise is a Proxy that answers
`then`, `catch`, `finally` and the usual probes, and throws on any other property with the fix:
`TypeError: check() returned a Promise: write (await check()).ok (line 1)`. Promises inside a returned value are
awaited. Calls a step starts and never awaits are allowed to finish within the step's time, so their failures are
reported. JIG-012's final batch finished during this step; its results and the resulting changes are in JIG-012's
diary, Step 8.

### What I did
- `src/agent/evaltool.js`:
  - `track()` returns `loud(tp, t)`. It passes `then`, `catch`, `finally`, `constructor`, `toString`, `valueOf`, `toLocaleString`, `toJSON` and every symbol, so `await`, `Promise.all`, `JSON.stringify`, `String()`, `markPromises` and `promiseNotes` keep working. It throws on anything else, and marks the Promise consumed so no note repeats the error.
  - `settleValue(v, ms)` awaits Promises inside the returned value (plain objects and arrays, depth ≤ 8). A rejection becomes `<label failed: message>`.
  - `drain(promises, ms)` waits for unsettled calls until the step's time is used up (at least 1 s), instead of 1 s.
  - Both are used in `runEval` (page) and `runStep` (sandbox, budget 22 s of the client's 25 s).
- `src/agent/hints.js`: `ASYNC_CALL` lists the awaited calls of the new rule (run, check, look, exportFile, select, params.set/clear, presets.load/create/rename, view.set, lab.follow). A not-a-function on `faces(...)` no longer says it returns a Promise.
- `tools/agent-eval/failures.mjs`: the loud message is the class "promise not awaited".
- Tests: `sandbox.test.mjs` (loud on `check().ok` and `run().summary`; `Promise.all`, `.then` still work; `return { r: check() }` gives the result with no note; `run()` left running finishes, with its note). `eval.test.mjs`: the two JIG-004 tests now describe the loud behaviour (the page path).

### Why
- Of the 49 unawaited steps in JIG-012's last batch, 25 "succeeded" with a wrong value. A loud error is the cheapest fix the model knows how to act on: 58 of 69 failed steps recovered on the next step.

### What worked
- `make test-js`: 84 + 15 + 62 + 42 passing.

### What didn't work
- Two JIG-004 tests failed as expected (`an unawaited lab call gets a note and a marker instead of {}`: `actual: true, expected: false` for `r.error`; the TypeError test expected `fs.map is not a function`). I rewrote them for the new contract rather than keeping the old one.

### What warrants a second pair of eyes
- A tracked Promise is not a real `Promise` (it never was; JIG-004 made it a thenable). `x instanceof Promise` is false for it, as before.

**Commit (code):** 309b8b9

## Step 4: Phases 4 and 5, the rule in the docs; engine errors that say whose they are

The registry now knows which names return a Promise (`awaited`). The scope table and `help()` write them as
`await run()`, `await check(…)`, `await params.set(…)`. The reference opens the scope section with the rule, and
the prompt states it in one sentence and writes its examples with `await`. A test ties the docs to the code: the
awaited names must be exactly the calls the sandbox bridges to the page (minus file edits) plus `check`. An
engine feature that fails with a JavaScript error now says whether the error came from a function in the script
(with its line) or from inside the engine (kind `engine.bug`, with the first engine frames).

### What I did
- `src/agent/docs.js`: `awaited` on the rows of run, check, look, exportFile, params.set/clear, presets.load/create/rename, select, view.set, lab.follow; their signatures carry `await`; `awaitedNames()`. The `faces` row: `faces(selector?)` with selector values and "nothing for every face".
- `src/agent/reference.md`: the rule, the awaited list, "`await` on a value is harmless", and the loud message, ahead of the sandbox paragraph.
- `src/agent/prompt.js`: the rule and the awaited list after the tool description. "Then const r = await run() and read r.ok, r.errors"; "await check(variant)".
- `tools/agent-eval/failures.mjs`: `ASYNC` = `awaitedNames()` plus the reads that were asynchronous before JIG-013 (old runs are still classified correctly).
- `src/engine/compile.js`: for a `TypeError`, `ReferenceError` or `RangeError` without an engine kind, if the first stack frame is in `script.js` the message gets "(in a function of your script, script.js:N)". Otherwise the kind becomes `engine.bug`, the message gets the first three engine frames (`at fn (src/engine/file.js:line) ← …`), and the fix says to try another way and report it.
- Test: `docs.test.mjs` "the awaited names are exactly the asynchronous ones"; `help('run')` starts with `await run()`.

### What worked
- `make test-js`: 85 + 15 + 62 + 42; presets 72/72; book 159 blocks, no problems.
- A custom feature whose lambda reads `undefined.type`: `custom bad failed: Cannot read properties of undefined (reading 'type') (in a function of your script, script.js:1)`.

### What didn't work
- I could not trigger an engine-internal error on purpose to check the `engine.bug` branch. `.add(j.lib.magnet(), { at: { foo: 1 } })` compiled; `j.frame.on(j.sel.faces().where(…))` on a part gives a clean `ref.lost`. The branch is reviewed, not tested.

### What warrants a second pair of eyes
- The first-frame test for "your script" relies on the `//# sourceURL=script.js` that `runScript` appends. A lambda defined in a data file or in `call.js` would be reported as an engine bug.

**Commit (code):** 8c0f856; e6a2562 (browser check, guide correction). Pushed to origin/main at the user's request ("push the jig repo too"); that push included the running batch's partial `results.jsonl`, replaced by the complete file in this step's commit.

## Step 5: The measured batch, and what it found

The batch ran from the worktree frozen at 8c0f856, with two repeats per case (`--tiers default,complex
--repeat 2 --look chrome`, 140 runs; `various/runs/2026-11-02-jig013/`, report `various/02-failures-jig013.md`).
It passed 136/140. The class this ticket targeted, unawaited promises, went from 49 steps in 38 runs to none.
Reading the failing steps found two problems outside the class. `look()` refused overlays written as an object,
the form `view.set` takes. The harness's Chrome renderer could not draw a preset the agent had just created. Both
are fixed in this step.

### What worked
| | baseline | JIG-012 phase 2 | JIG-012 phases 3–5 | JIG-013 |
|---|---:|---:|---:|---:|
| runs | 66 | 66 | 70 | 140 (2 repeats) |
| passed | 64 | 63 (1 auth error) | 68 | 136 |
| failed steps | 18 % | 16 % | 15 % (69 of 450) | 11 % (87 of 774) |
| runs with a misuse error | 24 % | 18 % | 16 % | 15 % (21) |
| runs with an unawaited promise | 28 (31 steps) | 29 (31) | 38 (49) | 0 (0) |
| stuck loops | 2 | 1 | 1 | 2 |
| never recovered | 5 | 1 | 0 | 3 |
- Fewer tool calls per run: default 4.3 (was 5.2), complex 6.8 (was 7.6). `help` was called 12 times.
- The four failures:
  - `default #1 a01-mount-holes`: volume 15267.3, expected 15271.6 ± 1. The same miss as in the phase 2 batch: the agent's holes differ slightly from the request.
  - `default #2 a01-fillet-too-large`: the agent left a 25 mm fillet that the engine refuses (`fillet.tooLarge`).
  - `complex #1 h04-switch-toggle`: wrong volume (21301, expected 17062).
  - `complex #1 u01-cat-magnet-pin`: 15 tool calls spent exploring ear fillets; it never created the preset (the final files are D-03's).

### What didn't work
- `look(view, { overlays: { dims: true } })` failed 5 times with `Error: TypeError: object is not iterable (cannot read property Symbol(Symbol.iterator))`. The reference documents the object form for `view.set`, and `look` passed the object on as if it were a list. `look()` now takes a list, or `{ name: on }` over the person's current overlays.
- In three of the four `u01-cat-magnet-pin` runs, every `look()` after `presets.create` failed with `Error: Error: no preset U-01` (also `U-02`, `U-03`). The harness's Chrome page loads the preset by id before applying the Node host's files, and a preset the agent made exists only in the Node host. The page now goes on with the files when the id is unknown. Checked: rendering `presetId: 'U-99'` with A-01's files gives a 320 × 240 plan view. This affected only the harness; in the browser, `look()` draws the page's own state.
- `j.compile(null)` leaked `Cannot read properties of null (reading 'constructor')` (2 steps). It now throws `j.compile: give a part, sketch, assembly, print job or design (got null)`.
- Correction to Step 1: there I called unawaited promises "the only class that grew". With the corrected classifier, the baseline had 28 runs (31 steps), not 25, so the class was flat from the baseline to phase 2 and rose only in the last JIG-012 batch, partly because calls on `check()`'s program were tracked from then on. The guide was corrected in e6a2562.

### What I learned
- Removing the asynchrony removed the class entirely: no step in 140 runs used a Promise as a value or left one unawaited. The loud-promise error never fired, because the reads it would have caught are values now and the awaited calls were awaited.
- The remaining failures are engineering judgment (sizes, fillets, a selector that picks the wrong face) and one exploration that ran out of steps, not API misuse.

### What warrants a second pair of eyes
- "never recovered" rose from 0 to 3 in twice as many runs; two stuck loops in 140 runs (one in the cat case, one in `w01-a01-hole-misses`). Not investigated further.

### Code review instructions
- `node tools/agent-eval/failures.mjs ttmp/…/JIG-013…/various/runs/2026-11-02-jig013/results.jsonl`; `node --test import/jigcad/test/agent/eval.test.mjs` (the `look()` overlays test).
