// 34 · Print-in-place mechanism: an articulated snake that comes off the bed already moving
//
// Model
//   A chain of n rigid links and n − 1 revolute joints. Each joint is the subgroup SO(2) of SE(3),
//   so Grübler–Kutzbach gives M = 6(n − 1 − j) + Σfᵢ = n − 1 degrees of freedom.
//   Printing in place means every pair of mating surfaces is separated by the fit class
//   'printInPlace'. That gap is measured along the surface normal, so on a 45° cone an axial
//   offset of g leaves only g · cos 45° = 0.71 g.
//   Each joint is checked by sweeping it through its limits and integrating the swept interference.
//
// Notice
//   - Conical knuckles (45°) let the pins print without support. The rules check that no support lands inside a gap.
//   - The naive axial offset fails the clearance rule; offsetFace offsets along the normal and passes.
//   - A four-hinge coupon calibrates the gap for your printer. The whole snake then recompiles tighter, from cache.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, turn } from 'jig'

// ── 1. One link: body, fork (behind), tongue (ahead), conical knuckles ───────
// Link pitch 18 mm, height 9 mm in thirds: prongs z 0–3 and 6–9, the next link's tongue z 3–6.
const gap = j.fit.gap('printInPlace')
const link = (name, { naive = false } = {}) => j.part(name)
  .params({ P: mm(18), W: mm(12), H: mm(9) })
  .extrude(j.sketch('body', { on: j.plane.XY }).rect('r', 14, 'W', { center: true, r: 2 }).profiles(), 'H', { id: 'body' })
  .cut(j.sketch('slot', { on: j.plane.XZ }).rect('s', 8, mm(3).add(gap.mul(2)), { at: [-5, 4.5], center: true }).profiles(),
    { through: 'all' }, { id: 'slot' })                                    // the fork: room for the previous tongue
  .extrude(j.sketch('tongue', { on: j.plane.offset(j.plane.XY, mm(3)) }).slot('t', [7, 0], [13, 0], 6).profiles(),
    mm(3), { id: 'tongue', op: 'join' })
  .add(j.cone(mm(1.8), mm(0), mm(1.8)), { at: j.tx.move(13, 0, 6), op: 'join' })                          // knuckle up
  .add(j.cone(mm(1.8), mm(0), mm(1.8)), { at: j.tx.mirror(j.plane.XY).then(j.tx.move(13, 0, 3)), op: 'join' })   // knuckle down
  .revolve(j.sketch('recess', { on: j.plane.XZ })                          // two half-cone sections about the fork axis x = −5
    .polyline('up', [[-5, 6], [-3.2, 6], [-5, 7.8]], { closed: true })
    .polyline('down', [[-5, 3], [-3.2, 3], [-5, 1.2]], { closed: true }).profiles(),
    j.axis.through(j.pt(-5, 0, 0), j.pt(-5, 0, 1)), turn(1), { op: 'cut', id: 'recess' })
  .with(b => naive
    ? b.move(j.feat('recess').faces(), j.tx.move(0, 0, gap))                // axial offset: wrong on a cone
    : b.offsetFace(j.feat('recess').faces(), gap))                          // normal offset: right on any surface
  .chamfer(j.feat('body').sideFaces().edges('|Z').where(e => e.convex), mm(3), { id: 'ends' })
  .port('fork', j.frame({ origin: j.pt(-5, 0, 0), x: j.dir('+X'), z: j.dir('+Z') }))
  .port('tongue', j.frame({ origin: j.pt(13, 0, 0), x: j.dir('+X'), z: j.dir('+Z') }))

// ── 2. The chain: n links, n − 1 revolute joints, printed as one body ───────
const snake = (n, opts) => Array.from({ length: n - 1 }, (_, k) => k + 1).reduce((a, i) => a
  .add(`s${i}`, link('link', opts))
  .joint(`h${i}`, j.joint.revolute({ limits: [deg(-35), deg(35)] }), `s${i - 1}:tongue`, `s${i}:fork`),
  j.assembly('flexi-snake').add('s0', link('head', opts)))                 // s0 is grounded: the first component
  .with(a => a.printInPlace(Array.from({ length: n }, (_, i) => `s${i}`), { clearance: 'printInPlace' }))

const S = j.compile(snake(12))
S.dof()                       // → 11
j.inspect.mobility(snake(12))   // → { grubler: { n: 12, joints: 11, sumF: 11, M: 6·(12 − 1 − 11) + 11 = 11 }, solverDOF: 11 }

// ── 3. Clearance rules: the cone trap ───────────────────────────────────────
j.check(j.compile(snake(12, { naive: true })), j.rules.printInPlace)
// → [{ level: 'error', kind: 'print.thinFeature', at: 's1/recess ↔ s0/knuckle', message: 'normal gap 0.28 mm < printInPlace 0.40 mm',
//      fix: 'offset along the normal (offsetFace) instead of moving the recess by 0.40 mm in z' }]
j.check(S, j.rules.printInPlace)
// → []   (normal gap 0.40 mm everywhere; supports inside gaps: 0 mm³; knuckle overhang 45.0°)

// ── 4. Sweep every hinge through its limits ──────────────────────────────────
S.sweep('h5')
// → { joint: 'h5', range: [-35°, 35°], steps: 36, sweptInterference: 0 mm³, minClearance: 0.4 mm at ±35° (s4 ↔ s5 chamfers) }

const square = j.compile(snake(12).replace('s5', link('link').suppress('ends')))
square.diagnostics
// → [{ level: 'error', kind: 'asm.sweptInterference', at: ['s4', 's5'], message: '6.2 mm³ swept overlap beyond ±28°',
//      fix: "keep the 'ends' chamfer (free to ±38°) or set limits to ±27°" }]

// ── 5. Calibrate the gap on your printer: a four-hinge coupon ────────────────
const coupon = j.fit.coupon({ kind: 'print-in-place', range: [mm(0.2), mm(0.5)], steps: 4 })   // hinges at 0.2/0.3/0.4/0.5 mm
j.compile(j.print('coupon', { printer: j.printer('mk4'), material: j.material('PLA'), parts: [coupon] })).metrics()
// → { printTime: 14 min, filament: 2.1 g }

const results = [                                                         // measured by hand after printing
  { gap: mm(0.2), free: false }, { gap: mm(0.3), free: true, note: 'needs one firm twist' },
  { gap: mm(0.4), free: true }, { gap: mm(0.5), free: true, wobble: 'noticeable' },
]
const cal = j.fit.calibrate(results)
// → { classes: { printInPlace: 0.30 mm, … }, basis: 'smallest freed gap', samples: 4, previous: 0.40 mm }
j.fit.profile('mk4-pla', { printer: j.printer('mk4'), material: j.material('PLA'), classes: cal.classes })

// ── 6. Recompile tighter, then print ─────────────────────────────────────────
const job = j.print('snake', { printer: j.printer('mk4'), material: j.material('PLA') })
  .add('snake', snake(12))
  .fit('mk4-pla')
  .supports(false)
  .use(j.rules.printInPlace)

const P = j.compile(job)
P.why(gap)                    // → { value: 0.30 mm, src: 'fit mk4-pla (calibrated, printInPlace)', previous: 0.40 mm }
P.trace.filter(t => t.cached).length / P.trace.length
// → 0.79   (only the recess offsets and the slot height changed; bodies, tongues and chamfers came from cache)
P.summary()
// → { plates: 1, orientation: { snake: '+Z (as modelled; knuckle axes vertical)' }, supports: 0 mm³,
//     bedChamfer: '0.4 mm on 46 bed edges, including the 22 inside hinge gaps', warnings: 0 }
P.metrics()                   // → { printTime: 1 h 38 min, filament: 14.2 g, cost: 0.31 usd, sweptInterference: 0 }
j.export.tmf(P).report.kept   // → ['plates', 'settings', 'part names']
