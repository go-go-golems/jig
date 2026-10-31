// 42 · Search: a wall hook, trading a strength proxy against print time
//
// Model
//   The hook's design space is t (arm thickness) × walls × infill × orientation: 13 · 5 · 11 · 3 = 2'145 points.
//   There is no FEA in the print suite, so strength is a proxy. The custom metric `capacity` is the
//   bending capacity of the arm's root:
//     F = σ · Z_eff / L,   Z_eff = (b·t²/6) · [1 − (1 − ρ)(1 − 2w/t)³]
//   where w is the shell (walls × line width), ρ is the infill density, and σ blends the along-layer
//   strength (50 MPa) with the across-layer strength (25 MPa, PLA) by the metric layerStrengthRisk.
//   Search: Latin hypercube to explore, descent to refine, NSGA-II to map the Pareto front.
//
// Notice
//   - Candidates that differ only in walls, infill or orientation reuse every L4 feature, so the cache makes search cheap.
//   - Descent moves one coordinate at a time, which is the access pattern the per-feature cache likes best.
//   - The front says what the single "best" hides: every Newton above ~100 N costs about 7 s of print time.
//   - Seeds make every run reproducible (the suite's compile.deterministic covers search too).
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── Fixture: a J-shaped wall hook ─────────────────────────────────────────────
const profile = j.sketch('profile', { on: j.plane.XZ })
  .rect('back', 't', 'plate', { at: [0, 0] })                 // the plate against the wall
  .rect('arm', 'arm', 't', { at: [0, 0] })                    // the arm, out from the wall
  .rect('tip', 't', mm(12), { at: ['arm - t', 0] })           // the upturned tip
const hook = j.part('hook')
  .params({ b: mm(20), t: mm(6), arm: mm(40), plate: mm(50) })
  .extrude(profile.profiles(), 'b', { id: 'body' })
  .fillet(j.sel.edges('|Y').of('body').where(e => e.concave), mm(4), { id: 'root' })

// ── 1. A strength proxy, as a registered metric ──────────────────────────────
const capacity = j.metric('capacity', prog => {
  const b = prog.param('b').value, t = prog.param('t').value, arm = prog.param('arm').value
  const w = mm(0.45).mul(prog.param('walls').value)                     // shell = walls × line width (0.4 mm nozzle)
  const rho = prog.param('infill').value
  const core = Math.max(0, 1 - w.mul(2).div(t).value) ** 3              // the infilled core's share of I
  const Zeff = b.mul(t).mul(t).div(6).mul(1 - (1 - rho) * core)
  const r = prog.metric('layerStrengthRisk').value                      // 0: load within layers · 1: across them
  const sigma = j.q('50 MPa').mul(1 - r).add(j.q('25 MPa').mul(r))
  return sigma.mul(Zeff).div(arm).to('N')
}, { dir: 'max', unit: 'N', about: 'bending capacity at the arm root (beam proxy; replace with sim when available)' })

// ── 2. The design space ───────────────────────────────────────────────────────
const hookSpace = j.design({
  t:      j.param.range(mm(4), mm(10), { step: mm(0.5), default: mm(6) }),   // 13 values
  walls:  j.param.int(2, 6, { default: 3 }),                                // 5
  infill: j.param.range(0.1, 0.6, { step: 0.05, default: 0.15 }),           // 11
  up:     j.param.choice(['+Y', '+Z', '-X'], { default: '+Y' }),            // 3: flat, upright, on its back
}, p => j.print('hook', { parts: [hook.params({ t: p.t })] })
  .params({ walls: p.walls, infill: p.infill })
  .orient(p.up)
  .slice({ walls: 'walls', infill: { density: 'infill', pattern: 'gyroid' } }))

j.compile(hookSpace.at({})).metric('capacity')   // → 128.8 N  (t 6, 3 walls, 15 %, flat: Z_eff = 103.0 mm³)

// The objective: be strong enough first, then fast.
const strongEnough = j.objective.require(prog => prog.metric('capacity').gte(j.q('100 N')))
const objective = j.objective.lexicographic([strongEnough, j.objective.minimize('printTime')])

// ── 3. Explore: Latin hypercube ──────────────────────────────────────────────
const r1 = await j.search.lhs(hookSpace, { budget: 24, seed: 3, objective })
r1.table()
// → rank  t       walls  infill  up   capacity  printTime  feasible  cacheHit
//   1     6.5 mm  3      0.25    +Y   150 N     36 min     yes       0.62
//   2     7.5 mm  2      0.40    +Y   173 N     39 min     yes       0.58
//   …
//   24    4.5 mm  5      0.10    +Z    59 N     31 min     no        0.71
r1.stats                          // → { compiles: 24, features: { computed: 31, cached: 65 }, cacheHitRate: 0.68, ms: 2'140 }

// ── 4. Refine: coordinate descent from the best LHS point ────────────────────
const r2 = await j.search.descent(hookSpace, { from: r1.best.point, steps: 20, objective })
r2.best.point                     // → { t: 5 mm, walls: 4, infill: 0.15, up: '+Y' }
r2.best.metrics                   // → { capacity: 102 N, printTime: 31 min }
// path: (6.5, 3, .25) → (6, 3, .2) → (5.5, 3, .15) 112 N → (5, 4, .15) 102 N; (5, 3, .15) is 95 N and infeasible
r2.stats.cacheHitRate             // → 0.86   (3 of 4 moves leave the geometry untouched)

// The two near-optimal answers differ in kind: a thinner arm with one more wall beats a thicker arm.
// t 5.0 mm, 4 walls: Z_eff = 81.8 mm³ → 102 N     t 5.5 mm, 3 walls: Z_eff = 89.5 mm³ → 112 N, but 2 min slower

// ── 5. Map the trade-off: NSGA-II on (capacity ↑, printTime ↓) ───────────────
const r3 = await j.search.nsga2(hookSpace, {
  pop: 24, gens: 12, seed: 7,
  objective: j.objective.pareto(['capacity', 'printTime']),   // directions come from the registry
})
r3.front.map(c => [c.metrics.capacity, c.metrics.printTime, c.point])
// → [[ 80 N, 26 min, { t: 4.5 mm,  walls: 3, infill: 0.15, up: '+Y' }],
//    [102 N, 31 min, { t: 5 mm,    walls: 4, infill: 0.15, up: '+Y' }],
//    [150 N, 36 min, { t: 6.5 mm,  walls: 3, infill: 0.25, up: '+Y' }],
//    [212 N, 45 min, { t: 8 mm,    walls: 3, infill: 0.3,  up: '+Y' }],
//    [340 N, 58 min, { t: 10 mm,   walls: 4, infill: 0.3,  up: '+Y' }]]
// Every front point prints flat: upright prints load the root across layers and are dominated.
// The slope above 100 N: (340 − 102) N over (58 − 31) min ≈ 8.8 N per minute.

// ── 6. Reproducibility ───────────────────────────────────────────────────────
const again = await j.search.nsga2(hookSpace, { pop: 24, gens: 12, seed: 7, objective: j.objective.pareto(['capacity', 'printTime']) })
j.hash(again.front) === j.hash(r3.front)   // → true
