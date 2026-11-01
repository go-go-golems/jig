---
Title: Diary
Ticket: JIG-010-SKETCH-3D
Status: active
Topics:
    - stage
    - ui
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-01T12:36:58.194488618-05:00
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

## Step 1: Reproduce, find the `??`, turn the accident into a choice

The person liked seeing a sketch on the part but noticed that it no longer disappeared after "back to the part".
Reproducing it showed a mismatch: the host said "no sketch", the stage kept one. The cause was a `??` in the stage's
view sync. Since seeing sketches on the part is wanted, the fix separates the two meanings: the sketch you open, and
the sketches you show.

### Prompt Context
**User prompt (verbatim):** "I like seeing the sketches in the 3d view [Image #1] but this is pressing \"return to the part\" from the sketch view where it previously i think disappeared. Maybe we can do a menu change where you can zoom into the sketch (like now), and a checkbx or so where you can toggle if a sketch is displayed in the 3d view"
**Assistant interpretation:** Fix "back to the part" leaving the sketch drawn; add per-sketch "show in 3D" toggles to the Sketch menu while keeping "open in its plane".
**Inferred user intent:** Control over which sketches appear on the part.
**Commit (code):** 7d25528

### What I did
- Playwright on H-01: Sketch ▾ › saucer, back to the part; `jigHost.view` → `{ name: 'axo', sketch: null }`; screenshot showed `SKETCH saucer` on the axo sheet.
- Read `stage.js` `sub('view', …)` and `sheet.js` `activeSketch`; fixed the sync; added `view.shown`, `shownSketches`, `toggleSketchShown`, the menu rows and CSS, lab `view.set({ sketches })`; tests.

### Why
- Two states, two meanings: interactive editing belongs to the sketch view; drawings on the part are display only, so clicks on the part still pick faces.

### What worked
- After the fix: back to the part shows the part alone; ticking pot and saucer draws both on the part with the menu open.
- Tests: sketch-shown 4/4, scope 10/10, stage unit 20/20.

### What didn't work
- My first Playwright selectors used the buttons' titles (`Open sketch saucer in its own plane`); the accessible name is the content (`saucer explicit coordinates · fixed`). A CSS selector by position worked (it picked pot, the first row, which served the test).
- The existing scope test expected `view.set` to return `{ name, overlays }`; it now also has `sketches: []`.

### What I learned
- `??` is the wrong operator for "absent means keep, null means clear"; `=== undefined` states it.

### What was tricky to build
- Keeping the agent-eval measurement clean: the JIG-009 full run had started (12:27) before these edits (12:35) and had loaded its modules, so its prompt did not change.

### What warrants a second pair of eyes
- With several sketches shown, their dimension labels can overlap; the Dims overlay hides them.

### What should be done in the future
- Remember shown sketches per preset (like fragments) if people want them to persist.

### Code review instructions
- `node --test test/ui/sketch-shown.test.mjs`; in the workbench: Sketch ▾ › a name, back to the part; Sketch ▾ › 3D.

### Technical details
- `pushView` sends `shown` back to the host so stage-initiated view changes keep it.
