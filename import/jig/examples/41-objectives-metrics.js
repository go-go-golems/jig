// 41 · Objectives and metrics: where rankings disagree is where the trade-off lives
//
// Model
//   A metric is a function Program → Quantity with a direction (min | max) and a unit, kept in a registry.
//   An objective induces an order on candidates:
//     weighted       Σ wᵢ·mᵢ, where the weights carry units so that the sum has a single dimension
//     lexicographic  compare m₁ first, use m₂ only to break ties, and so on
//     pareto         a dominates b when it is no worse on every metric and better on at least one
//     require        feasibility comes first; infeasible candidates rank below all feasible ones
//
// Notice
//   - The weights are Quantities. "1 minute per gram" makes filament commensurable with time; a bare number would be a DimensionError.
//   - Weighted and lexicographic orders disagree on the phone stand below. The break-even weight is the price of a support.
//   - A Pareto front shows the trade-off without choosing a price at all.
//   - require(rules) removes the candidate that a weighted sum would have chosen.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── Fixture: a phone stand, printed in one of four orientations ──────────────
const stand = j.part('phone-stand')
  .extrude(j.sketch('side', { on: j.plane.YZ })
    .polyline('p', [[0, 0], [90, 0], [90, 6], [22, 6], [14, 72], [8, 72], [12, 6], [0, 6]], { closed: true })
    .profiles(), { symmetric: mm(70) }, { id: 'body' })
  .fillet(j.sel.edges('|X').of('body').where(e => e.concave), mm(3), { id: 'root' })

const job = j.print('stand', { parts: [stand] })

// ── 1. The registry: every metric has a level, a direction and a unit ────────
const P = j.compile(job.orient('+Z'))           // upright, as modelled
P.metrics()
// → { volume: 34.0 cm³ (solid), mass: 31.5 g (as printed, with supports), filament: 10.6 m, cost: 0.69 usd,
//     printTime: 74 min, supportVolume: 3.8 cm³, overhangArea: 1'260 mm², bedContact: 540 mm²,
//     height: 72 mm, cuspMax: 0.2 mm, plates: 1, rebuildMs: 41, cacheHitRate: 0.0 }
// filament: 31.5 g ÷ 1.24 g/cm³ = 25.4 cm³, ÷ 2.405 mm² (1.75 mm filament) = 10.6 m

// ── 2. A custom metric: hand time to clean up supports ───────────────────────
const cleanup = j.metric('cleanup',
  prog => prog.metric('supportVolume').mul(j.q('0.01 minute/mm^3')),
  { dir: 'min', unit: 'minute', about: 'hand time to remove supports (shop estimate: 6 min per 0.6 cm³)' })
P.metric('cleanup')                 // → 38 min

// ── 3. Four candidate orientations, measured ─────────────────────────────────
const orients = j.design({ up: j.param.choice(['+Y', '-X', '+Z', '+X']) }, p => job.orient(p.up))
//          up   supportVolume  printTime  mass     cleanup   firstLayer
//   A     +Y        0 mm³        96 min   29.0 g    0 min    6'300 mm²   on its back
//   B     -X      600 mm³        61 min   26.2 g    6 min    2'100 mm²   on its side
//   C     +Z    3'800 mm³        74 min   31.5 g   38 min      540 mm²   upright, as modelled
//   D     +X      200 mm³        52 min   25.9 g    2 min       38 mm²   on a thin edge

// ── 4. Weighted: everything priced in minutes ────────────────────────────────
const weighted = j.objective.weighted({
  time:    ['printTime', 1],
  hands:   ['cleanup', 1],
  plastic: ['mass', j.q('1 minute/g')],          // a gram of filament is worth a minute of waiting
})
// A: 96 + 0 + 29.0 = 125.0   B: 61 + 6 + 26.2 = 93.2   C: 74 + 38 + 31.5 = 143.5   D: 52 + 2 + 25.9 = 79.9

// ── 5. Lexicographic: no support is worth any amount of time ─────────────────
const lexicographic = j.objective.lexicographic(['supportVolume', 'printTime', 'mass'])

const rw = await j.search.grid(orients, { objective: weighted })
const rl = await j.search.grid(orients, { objective: lexicographic })
rw.ranked.map(c => c.point.up)      // → ['+X', '-X', '+Y', '+Z']   D, B, A, C
rl.ranked.map(c => c.point.up)      // → ['+Y', '+X', '-X', '+Z']   A, D, B, C

// Both put C last. Leaving D aside (section 7 removes it), they disagree about A and B, and that
// disagreement is the trade-off: B saves 35 minutes and 2.8 g
// but needs 600 mm³ of support. Weighted prices support removal at 0.01 min/mm³ and picks B.
// The orders agree only once a cubic centimetre of support costs more than
//   (125.0 − 87.2) min / 600 mm³ = 0.063 min/mm³ ≈ 63 minutes per cm³.

// ── 6. Pareto: show the trade-off without pricing it ─────────────────────────
const front = await j.search.grid(orients, { objective: j.objective.pareto(['printTime', 'supportVolume']) })
front.front.map(c => c.point.up)    // → ['+X', '+Y']   D (52 min, 200 mm³) and A (96 min, 0); B and C are dominated by D

// ── 7. require(rules): feasibility before preference ─────────────────────────
// D stands on a 38 mm² edge, which j.rule.firstLayer rejects (minimum 100 mm²).
const feasibleWeighted = j.objective.lexicographic([j.objective.require(j.rules.fdm), weighted])
const rf = await j.search.grid(orients, { objective: feasibleWeighted })
rf.table()
// → rank  up   feasible  score     notes
//   1     -X   yes        93.2     B
//   2     +Y   yes       125.0     A
//   3     +Z   yes       143.5     C
//   4     +X   no         79.9     D: print.firstLayer (38 mm² < 100 mm²)
j.evaluate(feasibleWeighted, j.compile(orients.at({ up: '+X' })))
// → { feasible: false, score: 79.9, parts: { time: 52, hands: 2, plastic: 25.9 }, violations: ['print.firstLayer'] }

// The front changes too: without D, A and B form the Pareto front.
