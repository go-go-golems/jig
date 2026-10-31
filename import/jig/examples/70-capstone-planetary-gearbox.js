// 70 · Capstone: a print-in-place planetary gearbox, from number theory to a 3MF
//
// Model
//   A planetary train: sun (z_s teeth), n planets (z_p), a fixed ring (z_r), and a carrier as the output.
//     coaxial      z_r = z_s + 2·z_p            the sun–planet and planet–ring centre distances agree
//     assembly     (z_s + z_r) / n ∈ ℤ          n equally spaced planets can all mesh at once
//     neighbours   (z_s + z_p)·sin(π/n) > z_p + 2   adjacent planet tip circles do not touch
//     ratio        i = 1 + z_r / z_s            Willis, with the ring fixed, sun in and carrier out
//   Number theory filters the design space before anything is compiled (d.where). Engineering limits
//   (ratio window, bed size, printability) filter compiled programs (j.objective.require).
//   The whole train prints as one job, with gaps from a calibrated print-in-place fit class.
//   Herringbone teeth hold the planets axially without a top plate.
//
// Notice
//   - The mobility formula counts −1 DOF, yet the solver finds 1. The extra planets are redundant constraints, consistent only
//     because the assembly condition holds. Break it and the redundancy becomes a contradiction.
//   - The gaps come from a calibration (50), with provenance down to the experiment's hash.
//   - The same value is searched, swept for interference, rule-checked, plated, exported and wrapped in a process.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, turn, layer } from 'jig'

// ── 1. The parts, as a function of a design point ──────────────────────────
const gearbox = ({ zs, zp, n, module, width = mm(12), helix = deg(30), fit = 'mk4-pla' }) => {
  const zr = zs + 2 * zp
  const a = module.mul((zs + zp) / 2)                      // centre distance, shared by both meshes
  const common = { module, width, helix, pressure: deg(20), backlash: 'fit' }

  const sun = j.lib.gear.herringbone({ ...common, teeth: zs, hand: 'right' })
    .cut(j.sketch('hex', { on: j.plane.XY }).polygon('h', 6, mm(4), { at: [0, 0] }).profiles(), { through: 'all' }, { id: 'drive' })
  const planet = j.lib.gear.herringbone({ ...common, teeth: zp, hand: 'left' })   // external meshes take opposite hands
    .hole(j.pt(0, 0, 0), j.hole.simple(j.fit.hole(mm(5), 'printInPlace'), width), { id: 'bore' })
  const ring = j.lib.gear.internal({ ...common, teeth: zr, hand: 'left', herringbone: true, rim: mm(4) })   // internal: same hand as the planet

  const pinFrames = Array.from({ length: n }, (_, i) =>
    j.frame({ origin: j.pt(a, mm(0), mm(0)), z: j.dir('+Z') }).moved(j.tx.rotate(j.axis.Z, turn(i / n))))
  const carrier = pinFrames.reduce((c, f, i) => c.port(`pin${i}`, f), j.part('carrier'))
    .extrude(j.sketch('disc', { on: j.plane.offset(j.plane.XY, width.add(layer(2))) })
      .circle('d', a.add(mm(7)), { at: [0, 0] })
      .polygon('out', 6, mm(4), { at: [0, 0] })             // hex socket for the output shaft
      .profiles(), mm(3), { id: 'disc' })
    .extrude(j.sketch('pins', { on: j.feat('disc').startFace() })
      .circle('p0', mm(2.5), { at: [a, 0] }).pattern(['p0'], j.pattern.circular(j.axis.Z, { count: n }))
      .profiles(), width, { id: 'pins' })                    // pins hang down into the planet bores

  const asm = Array.from({ length: n }, (_, i) => i).reduce((s, i) => s
    .add(`p${i}`, planet)
    .joint(`pin${i}`, j.joint.revolute(), `p${i}:axis`, `carrier:pin${i}`)
    .couple(j.couple.gear('sun:pitch', `p${i}:pitch`))      // ratio derived from the teeth on each port
    .couple(j.couple.gear(`p${i}:pitch`, 'ring:pitch')),
  j.assembly('planetary')
    .params({ zs, zp, zr, n, module, ratio: 1 + zr / zs })
    .add('ring', ring, { ground: true })
    .add('sun', sun)
    .add('carrier', carrier)
    .joint('input', j.joint.revolute(), 'sun:axis', 'ring:axis')
    .joint('output', j.joint.revolute(), 'carrier:axis', 'ring:axis'))

  return asm.printInPlace(['ring', 'sun', 'carrier', ...Array.from({ length: n }, (_, i) => `p${i}`)], { clearance: 'printInPlace' })
    .fit(fit)
}

// ── 2. The design space: number theory first, engineering second ──────────
j.metric('ratioError', prog => Math.abs(prog.param('ratio').value - 5), { dir: 'min', about: 'distance from a 5:1 target' })
j.metric('toothStrength', prog => prog.param('module').value.mul(mm(12)).value, { dir: 'max', unit: 'mm²',
  about: 'Lewis proxy m·b for one tooth; printed planets rarely share load evenly, so no factor of n' })

const space = j.design({
  zs: j.param.int(9, 18, { default: 12 }),
  zp: j.param.int(9, 30, { default: 18 }),
  n: j.param.choice([3, 4, 5], { default: 3 }),
  module: j.param.choice([mm(1), mm(1.25), mm(1.5)], { default: mm(1.5) }),
}, gearbox, {
  objective: j.objective.lexicographic([
    j.objective.require([
      prog => prog.param('ratio').value >= 4.5 && prog.param('ratio').value <= 5.5,
      prog => prog.metric('bbox')[0].lte(mm(90)),          // fits the bed with room for the crank
      j.rules.printInPlace,
    ]),
    j.objective.minimize('ratioError'),
    j.objective.maximize('toothStrength'),
    j.objective.minimize('printTime'),
  ]),
})

const assemblable = ({ zs, zp, n }) =>
  (2 * zs + 2 * zp) % n === 0 &&                            // (z_s + z_r)/n with z_r = z_s + 2z_p
  (zs + zp) * Math.sin(Math.PI / n) > zp + 2 &&
  zs >= 10                                                  // fewer teeth undercut badly at 20°, even with shift
const feasible = space.where(assemblable)
space.size                               // → 1980 = 10 · 22 · 3 · 3
feasible.size                            // → 465   (filtered on parameters alone; nothing compiled)

const r = await j.search.grid(feasible)
r.table().slice(0, 4)
// → rank  zs  zp  zr  n  module   ratio  feasible  toothStrength  printTime
//   1     12  18  48  3  1.5 mm   5.000  ✓         18 mm²         3 h 05 min
//   2     12  18  48  4  1.5 mm   5.000  ✓         18 mm²         3 h 22 min
//   3     12  18  48  3  1.25 mm  5.000  ✓         15 mm²         2 h 21 min
//   4     12  18  48  4  1.25 mm  5.000  ✓         15 mm²         2 h 35 min
r.ranked.filter(x => x.feasible).length  // → 110   (8 hit 5:1 exactly)
const best = r.best.point                // → { zs: 12, zp: 18, n: 3, module: 1.5 mm }

// ── 3. Checks: the gear mesh and the mobility paradox ─────────────────────────
const box = gearbox(best)
const B = j.compile(box)
j.inspect.gearMesh(B.occurrence('sun'), B.occurrence('p0'))
// → { ok: true, module: 1.5 mm, pressure: 20°, centreDistance: 22.5 mm = 1.5 · (12 + 18) / 2 }
j.inspect.gearMesh(B.occurrence('p0'), B.occurrence('ring'))
// → { ok: true, internal: true, centreDistance: 22.5 mm = 1.5 · (48 − 18) / 2 }   (equal: the coaxial condition)
j.inspect.mobility(box, { planar: true })
// → { formula: 3·(6 − 1) − 2·5 − 6 = −1, solver: 1, redundant: 2,
//     note: 'each planet beyond the first adds 1 body, 1 revolute and 2 meshes (−1 DOF); consistent because (12 + 48)/3 = 20 ∈ ℤ' }
B.dof()                                   // → 1   (input and output are tied: output = input / 5)

// Break the assembly condition, and the redundancy turns into a contradiction:
j.compile(gearbox({ zs: 13, zp: 18, n: 3, module: mm(1.5) })).diagnostics
// → [{ level: 'error', kind: 'joint.unsolved', at: 'p1', message: 'planet p1 cannot mesh at 120°: (13 + 49)/3 = 20.67 is not an integer',
//      fix: 'n = 2, or z_s ∈ {12, 15, 18} with z_p = 18' }]

// ── 4. Fit and the interference sweep ───────────────────────────────────────
B.param('gap.printInPlace')
// → { value: 0.35 mm, src: "fit 'mk4-pla' (print-in-place coupon, exp sha256:9c1e…)" }
B.sweep('input')                          // the default range for a coupled train is one full period: 5 sun turns = 1 carrier turn
// → { steps: 360, minClearance: 0.31 mm, sweptInterference: 0 mm³, ratioMeasured: 5.000, tightestAt: 'p2 tooth 7 ↔ ring tooth 31, 214°' }

// ── 5. Print rules, and the one fix they ask for ───────────────────────────
j.check(B, j.rules.printInPlace)
// → [{ level: 'warning', kind: 'print.bridge', at: 'carrier/disc start face', message: 'bridges 59 mm over a 0.4 mm gap',
//      fix: 'open windows between the pins so spans stay ≤ 10 mm, with 45° chamfers on their edges' }]
const withWindows = b => b.replace('carrier', c => c.insertAfter('disc', d => d    // replace takes a part, or a lambda over the current one
  .cut(j.sketch('win', { on: j.feat('disc').endFace() })
    .slot('w0', [mm(9), mm(0)], [mm(15), mm(0)], mm(8)).pattern(['w0'], j.pattern.circular(j.axis.Z, { count: 6 }))
    .profiles(), { through: 'all' }, { id: 'windows' })
  .chamfer(j.feat('windows').edges().and(j.sel.edges('<Z')), mm(1.5), { angle: deg(45), id: 'easing' })))
const windowed = withWindows(box)
j.check(j.compile(windowed), j.rules.printInPlace)   // → []

// ── 6. The print job: one plate, one 3MF, one IR bundle ────────────────────
const crank = j.part('crank')
  .extrude(j.sketch('arm', { on: j.plane.XY }).slot('a', [0, 0], [mm(30), mm(0)], mm(10)).profiles(), mm(5), { id: 'arm' })
  .extrude(j.sketch('shaft', { on: j.feat('arm').endFace() }).polygon('h', 6, j.fit.pin(mm(4), 'press'), { at: [0, 0] }).profiles(), mm(12), { id: 'shaft' })

const jobFor = (model, fit = 'mk4-pla') => j.print('planetary', { printer: j.printer('mk4'), material: j.material('PLA'), fit })
  .add('gearbox', model)
  .add('crank', crank)
  .slice({ layer: mm(0.2), walls: 3, infill: { density: 0.25, pattern: 'gyroid' } })
  .plates({ pack: 'skyline', spacing: mm(5) })

const P = j.compile(jobFor(windowed))
P.decisions.filter(d => d.kind === 'orient')
// → [{ at: 'gearbox', chose: '+Z', reason: 'support 0 mm³ (herringbone flanks lean 30° < 45°); bed contact 4'210 mm²' },
//    { at: 'crank',   chose: '+Z', reason: 'support 0 mm³; shaft vertical keeps the hex press fit round' }]
P.metrics()
// → { plates: 1, printTime: 3 h 18 min, filament: 61 g, cost: 1.34 usd, supportVolume: 0, sweptInterference: 0, cuspMax: 0.17 mm }

const { data: tmf, report } = j.export.tmf(P, { plates: true, settings: true, colors: true })
report  // → { kept: ['plates', 'settings', 'print-in-place gaps'], approximated: ['B-rep → mesh (max deviation 0.009 mm)'], dropped: [] }
const bundle = j.export.ir(P)
bundle.data.manifest
// → { levels: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'], design: { zs: 12, zp: 18, n: 3, module: '1.5 mm' },
//     fit: 'mk4-pla@sha256:9c1e…', hash: 'sha256:70ee…' }

// ── 7. The whole thing as a process ────────────────────────────────────────
const makeGearbox = j.process
  .print(() => j.fit.coupon({ kind: 'print-in-place', range: [mm(0.2), mm(0.5)], steps: 7 }))
  .measure({ freeAt: 'index' })
  .step('calibrate', (_, ctx) => j.fit.profile('this-printer', { classes: j.fit.calibrate(ctx.measured).classes }))
  .step('search', async fit => ({ fit, point: (await j.search.grid(feasible)).best.point }))
  .step('model', c => withWindows(gearbox({ ...c.point, fit: 'this-printer' })))
  .critique(j.rules.printInPlace)
  .print(m => jobFor(m, 'this-printer'))
  .measure({ turnsFreely: 'bool', backlash: 'deg' })
j.hash(makeGearbox)                      // → 'sha256:70a1…'   (re-run it on a new printer, and only the coupon is new work)
