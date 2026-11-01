---
Title: Implementation diary
Ticket: JIG-004-PROMISE-HINT
Status: active
Topics:
    - agent
    - llm
    - testing
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/src/agent/evaltool.js
      Note: track, trackScope, markPromises, promiseNotes; runEval waits briefly for unconsumed promises
    - Path: repo://import/jigcad/test/agent/eval.test.mjs
      Note: five tracked-promise tests
    - Path: repo://ttmp/2026/10/31/JIG-004-PROMISE-HINT--tell-the-agent-when-it-forgot-await-tracked-promises-in-the-eval-tool-measured-with-the-harness/scripts/01-compare.py
      Note: before/after comparison of two results.jsonl
ExternalSources: []
Summary: "Tracked promises in the eval tool: design, implementation, tests and the before/after measurement against the JIG-003 baseline."
LastUpdated: 2026-10-31T22:43:40.361000254-04:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1: Ticket and design: tracked promises instead of a prompt change

The JIG-003 baseline showed that about one eval step in five calls an async lab function without `await`, and
that nine such calls failed after their step had returned, where the model could not see them. This ticket adds a
hint to the eval tool's result and measures it. The design changes only what the model reads after a mistake, so
the measurement isolates one variable.

### Prompt Context
**User prompt (verbatim):** "Do 1, 2, 3, 4. Create docmgr tickets as needed and write their design doc, then implement and commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill). Write a detailed report  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault).    after each ticket."
**Assistant interpretation:** Item 1 of my previous list: a Promise hint in eval results, then rerun the baseline and compare. Tickets JIG-004 to JIG-007 follow for items 2–4, each with a design doc, diary, commits and a vault report.
**Inferred user intent:** Turn the baseline's findings into measured improvements, with a written record per ticket.

### What I did
- `docmgr ticket create-ticket --ticket JIG-004-PROMISE-HINT …`; design doc `01-promise-hints-in-the-eval-tool-design-and-measurement-plan.md` (problem with the baseline numbers, tracked-promise design, what the model sees, measurement plan, tests, risks).

### Why
- A prompt change (marking async functions in the reference) would alter every case's prompt and its cache prefix; a result change only fires after a mistake.

### What worked
- The baseline records already held what the design needed: step code and results, cut at 400 characters.

### What didn't work
- N/A.

### What I learned
- The YAML of a pending promise is `{}`: the model got no signal at all from logging or returning it.

### What was tricky to build
- Deciding what counts as "consumed": `await` and `return` both go through `then`, so a thenable wrapper that marks itself on `then`, `catch` and `finally` covers await, return, `Promise.all` and explicit chaining without parsing the code.

### What warrants a second pair of eyes
- The wrapper is a thenable, not a `Promise`: `x instanceof Promise` is false (§5 of the design doc).

### What should be done in the future
- N/A for this step.

### Code review instructions
- Read design doc §2.

### Technical details
- Async lab functions: `faces`, `why`, `feature`, `sketch`, `check`, `run`, `params.get/set/clear`, `measure.area`, `program.ir`, `presets.load/create`, `exportFile`.

## Step 2: Implementation and tests (commit f9118b5)

`runEval` wraps the lab scope per step. Every function one level into its namespaces returns a tracked promise when
the original returns a thenable. After the step, unconsumed promises get a note, and a pending one gets one second to
settle so its failure can be reported. Five tests cover the cases. Two tests failed on their first run because of the
test setup, not the code.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement design §2 and §4.
**Inferred user intent:** A tested change committed before measuring.
**Commit (code):** f9118b5 — "JIG-004: tracked promises in the eval tool — notes and markers for calls the step never awaited"

### What I did
- `src/agent/evaltool.js`: `TRACKED` symbol; `argText` (call label, arguments as compact JSON cut at 60 characters, strings in single quotes); `track(p, label, promises)`; `trackScope(scope, promises)` (console and log untouched); `markPromises(v)` renders `<Promise from faces('|Z'): not awaited>`; `promiseNotes(promises)` (one note per label, `(2×)` for repeats, ` It failed: …` for rejections); `makeConsole(logs, mark)` marks logged promises; `formatResult(value, logs, error, notes)`.
- In `runEval`: after the race, `open = promises.filter(t => !t.consumed && !t.settled)`; if any, wait for them or 1 s.
- `test/agent/eval.test.mjs`: unawaited call → marker and note; awaited, returned, `Promise.all` and `.catch` → no note; rejected unawaited call → error in the note and no unhandled rejection; TypeError symptom → note next to the error and marker in logs; the same call twice → one note with `(2×)`.

### Why
- Labels quote the call as written so the note's suggested fix can be copied: `Write: const x = await faces('shell/inner*');`.

### What worked
- On the real engine (Node, `createNodeEngine`): `note: faces('shell/inner*') returned a Promise that this step never awaited. Write: const x = await faces('shell/inner*'); It failed: faces: selector: unknown token 'shell/inner*' in 'shell/inner*'`.
- `node --test test/agent/` → 39/39 after the fixes below.

### What didn't work
- Summary of the two first-run failures (the exact output was not kept): (1) labels rendered with double quotes came back from the YAML writer escaped (`\"|Z\"`), so the expected text did not match; labels now use single quotes. (2) The mock host had no compiled program, so the lab functions under test rejected for that reason; each test now calls `await host.compile()` first.

### What I learned
- Pending promises need a bounded wait: without it a rejection lands after the step's text is built and the error is lost again.

### What was tricky to build
- Avoiding unhandled rejections from the tracker itself: `t.p = Promise.resolve(p).then(ok, err)` handles the original once, and the thenable's own `then` makes a new chain only when the code consumes it.

### What warrants a second pair of eyes
- `trackScope` wraps one level into plain-object namespaces; a function nested deeper is not tracked (none exists today).

### What should be done in the future
- N/A.

### Code review instructions
- `git show f9118b5 -- import/jigcad/src/agent/evaltool.js`; `node --test test/agent/eval.test.mjs`.

### Technical details
- Note text: `note: ${label} returned a Promise that this step never awaited${n>1?` (${n}×)`:''}. Write: const x = await ${label};` + optional ` It failed: ${message}`.

## Step 3: Measurement: errors visible, turns not shorter

The rerun (84 turns) finished with 81 recorded passes. Rescored with two corrected checks, it is 83 of 84; the
remaining failure is a lunaroute `rate_limited`. The hint removed all unhandled rejections, and 31 of the 35 runs that
received a note did not repeat the mistake. It did not reduce tool calls or seconds. The long runs are long because
the model explores engineering alternatives.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Design §3: rerun and compare.
**Inferred user intent:** Know whether the change helped, with numbers.
**Commit (code):** the commit that adds this step (results, compare script, run records).

### What I did
- Restarted `jigcad serve` on the new build; `node tools/agent-eval.mjs --tiers default,complex --repeat 3 --out $T/various/runs/2026-10-31-promise-hint` (background, 84 turns).
- `python3 scripts/01-compare.py <JIG-003 baseline>/results.jsonl <this run>/results.jsonl`.
- Read every failing record's answer and steps; computed seconds per round and output tokens per second for both runs; read the longest run step by step.
- Design doc §6 (results, what changed, what did not, conclusion).

### Why
- Seconds alone conflate the change with backend latency, so seconds per round were measured too.

### What worked
- Compare output (excerpt): `complex … unawaited 44 → 16, noted_steps 0 → 17, repeat_after_note 0 → 2, unhandled 5 → 0`; `default … unawaited 35 → 20, noted_steps 0 → 26, repeat_after_note 0 → 2, unhandled 4 → 0`.
- Latency check: `baseline complex sec/round median 1.97, output tok/s 123`; `promise-hint complex sec/round median 2.31, output tok/s 111`.

### What didn't work
- Three recorded failures: `FAIL default #2 s01-orientation · answer: missing /[-−–]\s*Y|minus Y|negative Y/`, `FAIL complex #2 a01-volume-readonly · answer: none of /19[.,]0\d*\s*g/`, `FAIL complex #2 a03-dof-question · rate_limited · 6 tools · 100.2 s`. The first two answers were correct ("printed on its side … no supports"; `**Mass:** $19.03\ \text{g}$`); the checks were loosened in JIG-005. The third is an upstream limit.

### What I learned
- A hint that fires after a mistake cannot shorten a turn by more than the rounds the mistake used to cost. The baseline's longest run spent about four rounds on an unawaited `faces`. In the rerun's longest run the note cost one round, and the other 21 steps were a search for the largest feasible fillet.
- With three repeats, per-case tool-call means move by ±3 between identical builds (`a03-dof-question` complex 2.3 → 6.3 with no related change). Only totals and mechanisms are worth reporting.

### What was tricky to build
- Telling a case bug from a model failure: every failing record's answer was read before counting it.

### What warrants a second pair of eyes
- The claim "the hint does not slow turns" rests on per-round latency moving by the same amount as the medians; a run at a quieter hour would settle it.

### What should be done in the future
- Mark async functions in the reference (`await faces(sel)`) and measure it on the JIG-005 set.

### Code review instructions
- `python3 scripts/01-compare.py …baseline/results.jsonl …promise-hint/results.jsonl`; `cat various/runs/2026-10-31-promise-hint/summary.md`.

### Technical details
- Run: 84 turns, `meta.json` records the backend's tier map and max rounds 16; engine rust.
