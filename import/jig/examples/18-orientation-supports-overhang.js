// 18 · Orientation, overhangs and supports: optimisation on the sphere
//
// Model
//   An orientation is a build direction u ∈ S² (plus a free rotation about u that only matters for packing).
//   Overhang is a predicate on face normals: face f overhangs under u when −n_f · u > sin θ_max (θ from vertical).
//   Support volume ≈ ∫ over overhanging area of the height down to the part or the bed (columns, or trees).
//   Choosing u is minimisation over S²: evaluate 26 candidates (cube faces, edges, corners), then refine by descent
//   along geodesics. Objectives are orders on the candidates: lexicographic and weighted orders can disagree.
//   Orientation and geometry are coupled: horizontal holes (axis ⟂ u) become teardrops, which changes overhangs.
//
// Grounding
//   The 45° overhang rule is an empirical heuristic, calibrated per printer. Choosing an orientation is
//   optimisation over directions on the sphere.
//
// Notice
//   - The default is lexicographic: support volume, then bed contact, then height. Every candidate is kept as an alternative.
//   - When two sensible objectives disagree, the disagreement is the trade-off; jig shows the break-even weight.
//   - preset.functional puts layer strength first, which needs a load: the preset takes it as a parameter.
//   - The teardrop ↔ orientation cycle is a fixpoint; the trace shows it converge.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg } from 'jig'

// ── Fixture: an L-bracket with two screw holes and a cable hole ───────────────
const baseHoles = j.sketch('hb', { on: j.plane.offset(j.plane.XY, mm(5)) }).point('p1', [15, 18]).point('p2', [45, 18])
const cableHole = j.sketch('hc', { on: j.plane.XZ }).point('p', [30, 30])
const bracket = j.part('bracket').material(j.material('PETG'))
  .add(j.box(60, 30, 5), { id: 'base' })                                     // 60 × 30 × 5, on the XY plane
  .add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })          // 60 × 5 × 40, total height 45
  .hole(baseHoles, j.hole.clearance('M4', { fit: 'free' }), { id: 'screws' })
  .hole(cableHole, j.hole.simple(mm(8), mm(5)), { id: 'cable' })
const job = j.print('bracket', { printer: j.printer('mk4'), material: j.material('PETG'), parts: [bracket] })

// ── 1. Overhang is a predicate on normals ────────────────────────────────────
const up = j.dir('+Z')
const overhanging = j.sel.faces().of('bracket').where(f => -f.normal.dot(up) > j.q.sin(deg(45)))
j.compile(bracket).faces(overhanging)                          // → ['cable/bore (upper 90°)']   the top of a round horizontal hole
j.inspect.overhang(bracket, { dir: '+Z', max: deg(45) }).area   // → 31 mm²: the same face (6.3 mm of arc × 5 mm deep)

// ── 2. The default: 'auto', lexicographic ────────────────────────────────────
const P = j.compile(job)
P.decisions.find(d => d.kind === 'orient')
// → { at: 'bracket', kind: 'orient', chose: '+Y',
//     reason: 'lexicographic: support 0 mm³ → bed contact 2650 mm² → height 30 mm',
//     alternatives: [                                  // scored on the current geometry: holes shaped for +Y
//       { dir: '+Y', supportVolume: 0,       bedContact: 2650 mm², height: 30 mm, printTime: 52 min },
//       { dir: '+Z', supportVolume: 206 mm³, bedContact: 1765 mm², height: 45 mm, printTime: 58 min },   // inside the round cable hole
//       { dir: '+X', supportVolume: 348 mm³, bedContact:  350 mm², height: 60 mm, printTime: 71 min },   // inside all three holes
//       …, { dir: '-Z', supportVolume: 8900 mm³ (tree; grid would be 60'000), bedContact: 300 mm², height: 45 mm, printTime: 96 min } ] }

// ── 3. Orientation as a design variable on S² ────────────────────────────────
const space = j.design({ up: j.param.dir({ samples: 26 }) }, p => job.orient(p.up))
const coarse = await j.search.grid(space, { objective: j.objective.minimize('supportVolume') })
const fine = await j.search.descent(space, { from: coarse.best.point, steps: 20 })
fine.best.point                       // → { up: '+Y' }   moved 0°: a flat face down is a local minimum for prismatic parts
// Each grid point compiles with its orientation fixed, so its holes get their own teardrops: no fixpoint needed there.

// ── 4. Two reasonable objectives disagree ────────────────────────────────────
// A shelf load pushes down on the base; the upright is screwed to a wall.
const loaded = bracket.use(j.preset.functional({
  load: { at: j.sel.faces('>Z').of('base'), dir: '-Z' },
  fixed: j.sel.faces('<Y').of('upright'),
}))
const loadedJob = j.print('bracket-loaded', { printer: j.printer('mk4'), material: j.material('PETG'), parts: [loaded] })
const loadedSpace = j.design({ up: j.param.dir({ samples: 26 }) }, p => loadedJob.orient(p.up))

const lex = j.objective.lexicographic(['supportVolume', j.objective.maximize('bedContact'), 'height'])
const weighted = j.objective.weighted({ time: ['printTime', 1], risk: ['layerStrengthRisk', 40] })   // 40 min per unit of risk

const rLex = await j.search.grid(loadedSpace, { objective: lex })
const rW = await j.search.grid(loadedSpace, { objective: weighted })
rLex.best.point                       // → { up: '+Y' }
rW.best.point                         // → { up: '+X' }
rW.table()
// → up   printTime  layerStrengthRisk  score
//   +X   71 min     0.05               73.0     the L lies flat: bending stays inside each layer
//   +Y   52 min     0.60               76.0     the base bends across its layers
//   +Z   58 min     0.80               90.0     the upright bends across its layers at the corner
// Break-even: +X costs 19 min for 0.55 less risk, so it wins whenever risk is worth more than 19 / 0.55 = 34.5 min.

// ── 5. preset.functional: strength first ─────────────────────────────────────
const F = j.compile(loadedJob)
F.summary().orientation               // → { bracket: '+X', reason: 'functional: layerStrengthRisk 0.05 (next: +Y 0.60)' }
F.metrics()                           // → { supportVolume: 0, bedContact: 350 mm², height: 60 mm, printTime: 71 min, layerStrengthRisk: 0.05 }

// ── 6. Supports, when you cannot avoid them ──────────────────────────────────
const flipped = job.orient('-Z')
j.compile(flipped.supports({ kind: 'tree', angle: deg(45) })).metric('supportVolume')   // → 8'900 mm³
j.compile(flipped.supports({ kind: 'grid' })).metric('supportVolume')                   // → 60'000 mm³  (1500 mm² × 40 mm)
j.compile(flipped.supports({ kind: 'tree', angle: deg(55) })).metric('supportVolume')   // → 8'900 mm³   (the base is flat: 90°)

// ── 7. The teardrop ↔ orientation fixpoint ───────────────────────────────────
P.trace.filter(t => ['orient', 'teardrops', 'fixpoint'].includes(t.pass))
// → [{ pass: 'orient',    level: 'L5', iter: 1, note: '+Y: support 142 mm³ (2 round screw holes) beats +Z 206 mm³, +X 348 mm³' },
//    { pass: 'teardrops', level: 'L4', iter: 1, note: 'screws.p1, screws.p2 → teardrop (axis ⟂ +Y), cable stays round' },
//    { pass: 'orient',    level: 'L5', iter: 2, note: '+Y: support 0 mm³' },
//    { pass: 'teardrops', level: 'L4', iter: 2, cached: true, note: 'unchanged' },
//    { pass: 'fixpoint',  note: 'converged in 2' }]
P.why(j.feat('screws').bores())
// → { chain: ['clearance M4 free → Ø 4.7 mm', 'axis Z ⟂ build direction +Y → 45° teardrop, tip toward +Y'], decidedIn: 'iteration 1' }
