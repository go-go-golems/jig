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

## 7. Results

### 7.1 Runs

| Run | What | Records |
|---|---|---|
| `various/runs/2026-11-01-hard-baseline` | 28 cases × 2 tiers × 3 repeats from a worktree at 3d29c04 (JIG-004 build, no JIG-006 prompt change), `jigcad serve` on the JIG-004 binary | 168 |
| `…/results.rescored.jsonl` | the same records, answer checks re-evaluated after the check fixes (§7.3) | 168 |
| `various/runs/2026-11-01-clarify-rerun` | `a01-bigger-clarify` with its corrected follow-up, both tiers × 3 | 6 |
| `various/runs/2026-11-01-ratelimit-replacements` | one new run for each deepseek record that ended `rate_limited` and failed | 4 |

`scripts/01-analyze.py` merges them: the rerun replaces the corrected case, and each replacement takes the place of one
rate-limited record. As recorded, before any correction, the baseline was 77/84 on both tiers.

### 7.2 Pass rates after correction

| Tier | Set | Passed | 95 % CI | Tool calls mean (max) | Seconds median (max) |
|---|---|---|---|---|---|
| default (glm-5.3-flash) | first 14 | 42/42 | 92–100 % | 3.2 (7) | 6.4 (58.5) |
| default | harder 14 | 40/42 | 84–99 % | 5.6 (18) | 10.7 (137.4) |
| complex (deepseek-4.1-flash) | first 14 | 42/42 | 92–100 % | 4.5 (12) | 27.1 (182.1) |
| complex | harder 14 | 42/42 | 92–100 % | 7.7 (16) | 68.4 (166.7) |

The harder set costs more (about 1.7× the tool calls of the first set on both models) but does not separate the models
by pass rate. The aim of §6, pass rates below 100 %, was met only for glm, and only by two runs.

### 7.3 Every failure, classified

| Record | Recorded | Class | Action |
|---|---|---|---|
| default #1, #3 m09-travel-per-turn | answer missing `113…mm` | **check bug**: `113.097\ \text{mm}` in LaTeX | `plainAnswer()` normalises LaTeX and markdown before answer regexes; rescored PASS |
| default #3 a03-dof-question | answer missing `1 DOF` | **check bug**: `$$\text{DOF} = 22 - 21 = 1$$ … only center.x is free` | pattern `DOF…= 1` added; rescored PASS |
| all 6 a01-bigger-clarify | bbox 80 × 50 × 40/45 | **case bug**: after the model guessed a height in turn one, "same height" meant the guessed height | follow-up now "Keep the original 30 mm height"; rerun 5/6 |
| complex a01-undo-change #2, a01-readonly-refuse #3, m07-wheel-30 #3, h04-switch-toggle #3 | answer `Thinking…`, files mid-edit | **infrastructure**: lunaroute `rate_limited` mid-turn (6 of 84 deepseek runs hit it; two still passed) | one replacement run each: 4/4 |
| default h01-large #3 | config still M | **model**: computed L with `check()`, saw 2 plates, cited the brief's `plate` fragment ("report the plate count and suggest a smaller saucer flare") and never applied the edit | none: a genuine failure (the brief asks to report, not to refuse) |
| default a01-bigger-clarify #2 (rerun) | bbox 90 × 60 × 45 | **model**: in turn two the answer *contains* `[eval] files.edit(…) → ok … volume: 23216.565` as text; no tool call was made, the result is invented | none: a genuine failure (tool call written as text, result hallucinated) |

Six of the eight failure classes in the uncorrected numbers were the harness's or the infrastructure's, not the
models'. Reading every failing record before counting remains the rule.

### 7.4 Why the traps did not catch the models

- **The presets document their own traps.** M-07's script says, above the joint: "The wheel's joint starts at 5°,
  half a tooth, so a pinion tooth sits in a wheel gap." Every m07-wheel-30 run changed the phase, most of them within
  the first three steps; two glm runs saw `asm.interference` first and recovered. H-01's header says "a config changes
  all of them"; all passing runs changed both parts. The models read the script before editing, and the comments
  teach them. A trap in a well-commented preset is a reading test, and both models read.
- **The diagnostics are explicit.** a03-conflict's solver error names the conflicting pair; every run removed the
  planted `.dim('l1', 90)`.
- **The refusal was easy.** "Make the mounting holes 1 mm bigger" on a box without holes: 6/6 said there are none.

### 7.5 What the set does show

- **No clarifying questions.** Given "Make the box bigger", 12 of 12 runs (baseline and rerun) guessed a size
  (90 × 60 × 50, 80 × 60 × 40, 1.5× …) instead of asking. The checks cannot see this, because the follow-up fixes the final state.
- **Two genuine failure modes on glm**: an instruction from the preset brief read as a reason not to act, and a tool
  call written into the answer as text with an invented result. The second is the more dangerous: the answer
  reports success, with numbers, for an edit that never happened.
- **Cost**: deepseek's harder-set median of 68 s includes rate-limit waits and a slow backend hour; its tool calls (7.7
  mean) are the more stable measure.

### 7.6 Next cases

To get below 100 %, cases need what the scripts do not explain: presets without comments (strip them in `setup`),
requests that need a feature the reference documents but no preset uses, longer conversations (five turns with
corrections), and checks on behaviour the checks now ignore, such as `stepCode` or answer checks requiring a question
when the request is ambiguous. A check for "the answer claims an edit that the files do not show" would catch the
text-as-tool-call failure directly.
