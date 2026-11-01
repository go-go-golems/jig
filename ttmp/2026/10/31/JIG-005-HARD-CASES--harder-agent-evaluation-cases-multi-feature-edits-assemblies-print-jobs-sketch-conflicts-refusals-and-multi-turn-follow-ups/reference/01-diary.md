---
Title: Diary
Ticket: JIG-005-HARD-CASES
Status: active
Topics:
    - agent
    - llm
    - testing
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/test/agent-eval/cases
      Note: cases 15–28
    - Path: repo://import/jigcad/tools/agent-eval/runner.mjs
      Note: followUps, sumUsage, oracleSample
    - Path: repo://import/jigcad/tools/agent-eval/checks.mjs
      Note: plainAnswer
    - Path: repo://import/jigcad/tools/agent-eval/rescore.mjs
      Note: re-evaluate answer checks of recorded runs
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T22:50:25.767688086-04:00
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

## Step 1: Ground truth, fourteen harder cases with traps, multi-turn runner (commit fb629fc)

I computed every expected number on the engine before writing a case: gear centre distances, config volumes, the
volume of four holes, an engraving and a repaired sketch, and what the naive edit produces for each trap. The runner
gained `followUps` for conversations. All 28 oracles pass, and a new test shows that the naive edits fail the trap
cases.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1 ("Do 1, 2, 3, 4. …").
**Assistant interpretation:** Item 2: a harder case set with pass rates below 100 %: multi-feature edits, gears and print jobs, assemblies, sketch conflicts, refusals, multi-turn follow-ups.
**Inferred user intent:** A case set that separates models and catches regressions.
**Commit (code):** fb629fc — "JIG-005 phase 1: multi-turn cases (followUps), 14 harder cases with engine ground truth and traps"

### What I did
- Scratch scripts (`truth3–6.mjs`) compiling variants with `worker.handle` in Node: M-07 with `teeth: 30` alone → `asm.interference`, pinion–wheel ≈ 0.000 mm; with `deg(180 / 30)` → ok, volume 34,129.47, gap 0.203 mm. H-01 both parts L → 189,985.93; pot only → 166,268.44. H-04 `us_decora` / `us_toggle` → 69.85 × 114.3 × 7, volumes 13,504.54 / 17,062.33. A-01 four Ø3.4 holes → 15,271.63, faces 23; engraving `BOX` → 15,277.39; A-03 planted `.dim('l1', 90)` → `sketch.overConstrained … length(l1) = 80 mm · length(l1) = 90 mm`.
- A first attempt at H-04 configs failed: `H04 euro false … compile.failed` for every name I guessed; the rows are `eu86`, `us_decora`, `us_toggle`.
- Cases 15–28 (generator script, then JSON), each with an oracle; `followUps` and `oracle.turns`.
- Runner: requests run in one thread; `turns`, `answers`, usage summed (`sumUsage`); `oracleSample(c)` shared by the CLI and the tests.
- Tests: "the harder cases reject the naive edit" (m07-wheel-30, h01-large, a03-conflict) and the multi-turn record; 13/13.
- Design doc §1–6.

### Why
- Expected values from the engine, not from preset comments: a case with a wrong expectation measures the case.

### What worked
- `node tools/agent-eval.mjs --oracle --cases …` → 14 × PASS; harness 13/13.

### What didn't work
- The H-04 config guess above.

### What I learned
- M-07's teeth are literals in `j.lib.gear.spur({ teeth: 36 })`, not params, so checks use the file and metrics, not `param`.

### What was tricky to build
- Traps that compile: the naive h01 edit compiles and is wrong only in volume, so the check had to be the volume.

### What warrants a second pair of eyes
- `a01-engrave` checks a volume band (15,200–15,340) rather than a value, because font size and placement may vary.

### What should be done in the future
- N/A.

### Code review instructions
- `node --test test/agent-eval/harness.test.mjs`.

### Technical details
- Ground-truth table: design doc §4.

## Step 2: Check fixes found by real answers (commits c4d8a5d, 3e326ad)

Real answers broke three answer checks, and the cause was the same each time: models write numbers in LaTeX. Rather
than loosening regexes one by one, the `answer` check now matches a plain form of the answer. A rescore tool applies
corrected checks to recorded runs without new model calls. One multi-turn case was ambiguous and was reworded.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1.
**Assistant interpretation:** Fix the case set where it rejects correct answers.
**Inferred user intent:** Pass rates that measure models.
**Commit (code):** c4d8a5d, 3e326ad

### What I did
- c4d8a5d: `a01-volume-readonly` (mass `$19.03\ \text{g}$`) and `s01-orientation` ("printed on its side") loosened.
- 3e326ad: `plainAnswer()` in checks.mjs (`\text{…}` → content, `\cdot` → ·, `\ ` → space, `$` and `**` removed, `{:}` → :); `tools/agent-eval/rescore.mjs`; `a01-bigger-clarify` follow-up reworded.
- Later: `a03-dof-question` gained `DOF[^\n]{0,30}=\s*1\b` and `not fully constrained`.

### Why
- A normalisation fixes the class; per-regex fixes would keep failing on the next model's formatting.

### What worked
- `plainAnswer('$$\\pi \\cdot 2\\ \\text{mm} \\cdot 18 = 113.097\\ \\text{mm}$$')` → `π · 2 mm · 18 = 113.097 mm`; harness 15/15.

### What didn't work
- `FAIL default #1 m09-travel-per-turn · answer: missing /113([.,][01]\d*)?\s*mm/` with the answer `… = 113.097\ \text{mm}`.
- `FAIL default #1 a01-bigger-clarify · metric: bbox [80, 50, 40] ≈ [80, 50, 30]`: the model guessed 80 × 60 × 40 for "Make the box bigger", then "same height and walls" kept 40.

### What I learned
- A follow-up must fix the final state independently of what the agent did in earlier turns; otherwise the case tests my wording.

### What was tricky to build
- Rescoring only what the record can support: non-answer checks need the final program, so they keep their verdict.

### What warrants a second pair of eyes
- `plainAnswer` removes `$` everywhere; an answer about dollars would lose its currency sign (no case asks about cost in USD).

### What should be done in the future
- N/A.

### Code review instructions
- `node tools/agent-eval/rescore.mjs <results.jsonl>`.

### Technical details
- Rescore prints per-tier totals and every verdict that changed.

## Step 3: The baseline: harder costs more, but both models pass

168 turns ran from a worktree at 3d29c04 to keep JIG-006's reference change out of the prompt. After rescoring,
rerunning the corrected case and replacing rate-limited runs, glm passes 40/42 on the harder set and deepseek 42/42.
The traps did not work because the presets' comments explain them. Two genuine glm failures were found, one of
them dangerous: a tool call written into the answer as text, with an invented result.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1.
**Assistant interpretation:** Design §6: run, classify every failure, report.
**Inferred user intent:** Know where the agent fails.
**Commit (code):** the commit that adds this step.

### What I did
- `git worktree add $S/wt005 HEAD`; copied `src/generated/content.json`, the OCCT wasm and `dist/jig_compute.wasm`; `--oracle` 28/28; then `node tools/agent-eval.mjs --tiers default,complex --repeat 3 --out …/2026-11-01-hard-baseline` (about 75 minutes).
- Rescored; read every failing record's answers and last steps; reran `a01-bigger-clarify` (6) and the four rate-limited failures (4) from the worktree with the corrected case and checks copied in.
- `scripts/01-analyze.py`; a step scan for trap evidence (interference, phase fix, config edits, the solver diagnostic).
- Design doc §7.

### Why
- Replacement runs rather than dropping rate-limited records: dropping would bias the sample toward short turns.

### What worked
- Summary as recorded: `default … 77/84 … ok 84`; `complex … 77/84 … ok 78, rate_limited 6`.
- After correction: default first 42/42, harder 40/42 (CI 84–99 %); complex first 42/42, harder 42/42.
- Trap scan: m07-wheel-30 phase fix at steps 1–3 in most runs; interference seen and recovered in glm #2 (step 10) and #3 (step 1).

### What didn't work
- 6 of 84 deepseek runs ended `rate_limited`; one replacement run (h04-switch-toggle) hit it again but had already finished the edit.

### What I learned
- The traps are documented in the presets ("The wheel's joint starts at 5°, half a tooth…"; "a config changes all of them"). The models read the script first, so a commented trap tests reading, which they do well.
- 12 of 12 runs guessed a size for "Make the box bigger"; none asked.
- glm h01-large #3 turned the brief's `plate` fragment ("report the plate count and suggest a smaller saucer flare") into a reason not to apply L.
- glm a01-bigger-clarify #2 (rerun) wrote `[eval] files.edit('script.js', …) → ok: true … volume: 23216.565` into its answer and made no tool call; the files stayed at 90 × 60 × 45.

### What was tricky to build
- Keeping the prompt fixed while correcting cases: the worktree got only the case and check files, not the JIG-006 source.

### What warrants a second pair of eyes
- Deepseek's seconds are inflated by rate-limit waits; compare tool calls, not seconds, across these runs.

### What should be done in the future
- Cases with comments stripped, five-turn conversations, an answer-claims-edit check, and a "should ask" check for ambiguous requests (§7.6).

### Code review instructions
- `python3 scripts/01-analyze.py various/runs/2026-11-01-hard-baseline/results.rescored.jsonl --replace various/runs/2026-11-01-clarify-rerun/results.jsonl various/runs/2026-11-01-ratelimit-replacements/results.jsonl`.

### Technical details
- The worktree at `$S/wt005` is scratch; the results live under `various/runs/`.
