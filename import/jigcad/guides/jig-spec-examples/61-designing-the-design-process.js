// 61 · Designing the design process
//
// Model
//   Three processes (values, as in 60) compete on the same jobs:
//     calibrate-first : coupon → calibrate → design → critique → print → measure ⟲
//     print-and-fix   : design → print → measure → adjust ⟲ (up to 5 rounds)
//     analyse-first   : design → critique (rules) → fit stack check → converge → print → measure ⟲
//   An experiment crosses process × part family × printer, with replicates. The responses are
//   meta-metrics of the process, not of the part: prints wasted, minutes to the first good print,
//   filament wasted, designer minutes. A seeded printer model drives a cheap simulated pilot;
//   a smaller real run confirms it.
//   The final step designs the objective itself, because the ranking of processes depends on it.
//
// Notice
//   - Effects are injected, so the same process runs against a simulated printer or a real one.
//   - On the mk4, weighted, lexicographic and constrained objectives each crown a different process. The objective is a design decision.
//   - The winner depends on the printer, an interaction you only see when the process is a value you can vary.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, gram } from 'jig'

// ── 1. Three processes over the same steps ─────────────────────────────────
const families = {
  'snap-box': (fit, p = {}) => j.part('snap-box').fit(fit).params({ w: mm(50), d: mm(35), h: mm(25), ...p }),
  'pin-hinge': (fit, p = {}) => j.assembly('pin-hinge').add('leaf', j.lib.hinge.pin({ knuckles: 5, clearance: 'printInPlace' })).fit(fit),
  'threaded-cap': (fit, p = {}) => j.part('cap').fit(fit).add(j.lib.thread('M30x2', { length: mm(10), internal: true, fit: 'slide' })),
}
const coupon = j.fit.coupon({ kind: 'pin-hole', range: [mm(0.1), mm(0.4)], steps: 4 })
const design = j.process.step('design', ctx => families[ctx.family](ctx.fit ?? 'default'))
const check = j.process.print(m => m).measure({ works: 'bool', defect: ['none', 'tight', 'loose', 'fused', 'other'] })

const processes = {
  'calibrate-first': j.process.print(() => coupon).measure({ bestPair: 'index' })
    .step('calibrate', (c, ctx) => ({ ...ctx, fit: j.fit.calibrate(ctx.measured) }))
    .then(design).critique(j.rules.fdm)
    .then(check.loop(check, { until: r => r.works, max: 4 })),
  'print-and-fix': design
    .then(check.loop(j.process.step('adjust', (m, ctx) => m.override(ctx.adjustFor(ctx.measured.defect))).then(check),
      { until: r => r.works, max: 5 })),
  'analyse-first': j.process.diverge(4, (ctx, i) => families[ctx.family](ctx.fit ?? 'default').override({ gapScale: 0.8 + 0.15 * i }))
    .critique(j.rules.fdm).critique(j.rules.printInPlace)          // rules and clearance checks before any print
    .converge(j.objective.minimize('fitWorstCase'))                // the stack check of 16, as an objective
    .then(check.loop(check, { until: r => r.works, max: 4 })),
}
Object.fromEntries(Object.entries(processes).map(([k, p]) => [k, j.hash(p).slice(0, 14)]))
// → { 'calibrate-first': 'sha256:61a0…', 'print-and-fix': 'sha256:61b7…', 'analyse-first': 'sha256:61c2…' }

// ── 2. Meta-metrics: metrics of a process run ──────────────────────────────
j.metric('printsWasted', run => run.prints.filter(p => !p.kept).length, { dir: 'min', unit: 'count', about: 'prints not kept, coupons included' })
j.metric('minutesToFirstGood', run => run.elapsedUntil(r => r.works), { dir: 'min', unit: 'min' })
j.metric('filamentWasted', run => run.prints.filter(p => !p.kept).reduce((g, p) => g.add(p.filament), gram(0)), { dir: 'min', unit: 'g' })
j.metric('designerMinutes', run => run.designerTime, { dir: 'min', unit: 'min' })

// ── 3. A simulated printer from the calibration study (50) ─────────────────
// Each printer is a logistic model of whether a modelled clearance works; handlers get the run's seeded ctx.random.
const printerModel = ({ beta0, betaC }) => ({
  print: async (prog, ctx) => ({ minutes: prog.metric('printTime'), filament: prog.metric('filament') }),
  measure: async (form, ctx) => {
    const c = ctx.lastPrint.param('fit.slide').value.to('mm').value
    const pWorks = 1 / (1 + Math.exp(-(beta0 + betaC * c)))
    return { works: ctx.random() < pWorks, bestPair: Math.round((c - 0.1) / 0.1) }
  },
})
const printers = { mk4: printerModel({ beta0: -5.6, betaC: 40 }), ender3: printerModel({ beta0: -7.2, betaC: 32 }) }

// ── 4. The experiment: simulated pilot first, then a real confirmation ─────
const exp = j.experiment({
  hypothesis: [
    'H1: calibrate-first wastes fewer prints than print-and-fix on an uncalibrated printer (ender3)',
    'H2: the process × printer interaction on minutesToFirstGood is non-zero',
  ],
  factors: { process: Object.keys(processes), family: Object.keys(families), printer: Object.keys(printers) },
  responses: { printsWasted: 'count', minutesToFirstGood: 'min', filamentWasted: 'g', designerMinutes: 'min' },
  design: 'full-factorial', replicates: 4, randomize: { order: 'runs' }, seed: 61,
})
exp.runs.length                          // → 72 = 3 processes · 3 families · 2 printers · 4 replicates

const simulated = await Promise.all(exp.runs.map(r =>
  j.process.run(processes[r.process], { input: { family: r.family }, effects: printers[r.printer], seed: r.seed })))
const pilot = exp.record(simulated.map((run, i) => ({ ...exp.runs[i], ...run.metrics })))
pilot.analyze({ model: 'mixed', formula: 'printsWasted ~ process * printer + family + (1 | replicate)' }).table('printer')
// → printer   process          printsWasted  minutesToFirstGood  filamentWasted
//   mk4       calibrate-first  1.0           128                 6.1 g
//   mk4       print-and-fix    1.4           104                 21.0 g
//   mk4       analyse-first    0.8           139                 13.2 g
//   ender3    calibrate-first  1.1           146                 7.0 g
//   ender3    print-and-fix    2.6           171                 39.5 g
//   ender3    analyse-first    1.3           162                 20.8 g

// The real confirmation: one family, two replicates per cell, printed for real.
const confirm = exp.runs.filter(r => r.family === 'snap-box' && r.replicate <= 2)   // 12 runs, printed on real printers (an effect)

// ── 5. Designing the objective: three reasonable objectives, three winners ─
const averaged = pilot.means(['process'])   // mean over families and printers
// → { 'calibrate-first': { printsWasted: 1.05, minutesToFirstGood: 137 },
//     'print-and-fix':   { printsWasted: 2.00, minutesToFirstGood: 137.5 },
//     'analyse-first':   { printsWasted: 1.05, minutesToFirstGood: 150.5 } }
const objectives = {
  lexicographic: j.objective.lexicographic([j.objective.minimize('printsWasted'), j.objective.minimize('minutesToFirstGood')]),
  weighted: j.objective.weighted({ waste: ['printsWasted', 5], time: ['minutesToFirstGood', 1] }),
  capped: j.objective.lexicographic([j.objective.require(r => r.printsWasted <= 1.5), j.objective.minimize('filamentWasted')]),
}
Object.fromEntries(Object.entries(objectives).map(([k, o]) => [k, pilot.rank(o, { by: 'process' })[0]]))
// → { lexicographic: 'calibrate-first'   (ties on waste 1.05, then 137 < 150.5 min),
//     weighted:      'calibrate-first'   (142.25 vs 147.5 vs 155.75),
//     capped:        'calibrate-first'   (6.6 g vs 17.0 g; print-and-fix fails the cap) }
// On average they agree. Per printer they do not:
pilot.rank(objectives.weighted, { by: 'process', where: { printer: 'mk4' } })[0]       // → 'print-and-fix'   (111 vs 133 vs 143)
pilot.rank(objectives.lexicographic, { by: 'process', where: { printer: 'mk4' } })[0]  // → 'analyse-first'   (0.8 prints wasted)
pilot.rank(objectives.capped, { by: 'process', where: { printer: 'mk4' } })[0]         // → 'calibrate-first' (6.1 g)

// The objective is chosen before the real run and hashed with the experiment: that is part of the design of the process.
const chosen = objectives.capped
j.hash({ exp, objective: chosen })       // → 'sha256:61f9…'   (pre-registered)
