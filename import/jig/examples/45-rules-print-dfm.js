// 45 · Print rules: design-for-printing as data
//
// Model
//   A rule is a predicate over a compiled program (topology, analysis fields, orientation, printer
//   context) that yields diagnostics: { level, kind, at, message, fix }. A rule set is a named list.
//   Rule sets compose like style sheets: right-biased by rule name and idempotent, so
//   [fdm, bridge(15 mm)] is fdm with a longer bridge.
//   Thresholds use symbolic units (lw, layer, nozzle), so one rule set is right on any printer.
//   Rules feed three consumers: the diagnostics list, objectives (require), and release gates (preset.production).
//
// Notice
//   - Every finding names its feature and carries a fix written as code, ready to paste.
//   - Horizontal holes made with j.hole become teardrops by default. The rule exists for holes made any other way.
//   - Changing the process changes the verdict: the same lid passes some resin rules and fails others.
//   - Production does not add rules. It raises their level, so iterating stays quiet and release stays strict.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, lw, layer } from 'jig'

// ── Fixture: a sensor-box lid with four problems ─────────────────────────────
const lid = j.part('lid')
  .params({ wall: mm(0.6) })
  .extrude(j.sketch('top', { on: j.plane.XY }).rect('r', 70, 45, { center: true, r: 3 }).profiles(), mm(1.2), { id: 'top' })
  .extrude(j.sketch('lip', { on: j.feat('top').endFace() })
    .rect('outer', 66, 41, { center: true }).rect('inner', '66 mm - 2 * wall', '41 mm - 2 * wall', { center: true })
    .profiles(), mm(6), { id: 'lip' })
  .cut(j.sketch('cable', { on: j.plane.YZ }).circle('c', 3, { at: [0, 4.2] }).profiles(), { through: 'all' }, { id: 'cable' })  // a cut, not a j.hole
  .cut(j.sketch('win', { on: j.plane.XZ }).rect('w', 14, 3, { at: [-7, 3.2] }).profiles(), { through: 'all' }, { id: 'window' })
  .emboss(j.region.text('rev 2', { size: mm(3) }), mm(0.2), { on: j.feat('top').startFace(), op: 'cut', id: 'rev' })

// ── 1. The FDM rule set ──────────────────────────────────────────────────────
const L = j.compile(j.print('lid', { parts: [lid] }).orient('+Z'))   // lip up, top plate on the bed
j.check(L, j.rules.fdm)
// → [{ level: 'warning', kind: 'print.thinWall', at: 'lip', message: 'wall 0.6 mm < 2lw (0.9 mm): a single perimeter',
//      fix: "lid.params({ wall: lw(2) })" },
//    { level: 'warning', kind: 'print.overhang', at: 'cable', message: 'horizontal Ø6 mm hole: its top arc overhangs up to 90°',
//      fix: "replace the cut with .hole(j.point.center(j.feat('lip').sideFace('outer.right')), j.hole.simple(mm(6), mm(2)), { id: 'cable' }); j.hole makes a 45° teardrop when the axis is horizontal" },
//    { level: 'warning', kind: 'print.bridge', at: 'window', message: 'bridge span 14 mm > 10 mm',
//      fix: "split the window in two (rect('w', 6, 3) twice), or add a 45° chamfer to its top edge" },
//    { level: 'warning', kind: 'print.textIllegible', at: 'rev', message: 'stroke 0.30 mm < 1lw (0.45 mm); depth 0.2 mm < 3 layers (0.6 mm)',
//      fix: "j.region.text('rev 2', { size: mm(5) }), depth layer(3)" }]

// ── 2. Applying the fixes: the teardrop comes from the default, not from the rule ─
const fixed = lid
  .params({ wall: lw(2) })
  .suppress('cable')
  .hole(j.point.center(j.feat('lip').sideFace('outer.right')), j.hole.simple(mm(6), mm(2)), { id: 'cable2' })
  .suppress('window')
  .cut(j.sketch('win2', { on: j.plane.XZ }).rect('w', 6, 3, { at: [-7, 3.2] }).pattern(['w'], j.pattern.linear(j.dir('+X'), { count: 2, step: mm(8) })).profiles(),
    { through: 'all' }, { id: 'window2' })
  .suppress('rev')
  .emboss(j.region.text('rev 2', { size: mm(5) }), layer(3), { on: j.feat('top').startFace(), op: 'cut', id: 'rev2' })

const F = j.compile(j.print('lid', { parts: [fixed] }).orient('+Z'))
F.decisions.find(d => d.at === 'cable2')
// → { at: 'cable2', kind: 'hole', chose: 'teardrop 45°, point +Z', alternatives: ['round', 'bridged'], reason: 'axis ⟂ build direction' }
j.check(F, j.rules.fdm)             // → []

// ── 3. Your own rules: thresholds tweaked, custom checks added ───────────────
const insertWalls = j.rule.custom('insert-walls', (prog, ctx) =>
  prog.find('hole').filter(h => h.spec.kind === 'insert')
    .map(h => ({ h, wall: j.inspect.wall(j.feat(h.id).bores(), { min: lw(4) }) }))
    .filter(x => x.wall.min.lt(lw(4).resolve(ctx)))
    .map(x => ({ level: 'warning', kind: 'rule.insert-walls', at: x.h.id,
                 message: `${x.wall.min} of plastic around a heat-set insert; 4lw holds the knurl`,
                 fix: `j.lib.insert('M3x5.7').boss({ wall: lw(4) })` })))

const house = j.rules('house', [j.rules.fdm, j.rule.bridge({ max: mm(15) }), j.rule.overhang({ max: deg(50) }), insertWalls])
j.check(L, house).map(d => d.kind)
// → ['print.thinWall', 'print.overhang', 'print.textIllegible']   (the 14 mm bridge passes the house limit of 15 mm)

// ── 4. Other processes, other verdicts ───────────────────────────────────────
const resin = j.compile(j.print('lid', { printer: j.printer('generic-msla'), material: j.material('resin-standard'), parts: [lid] }))
j.check(resin, j.rules.msla)
// → [{ level: 'warning', kind: 'print.island', at: 'rev', message: '4 letter islands start mid-air in the chosen 30° tilt', fix: 'supports: auto, or move the text to a side face' }]
// The 0.6 mm wall passes (msla minimum 0.5 mm), overhangs and bridges are left to supports, and 0.3 mm strokes resolve at 50 µm pixels.

const tightHinge = j.lib.hinge.pin({ knuckles: 5, clearance: mm(0.25) })   // a print-in-place hinge, see 15
j.check(j.compile(j.print('hinge', { parts: [tightHinge] })), j.rules.printInPlace)
// → [{ level: 'warning', kind: 'asm.interference', at: 'hinge', message: 'knuckle gap 0.25 mm < printInPlace 0.40 mm: likely to fuse',
//      fix: "j.lib.hinge.pin({ knuckles: 5, clearance: 'printInPlace' })" }]

// ── 5. Rules as an objective: infeasible means excluded ──────────────────────
const walls = j.design({ wall: j.param.choice([mm(0.6), lw(2), lw(3)]) }, p => j.print('lid', { parts: [fixed.params({ wall: p.wall })] }))
const r = await j.search.grid(walls, { objective: j.objective.lexicographic([j.objective.require(j.rules.fdm), j.objective.minimize('mass')]) })
r.table()
// → rank  wall   feasible  mass     violations
//   1     2lw    yes       6.1 g    (lip 214 mm × 6 mm × 0.9 mm on a 1.2 mm top plate)
//   2     3lw    yes       6.8 g
//   3     0.6mm  no        5.6 g    print.thinWall

// ── 6. preset.production: same rules, higher stakes ──────────────────────────
const P = j.compile(j.print('lid', { parts: [lid] }).orient('+Z').use(j.preset.production))
P.diagnostics.map(d => [d.level, d.kind])
// → [['error', 'print.thinWall'], ['error', 'print.overhang'], ['error', 'print.bridge'], ['error', 'print.textIllegible']]
const out = j.export.tmf(P)
out.data                            // → null
out.report                          // → { refused: true, reason: '4 errors under preset.production', kept: [], approximated: [], dropped: [] }
j.export.tmf(j.compile(j.print('lid', { parts: [fixed] }).orient('+Z').use(j.preset.production))).report.refused   // → false
