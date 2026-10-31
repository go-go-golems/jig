---
part: II · Solids
presets: A-01, D-03
docs: naming
---
# Naming what you made

A fillet must say which edges to round and a hole which face to start from. In a parametric model those references are written once and must keep meaning the same thing after every edit, but the kernel numbers faces in the order it happened to build them, and that order changes. This chapter shows how jig names every face and edge by its history instead, how selectors resolve through those names, where a query by position means something different from a reference by history, and what the compiler reports when a reference breaks. By the end you can read any face name back to the sketch entity it came from, and choose a selector that survives the edits you expect.

## 6.1 A name is a history

Every face the compiler makes gets a **persistent name** of the form `<feature>/<role>[<source>]`. The feature is the id of the feature that created the face; the role is what the face is to that feature; the source is what it was made from. The box of [A-01](lab:preset/A-01) has 19 faces. Some of them:

| name | made by | from |
|---|---|---|
| `body/start` | the extrude `body` | its near cap, on the sketch plane |
| `body/end` | the extrude `body` | its far cap; after the shell, the rim |
| `body/side[base.outline.bottom]` | the extrude `body` | the bottom line of the rectangle `outline` in sketch `base` |
| `body/side[base.outline.br]` | the extrude `body` | the rectangle's bottom-right corner arc |
| `shell/inner[body/side[base.outline.bottom]]` | the shell `shell` | the face `body/side[base.outline.bottom]`, offset inwards |

A name can be read from the inside out. `shell/inner[body/side[base.outline.bottom]]` is the inner face the shell offset from the side the extrude swept from the bottom edge of the outline: the inside of the front wall. Edges are named by the two faces they separate, `a ∩ b`, and a fillet or chamfer face is named by the edge it replaced: `corners/face[body/side[base.r.bottom] ∩ body/side[base.r.left]]`.

The record of which feature made which face from what is the **genealogy**. Each feature reports its faces as created, modified or deleted as it runs, and the compiler composes the reports into names. The approach, naming faces by the history of features rather than by geometry or kernel index, is Kripac's (1997).

```figure
// view: axo
// select: shell/inner[body/side[base.outline.bottom]]
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2), r: mm(3) })
  .extrude(
    j.sketch('base', { on: j.plane.XY })
      .rect('outline', 'w', 'd', { center: true, r: 'r' }).profiles(),
    'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
```

**Figure 6.1.** The box of A-01 with `shell/inner[body/side[base.outline.bottom]]` selected: the inside of the front wall, 1,512 mm² at the default 60 mm width. Its name records three steps: the sketch line, the extrude's side, the shell's offset.

```sketch
// title: Read a face's name
// Click faces on the sheet and read their names and Why in the inspector.
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2), r: mm(3) })
  .extrude(
    j.sketch('base', { on: j.plane.XY })
      .rect('outline', 'w', 'd', { center: true, r: 'r' }).profiles(),
    'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
```

> **Try it.** [Load A-01](lab:preset/A-01) and [select the inside of the front wall](lab:select/shell/inner[body/side[base.outline.bottom]]). The inspector's *Why* lists the two steps of its genealogy.

## 6.2 Names survive dimension changes

Because a name records history and not position, a change of dimensions leaves it alone. The block below rounds its four vertical corners and chamfers its top edges:

```js
.fillet(j.feat('body').sideFaces().edges('|Z')
  .where(e => e.convex).expect(4), mm(3), { id: 'corners' })
.chamfer(j.feat('body').endFace().edges(), mm(1), { id: 'lead' })
```

Compiled at `w` = 60 mm and again at `w` = 80 mm, it has 18 faces with the same 18 names, and the selectors resolve to the same edges. The volume changes from 71,671.85 to 95,651.85 mm³; the names do not. Among them are the four `corners/face[…]` faces and eight `lead/face[…]` faces, including the ones the chamfer cut across the fillets: `lead/face[corners/face[body/side[base.r.bottom] ∩ body/side[base.r.left]] ∩ body/end]`, a chamfer face named after the edge between a fillet face and the top.

The selectors themselves are written by history too. `j.feat('body').sideFaces()` means "the side faces of the extrude `body`", whatever their number; `.edges('|Z')` keeps the edges parallel to Z; `.where(e => e.convex)` keeps the outside ones; `.expect(4)` asserts there are four. If a later edit made it five, the compile would fail at this selector with `ref.expect`, rather than fillet five edges and fail somewhere less obvious.

```figure
// view: axo
// select: corners/face[body/side[base.r.bottom] ∩ body/side[base.r.left]]
const base = j.sketch('base', { on: j.plane.XY })
  .rect('r', 'w', 'd', { center: true })
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30) })
  .extrude(base.profiles(), 'h', { id: 'body' })
  .fillet(j.feat('body').sideFaces().edges('|Z')
    .where(e => e.convex).expect(4), mm(3), { id: 'corners' })
  .chamfer(j.feat('body').endFace().edges(), mm(1), { id: 'lead' })
```

**Figure 6.2.** A block with filleted vertical corners and a chamfered top, the front-left fillet selected. At `w` = 60 mm and at 80 mm it has the same 18 face names; only their areas change.

```sketch
// title: Names that survive a change of width
// Change w to 80 mm and Run: every face keeps its name.
const base = j.sketch('base', { on: j.plane.XY })
  .rect('r', 'w', 'd', { center: true })
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30) })
  .extrude(base.profiles(), 'h', { id: 'body' })
  .fillet(j.feat('body').sideFaces().edges('|Z')
    .where(e => e.convex).expect(4), mm(3), { id: 'corners' })
  .chamfer(j.feat('body').endFace().edges(), mm(1), { id: 'lead' })
```

## 6.3 Queries mean positions; references mean history

jig has two kinds of selector, and they answer different questions.

A **query** selects by geometry on every compile: `j.sel.faces('>Z')` is the face farthest along Z, `'|Z'` the edges parallel to Z, `'%cylinder'` the cylindrical faces. The language is CadQuery's, combined with `and`, `or` and `not`. A **reference** selects by history: `j.feat('plate').endFace()` is the far cap of the extrude `plate`, found through the genealogy.

Before anything is built on top of it, both pick the top of a plate. Put a boss on the plate and they part:

```text
j.sel.faces('>Z')          → boss/end     '>Z' → 1 of 13
j.feat('plate').endFace()  → plate/end    1 by genealogy
```

Neither is wrong. A label embossed on "the top" should follow the query; a chamfer on "the plate's top edges" should follow the reference. The bug is to write one when you mean the other, and the compiler cannot tell which you meant, so it shows both in `why`.

A selector also returns exactly what it names. `j.feat('plate').endFace().edges()` is every edge of the plate's top face, and after the boss is added that includes the circle where the boss meets it. In the part below, the 1 mm chamfer on those edges therefore also cuts a concave chamfer round the root of the boss, named `edge/face[boss/side[b.c] ∩ plate/end]`. To chamfer only the outside, add `.where(e => e.convex)`.

```figure
// view: axo
// select: plate/end
const plate = j.sketch('p', { on: j.plane.XY })
  .rect('r', 60, 40, { center: true })
return j.part('mount')
  .extrude(plate.profiles(), mm(5), { id: 'plate' })
  .extrude(j.sketch('b', { on: j.feat('plate').endFace() })
    .circle('c', 8).profiles(), mm(12), { id: 'boss' })
  .chamfer(j.feat('plate').endFace().edges(), mm(1), { id: 'edge' })
```

**Figure 6.3.** A 60 × 40 × 5 mm plate with a boss 16 mm across and 12 mm tall, `plate/end` selected. `j.sel.faces('>Z')` now resolves to `boss/end`; the reference `j.feat('plate').endFace()` still resolves to `plate/end`, and its edges include the boss's root circle, which the chamfer also cut.

```sketch
// title: A query and a reference part ways
// Chamfer j.sel.faces('>Z').edges() instead and see which edges change.
const plate = j.sketch('p', { on: j.plane.XY })
  .rect('r', 60, 40, { center: true })
return j.part('mount')
  .extrude(plate.profiles(), mm(5), { id: 'plate' })
  .extrude(j.sketch('b', { on: j.feat('plate').endFace() })
    .circle('c', 8).profiles(), mm(12), { id: 'boss' })
  .chamfer(j.feat('plate').endFace().edges(), mm(1), { id: 'edge' })
```

## 6.4 Splits, losses and fragile references

A later feature can split a face. A groove cut across the top of a 60 × 40 × 20 mm block divides `body/end` into two pieces, and each keeps the name with a suffix: `body/end#a` and `body/end#b`, 1,020 mm² each. `why('body/end#a')` explains:

```text
body/end#a: piece a of a face split by a later feature
body/end ← body: the far cap of the extrusion
```

A reference to `body/end` after the split resolves to both pieces, which is usually what a feature on "the top" wants. The groove's own faces are new: `groove/side[g.r.bottom]`, `groove/side[g.r.top]` and the floor `groove/start`.

Names do not survive the removal of what they were made from. Misspell a sketch entity in a reference, `sideFace('r.leftt')`, or delete the entity, and the compiler warns `ref.lost: j.feat('body').sideFace('r.leftt').edges('|Z') resolved to nothing`, and the fillet that used it is skipped with a second `ref.lost`.

Selectors by index are the fragile kind. `j.sel.edges('|Z').nth(0)` is whichever vertical edge the kernel lists first, and the compiler warns `ref.fragile: nth(0) depends on face order`. On a block whose left side had already been filleted, `nth(0)` picked an edge the fillet had rounded away, and a 1 mm chamfer on it failed with `feature.failed`. A reference by feature, or a query with `.expect(n)`, says what it means and fails at the selector when the model no longer has it.

```figure
// view: axo
// select: body/end#a
const groove = j.sketch('g', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('r', 'w + 2 mm', 6, { center: true })
return j.part('block')
  .params({ w: mm(60), d: mm(40), h: mm(20) })
  .extrude(j.region.rect('w', 'd'), 'h', { id: 'body' })
  .cut(groove.profiles(), mm(4), { id: 'groove' })
```

**Figure 6.4.** A groove 6 mm wide and 4 mm deep across a 60 × 40 × 20 mm block splits the top face in two; `body/end#a` is selected. Both pieces keep the name of the face they came from.

```sketch
// title: A face split in two
// Make the groove narrower than the block (w - 10 mm): the top is not split.
const groove = j.sketch('g', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('r', 'w + 2 mm', 6, { center: true })
return j.part('block')
  .params({ w: mm(60), d: mm(40), h: mm(20) })
  .extrude(j.region.rect('w', 'd'), 'h', { id: 'body' })
  .cut(groove.profiles(), mm(4), { id: 'groove' })
```

| diagnostic | level | means |
|---|---|---|
| `ref.lost` | warning | a selector resolved to nothing |
| `ref.fragile` | warning | a selector depends on the kernel's order (`nth`) |
| `ref.expect` | error | `.expect(n)` counted a different number |
| `ref.autoId` | info | a reference to a generated id such as `extrude1`, which changes when features are added before it |

## 6.5 Key points

- Every face and edge has a persistent name `<feature>/<role>[<source>]`, built from the genealogy the features report.
- Names record history, so they survive changes of dimension: the block of Figure 6.2 keeps all 18 names from 60 to 80 mm wide.
- A query (`'>Z'`) selects by position on every compile; a reference (`j.feat(id).endFace()`) selects by history. Choose the one that means what you mean.
- A face split by a later feature keeps its name with `#a`, `#b`, and a reference to the original resolves to all the pieces.
- `why` explains any reference: what it resolved to and the chain of features behind it.
- Broken references are diagnostics: `ref.lost`, `ref.fragile` for `nth`, `ref.expect` for a wrong count; use `.expect(n)` to fail early.

## Exercises

> **Exercise.** In Figure 6.3, change the chamfer's selector so that it does not touch the boss. Find two ways: one with `.where`, one with `.minus`.

> **Exercise.** Add a second groove across the block of Figure 6.4, perpendicular to the first. How many pieces does `body/end` have, and what are they called?

> **Exercise.** [D-03](lab:preset/D-03) fillets the floor edges of its pockets with a `where` on concave edges at the floor height. Rewrite that selector with `j.feat('pocket').edges()` and `.created('pocket')`, and check with `why` that it resolves to the same edges.

## Further reading

- Kripac, *A mechanism for persistently naming topological entities in history-based parametric solid models*, Computer-Aided Design 29(2), 1997: naming by feature history, the basis of jig's names.
- [Persistent names and genealogy](lab:doc?id=naming): the naming rules as a reference page.
