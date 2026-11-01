---
Title: Sketches in the 3D views
Ticket: JIG-010-SKETCH-3D
Status: active
Topics:
    - stage
    - ui
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: import/jigcad/src/stage/stage.js
      Note: host view sync (the ?? bug); shown in pushView
    - Path: import/jigcad/src/stage/sheet.js
      Note: activeSketch (sketch view only), shownSketches
    - Path: import/jigcad/src/ui/views/stage.jsx
      Note: Sketch menu with 3D checkboxes
    - Path: import/jigcad/src/host/host.js
      Note: view.shown, toggleSketchShown
ExternalSources: []
Summary: "A sketch opened in its plane stayed drawn on the part after Back to the part, through a ?? in the stage's view sync. The person liked seeing it, so drawing sketches on the part became an explicit per-sketch choice in the Sketch menu."
LastUpdated: 2026-11-01T12:36:58.106283195-05:00
WhatFor: ""
WhenToUse: ""
---

# Sketches in the 3D views

## 1. Report and cause

The person: "I like seeing the sketches in the 3d view, but this is pressing 'return to the part' from the sketch view
where it previously I think disappeared. Maybe we can do a menu change where you can zoom into the sketch (like now),
and a checkbox or so where you can toggle if a sketch is displayed in the 3d view." (`various/00-user-screenshot.png`:
the H-01 saucer's section, hatched with its dimensions, on the axonometric view.)

Reproduced on H-01: Sketch ▾ › saucer, then "back to the part". `jigHost.view` was `{ name: 'axo', sketch: null }`,
and the sheet still drew the saucer sketch with the label `SKETCH saucer · fully constrained · 0 DOF`
(`various/01-…png`).

Two pieces combined. The stage copies the host's view when the host emits `view`:

```js
const nxt = { name: v.name ?? cur.name, …, sketch: v.sketch ?? cur.sketch };   // src/stage/stage.js, before
```

`null ?? 'saucer'` is `'saucer'`, so the host's "no sketch" never reached the stage. And the sheet drew a sketch
whenever `view.sketch` was set, whatever the view's name (`activeSketch`).

## 2. Design

| State | Meaning | Drawn where |
|---|---|---|
| `view.sketch` | the sketch open in its own plane | the sketch view only, interactive (select, drag) |
| `view.shown` (Set of ids) | sketches the person chose to see on the part | axo, front, side, plan; display only |

- **The sync copies `sketch` exactly** (`v.sketch === undefined ? cur : v.sketch`) and copies `shown`.
- **`activeSketch` returns a sketch only in the sketch view** (or the first sketch of a sketch program, as before).
  `shownSketches(program, view, solved)` returns the shown ones in the 3D views; a dragged sketch is drawn as solved.
- **Sketch ▾.** Each row has the sketch's name, which opens it in its plane as before. A `3D` checkbox
  (`role="checkbox"`, `data-keep`, so the menu stays open) toggles `host.toggleSketchShown(id)`. "Show all / Hide all
  in 3D" appears with more than one sketch. The button reads `Sketch 2 shown · 3`.
- **Loading a preset clears `shown`.**
- **The lab follows.** `view.set({ sketches: ['pot'] })` and `view.get().sketches`, with unknown ids refused, so the
  agent can show a sketch and `look()` at it on the part.

## 3. Verification

- Browser (H-01): open pot, back to the part → part only, no SKETCH label (`various/02-…`); the menu
  (`various/03-…`); pot and saucer ticked → both sections drawn on the part, menu still open (`various/04-…`).
- `test/ui/sketch-shown.test.mjs` (4): the sketch view draws its sketch; a leftover `view.sketch` is not drawn in axo;
  shown sketches in 3D views only, unknown ids skipped; a sketch program still opens on its sketch; solved drawing;
  `host.toggleSketchShown` adds, removes, forces. `test/agent/scope.test.mjs`: `view.set({ sketches })`.
- `test/stage/unit.mjs` 20/20.
