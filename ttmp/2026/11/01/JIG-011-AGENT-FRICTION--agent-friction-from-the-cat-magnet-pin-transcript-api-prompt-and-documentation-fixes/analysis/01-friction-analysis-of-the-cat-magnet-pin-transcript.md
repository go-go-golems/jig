---
Title: Friction analysis of the Cat magnet pin transcript
Ticket: JIG-011-AGENT-FRICTION
Status: active
Topics:
    - agent
    - api
    - docs
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "The Cat magnet pin transcript (deepseek-4.1-flash, complex tier, 14 steps for the build, then two reflective turns) shows where the agent lost time: no way to try builder expressions, check() cannot report values, whole scripts re-pasted into check(), no view of the bed face, two engine inconsistencies (lib.magnet direction, fit.hole with a param name in params). Each finding is checked against the code; the network error that ended the build was my page reload."
LastUpdated: 2026-11-01T17:03:39.469497444-05:00
WhatFor: ""
WhenToUse: ""
---

# Friction analysis of the Cat magnet pin transcript

Source: `sources/01-cat-magnet-pin-transcript.md`, downloaded from the workbench with the new Download button.
Thread "Create a configurable Cat magnet", preset D-03 open, then U-01 created; complex tier (deepseek-4.1-flash),
thinking medium, mode auto. Four exchanges:

1. "Create a configurable Cat magnet pin in a new preset": 14 steps, 246 s, 632k input tokens, then
   *Interrupted: network error*.
2. "Make the walls 2.4 mm and check the mass": my accidental test message, stopped after 3 steps.
3. "What do you think would have been useful APIs…": the agent probes 5 steps and answers.
4. "would you like … a workspace …": 2 more probes and an answer.

Every finding below was checked against the code (`scripts/01-probe-findings.mjs` compiles the probes in Node on
the real engine). Claims the agent made that the evidence does not support are marked.

## 0. The interruption was not jigcad

The server log has the build call as `jc27c46ba800bb9c5487ed2aac … tools=14 … ms=246251 outcome=cancelled` at
16:39:30 EST. My Playwright `browser_navigate` to the workbench happened at 16:39:30.8 EST, in the same browser
the person was using. The reload closed the stream; Chrome reported it as `network error`. No product change.

## 1. Findings, by where the fix belongs

### Engine

| # | Finding | Evidence | Fix |
|---|---|---|---|
| E1 | `j.lib.magnet` cuts its pocket upward from its origin (z 0 → h + 0.2), `j.lib.dowel` cuts downward into the surface (−depth → 0). Placed on the top face, the magnet misses. | step 4: `C … warnings: magnet: the cut removes no material`. Probe: magnet at `z = t` → volume unchanged, `feature.noEffect`; at `z = 0` it pockets the bed face; dowel at `z = t` cuts the top. `src/engine/lib.js:57–70`. | One convention for cutters: into the surface from the placement point (like dowel). Document it in the lib reference. A noEffect hint for lib cutters: "the pocket goes up from its placement; place it on the face it cuts into". |
| E2 | `j.fit.hole('md', 'press')` inside `.params()` fails with `mm(…) takes a number, got NaN`; the same call as a feature argument works. | steps 6–10; probe `fit name parm` fails, `fit name feat` ok. `lazyFit` resolves a param name only when `CURRENT_LEN` is set (`src/engine/fit.js:55`), which it is not while params resolve. | Resolve param names in params too, or reject with "j.fit.hole: a param name works in a feature, not in .params(); write 'md + 2 * gap.press'". The NaN message names neither the call nor the cause. |
| E3 | `'md + 2 * gap.press'` works in a param expression, and is the answer the agent found by trial (steps 9–11). | probe `gap.press` ok. | Document it in the fit row of the reference, with the hole compensation (`+ 0.1 mm` default). |

### The agent's tools (lab scope)

| # | Finding | Evidence | Fix |
|---|---|---|---|
| T1 | `j` is not defined in an eval step, so the agent cannot try a builder expression (`j.fit.hole(...)`, `j.lib.magnet(...)`) without wrapping it in a whole part and `check()`. | step 6: `ERR j is not defined` ×3. | Put `j` (and `mm`, `deg`, `lw`, `layer`) in the eval scope for inspection; values print through the YAML formatter. |
| T2 | `check()` cannot return a value computed in the script. The agent encoded answers in geometry (bbox width 20 vs 10) or in a thrown error message (`throw new Error('KEYS ' + …)`). | step 7 comment "the returned value is not surfaced by check"; reflective turns steps 3–4 and workspace step 1. | Capture `console.log`/`log` inside a compiled script and return it as `logs` from `check()` and `run()`. |
| T3 | The agent re-pasted the whole ~60-line script into `check()` five times (steps 3, 4, 5, 12, 13) before the preset existed, and edited the person's file to look at the other side (step 14). | the steps. | Prompt guidance (P1) plus `check(edits)`: `check({ replace: [[old, new], …] })` against the current files. |
| T4 | `look()` has axo, front, side and plan; nothing shows the bed face, where the engraving was. The agent rewrote `script.js` to flip the part, looked, and restored. | step 14; `LOOK_VIEWS` in `src/agent/scope.js:432`. | A `bottom` view (and `back`), or `look(view, { from: '-Z' })`. A section view would separate an engraving from an imprint. |
| T5 | `summary` has no part name or kind; the agent tried `summary.name`. | reflective step 3. | Add `name` and `kind` to the summary. |
| T6 | `globalThis` survives between steps (the agent verified it), but the reference says only that `const`/`let` do not carry over. | reflective steps 1–4. | Document a supported place for helpers between steps (`keep.x = …`), cleared with the thread. |

### Files and presets

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | A nested file reaches the script flattened to its basename: `lib/cat.js` → `data['cat.js']` and `data['cat']`; `data['lib/cat.js']` is undefined. Two `util.js` in different folders collide. | workspace step 1: `KEYS ["cat.js","cat","faceup.js","faceup"]`. | Key `data` by path (keep the basename alias only when unique). |
| F2 | A `.js` file other than `script.js` is data: a string the script has to `new Function`. The agent proposes a code lane, `lib/*.js` imported as modules. | reflective step 5, workspace answer. | Design decision (see §3). |

### Prompt and reference

| # | Finding | Fix |
|---|---|---|
| P1 | The agent drafted entirely in `check()` strings for 12 steps before creating the preset. | "For a new design, create the preset early (`presets.create`) and iterate with `files.edit` + `run()`; use `check()` for alternatives, not drafts." |
| P2 | The fit row does not say how to size a pocket from a param in an expression. | E3. |
| P3 | Library cutters' placement convention is not stated. | E1. |
| P4 | Print settings (walls, infill) are slice options, not params; "make the walls 2.4 mm" on a solid part has nowhere to go. The agent priced alternatives (floor 2.4 mm → 11.44 g) and asked; a sentence in the prompt about slice settings vs geometry would save the exploration. | Reference sentence; whether `.slice()` should read params is a design question. |

### A wrong claim by the agent

The agent's answer says `j.lib.magnet` "cut nothing … and said so with silence". Step 4's result shows the
warning `magnet: the cut removes no material`. The warning text from JIG-009 reached it; it misremembered three
turns later.

## 2. What the measurements say about cost

The build used 14 steps and 246 s; 632k input tokens with 571k cached. Seven steps (3–4, 6–11) went to probing
three things that a reference line or an inspectable `j` would have answered: whether expression coordinates work
in regions, how to size a press-fit pocket from a param, and whether `j.lib.magnet` fits. Two steps (12–13) were
the draft and the preset. Step 14 was the bed-face view.

## 3. Proposed order

1. Engine E1 and E2, reference P1–P3, `j` in the eval scope (T1), script logs from `check()` (T2), `bottom` view
   (T4), summary name (T5). Small, local, measurable with a case built from this transcript ("create a magnet pin
   preset"): steps and time before and after.
2. `check({ replace })` (T3), `data` keyed by path (F1), a documented `keep` (T6).
3. Design questions for the person: a code lane for `lib/*.js` (F2), and print settings as params (P4).
