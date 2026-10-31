// 16 · Fit: clearances calibrated to your printer, and tolerance stacks
//
// Model
//   A fit class is a radial gap per side, totally ordered: press < snug < slide < free < printInPlace.
//   A printer distorts sizes; for holes the map is close to affine: actual = a · nominal + b.
//   Calibration is least squares on a printed coupon; compensation is the inverse map: model = (target − b) / a.
//   A fit profile = (printer, material, classes, compensation). It is context: fit-aware slots resolve through it.
//   Tolerances add as intervals (worst case: Σ |tᵢ|) or as random variables (RSS: √Σ σᵢ²; Monte Carlo).
//
// Grounding
//   Interval and statistical (RSS, Monte Carlo) tolerance analysis. Printed fit classes are empirical and
//   calibrated with coupons; ISO 286 covers machined parts only.
//
// Notice
//   - Defaults are honest starting points and say so (fit.uncalibrated) until a coupon replaces them.
//   - Holes are compensated by the inverse of the measured map, not by a fudge constant.
//   - Every fitted size carries provenance: class, profile, coupon and date.
//   - Every Monte Carlo sample lies inside the worst-case interval: the interval-soundness law.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── 1. Defaults, flagged as defaults ─────────────────────────────────────────
j.fit.classes()
// → { press: 0.05 mm, snug: 0.10 mm, slide: 0.20 mm, free: 0.30 mm, printInPlace: 0.40 mm }   (radial, per side)

const pegBoard = j.part('peg-board')
  .params({ pin: mm(3) })
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 30, 20, { center: true }).profiles(), mm(6), { id: 'body' })
  .hole([[-8, 0], [8, 0]], j.hole.simple(j.fit.hole(j.ref('pin'), 'slide'), mm(6)), { id: 'pins' })

const P0 = j.compile(pegBoard)
P0.why(j.feat('pins').bores())
// → { value: 'Ø 3.50 mm', chain: ['pin 3.00 mm', '+ 2 × slide 0.20 mm (default class)', '+ holeComp 0.10 mm (default)'] }
P0.diagnostics
// → [{ level: 'info', kind: 'fit.uncalibrated', at: 'pins',
//      message: 'fit classes and hole compensation are defaults', fix: "print j.fit.coupon({ kind: 'pin-hole' }) and run j.fit.calibrate" }]
j.compile(pegBoard.use(j.preset.production)).diagnostics[0].level   // → 'warning'

// ── 2. Coupons: printable experiments ────────────────────────────────────────
// Coupons print with compensation off: they measure the raw printer.
const coupon = j.fit.coupon({ kind: 'pin-hole', range: [mm(0.05), mm(0.5)], steps: 10 })
const pip = j.fit.coupon({ kind: 'print-in-place', range: [mm(0.2), mm(0.5)], steps: 7 })

j.compile(coupon).summary()
// → { pins: '10 × Ø 6.00 mm', holes: 'Ø 6.10 … 7.00 mm (gap 0.05 … 0.50 mm per side)', labels: "'05' … '50' embossed",
//     printTime: 24 min, filament: 6.1 g }

// ── 3. Measure, then calibrate ───────────────────────────────────────────────
// Hole diameters measured with gauge pins; the ten printed pins average 6.04 mm (calipers).
const holes = [[6.10, 5.91], [6.20, 6.01], [6.30, 6.11], [6.40, 6.21], [6.50, 6.31],
               [6.60, 6.41], [6.70, 6.51], [6.80, 6.61], [6.90, 6.72], [7.00, 6.82]]   // [nominal, measured] mm
const outcomes = ['no-fit', 'no-fit', 'press', 'snug', 'slide', 'slide', 'free', 'free', 'loose', 'loose']

const cal = j.fit.calibrate([
  { coupon, pin: mm(6.04), holes, outcomes },
  { coupon: pip, outcomes: ['fused', 'fused', 'stiff', 'free', 'free', 'free', 'loose'] },
])
cal
// → { hole: { a: 1.0097, b: -0.252 mm, r2: 0.9999, residualSD: 0.003 mm, range: [6.1, 7.0] mm },
//     pinOversize: 0.04 mm,
//     classes: { press: 0.035 mm, snug: 0.085 mm, slide: 0.135 mm, free: 0.235 mm, printInPlace: 0.35 mm },
//     coupons: ['a3f9…', '71c2…'], date: '2026-10-12' }
// Classes are *true* gaps: (measured hole − measured pin) / 2 at the first row with that outcome,
// e.g. slide: (6.31 − 6.04) / 2 = 0.135 mm.

// ── 4. A profile: compensation is the inverse map, written as a lambda in its slot ─
const mk4petg = j.fit.profile('mk4-petg', {
  printer: j.printer('mk4'),
  material: j.material('PETG'),
  classes: cal.classes,
  holeComp: (d, ctx) => d.sub(cal.hole.b).div(cal.hole.a).sub(d),   // model − target, from actual = a·model + b
  xyComp: mm(-0.02),                                                // pins print 0.04 mm oversize in diameter
  elephantFoot: mm(0.15),
})

// ── 5. Fit-aware sizes in a model ────────────────────────────────────────────
const P1 = j.compile(pegBoard.fit(mk4petg))
P1.why(j.feat('pins').bores())
// → { value: 'Ø 3.49 mm',
//     chain: ['pin 3.00 mm', '+ 2 × slide 0.135 mm (mk4-petg)', '= 3.27 mm actual target', 'model = (3.27 + 0.252) / 1.0097 = 3.49 mm'],
//     profile: 'mk4-petg', calibrated: '2026-10-12', coupons: ['a3f9…'] }
// Same as the default for slide, by luck. For press the default was wrong:
//   default press hole 3.20 mm prints at 1.0097 · 3.20 − 0.252 = 2.98 mm: it would not take a 3 mm pin.
//   calibrated press:  (3.00 + 0.07 + 0.252) / 1.0097 = 3.29 mm.

j.fit.gap('slide').resolve({ fit: mk4petg })           // → 0.135 mm
j.fit.hole(mm(3), 'press').resolve({ fit: mk4petg })   // → 3.29 mm
j.fit.pin(mm(4), 'press').resolve({ fit: mk4petg })    // → 3.89 mm   (target 4 − 2·0.035 = 3.93, minus 0.04 oversize)
P1.diagnostics                                         // → []

// ── 6. Stacks: will this lid be free on every print? ─────────────────────────
const lidGap = j.stack('lid-gap')
  .add(mm(56).pm(0.15), { dir: +1 })                   // box inner width
  .add(mm(55.4).pm(0.10), { dir: -1 })                 // lid lip outer width
  .add(mm(0).pm(0.08), { dir: -1 })                    // elephant's-foot residual on the lip

lidGap.worstCase()   // → { nominal: 0.60 mm, range: [0.27, 0.93] mm }             Σ|tᵢ| = 0.33 mm
lidGap.rss()         // → { nominal: 0.60 mm, range: [0.40, 0.80] mm, sigma: 0.066 mm }   √(0.15² + 0.10² + 0.08²) = 0.197 = 3σ
lidGap.monteCarlo({ n: 10000, dist: 'normal', truncate: '3σ', seed: 7 })
// → { mean: 0.600 mm, sd: 0.066 mm, p001: 0.40 mm, p999: 0.80 mm, min: 0.37 mm, max: 0.83 mm }

// Every sample lies inside the worst-case interval, as it must (the suite's stack.soundness oracle).

// Per side the gap is half: 0.30 mm nominal against the calibrated free class of 0.235 mm.
// P(gap / 2 < 0.235 mm) = P(gap < 0.47 mm) = Φ((0.47 − 0.60) / 0.066) ≈ 2.4 %: a few lids will feel like 'slide'.
lidGap.monteCarlo({ n: 10000, seed: 7 }).p(g => g.lt(mm(0.47)))   // → 0.024
