---
id: naming
title: Persistent names and genealogy
group: Modelling
about: How faces get names like body/side[base.outline.bottom], and why selectors that use them survive edits.
order: 20
---
# Persistent names and genealogy

Every face and edge the compiler makes gets a **persistent name**, built from the feature that made it and the thing it was made from: `body/side[base.outline.bottom]`, `shell/inner[body/side[base.outline.bottom]]`, `round/face[body/side[base.r.left] ∩ body/end]`. Selectors resolve through these names, so a fillet that refers to "the end face of `body`" still finds it after the part is made wider, taller or rounder. This page explains the problem names solve, how they are built, and when they break. [Chapter 6](lab:book?ch=6) works through it with figures.

## The problem

OpenCascade, like every boundary-representation kernel, stores a solid as lists of faces, edges and vertices, and numbers them in the order it built them. The numbers are not stable. Make a box wider and the kernel may build its faces in the same order; add a pocket, a fillet or a hole and the order changes, faces split in two, and face 7 is now a different face. A model that says "fillet the edges of face 7" breaks silently: it fillets the wrong edges, or none. This is the **topological naming problem**, and it is the most common way parametric models fail when edited.

jig avoids face numbers altogether. A face is identified by its history, which does not change when dimensions do.

## How a name is built

A name has the form `<feature>/<role>[<source>]`:

| part | is | examples |
|---|---|---|
| feature | the id of the feature that created the face | `body`, `shell`, `round`, `holes` |
| role | what the face is to that feature | `side`, `start`, `end` (extrude, revolve, sweep); `inner` (shell); `face` (fillet, chamfer); `bore`, `floor`, `tear.l`, `tear.r` (holes) |
| source | what the face was made from | a sketch entity `base.outline.bottom`; another face; an edge as the intersection of two faces `a ∩ b`; a hole's point `p1` |

So `body/side[base.outline.bottom]` is the side face the extrude `body` swept from the bottom edge of the rectangle `outline` in the sketch `base`. `body/end` is its far cap and `body/start` its near cap. A fillet face is named by the edge it replaced, and an edge is named by the two faces it separates: `round/face[body/side[base.r.left] ∩ body/end]`. Pattern copies carry their instance: `body/side[outline.h1.p2]`. A face that a later feature splits in two keeps its name with `#a` and `#b`: a groove across the top of a block leaves `body/end#a` and `body/end#b`, 1,020 mm² each.

The record of which feature made which face from what is the **genealogy**. Each feature reports it as it runs: faces created, faces modified, faces deleted. The approach is Kripac's (1997): name by history, and resolve a reference by following the history forward from the face it originally meant.

## Selectors that use names

A selector is a query that the compiler resolves on every compile. Two kinds behave differently under edits:

- **Feature selectors** resolve through genealogy: `j.feat('body').endFace()`, `.startFace()`, `.sideFaces()`, `.sideFace('outline.left')`, `.holes()`, `.bores()`, and `j.sel.names(kind, [names])`. They mean the same faces whatever the dimensions.
- **Query selectors** resolve from geometry: `j.sel.faces('>Z')` is whichever face is highest along Z now. That is often what you want, and it can change meaning when the model changes.

An example. A 60 × 40 × 5 mm plate has a boss 16 mm across and 12 mm tall on top. Before the boss existed, `j.sel.faces('>Z')` was the top of the plate; now it resolves to `boss/end`, the top of the boss. `j.feat('plate').endFace()` still resolves to `plate/end`. `why` shows both:

```text
j.sel.faces('>Z')          → boss/end    '>Z' → 1 of 13
j.feat('plate').endFace()  → plate/end   1 by genealogy
```

Selectors also return exactly what they say. `j.feat('plate').endFace().edges()` is every edge of the plate's top face, and that includes the circle where the boss meets it: a chamfer on that selection also chamfers the root of the boss. Add `.where(e => e.convex)` to keep only the outside edges.

## Asking why

`why` is the engine's explanation of a reference. In the workbench, select a face and read *Why* in the inspector; in a script or the agent, `prog.why(target)` takes a face name, an edge name, a feature id, a param or a selector. For `body/end#a` it answers:

```text
body/end#a: piece a of a face split by a later feature
body/end ← body: the far cap of the extrusion
```

## When references break

Names survive dimension changes, and they survive features added downstream. They do not survive the removal of what they were made from: rename the sketch entity `outline` and every `body/side[base.outline.…]` is gone. The compiler reports each kind of break:

| diagnostic | level | when |
|---|---|---|
| `ref.lost` | warning | a selector resolved to nothing: `j.feat('body').sideFace('r.leftt').edges('\|Z') resolved to nothing` |
| `ref.fragile` | warning | a selector depends on order: `nth(0) depends on face order` |
| `ref.expect` | error | `.expect(n)` counted something else |
| `ref.autoId` | info | a reference to a generated feature id such as `extrude1` |

`nth` deserves its warning. On a 40 × 30 × 10 mm block whose left side has been filleted, `j.sel.edges('|Z').nth(0)` picks whichever vertical edge comes first, which happened to be an edge the fillet had already rounded, and the chamfer on it failed. Prefer a feature selector, and put `.expect(n)` on any selector whose count you know, such as `.edges('|Z').expect(4)` for the four vertical edges of a box: a model that changes under it then fails loudly at the selector instead of quietly downstream.

## Names in the rest of the workbench

The same names appear wherever faces do: in the inspector, in the IR at level L4, in `lab:select/<name>` links in notes and the book, and in the agent's eval scope. Exports that keep names are the IR bundle; STL, 3MF and STEP drop them, and their reports say so.
