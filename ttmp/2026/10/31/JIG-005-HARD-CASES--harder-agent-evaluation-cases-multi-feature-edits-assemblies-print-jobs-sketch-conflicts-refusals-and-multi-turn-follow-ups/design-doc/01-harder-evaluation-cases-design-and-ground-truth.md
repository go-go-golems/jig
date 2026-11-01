---
Title: 'Harder evaluation cases: design and ground truth'
Ticket: JIG-005-HARD-CASES
Status: active
Topics:
    - agent
    - llm
    - testing
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: import/jigcad/tools/agent-eval/runner.mjs
      Note: followUps (multi-turn cases), sumUsage, oracleSample
    - Path: import/jigcad/test/agent-eval/cases
      Note: cases 15–28 are the harder set
    - Path: import/jigcad/test/agent-eval/harness.test.mjs
      Note: trap test (naive edits fail) and the multi-turn test
ExternalSources: []
Summary: "Fourteen harder cases (assemblies, gears, configs, print jobs, multi-feature edits, a planted sketch conflict, a refusal, two multi-turn conversations), each with ground truth computed on the engine and a trap a hurried agent falls into; runner support for followUps."
LastUpdated: 2026-10-31T23:30:00-04:00
WhatFor: "What the harder case set measures and why its expected values are right"
WhenToUse: "When adding cases, reading a JIG-005 run, or changing the runner's multi-turn behaviour"
---

# Harder evaluation cases: design and ground truth

## 1. Why the first set is not enough

The JIG-003 baseline passed 84 of 84 runs on both models. A set that every run passes measures nothing beyond
"still works": a regression from 100 % to 95 % is invisible inside a 95 % interval of 92–100 %, and two models that
both pass everything cannot be told apart by pass rate, only by cost. Every one of the 14 first cases is on the two
simplest presets (A-01, a shelled box; A-03, a constrained plate) plus one print question on S-01, and every edit is
one parameter or one line.

The second set aims below 100 %. A case is harder when getting it right requires something beyond finding the line
and changing a number:

| Difficulty | What the agent has to do | Cases |
|---|---|---|
| Reading an assembly | find joints, ports and gear parameters across several parts | m07-ratio-centre, m07-tooth-gap, m09-travel-per-turn, m08-hinge-clearance |
| A second, coupled change | change two places that must agree | m07-wheel-30 (teeth and phase), h01-large (pot and saucer) |
| Configs | know that `.config(name)` exists, pick the right row, read its units | h04-decora-size, h04-switch-toggle, h01-large |
| New features | write an operation the script does not have yet | a01-mount-holes, a01-engrave |
| Diagnosis | read a solver diagnostic and remove the right constraint | a03-conflict |
| Refusal | notice that the request names something that does not exist | a01-no-holes |
| Conversation | keep state across turns; undo; act on a clarification | a01-undo-change, a01-bigger-clarify |

## 2. Traps

Most harder cases contain a trap: an edit that looks complete, compiles or nearly compiles, and is wrong. The trap is
what makes the case discriminate. Each trap was checked on the engine (§4), and
`harness.test.mjs › the harder cases reject the naive edit` keeps three of them honest:

- **m07-wheel-30.** Changing `teeth: 36` to `teeth: 30` alone leaves the wheel's joint angle at `deg(180 / 36)`, the
  half-tooth offset for 36 teeth. The teeth then collide: `asm.interference: pinion and wheel touch or overlap`, gap
  0.000 mm. The agent must also change the offset to `deg(180 / 30)`, which brings the gap back to 0.203 mm.
- **h01-large.** The pot and the saucer are two parts, each with `.configs(sizes).config('M')`. Changing the first
  makes a large pot on a medium saucer: it compiles, volume 166,268 mm³ instead of 189,986 mm³.
- **a03-conflict.** The setup adds `.dim('l1', 90)` next to `.dim('l1', 'w')`. The solver reports the minimal
  conflicting set (`length(l1) = 80 mm · length(l1) = 90 mm`). Removing the wrong one compiles and makes a 90 mm plate;
  the request says the plate stays 80 mm.
- **h04-switch-toggle.** The request says "US toggle switch", the config is named `us_toggle`, and the decoy is
  `us_decora`, which has the same outer size (69.85 × 114.3 mm). Only the volume (17,062 vs 13,505 mm³) tells them apart.
- **a01-no-holes.** "Make the mounting holes 1 mm bigger" on a box without holes. Inventing holes changes the file and
  fails `unchanged`.

## 3. Multi-turn cases

A case may carry `followUps`, further requests in the same thread. The runner sends them one after another through
`runTurn` with the same `thread`, so the model sees the earlier turns (their text, steps and results, as the panel
would send them). Checks judge the state after the last turn:

```js
const requests = [c.request, ...(c.followUps || [])];
for (const text of requests) {
  if (ctl.signal.aborted) break;              // one deadline for the whole conversation
  await runTurn({ host, sample, thread, text, settings, reference, signal });
  usages.push(cap.usage);
}
const agentTurns = thread.turns.filter(t => t.role !== 'user');
const turn  = agentTurns.at(-1);              // `answer` checks read the last answer
const steps = agentTurns.flatMap(t => t.steps);   // `steps` and `stepCode` checks see every step
```

The record gains `turns` and `answers` (every answer), and `usage` is the sum over turns (`sumUsage`). An oracle for
a multi-turn case is `oracle.turns = [{ steps, answer }, …]`, one per request; `oracleSample(c)` replays it, and the
well-formedness test requires one oracle turn per request.

- **a01-undo-change.** "Set the wall to 2.4 mm", then "put the wall back to what it was and make the box 35 mm tall
  instead". The second request depends on the first: "what it was" is 2 mm. Final: wall 2, h 35, volume 17,229.93 mm³.
- **a01-bigger-clarify.** "Make the box bigger", then "80 by 50 mm footprint, same height and walls". The first turn
  is ambiguous; the agent may ask or guess. Whatever it did, the final state must be 80 × 50 × 30 with 2 mm walls
  (volume 21,904.27 mm³). A guess in turn one that the agent does not undo (a taller box, thicker walls) fails.

## 4. Ground truth

Every expected number was computed by compiling the edited files with the engine in Node (`worker.handle`, the same
engine the runner uses), not taken from the preset comments.

| Case | Edit or question | Engine result |
|---|---|---|
| m07-ratio-centre | 18 / 36 teeth, module 2 | ratio 2:1; centre distance m(z₁+z₂)/2 = 54 mm (`j.inspect.gearMesh`) |
| m07-tooth-gap | as published | gap decisions: base–pinion ≈ 0.200, base–wheel ≈ 0.200, pinion–wheel ≈ 0.203 mm |
| m07-wheel-30 | teeth 30 only | `asm.interference`, pinion–wheel ≈ 0.000 mm (trap) |
| | teeth 30 and `deg(180 / 30)` | ok, volume 34,129.47 mm³, pinion–wheel ≈ 0.203 mm; centre 48 mm |
| m09-travel-per-turn | pinion 18 teeth, module 2 | π·m·z = 113.10 mm per turn |
| m08-hinge-clearance | as published | `clearance: 'printInPlace'` → 0.4 mm; info `fit.uncalibrated` |
| h04-decora-size | config us_decora | bbox 69.85 × 114.3 × 7 mm, volume 13,504.54 mm³ |
| h04-switch-toggle | `.config('us_toggle')` | bbox 69.85 × 114.3 × 7 mm, volume 17,062.33 mm³ |
| h01-large | both parts L | volume 189,985.93 mm³, print time 629.7 min, 2 plates |
| | pot only L | volume 166,268.44 mm³ (trap) |
| a01-mount-holes | 4 × Ø3.4 through at (±22, ±12) | volume 15,271.63 mm³ (−72.63), faces 23 |
| a01-engrave | `emboss(text('BOX', 8 mm), 0.6 mm, startFace, cut)` | volume 15,277.39 mm³, faces 88; the check allows 15,200–15,340 (font and placement vary) |
| a03-conflict | planted `.dim('l1', 90)` | `sketch.overConstrained`; repaired: volume 12,672.77 mm³, bbox 80 × 40 × 4 |
| a01-undo-change | wall 2, h 35 | volume 17,229.93 mm³ |
| a01-bigger-clarify | w 80, d 50 | volume 21,904.27 mm³, bbox 80 × 50 × 30 |

## 5. Checks that do not over-constrain

The checks judge outcomes, not the route. `a01-mount-holes` does not demand `.hole(…)`: a `.cut` of four circles
produces the same volume and passes. `a01-engrave` accepts any volume in a band, because the agent may place the text
anywhere on the face and any font size near 8 mm cuts a similar amount. The answer regexes accept the usual ways of
writing a ratio (`2:1`, `1:2`, `ratio of 2`, `twice`) and a decimal comma. Questions in read mode add `unchanged`,
which read mode guarantees anyway; the check documents the expectation.

## 6. Measurement plan

Run all 28 cases × both tiers × 3 repeats on the JIG-004 build (the Promise hint on). Report the harder set
separately from the first 14, per tier and per case, with Wilson intervals, and read every failing run's steps to
classify the failure: the trap, a wrong reading, a tool-use error, a deadline, or a check that was too strict. A check
that rejects a correct answer is a bug in the case, and is fixed before the numbers are reported.
