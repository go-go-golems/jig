// 33 · Grid storage bins: a Gridfinity-compatible family, a baseplate, and a batch on plates
//
// Model
//   The grid is a lattice: a cell sits at 42 mm · (i, k), heights come in 7 mm units, and a bin of
//   gx × gy cells is (42·gx − 0.5) × (42·gy − 0.5) mm, leaving 0.25 mm per side.
//   One foot per cell is three stacked extrudes. Two 45° tapers around a straight band form the
//   stepped profile (0.8 / 1.8 / 2.15 mm), so each foot is a stack of frusta (see 06).
//   A bin is a function of (gx, gy, u, options): a model family. The design space over it is finite
//   (4 · 4 · 3 = 48 bins), so it tabulates, and every foot after the first comes from the cache.
//
// Notice
//   - Compatibility beats fit here: the magnet pockets are 6.5 × 2.4 mm because the grid's convention says so.
//   - The label shelf is exactly 45°, so the overhang rule passes at its boundary without supports.
//   - The fdm preset's bed chamfer is skipped, and recorded as a decision, because the foot is already chamfered.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg } from 'jig'

const PITCH = 42, UNIT = 7, FOOT = 4.75                       // mm; FOOT = 0.8 + 1.8 + 2.15

// ── 1. One foot: a stack of three extrudes ───────────────────────────────────
const footAt = (x, y) => b => b
  .extrude(j.sketch(`f${x}_${y}`, { on: j.plane.XY }).rect('r', 35.6, 35.6, { center: true, at: [x, y], r: 0.8 }).profiles(),
    mm(0.8), { taper: deg(45), id: `f${x}_${y}a` })                       // 35.6 → 37.2 mm
  .extrude(j.feat(`f${x}_${y}a`).endFace(), mm(1.8), { id: `f${x}_${y}b` })
  .extrude(j.feat(`f${x}_${y}b`).endFace(), mm(2.15), { taper: deg(45), id: `f${x}_${y}c` })   // 37.2 → 41.5 mm

// ── 2. The bin family ────────────────────────────────────────────────────────
const cells = (gx, gy) => Array.from({ length: gx * gy }, (_, n) => [
  PITCH * ((n % gx) - (gx - 1) / 2), PITCH * (Math.floor(n / gx) - (gy - 1) / 2)])

const bin = ({ gx, gy, u, magnets = true, label = true, dividers = 0 }) => {
  const W = PITCH * gx - 0.5, D = PITCH * gy - 0.5, H = UNIT * u
  const rim = j.sketch('rim', { on: j.plane.offset(j.plane.XY, mm(H)) }).rect('r', W, D, { center: true, r: 3.75 })
  return j.part(`bin-${gx}x${gy}x${u}`)
    .with(b => cells(gx, gy).reduce((acc, [x, y]) => footAt(x, y)(acc), b))
    .extrude(j.sketch('body', { on: j.plane.offset(j.plane.XY, mm(FOOT)) }).rect('r', W, D, { center: true, r: 3.75 }).profiles(),
      mm(H - FOOT), { id: 'body', op: 'join' })
    .shell(j.feat('body').endFace(), mm(1.2), { id: 'walls' })
    .sweep(j.sketch('lipProfile', { on: j.plane.normalTo(rim.wire(['r']), { at: 0 }) })
      .polyline('p', [[0, 0], [0.7, 0.7], [0.7, 2.5], [2.6, 4.4], [0, 4.4]], { closed: true }).profiles(),
      rim.wire(['r']), { frame: 'rmf', id: 'lip' })                                     // the stacking lip, 4.4 mm tall
    .with(b => !magnets ? b : b.hole(
      cells(gx, gy).flatMap(([x, y]) => [[13, 13], [-13, 13], [-13, -13], [13, -13]].map(([dx, dy]) => j.pt(x + dx, y + dy, 0))),
      j.hole.simple(mm(6.5), mm(2.4)), { id: 'magnets' }))                               // 6 × 2 mm magnets + glue
    .with(b => !label ? b : b.extrude(j.sketch('tab', { on: j.plane.offset(j.plane.YZ, mm(-W / 2 + 1.2)) })
      .polyline('t', [[D / 2 - 1.2, H], [D / 2 - 13.2, H], [D / 2 - 1.2, H - 12]], { closed: true }).profiles(),
      mm(W - 2.4), { id: 'label' }))                                                    // a 45° shelf along the back wall
    .with(b => dividers === 0 ? b : b
      .extrude(j.sketch('div', { on: j.plane.offset(j.plane.YZ, mm(-W / 2 + W / (dividers + 1))) })
        .rect('d', D - 2.4, H - FOOT - 2, { at: [0, FOOT + (H - FOOT - 2) / 2], center: true }).profiles(), { symmetric: mm(0.6) }, { id: 'div' })
      .pattern(j.feat('div'), j.pattern.linear(j.dir('+X'), { count: dividers, step: mm(W / (dividers + 1)) }), { id: 'dividers' }))
}

const b213 = j.compile(bin({ gx: 2, gy: 1, u: 3, dividers: 1 }))
b213.summary()
// → { bodies: 1, features: 13, bbox: [83.5, 41.5, 25.4] mm (21 + 4.4 lip), sketchDOF: 0 }
b213.decisions.find(d => d.kind === 'bedChamfer')
// → { at: 'bin-2x1x3', kind: 'bedChamfer', chose: 'skip', reason: 'bed edges already chamfered 45° by f*a (0.8 mm ≥ 0.4 mm)' }

// ── 3. The baseplate: the same profile, cut downwards ────────────────────────
const baseplate = (gx, gy) => j.part(`base-${gx}x${gy}`)
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', PITCH * gx, PITCH * gy, { center: true, r: 4 }).profiles(), mm(4.65), { id: 'plate' })
  .with(b => cells(gx, gy).reduce((acc, [x, y], n) => acc
    .cut(j.sketch(`c${n}`, { on: j.feat('plate').endFace() }).rect('c', 42, 42, { center: true, at: [x, y], r: 4 }).profiles(),
      mm(2.15), { taper: deg(-45), id: `c${n}a` })
    .cut(j.feat(`c${n}a`).endFace(), mm(1.8), { id: `c${n}b` })
    .cut(j.feat(`c${n}b`).endFace(), mm(0.7), { taper: deg(-45), id: `c${n}c` }), b))

// ── 4. The family as a finite design space: tabulate, and the cache does the work ─
const family = j.design({ gx: j.param.int(1, 4), gy: j.param.int(1, 4), u: j.param.choice([3, 6, 9]) }, p => bin(p))
const table = j.stage(family)
table.summary()
// → { kind: 'tabulated', points: 48, compiled: 48, rebuildMs: 9'400, cacheHitRate: 0.64,
//     note: 'feet are separate new bodies keyed by (x, y) offset: 147 unique of 900 foot features; joins recomputed per bin' }

// ── 5. A batch from a design table, packed onto plates ───────────────────────
const order = (await j.load.csv('bins.csv')).rows
// → [{ name: '1x1x3', gx: 1, gy: 1, u: 3, qty: 4 }, { name: '2x1x6', gx: 2, gy: 1, u: 6, qty: 2, dividers: 1 },
//    { name: '2x2x3', gx: 2, gy: 2, u: 3, qty: 1, label: false }]

const job = order.reduce((p, r) => p.add(r.name, bin(r), { qty: r.qty }),
  j.print('drawer', { printer: j.printer('mk4'), material: j.material('PLA') }).add('base', baseplate(4, 4)))
  .plates({ pack: 'skyline', spacing: mm(5) })
  .slice({ walls: 2, infill: { density: 0.15, pattern: 'gyroid' } })
  .use(j.rules.fdm)

const P = j.compile(job)
P.plates
// → [{ plate: 1, parts: ['base', '1x1x3 ×4'], fill: 0.67 },          168² + 4 · 41.5² = 35'113 mm² of 52'500
//    { plate: 2, parts: ['2x1x6 ×2', '2x2x3'], fill: 0.26 }]          2 · 83.5 · 41.5 + 83.5² = 13'903 mm²
P.plates.lowerBound
// → { footprints: 49'016 mm², bedArea: 52'500 mm², plates: 1 }   by area one plate would do (93 %); by shape it can't,
//   since the 83.5 mm 2×2 bin doesn't fit the 82 mm strip left beside the 168 mm base
P.diagnostics
// → [{ level: 'info', kind: 'print.overhang', at: '*.label', message: 'label shelf at 45.0°: at the limit, no support needed' }]
P.metrics()
// → { printTime: 9 h 12 min, filament: 268 g, cost: 5.90 usd, supportVolume: 0, plates: 2 }

const { report } = j.export.tmf(P, { plates: true })
report.kept            // → ['plates', 'settings', 'part names', 'quantities']
