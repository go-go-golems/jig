// 50 · A factorial calibration experiment: from pin-hole coupons to a fit profile
//
// Model
//   An experiment is a value: factors × levels, a design, replicates, a randomisation and a seed.
//   Factors: clearance (5 levels) × hole orientation (2) × material (2) × layer height (3) = 60 cells.
//   Response: does the pin slide in by hand? (binary), plus an ordinal grade seized < press < slide < loose.
//   Material and layer height are hard to change within one print, so they form whole plots
//   (one print job each); orientation and clearance vary inside the plate. This is a split-plot design.
//   Analysis: logistic regression  logit P(slide) = β₀ + β_c·c + β_h·horizontal + β_m·PETG + β_t·layer,
//   then solve P(slide) = 0.9 for c in each condition. The solutions are the calibrated `slide` class.
//
// Notice
//   - The plan is hashed before anything is printed. That hash is the pre-registration.
//   - Printing and measuring are effects. Their results come back as data, and the analysis of that data is pure.
//   - The output is a fit profile (see 16) that every fit-aware slot can use.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── 1. The coupon: five pin-hole pairs, one per clearance level ─────────────
const clearances = [mm(0.10), mm(0.15), mm(0.20), mm(0.25), mm(0.30)]
const coupon = j.fit.coupon({ kind: 'pin-hole', range: [mm(0.10), mm(0.30)], steps: 5 })
  .params({ pinD: mm(5), depth: mm(8), label: true })     // each pair is embossed with its clearance

j.compile(coupon).summary()
// → { bodies: 6, pairs: 5, labels: ['.10', '.15', '.20', '.25', '.30'], volume: 4.1 cm³, bbox: [62, 14, 10] mm }

// ── 2. The experiment, pre-registered ───────────────────────────────────────
const exp = j.experiment({
  hypothesis: [
    'H1: horizontal holes need ≥ 0.04 mm more clearance than vertical holes to reach P(slide) ≥ 0.9',
    'H2: PETG needs more clearance than PLA (β_m < 0)',
    'H3: across 0.12–0.28 mm, the layer-height effect on required clearance is smaller than the orientation effect',
  ],
  factors: {
    clearance: clearances,
    orientation: ['vertical', 'horizontal'],             // hole axis ∥ or ⟂ build direction
    material: ['PLA', 'PETG'],
    layer: [mm(0.12), mm(0.2), mm(0.28)],
  },
  responses: { slides: 'bool', grade: ['seized', 'press', 'slide', 'loose'] },
  design: 'full-factorial',
  wholePlots: ['material', 'layer'],                     // one print job per (material, layer) per replicate
  replicates: 3,
  randomize: { order: 'whole-plots', within: 'plate-position' },
  seed: 50,
})

exp.runs.length                          // → 180 observations = 5 · 2 · 2 · 3 cells × 3 replicates
exp.runs.slice(0, 2)
// → [{ run: 1, print: 'P07', material: 'PETG', layer: 0.2 mm, orientation: 'horizontal', clearance: 0.25 mm, slot: 'B3' },
//    { run: 2, print: 'P07', material: 'PETG', layer: 0.2 mm, orientation: 'vertical',   clearance: 0.10 mm, slot: 'A1' }]
const registered = j.hash(exp)          // → 'sha256:9c1e…'   (publish it before printing)

// ── 3. The prints: 18 jobs, coupons placed at randomised plate positions ─────
const jobs = exp.wholePlots.map(w => j.print(`cal-${w.print}`, {
  printer: j.printer('mk4'), material: j.material(w.material),
}).slice({ layer: w.layer })
  .add('vert', coupon, { orient: '+Z' })                // pins standing up: vertical holes
  .add('horiz', coupon, { orient: '+Y' })               // pins lying down: horizontal holes (teardrops off for this study)
  .set('holes.teardrop', false)                         // raw escape hatch: the study needs round holes
  .plates({ pack: (parts, ctx) => ctx.default(w.shuffle(parts)) }))   // the experiment's seeded plate positions

j.compile(jobs[0]).metrics()
// → { plates: 1, printTime: 38 min, filament: 9.6 g, supportVolume: 0 }
jobs.length                              // → 18 = 2 materials · 3 layer heights · 3 replicates

// ── 4. Measurements come back as data (an effect) ──────────────────────────
const rows = await j.load.csv('data/cal-2026-10-results.csv')
// columns: run, slides, grade, measuredHoleD, measuredPinD, operator
const recorded = exp.record(rows)        // still a value; its hash now includes the data's content hash
recorded.missing                         // → []   (180 of 180 recorded)

// ── 5. Analysis: logistic regression with print-level clustering ───────────
const fitModel = recorded.analyze({
  model: 'logistic',
  formula: 'slides ~ clearance + orientation + material + layer',
  cluster: 'print',                      // whole plots are correlated; use cluster-robust errors
})
fitModel.coefficients
// → { intercept: -4.0, clearance: 40.0 /mm, horizontal: -2.0, PETG: -1.2, layer: -8.0 /mm }
//   (95% CIs: clearance [31, 49], horizontal [-2.7, -1.3], PETG [-1.8, -0.6], layer [-15, -1])

// Required clearance for P = 0.9 (logit 2.197) at layer 0.2 mm:
//   PLA vertical:   c = (2.197 + 4.0 + 1.6) / 40 = 0.195 mm
//   PLA horizontal: + 2.0 / 40 = 0.245 mm       PETG: + 1.2 / 40 more
fitModel.hypotheses
// → { H1: { supported: true, estimate: '+0.050 mm', ci: ['+0.033', '+0.068'] },
//     H2: { supported: true, estimate: 'β_m = -1.2' },
//     H3: { supported: true, layerEffect: '+0.032 mm over 0.12→0.28', orientationEffect: '+0.050 mm' } }

// ── 6. From the model to fit profiles ──────────────────────────────────────
const cal = j.fit.calibrate(rows, { model: fitModel, target: 0.9, by: ['material', 'orientation'], at: { layer: mm(0.2) } })
cal.classes
// → { PLA:  { vertical: { slide: 0.195 mm }, horizontal: { slide: 0.245 mm } },
//     PETG: { vertical: { slide: 0.225 mm }, horizontal: { slide: 0.275 mm } } }

const mk4pla = j.fit.profile('mk4-pla', {
  printer: j.printer('mk4'), material: j.material('PLA'),
  classes: cal.classes.PLA,              // other classes (press, snug, free) are scaled from the same curve
  holeComp: mm(0.1), elephantFoot: mm(0.2),
})
const mk4petg = j.fit.profile('mk4-petg', { printer: j.printer('mk4'), material: j.material('PETG'), classes: cal.classes.PETG })

// Any model can now resolve fit classes against the calibration, with provenance:
const block = j.part('axle-block').fit('mk4-pla')
  .add(j.box(mm(20), mm(20), mm(10)))
  .hole(j.pt(10, 10, 10), j.hole.clearance('M5', { fit: 'slide' }), { id: 'axle' })
const P = j.compile(block)
P.param('axle.d')
// → { value: 5.39 mm, src: "fit 'mk4-pla' (calibrated, exp sha256:9c1e…), slide/vertical = 0.195 mm" }

// ── 7. Honest limits, recorded with the result ─────────────────────────────
fitModel.diagnostics
// → [{ level: 'info', kind: 'experiment.extrapolation', message: 'layer 0.32 mm is outside the studied range [0.12, 0.28]' }]
