---
Title: Diary
Ticket: JIG-013-AWAIT-RULE
Status: active
Topics:
    - agent
    - sandbox
    - api
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-01T18:39:17.772992345-05:00
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

## Step 1: Ticket and intern guide

JIG-012's phase 2 batch showed that unawaited promises are the largest failure class: 31 steps in 29 of 66 runs,
and the only class that grew. A look at the docs explained why. The reference and prompt never say which calls
return a Promise, the prompt writes `run()` and `check()` as if synchronous, and the split between synchronous
and asynchronous calls follows plumbing (which thread holds the Program), not meaning. I created JIG-013 and
wrote the intern guide: a rule ("reading is synchronous; anything that compiles, draws or changes the workbench is
awaited"), synchronous reads in the sandbox from a shadow of the page's program, loud promises for the rest, and
the rule in the docs.

### Prompt context

**User prompt (verbatim):** "Ok, creat ea new docmgr ticket and a design document guide implementationo guide for
the intern, and then implement, commit at appropriate intervals and keep a detailed diary as you work (using the
diary format from the skill)

When done,  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post
using a textbook writing style (no analogies, see skill).
 Commit and push the bsidian vault when done (go-go-parc vault)."

The "Ok" approves the proposal from the conversation just before it, quoted here from my own message: "I'd build
it as one more phase (loud promises, synchronous reads in the sandbox, the docs rule), after the current batch
finishes. Then I'd measure with `--repeat 2`".

**Assistant interpretation:** a new ticket (JIG-013) with a guide, then the implementation in phases with commits
and a diary, then a measured batch, then a vault report pushed to go-go-parc.

**Inferred user intent:** remove the largest failure class structurally, and keep a record that teaches.

### What I did
- `docmgr ticket create-ticket --ticket JIG-013-AWAIT-RULE …`; `docmgr doc add` for the design doc and the diary.
- Read the code paths the design depends on:
  - `Program.faces/why/feature/sketch` in `src/engine/program.js` are synchronous; `genealogy()` is pure string parsing.
  - `worker.js` `call` is async only because of `evalArg` (selector text `j.…` through `runScript`).
  - `releasePrograms(keepOnly)` and `gc()` keep only one Program's bodies alive.
  - `host.compile` records `_compiled` (the key) but not the inputs of the last good compile.
- Investigated the one failure so far in the running JIG-012 batch (`a01-magnet-pocket`, default tier): `add magnetPocket failed: Cannot read properties of undefined (reading 'type')` after a sequence of `files.edit` + `run()`. I replayed the same edit sequence in the sandbox (`check()`) and on a harness Host with the Node engine (`createNodeEngine`, `host.loadPreset('A-01')`, `setFile`, `compile`). Every variant compiled (volume 15292.94), so I could not reproduce it. Logged in the guide (§9) with a plan to put engine stack frames into such diagnostics.
- Wrote the guide (`design-doc/01-…`, 13 sections) and `tasks.md`.

### Why
- A note after the fact cannot prevent the first mistake. The rule removes most of the cases, and loud promises turn the rest from silent `undefined` into an error at the right line.

### What didn't work
- Replaying the magnet failure (above).
- My first frontmatter edit wrote an empty body (I piped nothing into a heredoc); I appended the body afterwards.

### What I learned
- In the failing case the agent called `help(j.lib.magnet)` and `help('part.add')`: the first `help()` calls seen in a batch.

### What warrants a second pair of eyes
- The shadow depends on the page and the sandbox compiling identical inputs to identical programs. The guide makes a mismatch an error, not a wrong answer.
