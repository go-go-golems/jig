---
Title: 'Warnings the agent can read: design and measurement'
Ticket: JIG-009-WARNINGS
Status: active
Topics:
    - agent
    - testing
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: import/jigcad/src/agent/scope.js
      Note: compileResult returns warnings as compact diagnostics
    - Path: import/jigcad/src/engine/features.js
      Note: noEffect hints (emboss-specific, neutral cut), size <= 0 message
    - Path: import/jigcad/src/agent/reference.md
      Note: run() warnings; what a drawing does not show
    - Path: import/jigcad/test/agent-eval/cases/32-w01-a01-hole-misses.json
      Note: planted hole that misses the part
    - Path: import/jigcad/test/agent-eval/cases/33-w02-a01-engrave-negative.json
      Note: a request that asks for the wrong sign
ExternalSources: []
Summary: "run() and check() reported warnings as a count, so the agent never read \"the cut removes no material\"; they now report the text, the engine's noEffect hints are correct for emboss, and two cases measure the effect."
LastUpdated: 2026-11-01T12:01:36.677081317-05:00
WhatFor: ""
WhenToUse: ""
---

# Warnings the agent can read: design and measurement

## 1. Evidence from JIG-006

In a JIG-006 visual run, glm wrote `.emboss(…, mm(-0.6), { on: … })`. The engine warned
`feature.noEffect: engrave: the cut removes no material`. `run()` returned `warnings: 1`. The model explained the
unchanged volume away, looked at the front view, where an imprint looks like an engraving, and reported success.
The warning text never reached the model. `compileResult` in `src/agent/scope.js` computed:

```js
const warnings = ((p && p.diagnostics) || []).filter(d => d.level === 'warning').length;
```

Reading the engine's diagnostics while preparing cases found two more problems:

- The cut's `noEffect` hint said "check its direction and depth …, or flip it with a negative depth". For an emboss
  whose depth is already negative, that is the wrong advice. An agent that reads warnings would be sent further
  the wrong way.
- A zero fillet radius reported `fillet.tooLarge: r = 0 mm is too large for 16 edges`.

## 2. Changes

| Where | Before | After |
|---|---|---|
| `run()`, `check()` | `warnings: 1` | `warnings: [{ level, kind, at, line, message, fix }]`, at most six, then `{ more, see: 'program.diagnostics()' }` |
| emboss with depth < 0 | fix: "… or flip it with a negative depth" | fix: "use a positive depth (mm(0.6)): op: 'cut' already cuts into the face and op: 'join' raises out of it" |
| other cuts with no effect | same text | "check its position, direction and depth: a cut from a sketch plane goes along the plane normal, and a negative depth goes the other way" |
| fillet/chamfer size ≤ 0 | `fillet.tooLarge … too large` | `feature.failed: fillet round: the radius is 0 mm; it must be greater than 0` |
| reference | – | `run()` row: warnings are text; "`feature.noEffect` means a feature changed nothing, even though the program compiles". `look()` row: "A drawing does not show depth or hidden faces … confirm depth with the volume and the warnings" |

The warnings appear only when the program compiles, as before. With errors, the errors carry the information.

## 3. Cases

- **w01-a01-hole-misses.** The setup plants `.hole([[45, 0]], j.hole.simple(mm(5), 'through'), { id: 'mount' })`
  on the 60 mm box: x = 45 lies outside it. The engine compiles it with
  `feature.noEffect: mount: the cut removes no material (it misses every body)`. The request: "I added a 5 mm mounting
  hole through the floor, 20 mm right of the centre, but I am not sure it worked. Check it and fix it if needed."
  Pass: volume 15,305.00 mm³ (hole at x = 20; 20 faces), and an answer that says the original missed.
- **w02-a01-engrave-negative.** "Engrave the text JIG, 10 mm tall, into the outside of the front face (the −Y side).
  Use a depth of -0.6 mm so the cut goes into the wall." Following the instruction produces the JIG-006 failure. Pass:
  volume in 15,200–15,335 mm³ (a real engraving; the engine gives 15,269.27 for 0.6 mm cut).
- m07-tooth-gap now asks for "the smallest gap … as the interference check measures it" (the JIG-006 ambiguity).

## 4. Measurement

- **Before**: a worktree at a9d2d07 (warnings as a count, the old hints) with the two new cases copied in;
  w01 and w02 × 2 tiers × 3 repeats.
- **After**: the same on 6fee355.
- **Regression**: all 33 cases once per tier on 6fee355 with `--look chrome`.

## 5. Results

Prompt size: 55,867 → 56,184 characters (+317, the reference rows).

### 5.1 The warning cases (2 tiers × 3 repeats)

| Case | default before → after | complex before → after |
|---|---|---|
| w01-a01-hole-misses | 3/3 → 3/3 | 3/3 → 3/3 |
| w02-a01-engrave-negative | 1/3 → 3/3 | 2/3 → 2/3 (3/3 recorded) |
| total | 4/6 → 6/6 | 5/6 → 5/6 |

| Mean per run | default before → after | complex before → after |
|---|---|---|
| tools | 9.2 → 7.7 | 10.0 → 10.0 |
| seconds | 32.7 → 15.4 | 115.1 → 98.1 |
| w02 tools | 15.0 → 9.3 | 14.7 → 13.0 |

- **Before, w02 failed three ways.** Default #1 found the warning only through a late `program.diagnostics()` call. It added `op: 'cut'` but kept `mm(-0.6)`, ended at 15,344.27 mm³ (the unengraved box) and reported done. Default #2 raised the text out of the face (bbox height 35.18) and said so. Complex #3 spent all 15 tool calls on `check()` variants and never edited the file. Five of the six w02 runs used all 15 tool calls.
- **After, the warning arrives in the `run()` result** in five of the six w02 runs. The answers quote the fix ("the workbench suggests a positive depth with op: 'cut'"). Every final file uses `mm(0.6)` with `op: 'cut'`.
- **A false pass.** After complex #3 replaced `text('JIG'` with `text('F'` to probe face counts and stopped. Its answer said so: "the script on disk right now reads 'F', not 'JIG'". The check `contains: "JIG"` matched the agent's comment `// engrave JIG into the front (-Y) face`. The check now reads `matches: text\(\s*['"`]JIG['"`]` (9c511a6), and the run counts as a failure. The failure is not about warnings: the agent read the warning and used the right depth.
- **w01 does not discriminate.** "I am not sure it worked. Check it" makes every model read the diagnostics, so the warning reached them before the change too.

Three repeats are a small sample. The w02 default change, 1/3 → 3/3, together with the tool counts, is consistent with the warning text changing behaviour. It is not a precise effect size.

### 5.2 Regression, all 33 cases, once per tier, `--look chrome`

| Tier | Passed | Tools | Seconds |
|---|---|---|---|
| default (glm-5.3-flash) | 32/33 → 33/33 with one replacement | 4.7 | 13.2 |
| complex (deepseek-4.1-flash) | 33/33 | 6.5 | 45.1 |

The one failure, default a03-fix-dof, was `upstream_error` ("The model provider request failed") after two tool calls. A replacement run passed (5 tools, 8.8 s; `runs/2026-11-01-after-full-replacement`). Both w02 runs in the full set passed and saw the warning, with no probe edits.

## 6. Conclusions

- Return the content of warnings to the model, not a count. The cost is 317 characters of reference text and a few hundred tokens when there are warnings. The benefit shows where a request leads straight into the warned condition.
- Audit hint text before exposing it, because the hint becomes advice the model follows.
- Grade the location of a string, not its presence anywhere in the file.
