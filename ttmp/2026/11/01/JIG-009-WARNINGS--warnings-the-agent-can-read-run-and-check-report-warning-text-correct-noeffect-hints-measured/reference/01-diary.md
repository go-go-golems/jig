---
Title: Diary
Ticket: JIG-009-WARNINGS
Status: active
Topics:
    - agent
    - testing
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-01T12:01:36.800492156-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Step 1: Warnings as text, hints that point the right way, two cases

JIG-006 recorded a visual run where the model engraved text with a negative depth. The engine warned that the cut
removed nothing, but `run()` returned only `warnings: 1`, and the model reported success. This step makes `run()` and
`check()` return the warning text. It corrects the engine's `noEffect` hint, which for a negative-depth emboss gave
the opposite advice. It also adds two cases built around a planted warning.

### Prompt Context
**User prompt (verbatim):** "continue also make stl etc.. export work. you can kill / restart the old instance"
**Assistant interpretation:** "continue" means taking the recommended next step from the JIG-006 report, warnings the agent can read, measured. Exports went to JIG-008.
**Inferred user intent:** Keep improving the agent on evidence, with measurements.
**Commit (code):** 6fee355

### What I did
- `src/agent/scope.js` `compileResult`: `warnings` is a list of compact diagnostics (`level, kind, at, line, message, fix`), at most `WARNINGS_SHOWN = 6`, then `{ more, see: 'program.diagnostics()' }`.
- `src/engine/features.js`: the cut's no-effect fix takes `hints.noEffectFix`. Emboss with depth < 0 passes "use a positive depth (mm(0.6)): op: 'cut' already cuts into the face and op: 'join' raises out of it". The default no longer suggests a negative depth. Fillet and chamfer reject sizes ≤ 0 with "must be greater than 0".
- `src/agent/reference.md`: run() and look() rows (see design doc §2).
- Cases 32-w01-a01-hole-misses and 33-w02-a01-engrave-negative. m07-tooth-gap reworded.
- `test/agent/scope.test.mjs`: warnings as text, capped at six.

### Why
- A count tells the model that something is wrong but not what. The text, with a correct fix, is what changes behaviour.

### What worked
- The oracle passes for both cases. Scope tests pass, and the engine suites are unchanged.

### What didn't work
- My first reading of the engine's hint ("… or flip it with a negative depth") showed it would have sent the w02 agent further the wrong way. That had to be fixed before the warnings were exposed.
- `fillet(0)` reported `fillet.tooLarge: r = 0 mm is too large for 16 edges`.

### What I learned
- Exposing a message means taking responsibility for its advice: the hint text became part of the agent's prompt.

### What was tricky to build
- A fair "before". The before run needs the old scope and the old engine hints, but the new cases. It runs from a worktree at a9d2d07 with the two case files copied in.

### What warrants a second pair of eyes
- The cap of six warnings: programs with many fragile references can produce more. The `{ more, see }` entry names the full list.

### What should be done in the future
- Other diagnostics with fix text deserve the same audit for wrong advice.

### Code review instructions
- `node --test test/agent/scope.test.mjs`. `node tools/agent-eval.mjs --oracle --cases w0`.

## Step 2: Before and after on the two warning cases

Both runs used w01 and w02, two tiers (glm-5.3-flash, deepseek-4.1-flash), three repeats each. Before: 9/12. After:
12/12 by the recorded checks, and 11/12 after I found a false pass and corrected the check.

### What I did
- Before: `node tools/agent-eval.mjs --tiers default,complex --repeat 3 --cases w0` in the a9d2d07 worktree → `various/runs/2026-11-01-before`. After: the same on 6fee355 → `…-after`.
- A per-run script counted tool calls, `run()` calls, `program.diagnostics()` calls and steps whose result contains `noEffect`, and read each w02 answer.

### What worked
| | default (glm) | complex (deepseek) |
|---|---|---|
| w01 before → after | 3/3 → 3/3 | 3/3 → 3/3 |
| w02 before → after | 1/3 → 3/3 | 2/3 → 3/3 (2/3 corrected) |
| w02 tools before → after | 15.0 → 9.3 | 14.7 → 13.0 |
| default tier seconds | 32.7 → 15.4 | 115.1 → 98.1 (complex) |

- Before, the w02 failures were: default #1 ended at volume 15,344.27, the unengraved box. It found the warning only through a late `program.diagnostics()`, added `op: 'cut'` while keeping `mm(-0.6)`, and reported done. Default #2 raised the text out of the face (bbox z 35.18) and said so. Complex #3 ran out of tool calls before editing the file.
- Five of the six w02 runs before used all 15 tool calls. After, the default tier needed 9 or 10.
- After, five of the six w02 runs saw `noEffect` in a `run()` result, and the answers quote the hint ("the workbench suggests a positive depth with op: 'cut'").

### What didn't work
- After complex #3 passed with the wrong text. To test a suspicion it replaced `text('JIG'` with `text('F'` and stopped. Its answer said so plainly ("the script on disk right now reads 'F', not 'JIG'"). The file check `contains: "JIG"` matched the agent's comment `// engrave JIG into the front (-Y) face`. I changed the check to `matches: text\(\s*['"`]JIG['"`]` (commit 9c511a6). The oracle still passes. The recorded verdict is corrected by hand to FAIL in the analysis: `rescore.mjs` can re-score only answer checks, because the record does not hold the final file.
- w01 does not separate before from after: the request ("I am not sure it worked. Check it") makes every model read the diagnostics anyway.

### What I learned
- The warning text changes behaviour when the request does not already prompt for a check (w02). When the request does prompt for one (w01), models find the warning through `program.diagnostics()` either way.
- A check for "the file contains X" must name where X belongs.

### What warrants a second pair of eyes
- Three repeats per tier are small samples: the w02 default change, 1/3 → 3/3, is suggestive, not conclusive. The tool-count change is the steadier signal.

### Technical details
- Runs: `various/runs/2026-11-01-{before,after}/` (results.jsonl, summary.md, meta.json).

## Step 3: The full regression and closing

The full run (33 cases × 2 tiers, `--look chrome`, on 6fee355) passed 65 of 66. The one failure was a provider error. A
replacement run passed.

### What I did
- `node tools/agent-eval.mjs --tiers default,complex --repeat 1 --look chrome --out …/2026-11-01-after-full`.
- Replacement: `--tiers default --cases a03-fix-dof` → `…/2026-11-01-after-full-replacement` (PASS, 5 tools, 8.8 s).
- Rescanned the full run's w02 records for probe edits: none, and both saw `noEffect`.
- Design doc §5 Results and §6 Conclusions.

### What worked
- default 32/33 (33/33 with the replacement), complex 33/33.

### What didn't work
- a03-fix-dof default: `sampleError: { code: 'upstream_error', message: 'The model provider request failed. Retry or choose another model.' }` after `files.grep` and `files.read`.

### What I learned
- The full run started at 12:27, before the JIG-010 edits (12:35). Node had loaded its modules by then, so the edits did not affect it.

### Code review instructions
- Design doc §5. The runs are in `various/runs/`.
