// 08 · Selectors and persistent naming: CSS selectors for topology
//
// Model
//   A Selector is a query that denotes a set of faces, edges, vertices or bodies.
//   Selectors form a Boolean algebra: and = ∩, or = ∪, minus = \, not = complement within the scope.
//   Resolution happens at L4 against a genealogy graph: every face records the feature and the
//   sketch entity that generated it, and every later feature records which faces it split,
//   merged or replaced. A persistent name is a path in that graph:
//     boss/side[base.l3]                       the side face swept from sketch edge l3
//     fillet2/face[boss/side[base.l3] ∩ boss/end]   the fillet face born from that edge
//   Genealogy names survive upstream edits. Index-based names ("face 7") do not.
//
// Grounding
//   Persistent naming in history-based modelling (Kripac 1997). The query syntax is borrowed from CadQuery.
//
// Notice
//   - Prefer feature-based selectors (j.feat('boss').sideFace('l3')) to geometric ones, and geometric ones to nth().
//   - .expect(n) turns a silent topological naming break into a loud error at the right place.
//   - prog.why(sel) explains every resolution: candidates, filters, and the genealogy chain.
//   - The selector algebra is property-tested like any other law (see 43).
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg } from 'jig'

// ── Fixture: an open box with a screw boss in one corner ──────────────────────
const base = j.sketch('base', { on: j.plane.XY })
  .line('l1', [0, 0], [60, 0]).line('l2', 'l1.end', [60, 40])
  .line('l3', 'l2.end', [0, 40]).line('l4', 'l3.end', 'l1.start')
  .constrain(j.c.horizontal('l1'), j.c.horizontal('l3'), j.c.vertical('l2'), j.c.vertical('l4'), j.c.fix('l1.start'))
  .dim('l1', 'w').dim('l2', 'd')

const boxFrom = sketch => j.part('box')                  // a model is a value, so a function of a sketch is a model family
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })
  .extrude(sketch.profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
const box = boxFrom(base)

// ── 1. Three ways to say "the top rim" ───────────────────────────────────────
const rimByGenealogy = j.feat('body').endFace().minus(j.feat('shell').faces()).expect(1)  // what is left of the end face
const rimByGeometry = j.sel.faces('>Z').of('box').expect(1)                               // the highest face
const rimByIndex = j.sel.faces().of('box').nth(7)                                       // works today, breaks tomorrow

const B = j.compile(box.fillet(rimByGenealogy.edges(), mm(0.6), { id: 'soften' }))
B.why(rimByGenealogy)
// → { resolved: ['body/end ∖ shell'],
//     chain: ['body/end ← extrude(base) cap', 'shell removed the inner region; remaining ring keeps its name'],
//     candidates: 1, filters: ['minus shell.faces → 1'] }
j.compile(box).diagnostics.filter(d => d.kind === 'ref.fragile')
// → []   (rimByIndex has not been used in a feature yet; it becomes a warning as soon as it is)

// ── 2. The query mini-language ────────────────────────────────────────────────
j.sel.edges('|Z').of('box')                       // the vertical edges: 4 outside + 4 inside
j.sel.edges('|Z').of('box').where(e => e.convex)  // the 4 outside corners
j.sel.faces('+Z')                                 // faces whose normal points up: the rim and the inside floor
j.sel.faces('<Z').expect(1)                       // the bottom face, which will sit on the bed
j.sel.faces('%plane and #Z')                      // the walls: planar faces perpendicular to Z
j.sel.edges('%circle').radius(mm(1.7))            // every M3 clearance hole edge

// ── 3. Feature-based selectors read like the design intent ────────────────────
const front = j.feat('body').sideFace('l1')       // the face swept from sketch edge l1, whatever its index
const sideEdges = j.feat('body').sideFaces().edges('|Z')
const insideFloor = j.feat('shell').faces().and(j.sel.faces('+Z')).expect(1)

const labelled = box
  .emboss(j.region.text('PARTS', { size: mm(8), font: 'Inter Bold' }), mm(0.6), { on: front, op: 'cut', id: 'label' })
  .fillet(j.sel.edges().of(insideFloor).and(j.sel.edges().of(j.feat('shell').faces())), mm(3), { id: 'scoop' })   // finger-friendly floor

// ── 4. The topological naming problem, staged ───────────────────────────────
// Add a notch to sketch edge l1. The front face now splits in two, and every index shifts.
const base2 = base.line('n1', [25, 0], [25, 6]).line('n2', 'n1.end', [35, 6]).line('n3', 'n2.end', [35, 0])
  .trim('l1', [30, 0])                     // l1 now runs 0–25 and 35–60; it keeps its id on both pieces
const boxNotched = boxFrom(base2)

const N = j.compile(boxNotched.emboss(j.region.text('PARTS', { size: mm(8) }), mm(0.6), { on: front, op: 'cut', id: 'label' }))
N.why(front)
// → { resolved: ['body/side[base.l1]#a', 'body/side[base.l1]#b'], note: 'l1 was split by trim; 2 faces descend from it' }
N.diagnostics
// → [{ level: 'error', kind: 'ref.expect', at: 'label.on', message: 'emboss target resolved to 2 faces; expected 1',
//      fix: "pick one: j.feat('body').sideFace('l1').largest()  or  .near([12, 0, 15])" }]

// The fix states the intent precisely, and the IR records it.
const fixedFront = j.feat('body').sideFace('l1').largest().expect(1)

// ── 5. Index selectors: what breaks, and how jig tells you ───────────────────
const fragile = box.fillet(j.sel.edges().of('box').nth(3), mm(1), { id: 'f' })
j.compile(fragile).diagnostics
// → [{ level: 'warning', kind: 'ref.fragile', at: 'f.edges', message: 'nth(3) depends on face order',
//      fix: "j.feat('body').sideFaces().edges('|Z').near([60, 0, 15])" }]

// ── 6. Selectors as values: compose them, name them, test them ───────────────
const outsideCorners = j.feat('body').sideFaces().edges('|Z').minus(j.feat('shell').faces().edges())
const allRounded = box.fillet(outsideCorners.expect(4), mm(3), { id: 'corners' })

// Robustness: run the suite's refs.robust law on this model. It perturbs every parameter and checks that
// each selector still resolves to the same genealogy, so naming breaks show up before a user edits the model.
j.laws.check(j.laws.for(allRounded), { only: ['refs.robust'], n: 50, seed: 1 })
// → [{ law: 'refs.robust', tier: 'invariant', ok: true, n: 50, justifies: 'catches topological naming breaks' }]
