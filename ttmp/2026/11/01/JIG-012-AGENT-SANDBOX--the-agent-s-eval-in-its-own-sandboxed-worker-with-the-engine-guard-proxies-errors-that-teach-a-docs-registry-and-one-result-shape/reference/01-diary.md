---
Title: Diary
Ticket: JIG-012-AGENT-SANDBOX
Status: active
Topics:
    - agent
    - api
    - sandbox
    - docs
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-01T17:23:01.136429142-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Step 1: Research, design and the intern guide

The person asked for improvements to the jig API as the agent meets it, with feedback through proxies and ad-hoc
help, and pointed at three earlier workbenches. I read Form Skate's and Kiln's evaluators in isolated folders and
factory-videos' agent tickets on bling, counted API-misuse errors across every recorded run, and wrote an intern
guide that explains the current system and the JIG-012 design. The person chose option B (a sandboxed worker with its
own engine) straight away, guards in scripts too, result-shape changes without compatibility, and measurement first.

### Prompt Context
**User prompt (verbatim):** "1. do B straightaway.
2. yes
3. yes, no backwards compatibility needed in any sense
4. yes

Create a new docmgr ticket if you haven't already, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Then mplement"
Later: "commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
**Assistant interpretation:** New ticket JIG-012 for the implementation (JIG-011 stays the analysis); a long intern guide; reMarkable upload; then phases 0–5 with commits and this diary.
**Inferred user intent:** An agent API that teaches through errors and gives the model the language directly, built and measured.

### What I did
- Read Form Skate (`app/host.js` labScope, `app/ui/agent.jsx`, `src/core.js`), Kiln (`apps/workbench/src/agent/{sandbox,frame,encode,inspect,gateway,agent}.js`, `agent-guidelines.txt`, `reference.txt`, `build.mjs`) from zips extracted into the scratchpad; nothing was run.
- On bling, read factory-videos FACTORY-AGENTERR-001 (§5–6), AGENTERR-002 (§4.5, diary steps 9–10), JSDRILL-001, REPORTFIX-002 Phase 5 and `docs/agent-evaluation-playbook.md`.
- Counted misuse errors in all 11 `results.jsonl` files: 517 runs, 2,697 steps; `j is not defined` 73, `mm is not defined` 39, unawaited promises 83, `undefined.volume` 15, `b.faces.map` 9; 182 runs (35 %) affected.
- Read the code the design touches: `evaltool.js`, `scope.js`, `worker.js`, `host.js` engine calls, `engine.js`, `oc.js` and `rs/wasm.js` (both accept wasm bytes), `build.mjs`, `node-engine.mjs`, server headers (no CSP).
- Created JIG-012, wrote the guide (`design-doc/01-…`, 585 lines), uploaded it: `OK: uploaded JIG-012 Agent sandbox intern guide.pdf -> /ai/2026/11/01/JIG-012`.
- Started the baseline batch from a frozen worktree at b560730 (`$S/wt012-base`): 33 cases × 2 tiers, `--look chrome` → `various/runs/2026-11-01-baseline`.

### Why
- factory-videos measured that models learn from error messages and rarely read docs; the design orders the work accordingly (errors before docs) and keeps guards on namespaces only.
- Kiln's construction (sandboxed srcdoc frame, CSP, blob worker, one port, allowlisted calls) gives isolation and the language in the worker; jigcad adds a long-lived worker because OpenCascade's start-up is too slow to pay per eval.

### What worked
- The engine already has everything the sandbox needs: `loadOC({ wasmBinary })`, `loadCompute({ computeBinary })`, `runScript`, `compileFiles`, and a `run` op that runs code with `j` in scope.

### What didn't work
- `~/Downloads/kiln-workbench.html` does not exist; the file is inside `kiln-aispe-full.zip` (`kiln/apps/workbench/dist/kiln-workbench.html`); I read the sources instead of the 3.5 MB build.

### What I learned
- The worker keeps one engine per module instance (`J`, `current`), so a second engine needs a second worker (in Node: `worker_threads`).
- A `srcdoc` iframe inherits its parent's CSP; `jigcad serve` sends none, claude.ai does: to be checked there.

### What was tricky to build
- Deciding what runs locally vs on the page: bridged calls keep today's semantics (the person's workbench, its last compile); local calls (`j`, `check()`) never touch it. That keeps `program.*` meaning "the last compile" and gives live objects through `check()`.

### What warrants a second pair of eyes
- Memory of two OpenCascade instances; guards inside `makeJ()` against engine code that probes `j` for optional members.

### What should be done in the future
- Check the sandbox inside claude.ai before release.

### Code review instructions
- Read the guide; the plan is §11.
