---
Title: Diary
Ticket: JIG-018-RT
Status: active
Topics:
    - rendering
    - gpu
    - build
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T19:31:39.681490239-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1: the ticket, written as a handoff

This ticket hands the GPU half of jig's rendering to the engineer with the DGX Spark. It covers items 1–5 of JIG-017's next phase, plus checking JIG-017's untested native parts. No code was written: the user stopped the implementation so all of it can be delegated.

### Prompt Context
**User prompts (verbatim):**
- "do we hae a ticket for 2-5 ? so i can give it to my colleague with the spark?"
- "yeah don't continue, we're going to delegate to the dgx spark dude"

**Assistant interpretation:** no implementation here. Write a self-contained ticket covering T0 (build check), T1 (scope, a prerequisite of the OptiX mode), and T2–T5 (OptiX Render view, GPU jobs, remote GPU, release package).

### What I did
- Created JIG-018-RT on branch `jig-018-rt`, which is stacked on `jig-017-candela`, PR #6.
- Wrote `design-doc/01-handoff-…`:
  - where things stand;
  - how jig renders, from candela-rt's point of view (the scope, RenderHost's hook points with line numbers, `/rt` authentication);
  - tasks T0–T5, each with files, a sketch and a done criterion;
  - conventions.
- Added the six tasks to `tasks.md`.
- Checked the doc's claims against the code:
  - `serve.cpp` builds `opts` without a scope (around line 197);
  - `openRender` calls `s.build(files)` with no options (`headless.ts:89`);
  - jig's `candela.js` re-exports all of `core.ts`, including `digestString`;
  - the render job loop is `main.cpp`'s `cmdRender` (line 318).

### What warrants a second pair of eyes
- **T3 and T4 are recommendations, not decisions.** The `--jobs-dir` shape for T3 and the URL mode of `--render` for T4 are for the implementer to confirm or change.
