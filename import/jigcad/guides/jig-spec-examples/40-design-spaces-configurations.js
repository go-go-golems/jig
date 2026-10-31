// 40 · Design spaces and configurations: from S/M/L to a product space
//
// Model
//   A configuration set is a finite space: a few named rows of overrides. jig tabulates it at compile time.
//   A design table is the same thing loaded from data. A design is a product space P = P₁ × … × Pₙ of
//   typed parameters, together with a function P → Model. Ranges carry units and a grid (step), choices
//   are finite sets, int is a range on ℤ, and dir is a direction on the sphere S². A point snaps to the grid;
//   missing coordinates fall back to each parameter's default, or to its middle value.
//   Where a metric is affine in a parameter, j.stage returns the closed form instead of recompiling.
//
// Notice
//   - Configurations, design tables and design spaces are one idea at three sizes: 3 rows, 4 rows, 25'245 points.
//   - Lengths stay Quantities inside ranges, so lw(3) still means "three line widths" at every point.
//   - .expose is the customizer surface you share. It projects the design space and does not define a second one.
//   - Every point is a plain model value: hash it, diff it, print it.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, lw } from 'jig'

// ── Fixture: the open box, parametrised ───────────────────────────────────────
const base = j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true })
const box = j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })
  .material(j.material('PLA'))
  .extrude(base.profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })

// ── 1. Configurations: a finite space, tabulated at compile time ─────────────
const sized = box.configs({
  S: { w: mm(40), d: mm(30), h: mm(20) },
  M: {},                                            // the params themselves
  L: { w: mm(90), d: mm(60), h: mm(45) },
})
const T = j.stage(sized)
T.tabulated                                         // → { config: ['S', 'M', 'L'], compiled: 3, ms: 38 }
T.at({ config: 'L' }).metric('mass')                // → 44.5 g   (a lookup, not a compile)
// shell volume = w·d·h − (w − 2t)(d − 2t)(h − t):
//   S  24'000 − 16'848 =  7'152 mm³ →  8.9 g
//   M  72'000 − 56'448 = 15'552 mm³ → 19.3 g
//   L 243'000 − 207'088 = 35'912 mm³ → 44.5 g      (PLA, 1.24 g/cm³, solid)

j.compile(sized.config('S')).param('h')
// → { value: 20 mm, expr: null, src: 'configs[S]', deps: [] }   (it beat params.h = 30 mm)

// ── 2. A design table is a configuration set read from data ──────────────────
const drawer = `name,w,d,h
pens,180 mm,30 mm,25 mm
cards,95 mm,60 mm,40 mm
bits,60 mm,40 mm,20 mm
cables,120 mm,80 mm,50 mm`
const family = box.configs(j.table(drawer, { key: 'name' }))
j.compile(family.config('cards')).param('w')
// → { value: 95 mm, src: 'configs[cards] (table row 2)', deps: [] }
// Units are parsed from the cells; a bare number in a Length column would be read as mm and flagged units.mixed.

// ── 3. A design: a product space of typed parameters ─────────────────────────
const trayModel = p => {
  let b = box.params({ w: p.w, d: p.d, h: p.h, wall: p.wall })
  if (p.cols > 1) b = b
    .extrude(j.sketch('div', { on: j.plane.XY }).rect('r', 'wall', 'd', { center: true }).profiles(), 'h - 1 mm', { id: 'divider' })
    .pattern(j.feat('divider'), j.pattern.linear(j.dir('+X'), { count: p.cols - 1, step: p.w.div(p.cols) }), { id: 'dividers' })
  return b
}
const tray = j.design({
  w:    j.param.range(mm(40), mm(120), { step: mm(5) }),                 // 17 values, no default → middle
  d:    j.param.range(mm(30), mm(80), { step: mm(5), default: mm(40) }), // 11 values
  h:    j.param.range(mm(20), mm(60), { step: mm(5), default: mm(30) }), //  9 values
  wall: j.param.choice([lw(2), lw(3), lw(4)]),                           //  3 values, no default → lw(3)
  cols: j.param.int(1, 5, { default: 1 }),                               //  5 values
}, trayModel)

tray.defaults()                     // → { w: 80 mm, d: 40 mm, h: 30 mm, wall: 3lw, cols: 1 }
tray.size                           // → 25'245 points   = 17 · 11 · 9 · 3 · 5

// Points snap to the grid, and provenance says so.
j.compile(tray.at({ w: mm(62) })).param('w')
// → { value: 60 mm, src: 'design point (snapped from 62 mm to the 5 mm grid)', deps: [] }
j.compile(tray.at({ cols: 3 })).features().map(f => f.id)
// → ['body', 'shell', 'divider', 'dividers']

// ── 4. Sub-spaces are values too: fix, where, sample ─────────────────────────
const shallow = tray.fix({ h: mm(20) })                                  // 2'805 points
const fitsDrawer = tray.where(p => p.w.lte(mm(100)) && p.d.lte(mm(60))) // 12'285 points  = 13 · 7 · 9 · 3 · 5
fitsDrawer.sample(3, { seed: 4 })
// → [{ w: 55 mm, d: 45 mm, h: 35 mm, wall: 2lw, cols: 4 }, { w: 95 mm, d: 30 mm, … }, { w: 70 mm, d: 60 mm, … }]

// Orientation is a design parameter as well: dir samples the sphere.
const printSpace = j.design({
  up:    j.param.dir({ samples: 26, default: '+Z' }),
  layer: j.param.choice([mm(0.12), mm(0.2), mm(0.28)], { default: mm(0.2) }),
}, p => j.print('tray', { parts: [tray.at({ cols: 2 })] }).orient(p.up).slice({ layer: p.layer }))
printSpace.size                     // → 78 points  = 26 directions · 3 layer heights

// ── 5. The customizer surface: expose a projection of the space ─────────────
const shareable = trayModel(tray.defaults()).expose(['w', 'd', 'h', 'cols'], {
  labels: { w: 'Width', d: 'Depth', h: 'Height', cols: 'Compartments' },
  ranges: { w: [mm(40), mm(120)], d: [mm(30), mm(80)], h: [mm(20), mm(60)], cols: [1, 5] },
})
j.compile(shareable).summary().customizer
// → [{ name: 'w', label: 'Width', kind: 'Length', range: [40 mm, 120 mm], value: 80 mm }, …]   (wall stays fixed at 3lw)

// ── 6. Staging: affine metrics become closed forms ───────────────────────────
// With w, d and the wall fixed, shell volume is affine in h:
//   V(h) = h·[w·d − (w − 2t)(d − 2t)] + t·(w − 2t)(d − 2t)
const tall = j.stage(tray.fix({ w: mm(60), d: mm(40), wall: lw(3), cols: 1 }))
tall.residual.mass                  // → h ↦ 0.326 g/mm · h + 3.58 g   (t = 1.35 mm; slope 262.7 mm², intercept 2'885 mm³)
tall.residual.mass(mm(45))          // → 18.2 g
tall.at({ h: mm(45) }).metric('overhangArea')   // → 0 mm²   (not affine: solved at run time, then cached)
tall.note                           // → 'mass, volume: affine in h (exact); others: residual program'
