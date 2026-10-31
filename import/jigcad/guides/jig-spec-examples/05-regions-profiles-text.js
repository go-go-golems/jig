// 05 · Regions, profiles and text: the planar algebra under every extrude
//
// Model
//   A sketch's curves induce a planar arrangement (vertices, edges, faces). A profile is a bounded face set,
//   and nesting is decided even–odd: a point inside an odd number of loops is material.
//   Regions form a regularised Boolean algebra, and area is a measure on it:
//       area(A ∪ B) = area A + area B − area(A ∩ B)
//   offset(R, +r) = R ⊕ D_r is a Minkowski sum with a disk; offset(R, −r) = R ⊖ D_r is an erosion.
//   For convex R, Steiner's formula gives area(R ⊕ D_r) = A + P·r + π·r².
//   Opening (R ⊖ D_r) ⊕ D_r deletes every feature thinner than 2r. With r = lw/2 it shows what a nozzle can draw.
//
// Grounding
//   Regularised Boolean set operations (Requicha 1980). Offsets are Minkowski sums, and offset-in-then-out
//   is a morphological opening (Serra 1982).
//
// Notice
//   - Holes are not a special feature: they are inner loops of a profile.
//   - A floating island is a legal region and a bad print; picking profiles is a slot with a lambda.
//   - Text is just regions, so the same opening test predicts which letters survive slicing.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, lw, layer } from 'jig'

// ── 1. Profiles from a planar arrangement, nested even–odd ─────────────────────
const tag = j.sketch('tag', { on: j.plane.XY })
  .rect('outer', 60, 24, { center: true, r: 4 })        // depth 1: material
  .circle('hole', 3, { at: [-24, 0] })                  // depth 2: empty
  .rect('window', 30, 12, { at: [6, 0], center: true }) // depth 2: empty
  .rect('island', 10, 4, { at: [6, 0], center: true })  // depth 3: material again

j.compile(tag).sketch('tag').profiles
// → [{ id: 'outer∖{hole, window}', loops: 3, area: 1038.0 mm² },   // 1426.3 − 28.3 − 360
//    { id: 'island', loops: 1, area: 40.0 mm² }]

j.compile(j.part('tag').extrude(tag.profiles(), mm(2))).diagnostics
// → [{ level: 'warning', kind: 'print.island', at: 'extrude1', message: 'body2 (island, 40 mm²) is not connected to body1',
//      fix: "pick profiles: tag.profile((r, ctx) => r.area.gte(j.q('100 mm^2')))" }]

// ── 2. Picking profiles: by id, by point, by lambda ────────────────────────────
tag.profile('outer')                                    // the region bounded by the outer loop, holes included
tag.profile([-10, 8])                                   // the region containing this point
const onePiece = tag.profile((r, ctx) => r.area.gte(j.q('100 mm^2')))   // drop anything too small to print alone
const tagPart = j.part('tag').extrude(onePiece, mm(2), { id: 'body' })
j.compile(tagPart).summary().bodies                     // → 1

// ── 3. The Boolean algebra of regions ─────────────────────────────────────────
const A = j.region.rect(mm(40), mm(20), { center: true })   // area 800 mm²
const B = j.region.circle(mm(12), { at: [20, 0] })          // area 452.4 mm², centred on A's right edge
A.intersect(B).area()                                       // → 208.2 mm²  (half disk 226.2 − two clipped caps 18.0)
A.union(B).area()                                           // → 1044.2 mm² = 800 + 452.4 − 208.2
A.subtract(B).area()                                        // → 591.8 mm²
B.subtract(A).area()                                        // → 244.2 mm²

// Because region booleans form a Boolean algebra (suite: region.boolean), a profile's operations can be
// reordered and fused: subtracting three holes one by one is the same as subtracting their union once.
const C = j.region.slot([-15, 0], [15, 0], mm(6))
A.subtract(B).subtract(C).area()            // → 438.9 mm²   (A ∖ B ∖ C = A ∖ (B ∪ C): 591.8 − 152.9 of slot outside B)

// ── 4. Offsets are Minkowski sums ─────────────────────────────────────────────
A.offset(mm(2)).area()               // → 1052.6 mm² = 800 + 120·2 + π·2²   (Steiner: A + P·r + πr²)
A.offset(mm(-2)).area()              // → 576 mm²    = 36 × 16              (erosion keeps sharp corners)
A.offset(mm(2)).offset(mm(-2)).area()// → 800 mm²    (closing: a convex region is unchanged)
A.offset(mm(-2)).offset(mm(2)).area()// → 796.6 mm² = 800 − 4·(1 − π/4)·2²   (opening rounds convex corners to r = 2)

// ── 5. Opening at half a line width: what the nozzle can draw ─────────────────
const logo = j.region.svg(await j.load.svg('logo.svg'), { width: mm(30) })
const r = lw(0.5)                                       // 0.225 mm on a 0.4 mm nozzle
const drawable = logo.offset(r.neg()).offset(r)
const lost = logo.subtract(drawable)

logo.area()                                             // → 212.6 mm²
lost.area()                                             // → 3.1 mm²  (two serifs and the tail of the swoosh)
lost.area().div(logo.area())                            // → 0.0146   (1.5 % of the logo will not print)

// Closing is the dual: gaps narrower than 2r fill in, so letters set too close fuse together.
const fused = logo.offset(r).offset(r.neg()).subtract(logo)
fused.area()                                            // → 0.4 mm²  (the gap between 'r' and 'n')

// ── 6. Text is regions ────────────────────────────────────────────────────────
const label = j.region.text('PLA 0.2', { font: 'Inter Regular', size: mm(3) })
const plaque = j.part('plaque')
  .extrude(j.region.rect(mm(40), mm(12), { center: true }), mm(2), { id: 'body' })
  .emboss(label, mm(0.4), { on: j.feat('body').endFace(), op: 'join', id: 'label' })
  .use(j.rules.fdm)

j.compile(plaque).diagnostics
// → [{ level: 'warning', kind: 'print.textIllegible', at: 'label',
//      message: 'stroke 0.33 mm < 1 lw (0.45 mm); height 0.4 mm < 3 layer (0.6 mm)',
//      fix: "size ≥ 4.1 mm in 'Inter Regular', or font 'Inter Bold'; depth ≥ 0.6 mm" }]

const legible = plaque
  .suppress('label')
  .emboss(j.region.text('PLA 0.2', { font: 'Inter Bold', size: mm(4.5) }), layer(3), { on: j.feat('body').endFace(), id: 'label2' })
j.compile(legible).diagnostics          // → []

// ── 7. Regions back into sketches ─────────────────────────────────────────────
// An imported region becomes sketch geometry with fixed points, so it can be constrained against.
const badge = j.sketch('badge', { on: j.plane.XY })
  .circle('rim', 20, { at: [0, 0] })
  .import('logo', logo.offset(mm(0.2)))
  .constrain(j.c.concentric('rim', 'logo'))
j.compile(badge).sketch('badge')
// → { dof: 4, status: 'under', note: 'rim 3 + logo 3 (rigid) − concentric 2: rim centre (2), rim radius, logo rotation' }
