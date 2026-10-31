// 02 · Parameters, expressions, configurations: a DAG with provenance
//
// Model
//   Parameters form a directed acyclic graph. Each node holds an Expr whose free names are its parents.
//   Evaluation is a topological fold that produces values in canonical units, each dimension-checked.
//   The value of a name comes from a right-biased merge of layers:
//       library default  <  .params  <  .configs row  <  .override  <  design-space point
//   (partial maps form a monoid under right-biased merge; provenance records which layer won).
//   Configurations are a finite set of overrides, so they are tabulated at compile time (staging, see 21).
//   A change to one name invalidates only its downstream cone in the DAG.
//
// Grounding
//   Parametric CAD practice (Fusion parameters, FreeCAD spreadsheets and VarSets). Evaluation order is a
//   topological sort of the dependency graph.
//
// Notice
//   - Expression strings carry units ('wall + 0.2 mm'), so 'w - count' is a DimensionError, not a bug.
//   - Symbolic units such as lw(3) stay symbolic in L1 and resolve in L2 against the printer context.
//   - Cycles are reported with their path and a fix.
//   - The trace shows which features were reused when a parameter changes.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, lw } from 'jig'

// ── 1. A parametric open box: parameters as a DAG ─────────────────────────────
const base = j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true, r: 'corner' })
const boss = j.sketch('boss', { on: j.plane.offset(j.plane.XY, 'floor') })
  .circle('c', 'boss_d / 2', { at: ['w / 2 - wall - boss_d / 2', 'd / 2 - wall - boss_d / 2'] })

const box = j.part('box')
  .params({
    w: mm(60), d: mm(40), h: mm(30), corner: mm(4),
    wall: lw(3),                          // symbolic: three line widths
    floor: 'wall + 0.2 mm',               // a unit inside an expression
    screw_d: mm(3),
    boss_d: 'screw_d * 2 + wall',
    inner_w: 'w - 2 * wall',
    count: 3,                             // dimensionless
  })
  .extrude(base.profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .extrude(boss.profiles(), 'h - floor - 2 mm', { id: 'boss' })
  .hole(j.feat('boss').endFace(), j.hole.simple('screw_d - 0.1 mm', mm(8)), { id: 'pilot' })

const P = j.compile(box)
P.param('boss_d')
// → { value: 7.35 mm, expr: 'screw_d * 2 + wall', src: 'params', deps: ['screw_d', 'wall'] }
P.ir.text('L2', { node: 'params' })
// → params (L2, context fdm-0.4: lw = 0.45 mm, layer = 0.2 mm)
//     w        60 mm      params
//     wall     1.35 mm    params   3lw
//     floor    1.55 mm    params   wall + 0.2 mm
//     boss_d   7.35 mm    params   screw_d * 2 + wall
//     inner_w  57.3 mm    params   w - 2 * wall
//     order: w d h corner screw_d count → wall → floor boss_d inner_w

// ── 2. Configurations: a finite family, chosen by name ─────────────────────────
const sized = box.configs({
  S: { w: mm(40), d: mm(30), h: mm(20) },
  M: { w: mm(60), d: mm(40), h: mm(30) },
  L: { w: mm(90), d: mm(60), h: mm(45), screw_d: mm(4) },
})
const S = j.compile(sized.config('S'))
S.param('w')        // → { value: 40 mm, src: 'configs.S', shadowed: [{ src: 'params', value: 60 mm }] }
S.param('inner_w')  // → { value: 37.3 mm, expr: 'w - 2 * wall', src: 'params', deps: ['w', 'wall'], via: { w: 'configs.S' } }
j.compile(sized).summary().configs
// → { names: ['S', 'M', 'L'], tabulated: true, active: 'M (default: the middle row)' }

// ── 3. A design table from CSV ─────────────────────────────────────────────────
const csv = `name,w,d,h,count
tray-2,80 mm,40 mm,20 mm,2
tray-3,120 mm,40 mm,20 mm,3
tray-4,160 mm,40 mm,20 mm,4`

const trays = box.configs(j.table(csv, { key: 'name' }))
j.compile(trays.config('tray-4')).param('count')
// → { value: 4, src: 'configs.tray-4 (table row 3)' }

// ── 4. Precedence: five layers, one value, a readable reason ──────────────────
const mine = trays.config('tray-3').override({ wall: mm(2) })
const M = j.compile(mine)
M.param('wall')
// → { value: 2 mm, src: 'override', shadowed: [{ src: 'params', value: '3lw' }] }
M.why('param:inner_w')
// → 'inner_w = w − 2·wall = 120 mm − 2·2 mm = 116 mm; w from configs.tray-3 (table row 2), wall from override'
j.compile(mine, { override: { wall: mm(2.4) } }).param('wall').src
// → 'compile.override'   (the outermost layer: what a design-space point uses, see 40)

// ── 5. Cycles and dimension errors are diagnosed where they happen ────────────
const loop = box.params({ wall: 'floor - 0.2 mm' })     // floor = wall + 0.2 mm, so wall depends on itself
j.compile(loop).diagnostics
// → [{ level: 'error', kind: 'param.cycle', at: 'params.wall', message: 'wall → floor → wall',
//      fix: 'give one of them a value, e.g. wall: lw(3)' }]

const wrong = box.params({ inner_w: 'w - count' })
j.compile(wrong).diagnostics
// → [{ level: 'error', kind: 'units.dimension', at: 'params.inner_w', message: "'w - count': cannot subtract 1 (dimensionless) from mm (L¹)" }]

// ── 6. Expose a customizer for people who print your model ────────────────────
const shared = sized.expose(['w', 'd', 'h', 'count'], {
  labels: { w: 'Width', d: 'Depth', h: 'Height', count: 'Compartments' },
  ranges: { w: [mm(30), mm(200)], d: [mm(30), mm(120)], h: [mm(10), mm(80)], count: [1, 8] },
})
j.compile(shared).summary().customizer
// → [{ name: 'w', label: 'Width', value: 60 mm, range: [30 mm, 200 mm], kind: 'length' },
//    …, { name: 'count', label: 'Compartments', value: 3, range: [1, 8], kind: 'int' }]

// ── 7. A change recomputes only its downstream cone ───────────────────────────
// screw_d → boss_d → boss → pilot.  body and shell do not depend on screw_d.
const P2 = j.compile(box.override({ screw_d: mm(4) }))
P2.trace.filter(t => t.level === 'L4').map(t => [t.pass, t.cached])
// → [['feature:body', true], ['feature:shell', true], ['feature:boss', false], ['feature:pilot', false]]
P2.metric('cacheHitRate')     // → 0.5
P2.param('boss_d').value      // → 9.35 mm
