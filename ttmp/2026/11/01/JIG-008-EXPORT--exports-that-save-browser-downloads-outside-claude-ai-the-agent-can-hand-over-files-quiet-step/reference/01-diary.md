---
Title: Diary
Ticket: JIG-008-EXPORT
Status: active
Topics:
    - agent
    - export
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-01T11:56:39.344006075-05:00
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

## Step 1: Exports save in any page; the agent can save a file

The request was to make STL and the other exports work. They did work in the engine: every format came out valid
for a part, an assembly and a print job. They just could not be saved outside claude.ai. The page now downloads
files itself, the menu matches the formats, the agent can hand a file over, and STEP export no longer floods the console.

### Prompt Context
**User prompt (verbatim):** "continue also make stl etc.. export work. you can kill / restart the old instance"
**Assistant interpretation:** Restart `jigcad serve` on the current build; find why exports do not work and fix them; then continue with the recommended next step (warning text in run results).
**Inferred user intent:** Exports usable from the served workbench.
**Commit (code):** 504c7b7 — "JIG-008: exports save outside claude.ai; …"

### What I did
- Restarted the server (`make build-bin`; `./dist/jigcad serve --dist import/jigcad/dist`, so rebuilt dist needs no restart).
- Read the export path: `ExportMenu` → `host.export` → worker `exportCurrent` → `exportAs`; `save.js` `downloads()`/`saveOrCopy`.
- Exported every format for four presets in Node and validated the files (STL sizes and edge twins, 3MF zip and objects, STEP header and solids, IR entries).
- `save.js` `browserDownloads`; menu entries; `exportFile({ save })` and `host.saveFile`; `oc.js` print hooks; two test files; Makefile `test-js` includes `test/ui`.
- Browser check of every menu item and an agent turn (Playwright).

### Why
- Keep the clipboard fallback inside claude.ai: an anchor click in the artifact frame does nothing visible, which is worse than a clear "copied" toast.

### What worked
- Validation: `gear-pair.stl triangles 22228 directed edges without an opposite twin: 0`; `gear-pair.3mf … objects 3 … unit True None`; `gear-pair.step ISO-10303-21; True MANIFOLD_SOLID_BREP 3`.
- Browser events: `Downloaded file gear-pair.stl`, `gear-pair.3mf`, `gear-pair.step`, `gear-pair-iso.svg`, `gear-pair-ir.zip`, `M-07-gear-pair.js`.
- Agent: `const r = await exportFile('3mf', { save: true });` → `Downloaded file plant-pot.3mf`; answer "Done — the 3MF is exported and saved to your browser. plant-pot.3mf (342 KB) — both parts on one plate".
- `make test-js`: 48 + 15 + 62 + 42 pass.

### What didn't work
- My first restart command, `ps … | awk '/[j]igcad serve/' | xargs kill; make build-bin; nohup ./dist/jigcad serve …` in one shell, killed its own shell (exit 144): the command line itself contained `jigcad serve`. Split into separate commands.
- `node --test test/ui/` failed with `Cannot find module …/test/ui` (the directory holds .cjs helpers too); ran the file directly and used `test/ui/*.test.mjs` in the Makefile.

### What I learned
- The workbench's save path was written for one host (claude.ai), and the failure in another host looked like an export bug.

### What was tricky to build
- Deciding when to use the anchor download: "no claude runtime" is the reliable signal; "runtime present but downloads not granted" must not fall through to it.

### What warrants a second pair of eyes
- The claude.ai path was not exercised in this session.

### What should be done in the future
- DXF (sketch outlines) and OBJ if a user asks.

### Code review instructions
- `node --test test/ui/save.test.mjs test/agent/scope.test.mjs`; open `jigcad serve`, Export ▸ each item.

### Technical details
- STL in claude.ai without downloads still goes to the clipboard as ASCII STL (`stlToASCII`); `host.saveFile` does the same.
