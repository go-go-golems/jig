// 30 · Quick start: zero config → preset → tweak → lambda → plate
//
// Model
//   Three calls give a printable result: a part, a print job, an export.
//   Every opinion on the way is a default you can see in prog.summary() and change at one of four
//   levels: tweak its params, swap a library strategy, wrap the default with a lambda, or .set() it raw.
//
// Notice
//   - Nothing here names a printer, a material or a support style, yet the output is a sliced 3MF.
//   - Defaults are visible, with provenance, before you override any of them.
//   - The same object goes from "it works" to "tuned for my printer" without being rewritten.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, lw, layer } from 'jig'

// ── 1. Zero configuration: a cable clip ──────────────────────────────────────
const clip = j.part('cable-clip')
  .extrude(j.sketch('s', { on: j.plane.XY })
    .rect('base', 24, 12, { center: true, r: 2 })
    .circle('hole', 1.7, { at: [-7, 0] })
    .profiles(), mm(3), { id: 'base' })
  .extrude(j.sketch('ring', { on: j.plane.XZ })
    .circle('outer', 5, { at: [4, 8] }).circle('inner', 3.5, { at: [4, 8] })
    .profiles(), { symmetric: mm(6) }, { id: 'ring' })
  .cut(j.sketch('gap', { on: j.plane.XZ }).rect('g', 3, 6, { at: [8.5, 10] }).profiles(), { through: 'all' }, { id: 'gap' })

const job = j.print('clip', { parts: [clip] })        // shorthand for j.print('clip').add('cable-clip', clip)
const P = j.compile(job)

P.summary()
// → { printer: 'generic-fdm (default)', material: 'PLA (default)', plates: 1, parts: 1,
//     orientation: { 'cable-clip': '+Z (as modelled)', reason: 'support 0 mm³; bed contact 274 mm²' },
//     holes: { 'cable-clip/hole': 'vertical → +0.1 mm compensation (fit: uncalibrated defaults)' },
//     printTime: 9 min, filament: 0.9 g, warnings: 1 }
P.diagnostics
// → [{ level: 'info', kind: 'fit.uncalibrated', message: 'using default fit classes; print j.fit.coupon() once to calibrate' }]

const { data: tmf, report } = j.export.tmf(P)
report
// → { kept: ['plates', 'settings', 'part names'], approximated: ['B-rep → mesh (max deviation 0.008 mm)'], dropped: [] }

// ── 2. A preset: functional parts get thicker walls and layer-aware orientation ─
const sturdy = j.print('clip', { parts: [clip.use(j.preset.functional)] })
j.compile(sturdy).summary().orientation
// → { 'cable-clip': '+Z', reason: 'functional: ring load path stays within layers; support 0 mm³' }

// ── 3. Tweak a default's params ──────────────────────────────────────────────
const tuned = job
  .slice({ layer: mm(0.16), walls: 4 })                 // partial params: everything else stays default
  .supports(false)

// ── 4. Swap in a library strategy ────────────────────────────────────────────
const lyingDown = job.orient('min-height')

// ── 5. Wrap the default with a lambda ────────────────────────────────────────
// Keep the default orientation, unless it would put the ring's gap facing down.
const careful = job.orient((part, ctx) => {
  const choice = ctx.default(part)
  return choice.faceDown(j.feat('gap').faces()) ? ctx.candidates(part)[1] : choice   // the default's second-best
})
j.compile(careful).decisions.find(d => d.kind === 'orient')
// → { at: 'cable-clip', kind: 'orient', chose: '+Z', alternatives: ['-Z', '+X', …], reason: 'lambda kept default (gap faces +X)' }

// ── 6. The raw escape hatch ──────────────────────────────────────────────────
const raw = job.set('slice.seam', 'rear')

// ── 7. Make it yours: a house preset is just a function ──────────────────────
const house = j.preset('house', b => b
  .with(x => x.slice({ layer: mm(0.2), walls: 3, infill: { density: 0.2, pattern: 'gyroid' } }))
  .with(x => x.supports({ kind: 'tree', only: 'buildplate' })))

const mine = j.print('clip', { printer: j.printer('mk4'), material: j.material('PETG'), parts: [clip] })
  .use(house)
  .fit('mk4-petg')                                      // a calibrated fit profile (see 16)

const M = j.compile(mine)
M.summary().holes
// → { 'cable-clip/hole': 'vertical → +0.14 mm (fit: mk4-petg, calibrated 2026-10-12, slide)' }
M.metrics()
// → { printTime: 11 min, filament: 1.0 g, cost: 0.03 usd, supportVolume: 0, cuspMax: 0.2 mm, plates: 1 }

// ── 8. And the model stays a value ───────────────────────────────────────────
const softer = clip.insertAfter('ring', b => b.fillet(j.feat('ring').edges('%circle'), mm(0.8), { id: 'soft' }))
j.diff(clip, softer)
// → { added: ['soft (fillet, 4 edges)'], changed: [], removed: [] }
