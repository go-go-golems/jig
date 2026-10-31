// 43 · The law suite: declared structures, justified laws, one runner
//
// Model
//   There is one way to state a law and one runner.
//     j.structure(Sort, kind, ops)  derives the structural laws of a kind (group, Boolean algebra, lattice, …)
//     j.law(name, gen, prop, { tier, justifies, source })  states an invariant or an oracle by hand
//     j.laws.check(laws, { n, seed })  runs each law on n generated values and shrinks any failure
//   Every law must say what it pays for: a rewrite, a cache rule, a closed form, an oracle, or a bug it catches.
//   Invariants and oracles cite the field they come from (§1.3 of the README). Heuristics never become laws.
//
// Grounding
//   Property-based testing with shrinking; the laws themselves come from solid modelling (Requicha 1980,
//   Mäntylä 1988), layered manufacturing (Dolenc & Mäkelä 1994) and classical geometry (Cavalieri, Pappus).
//
// Notice
//   - Nobody writes associativity by hand: declaring the structure generates it.
//   - A law without `justifies` is refused. Most refused laws should be plain assertions in an example.
//   - Shrinking finds two kinds of bug: engine bugs and wrong properties. The first one below is a wrong property.
//   - The examples elsewhere never call laws inline; they point here.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── Fixtures ──────────────────────────────────────────────────────────────────
const box = j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true }).profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })

// ── 1. Structures are declared once; their laws are derived ──────────────────
// This is how the library itself declares two of its sorts (users only do this for sorts they add).
const shapeLaws = j.structure(j.Shape, 'booleanAlgebra', {
  join: (a, b) => a.union(b), meet: (a, b) => a.intersect(b), eq: (a, b) => a.volume().eq(b.volume(), j.q('1e-6 mm^3')),
  justifies: 'rewrite: chains of unions fuse into one n-ary boolean',
})
shapeLaws.map(L => L.name)
// → ['shape.join.assoc', 'shape.join.comm', 'shape.join.idem', 'shape.meet.assoc', 'shape.meet.comm', 'shape.meet.idem',
//    'shape.absorption', 'shape.distributive', 'shape.inclusionExclusion']

const transformLaws = j.structure(j.Transform, 'group', {
  op: (a, b) => a.then(b), id: j.tx.identity, inv: a => a.inverse(), eq: (a, b) => a.eq(b, { tol: 1e-12 }),
  justifies: 'rewrite: placement chains fuse; ports align through inverses',
})

// ── 2. The built-in suite ────────────────────────────────────────────────────
j.laws.check(j.laws.suite, { n: 200, seed: 1 }).map(r => [r.law, r.tier, r.ok ? '✓' : '✗', r.source ?? ''])
// → law                   tier         ok  source
//   quantity.*            structural   ✓   dimensional analysis
//   point.affine          structural   ✓
//   transform.group       structural   ✓   rigid motions SE(3)
//   shape.boolean         structural   ✓   Requicha 1980
//   region.boolean        structural   ✓   Requicha 1980
//   field.lattice         structural   ✓   Hart 1996
//   timeline.monoid       structural   ✓
//   pattern.action        structural   ✓
//   brep.eulerPoincare    invariant    ✓   Mäntylä 1988
//   mesh.euler            invariant    ✓
//   sketch.dof            invariant    ✓
//   compile.deterministic invariant    ✓
//   extrude.volume        oracle       ✓   Cavalieri
//   revolve.volume        oracle       ✓   Pappus–Guldinus
//   slice.volume          oracle       ✓   Cavalieri
//   slice.cusp            oracle       ✓   Dolenc & Mäkelä 1994
//   snap.deflection       oracle       ✓   beam theory
//   gear.centreDistance   oracle       ✓   involute gearing
//   stack.soundness       oracle       ✓   interval arithmetic
//   plates.bound          oracle       ✓   bin-packing lower bound

// On a fixture the results are concrete. For the box:
//   brep.eulerPoincare: V 16 − E 24 + F 11 − (L 12 − F 11) − 2(S 1 − G 0) = 0   (the rim face has two loops)
//   extrude.volume:     area 2'400 mm² · 30 mm = 72'000 mm³ before the shell

// ── 3. Writing a law: say what it pays for, or it is refused ─────────────────
const gapLaw = j.law('printInPlace.gap',
  j.gen.params(j.lib.hinge.pin({ knuckles: 5, clearance: 'printInPlace' })),
  hinge => j.compile(hinge).metric('minGap').gte(j.fit.gap('printInPlace')),
  { tier: 'invariant', justifies: 'catches hinges that fuse when printed', source: 'house rule, calibrated in 50' })

const vague = j.law('box.looksRight', j.gen.params(box), b => j.compile(b).diagnostics.length === 0)
j.laws.check([gapLaw, vague], { n: 100, seed: 3 })
// → [{ law: 'printInPlace.gap', tier: 'invariant', ok: true, n: 100, justifies: 'catches hinges that fuse when printed' },
//    { law: 'box.looksRight', ok: false, error: 'no justifies: make it an example assertion, or say what it pays for' }]

// ── 4. Fuzzing profile detection: a wrong property, caught by shrinking ──────
const shoelace = pts => Math.abs(pts.reduce((acc, [x, y], i) => {
  const [x2, y2] = pts[(i + 1) % pts.length]
  return acc + x * y2 - x2 * y
}, 0)) / 2

const areaLaw = gen => j.law('profile.area', gen,
  pts => j.sketch('fz', { on: j.plane.XY }).polyline('p', pts, { closed: true }).profiles().area()
    .eq(j.q(`${shoelace(pts)} mm^2`), j.q('1e-6 mm^2')),
  { tier: 'oracle', justifies: 'oracle: profile areas match the shoelace formula', source: 'Gauss area formula' })

j.laws.check([areaLaw(j.gen.polygon({ vertices: [3, 12], radius: mm(50) }))], { n: 500, seed: 11 })
// → [{ law: 'profile.area', ok: false, counterexample: [[12.4, -3.1], [40.2, 18.8], …  9 vertices],
//      shrunk: [[0, 0], [2, 2], [2, 0], [0, 2]],
//      note: 'self-intersecting bow-tie: even–odd profiles keep both lobes (1 + 1 mm²); the shoelace formula cancels them (+1 − 1)' }]

// The engine is right and the property is wrong. Restrict the generator to the domain the formula covers:
j.laws.check([areaLaw(j.gen.polygon({ vertices: [3, 12], radius: mm(50), simple: true }))], { n: 500, seed: 11 })
// → [{ law: 'profile.area', ok: true, n: 500 }]

// ── 5. Fuzzing CSG: the classic printing hazard ──────────────────────────────
const printableUnion = j.law('union.manifold',
  j.gen.csg({ count: 2, depth: 3, primitives: ['box', 'cyl', 'sphere'], size: mm(40), snap: mm(5) }),
  ([a, b]) => j.compile(j.part('u').add(a.union(b))).body().topology.residual === 0,
  { tier: 'invariant', justifies: 'catches unions the slicer would read as two bodies', source: 'Mäntylä 1988' })
j.laws.check([printableUnion], { n: 300, seed: 5 })
// → [{ law: 'union.manifold', ok: false,
//      shrunk: [j.cyl(mm(5), mm(10)), j.cyl(mm(5), mm(10)).moved(j.tx.move(10, 0, 0))],
//      detail: 'the cylinders touch along a line: a non-manifold edge',
//      diagnostic: { kind: 'boolean.nonManifold', fix: 'separate them by ≥ 0.01 mm, or overlap by ≥ lw(1) so the slicer sees one body' } }]
// A snap grid makes these coincidences likely, which is the point: real models are full of round numbers.

// ── 6. Reference robustness, over the model's own parameters ─────────────────
const fragile = box.fillet(j.sel.edges('|Z').of('box').nth(3), mm(4), { id: 'corner' })
j.laws.check(j.laws.for(fragile), { only: ['refs.robust'], n: 100, seed: 2 })
// → [{ law: 'refs.robust', ok: false,
//      counterexample: { w: 37 mm, d: 52 mm }, shrunk: { w: 40 mm, d: 40 mm },
//      note: "nth(3) sorts edges by length, so it flips where w = d: corner moves from top-right to top-left" }]
const sturdy = box.fillet(j.feat('body').sideFaces().edges('|Z').near(j.pt(30, 20, 15)).expect(1), mm(4), { id: 'corner' })
j.laws.check(j.laws.for(sturdy), { only: ['refs.robust'], n: 100, seed: 2 })
// → [{ law: 'refs.robust', ok: true, n: 100 }]

// ── 7. Determinism: an undeclared effect is named ────────────────────────────
const bumpy = box.feature('bumps', (bodies, ctx) =>
  bodies.map(b => b.union(j.sphere(mm(2 + Math.random())).moved(j.tx.move(0, 0, 30)))))
j.laws.check(j.laws.for(bumpy), { only: ['compile.deterministic'], n: 3 })
// → [{ law: 'compile.deterministic', ok: false, culprit: { at: 'bumps', reason: 'lambda reads Math.random (an undeclared effect)' },
//      fix: 'use j.field.noise(scale, { seed }) or take the value from ctx.seed' }]

// ── 8. What stays out of the suite ───────────────────────────────────────────
// The 45° overhang rule, layer-strength risk and the fit classes are heuristics. They are calibrated metrics
// (see 16 and 50), and a "law" about them would only test the calibration data against itself.
// Mobility (Grübler–Kutzbach) is an analysis: two coaxial hinges make the formula wrong while the model is fine (see 15).

// ── 9. In CI ─────────────────────────────────────────────────────────────────
const results = j.laws.check([...j.laws.suite, ...shapeLaws, ...transformLaws, gapLaw, printableUnion], { n: 200, seed: 1 })
results.filter(r => !r.ok).length   // → 1   (union.manifold: kept as a regression case until the kernel heals line contacts)
