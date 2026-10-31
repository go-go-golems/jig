// 07 · CSG, booleans and B-reps: a regularised Boolean algebra with a validity law
//
// Model
//   Solids are regular closed sets: S = cl(int S). Plain set operations can leave lower-dimensional debris
//   (a shared face, a dangling edge), so jig uses the regularised operations  A ∪* B = cl(int(A ∪ B)), etc.
//   Regular sets form a Boolean algebra, and volume is a measure on it:
//       vol(A ∪ B) = vol A + vol B − vol(A ∩ B)
//   Exact results are B-reps: vertices, edges, faces, loops, shells. Every valid one satisfies Euler–Poincaré
//       V − E + F − (L − F) − 2(S − G) = 0      (G = genus: through-holes)
//   A part's timeline composes by concatenation, and a suppressed feature changes nothing, so an edit
//   only recomputes the features after it (prefix caching).
//
// Grounding
//   Regularised sets and CSG (Requicha 1980); B-rep validity through the Euler–Poincaré formula (Mäntylä
//   1988).
//
// Notice
//   - j.box / j.cyl / j.sphere give OpenSCAD-style CSG; parts give history-based modelling. They mix freely.
//   - Regularisation is why two boxes sharing a face union into one clean solid instead of a solid plus a sheet.
//   - Touching along an edge is legal set theory and an illegal print: it is diagnosed as non-manifold.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg } from 'jig'

// ── 1. OpenSCAD-style CSG: the classic die ────────────────────────────────────
const cube = j.box(mm(20), mm(20), mm(20), { center: true })     // 8000 mm³
const ball = j.sphere(mm(13))                                    // 9202.8 mm³
const rod = j.cyl(mm(5), mm(40), { center: true })               // along Z
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))

const rounded = cube.intersect(ball)
rounded.volume()        // → 7167.0 mm³ = 9202.8 − 6 · π·3²·(39 − 3)/3   (the ball minus six caps of height 3 mm)
const die = rounded.subtract(rods)
die.volume()            // → 3868.8 mm³ = 7167.0 − (3·1570.8 − 3·666.7 + 585.8)
                        //   three rods of length 20 inside, minus pairwise Steinmetz bicylinders (16r³/3),
                        //   plus the tricylinder (8(2 − √2)r³)

cube.union(ball).volume()     // → 10035.8 mm³ = 8000 + 9202.8 − 7167.0   (inclusion–exclusion; the suite's shape.boolean oracle)

// ── 2. Validity: Euler–Poincaré on the result ─────────────────────────────────
const dieP = j.part('die').add(die, { id: 'body' })
j.compile(dieP).body('body').topology
// → { S: 1, G: 5, residual: 0 }   V − E + F − (L − F) − 2(S − G) = 0, checked after every boolean (brep.invalid otherwise)
//   three orthogonal through-holes meeting in one chamber: six openings joined through a cavity give genus 5

// ── 3. Why booleans are regularised ───────────────────────────────────────────
const a = j.box(mm(10), mm(10), mm(10))
const b = j.box(mm(10), mm(10), mm(10)).moved(j.tx.move(10, 0, 0))   // shares the face x = 10

a.intersect(b)          // set intersection: a 10 × 10 square.  regularised: ∅ (volume 0, no dangling sheet)
a.intersect(b).volume() // → 0 mm³
a.union(b)              // one 20 × 10 × 10 block: the shared face is interior, so it disappears

j.compile(j.part('bar').add(a.union(b))).body()
// → { faces: 6, edges: 12, vertices: 8, volume: 2000 mm³, note: 'coplanar faces merged (4 pairs)' }

// ── 4. Touching along an edge: legal sets, broken prints ──────────────────────
const c1 = j.box(mm(10), mm(10), mm(10))
const c2 = j.box(mm(10), mm(10), mm(10)).moved(j.tx.move(10, 10, 0))   // shares only the edge x = y = 10
const pair = j.part('pair').add(c1.union(c2), { id: 'pair' })

j.compile(pair).diagnostics
// → [{ level: 'error', kind: 'boolean.nonManifold', at: 'pair',
//      message: 'union meets along edge (10, 10, z), z ∈ [0, 10]: 4 faces share one edge',
//      fix: 'overlap by ≥ 1 lw (move c2 by (−0.45, −0.45, 0)) or separate by ≥ 2 lw' }]
// Every slice of this part is two squares touching at a corner point. The slicer must guess whether that is one
// polygon with a pinch or two polygons, and the printed joint has zero width: fused by luck or broken.

const fixed = j.part('pair').add(c1.union(c2.moved(j.tx.move(-0.45, -0.45, 0))), { id: 'pair' })
j.compile(fixed).diagnostics            // → []

// ── 5. Multi-body parts and op modes ──────────────────────────────────────────
const plate = j.sketch('p', { on: j.plane.XY }).rect('r', 50, 30, { center: true })
const post = j.sketch('q', { on: j.plane.XY }).circle('c', 6, { at: [0, 0] })
const spare = j.sketch('t', { on: j.plane.XY }).circle('c', 6, { at: [40, 0] })

const holder = j.part('holder')
  .extrude(plate.profiles(), mm(5), { id: 'base' })                     // op 'new' (first feature)
  .extrude(post.profiles(), mm(30), { id: 'post' })                     // op 'join' (overlaps base)
  .extrude(spare.profiles(), mm(30), { id: 'spare' })                   // op 'new' (touches nothing: a spare post, body2)
  .cut(j.sketch('h', { on: j.feat('spare').endFace() }).circle('c', 1.7, { at: [40, 0] }).profiles(), mm(8), { id: 'pilot' })
  .boolean('cut', j.feat('post').body(), j.cyl(mm(1.7), mm(10)).moved(j.tx.move(0, 0, 22)), { id: 'bore' })   // CSG tool, one body only

const H = j.compile(holder)
H.summary()
// → { bodies: 2, features: 5, volume: 13'575 mm³ }
//   = base 7500 + post above base π·6²·25 (2827.4) + spare π·6²·30 (3392.9) − pilot 72.6 − bore 72.6
H.decisions.filter(d => d.kind === 'op').map(d => [d.at, d.chose])
// → [['base', 'new'], ['post', 'join'], ['spare', 'new'], ['pilot', 'cut']]
// op: 'intersect' keeps only the overlap with what exists, e.g. trimming a silhouette with a side-view extrude.

// ── 6. Timelines compose, and the unchanged prefix stays cached ──────────────
// Feature chains are functions builder → builder; composing them concatenates timelines.
const drill = p => p.hole([j.pt(-20, -10, 5), j.pt(20, -10, 5)], j.hole.clearance('M3', { depth: mm(5) }), { id: 'mount' })
const soften = p => p.fillet(j.sel.edges('|Z').of('holder'), mm(2), { id: 'soft' })

j.hash(holder.use(drill, soften)) === j.hash(holder.use(drill).use(soften))            // → true  (grouping doesn't matter)
j.compile(holder.use(drill, p => p.fillet(j.sel.edges('|Z').of('holder'), mm(3), { id: 'soft' }))).trace
  .filter(t => t.level === 'L4').map(t => [t.pass, t.cached])
// → [['feature:base', true], ['feature:post', true], ['feature:spare', true], ['feature:pilot', true], ['feature:mount', true], ['feature:soft', false]]
j.compile(holder.use(drill).suppress('mount')).metric('volume')
  .eq(H.metric('volume'))                                                              // → true  (a suppressed feature changes nothing)
