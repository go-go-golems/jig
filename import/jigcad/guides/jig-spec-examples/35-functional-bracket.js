// 35 · Functional bracket: orient for the load, size by a beam formula, search thickness against mass
//
// Model
//   A cantilever shelf bracket under a point load F at x = 120 mm from the wall. Bending moment
//   M(x) = F · (120 − x). The stress at a section is σ = M / Z, with section modulus Z = I / c
//   (b·t²/6 for a b × t rectangle). The gusset stiffens the arm until it ends, so the critical
//   section is where the gusset stops, not at the wall.
//   Printed parts are anisotropic: strong within a layer, weaker across layers. The orientation
//   should keep the bending stress inside the layers. layerStrengthRisk measures how much of the
//   load path crosses layers.
//   FEA (`sim`) is an extension; the beam formula is the honest proxy until then.
//
// Notice
//   - preset.functional takes the load, puts "load not across layers" first in the orientation order, and uses 4 walls.
//   - The screw holes turn into teardrops once the part lies on its side: an orientation ↔ geometry fixpoint.
//   - The search finds that a shorter gusset with a thicker arm is lighter. That is not obvious, and it is worth a table.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── 1. The bracket ───────────────────────────────────────────────────────────
const petg = j.material('PETG').with({ strength: { inPlane: j.q('45 MPa'), acrossLayers: j.q('25 MPa') } })

const bracket = j.part('bracket')
  .params({ t: mm(7.5), g: mm(90), b: mm(20) })
  .material(petg)
  .extrude(j.sketch('L', { on: j.plane.XZ })                               // leg 8 mm × 100 mm, arm 150 mm × t
    .polyline('p', [[0, 0], [8, 0], [8, '100 - t'], [150, '100 - t'], [150, 100], [0, 100]], { closed: true }).profiles(),
    { symmetric: 'b' }, { id: 'L' })
  .fillet(j.sel.edges('|Y').of(j.feat('L')).where(e => e.concave).expect(1), mm(6), { id: 'corner' })
  .rib(j.sketch('gusset', { on: j.plane.XZ })
    .line('g', [8, '100 - t - 0.75 * g'], ['8 + g', '100 - t']).wire(['g']), mm(6), { id: 'gusset' })
  .hole([j.pt(8, 0, 30), j.pt(8, 0, 70)], j.hole.counterbore(mm(4.5), mm(8.5), mm(3), mm(8)), { id: 'screws' })   // heads on the arm side
  .chamfer(j.feat('L').sideFaces().edges('|Y').where(e => e.convex), mm(1), { id: 'ease' })

const loaded = bracket.use(j.preset.functional({
  load: { at: j.sel.faces('+Z').of(j.feat('L')).near([128, 0, 100]), dir: '-Z', force: j.q('100 N') } }))   // ~10 kg of shelf per bracket

// ── 2. The strength proxy: σ = M / Z where the gusset ends ──────────────────
const sigmaArm = j.metric('sigmaArm', prog => {
  const g = prog.param('g').value
  const sec = j.inspect.section(prog, j.plane.offset(j.plane.YZ, mm(8).add(g)))
  const M = j.q('100 N').mul(mm(120).sub(g))
  return M.div(sec.Z.top).to('MPa')
}, { dir: 'min', unit: 'MPa', about: 'bending stress in the arm at the gusset tip (beam theory)' })

const B = j.compile(loaded)
j.inspect.section(B, j.plane.offset(j.plane.YZ, mm(98)))
// → { area: 150 mm², centroid: [98, 0, 96.25], I: 703 mm⁴ (= 20 · 7.5³ / 12), Z: { top: 187.5 mm³, bottom: 187.5 mm³ } }
j.evaluate(j.objective.minimize(sigmaArm), B)
// → { sigmaArm: 16.0 MPa }   M = 100 N · 30 mm = 3000 N·mm;  3000 / 187.5 = 16.0 MPa;  in-plane safety factor 45 / 16 = 2.8

// ── 3. Orientation for strength, not just for supports ──────────────────────
const job = j.print('bracket', { printer: j.printer('mk4'), material: petg }).add('bracket', loaded)
const P = j.compile(job)
P.decisions.filter(d => d.kind === 'orient' || d.kind === 'hole')
// → [{ at: 'bracket', kind: 'orient', chose: '+Y (on its side)', alternatives: ['+Z', '-X'],
//      reason: 'functional: layerStrengthRisk 0.03 vs 0.48 (+Z) vs 0.71 (-X, leg on bed); support 0 mm³' },
//    { at: 'screws', kind: 'hole', chose: 'teardrop 45°', reason: 'axis X ⟂ build direction Y' }]
P.trace.find(t => t.pass === 'fixpoint')
// → { pass: 'fixpoint', level: 'L5', note: 'orientation ↔ teardrops converged in 2' }

const upright = j.compile(job.orient('-X'))                              // leg flat on the bed: neat, and weak
upright.metrics().layerStrengthRisk                                      // → 0.71
// The arm's 16.0 MPa now pulls layers apart: 25 / 16 gives a safety factor of 1.6 instead of 2.8. Same geometry, weaker part.

P.summary()
// → { orientation: '+Y', walls: 4 (functional), infill: 25 % gyroid, supports: 0 mm³, warnings: 0 }
P.metrics()
// → { printTime: 2 h 06 min, mass: 43.2 g, filament: 14.1 m, layerStrengthRisk: 0.03, sigmaArm: 16.0 MPa }

// ── 4. Search: arm thickness against gusset length ──────────────────────────
const space = j.design({
  t: j.param.range(mm(5), mm(9), { step: mm(0.5), default: mm(7.5) }),
  g: j.param.choice([mm(60), mm(75), mm(90)], { default: mm(90) }),
}, p => j.print('bracket', { printer: j.printer('mk4'), material: petg }).add('bracket', loaded.params(p)),
{ objective: j.objective.lexicographic([
  j.objective.require(prog => prog.metric('sigmaArm').lte(j.q('18 MPa'))),   // in-plane strength / 2.5
  j.objective.require(prog => prog.metric('layerStrengthRisk') <= 0.1),
  j.objective.minimize('mass'),
]) })

const r = await j.search.grid(space)
r.table()
// → rank  t       g      sigmaArm   mass     printTime   feasible
//   1     9.0 mm  75 mm  16.7 MPa   42.1 g   2 h 02 min  ✓      4500 N·mm / (20 · 9² / 6)
//   2     7.5 mm  90 mm  16.0 MPa   43.2 g   2 h 06 min  ✓      3000 N·mm / 187.5 mm³
//   3     8.0 mm  90 mm  14.1 MPa   44.3 g   2 h 08 min  ✓
//   …     9.0 mm  60 mm  22.2 MPa   40.4 g   1 h 55 min  ✗ sigmaArm
r.best.point                    // → { t: 9 mm, g: 75 mm }
r.summary
// → { points: 27, compiled: 27, cacheHitRate: 0.58, note: 'L and leg features shared across g; gusset shared across t' }

const { report } = j.export.tmf(j.compile(space.at(r.best.point)))
report.kept                     // → ['plates', 'settings', 'part names', 'orientation +Y']
