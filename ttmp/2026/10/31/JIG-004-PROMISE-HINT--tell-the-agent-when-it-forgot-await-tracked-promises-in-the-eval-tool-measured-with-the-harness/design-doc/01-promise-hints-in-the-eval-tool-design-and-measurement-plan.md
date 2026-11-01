---
Title: 'Promise hints in the eval tool: design and measurement plan'
Ticket: JIG-004-PROMISE-HINT
Status: active
Topics:
    - agent
    - llm
    - testing
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: import/jigcad/src/agent/evaltool.js
      Note: runEval wraps the scope and reports unconsumed promises
    - Path: import/jigcad/src/agent/scope.js
      Note: the async lab functions (faces, why, feature, sketch, check, run, params.get, measure.area, program.ir, presets.load, exportFile)
ExternalSources: []
Summary: "Track every promise a lab function returns during an eval step; report those the code never awaited, render them as markers instead of {}, and measure the effect on the JIG-003 baseline."
LastUpdated: 2026-10-31T23:00:00-04:00
WhatFor: "Design of the Promise hint and its before/after measurement"
WhenToUse: "When changing how eval results are rendered or how lab functions return values"
---

# Promise hints in the eval tool: design and measurement plan

## 1. Problem

The agent's one tool, `eval`, runs an async JavaScript function body with the lab scope in view. Eleven scope
functions are asynchronous, because they ask the engine worker or compile: `faces`, `why`, `feature`, `sketch`,
`check`, `run`, `params.get/set/clear`, `measure.area`, `program.ir`, `presets.load/create`, and `exportFile`.
Called without `await`, they return a `Promise`, and the step's code then works with the promise instead of the
value.

The JIG-003 baseline measured how often this happens. In 79 of 363 steps (22 %), on both models, code calls one
of these functions neither awaited nor returned. The consequences visible in the records are:

- **Wasted rounds.** The longest run (deepseek-4.1-flash, `a01-fillet-too-large`, 16 rounds) spent several steps
  logging `Array.isArray(fs)`, `typeof fs` and `JSON.stringify(fs)` of an unawaited `faces('|Z')`. The YAML of a
  promise is `{}`, which tells the model nothing.
- **Lost errors.** When the unawaited call fails (`faces('shell/inner*')`: unknown token), the rejection surfaces
  after the step returned. The browser logs it to the console, Node ends the process, and the model never sees it.
  The baseline recorded 9 such rejections in 5 runs.

## 2. Design

### 2.1 Tracked promises

`runEval` wraps every function of the scope, one level into its namespaces (`files`, `program`, `params`,
`measure`, `presets`, `lab`, `view`). A wrapped function calls the original. When the original returns a thenable,
the wrapper returns a **tracked promise** instead:

```js
function track(p, label, step) {
  const t = { label, consumed: false, settled: false, error: null };
  p.then(() => { t.settled = true; }, e => { t.settled = true; t.error = e; });   // handled here: no unhandled rejection
  step.promises.push(t);
  return {
    then(a, b) { t.consumed = true; return p.then(a, b); },
    catch(b) { t.consumed = true; return p.catch(b); },
    finally(f) { t.consumed = true; return p.finally(f); },
    [TRACKED]: t,
  };
}
```

`await x` calls `x.then`, so it marks the promise as consumed. So does returning it from the async step function
(the step's own promise resolves through `then`), and so do `Promise.all`, `.then` and `.catch`. What remains
unconsumed when the step ends is a value the code used as if it were a result: logged it, stored it in an object,
read `.length` from it, or ignored it.

The `label` is the call as written, for example `faces("|Z")`, with arguments rendered as compact JSON cut to
60 characters.

### 2.2 What the model sees

Three changes to the step's result text:

1. **Markers instead of `{}`.** When the returned value or a `console.log` argument contains a tracked promise,
   the YAML shows `<Promise from faces("|Z"): not awaited>` in its place.
2. **A note per unconsumed promise**, after the value:
   `note: faces("|Z") returned a Promise that this step never awaited. Write: const x = await faces("|Z");`
   If that promise rejected, the note adds the error: `… It failed: faces: selector: unknown token '|Q'`.
3. **A hint on typical symptoms.** When the step throws a `TypeError` (`… is not a function`, `Cannot read
   properties of undefined`) and an unconsumed promise exists, the error line is followed by the same note, so the
   cause is next to the symptom.

Unconsumed promises that rejected no longer produce unhandled rejections. Their errors are reported in the step
instead.

### 2.3 What does not change

The scope's API, its documentation, the tool description and the instructions stay unchanged. The measurement then
isolates one variable, the result text. A promise that is awaited behaves exactly as before.

## 3. Measurement plan

Rerun the JIG-003 baseline (14 cases × glm-5.3-flash and deepseek-4.1-flash × 3 repeats) with the hint, and
compare per tier:

| Metric | Expectation |
|---|---|
| pass rate | unchanged (100 %); a drop would mean the hint confuses |
| steps with an unconsumed async call | the first occurrence remains; repeats within a run should fall |
| tool calls (mean, max) and rounds | lower on the cases with long runs (`a01-fillet-too-large`, `a03-fix-dof`, `a01-name-why`) |
| seconds (median, max) | lower |
| unhandled rejections | 0 (by construction) |

`scripts/01-compare.py` prints the two runs side by side, overall and per case. Three repeats per case give a noisy
per-case comparison, so the conclusion rests on the totals and the long-run cases.

## 4. Tests

- `test/agent/eval.test.mjs` (existing file) gains cases: an unawaited `faces` used as an array gets a note; a
  returned object holding a promise shows the marker; `await` and `Promise.all` produce no note; a rejected
  unconsumed promise reports its error and leaves no unhandled rejection; `return faces(…)` is consumed.
- The harness self-test and oracle cases must still pass.

## 5. Risks

- **Thenable, not Promise.** `x instanceof Promise` is false for a tracked promise. No scope consumer relies on it.
  Model code that tests it would see `false`; the marker text explains what the value is.
- **Wrapping cost.** One closure per scope function per step; negligible next to an engine call.

## 6. Results

The rerun used the same 14 cases × 2 tiers × 3 repeats as the JIG-003 baseline, on the build of commit f9118b5,
through the same `jigcad serve` (glm-5.3-flash on the default tier, deepseek-4.1-flash on the complex tier).
`scripts/01-compare.py` printed:

| Metric | default before → after | complex before → after |
|---|---|---|
| passed (as recorded) | 42 → 41 | 42 → 40 |
| passed (corrected checks, §6.2) | 42 → 42 | 42 → 41 (one `rate_limited`) |
| steps | 152 → 145 | 211 → 217 |
| steps with an unawaited async call (regex) | 35 → 20 | 44 → 16 |
| steps whose result carried a Promise note | 0 → 26 | 0 → 17 |
| runs that repeated the mistake after a note | – → 2 | – → 2 |
| unhandled rejections | 4 → 0 | 5 → 0 |
| tool calls, mean (max) | 3.62 (12) → 3.45 (13) | 5.02 (17) → 5.17 (22) |
| seconds, median (max) | 3.83 (25.1) → 4.12 (34.9) | 8.10 (47.2) → 10.85 (102.1) |
| seconds per model round, median | 1.04 → 1.03 | 1.97 → 2.31 |
| output tokens per second, median | 115 → 100 | 123 → 111 |

### 6.1 What the hint changed

- **Errors became visible.** No rejection escaped a step (9 → 0). In 43 steps the model received the note; in 35 of
  84 runs at least one step had one. In 31 of those 35 runs, no later step repeated the mistake. The note is
  read and acted on: in the longest run, step 2 `const e = faces('%cylinder'); return e.map(…)` returned
  `TypeError: e.map is not a function` followed by the note, and step 5 was `const cyl = await faces('%cylinder')`.
- **The mistake still happens once.** The note corrects after the fact; it does not prevent the first unawaited
  call. Steps with an unawaited call fell by 54 % (79 → 36) because the repeats stopped, not because first attempts
  improved.

### 6.2 What it did not change

- **Pass rate.** Two recorded failures were case bugs, not model failures: deepseek wrote the mass as
  `$19.03\ \text{g}$` (LaTeX), which `19[.,]0\d*\s*g` rejected, and glm answered "printed on its side" to the
  orientation question, which the check required as `−Y`. Both checks were loosened in JIG-005 (commit after
  fb629fc); rescored, the hint run is 42/42 and 41/42, the one failure a `rate_limited` from lunaroute after
  6 steps. The baseline rescored with the corrected checks stays 84/84.
- **Turn length and time.** Tool calls per run did not fall (3.62 → 3.45 and 5.02 → 5.17), and the long runs are
  long for another reason. The 22-step complex run of `a01-fillet-too-large` hit the note once (step 2), then spent
  16 steps searching for the largest fillet radius that works (`check()` over 19, 19.5, 19.9, 20 and 25 mm), and
  finally changed the sketch's corner radius to 19.9 mm. That is engineering exploration, not tool misuse. The time
  difference is within the noise of three repeats and partly backend latency: seconds per round on the complex
  tier rose 17 % between the runs while the code under test did not change what a round costs.

### 6.3 Conclusion and next step

Keep the hint: it removes a class of silent failures at no cost (no failing check, no new prompt text, a closure
per scope function). It is not a speed improvement. Preventing the first mistake would need a change the model reads
before it writes code. The reference's API table could mark async functions (`await faces(sel)` instead of
`faces(sel)`), as it already does for `look()`. That change touches the prompt every case reads, so it should be
measured on its own, after the harder case set (JIG-005) exists to measure it on.
