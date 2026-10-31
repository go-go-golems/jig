// 15 · Assemblies and print-in-place: joints as subgroups, clearance as a sweep
//
// Model
//   An occurrence is a part placed by a transform in SE(3). A joint between two ports restricts their
//   relative transform to a subgroup H ⊂ SE(3); its DOF is dim H.
//     rigid {e}: 0 · revolute SO(2): 1 · slider ℝ: 1 · cylindrical SO(2)×ℝ: 2 · planar SE(2): 3 · ball SO(3): 3
//   Grübler–Kutzbach mobility: M = 6(n − 1 − j) + Σ fᵢ for n bodies (ground included) and j joints.
//   It counts constraints, not geometry, so special positions (coaxial hinges) make it disagree with the solver.
//   Print-in-place: components printed as one job with fit-class gaps; the joint is swept through its range
//   and the swept volume of each moving part is intersected with the rest.
//
// Grounding
//   Joints as subgroups of SE(3). Mobility by Grübler–Kutzbach is an analysis, not a law: it cannot see
//   special geometry.
//
// Notice
//   - Ports turn mates into intent: 'lid:hinge' to 'base:hinge' survives any edit to either part.
//   - The default pose puts each joint at its first limit, so the print pose is just a joint value.
//   - Making the hinge height an expression removes a whole class of collisions by construction.
//   - Joint values are parameters (named by joint id), so a pose is an override like any other.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, lw } from 'jig'

// ── 1. Joints are subgroups: the DOF table is data ──────────────────────────
;[j.joint.rigid(), j.joint.revolute(), j.joint.slider(), j.joint.cylindrical(), j.joint.planar(), j.joint.ball(), j.joint.snap()]
  .map(k => [k.kind, k.group, k.dof])
// → [['rigid', '{e}', 0], ['revolute', 'SO(2)', 1], ['slider', 'ℝ', 1], ['cylindrical', 'SO(2)×ℝ', 2],
//    ['planar', 'SE(2)', 3], ['ball', 'SO(3)', 3], ['snap', '{e} once engaged', 0]]

// ── 2. A clamshell box, printed open and flat ───────────────────────────────
// Two trays side by side; the hinge axis runs along X between them. Closing is a 180° rotation.
const hingeAt = z => j.frame({ origin: j.pt(0, 0, z), x: j.dir('+Y'), z: j.dir('+X') })   // the axis is the frame's z
const knuckles = j.lib.hinge.pin({ knuckles: 5, length: mm(50), d: mm(3), clearance: 'printInPlace' })

const tray = (name, side, leaf) => j.part(name)
  .params({ h: mm(15), axisZ: mm(12.5) })
  .material(j.material('PETG'))
  .extrude(j.sketch('t', { on: j.plane.XY }).rect('r', 60, 40, { at: [0, side * 22], center: true, r: 3 }).profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), lw(4), { id: 'walls' })
  .add(knuckles, { at: hingeAt('axisZ'), leaf, id: 'hinge' })                               // leaf 'a': knuckles 1, 3, 5 + pin
  .port('hinge', hingeAt('axisZ'))

const clamshell = j.assembly('clamshell')
  .params({ hBase: mm(15), hLid: mm(12), axisZ: mm(12.5) })                                 // the axis height, hard-coded for now
  .add('base', tray('base', -1, 'a'), { params: { h: 'hBase', axisZ: 'axisZ' } })
  .add('lid', tray('lid', +1, 'b'), { params: { h: 'hLid', axisZ: 'axisZ' } })
  .joint('h', j.joint.revolute({ limits: [deg(0), deg(180)] }), 'lid:hinge', 'base:hinge')   // 0° = open flat (print pose)
  .printInPlace(['base', 'lid'], { clearance: 'printInPlace' })
  .sweep('h', { steps: 36 })

// ── 3. Grübler, and when it disagrees ───────────────────────────────────────
j.inspect.mobility(clamshell)
// → { grubler: { n: 2, joints: 1, M: 6·(2 − 1 − 1) + 1 = 1 }, solverDOF: 1 }

const twoHinges = clamshell.joint('h2', j.joint.revolute(), 'lid:hinge', 'base:hinge')     // a second hinge on the same axis
j.inspect.mobility(twoHinges)
// → { grubler: { M: 6·(2 − 1 − 2) + 2 = −4 }, solverDOF: 1, redundant: 5,
//     note: 'coaxial revolutes: all 5 constraints of h2 repeat h (special geometry the formula cannot see)' }
// This is why mobility is an analysis, not a law: the formula is a count, and geometry can beat it.

// ── 4. The sweep finds a collision, and an expression removes it ────────────
// With the axis at 12.5 mm, the closed lid rim lands at 2·12.5 − 12 = 13 mm, inside the 15 mm base walls.
const P = j.compile(clamshell)
P.sweep('h')
// → { range: [0°, 180°], steps: 36, sweptInterference: 681 mm³, first: 165°, worst: 180°,
//     between: ['lid/walls', 'base/walls'] }          (wall ring ≈ 341 mm² with r 3 corners × 2 mm overlap)
P.diagnostics.find(d => d.kind === 'asm.sweptInterference')
// → { level: 'error', at: 'h', message: 'lid walls enter base walls from 165° to 180° (681 mm³)',
//      fix: 'put the axis at (h_base + h_lid) / 2 = 13.5 mm, or shorten the lid by 2 mm' }

// Closing by 180° maps z ↦ 2a − z, so the rims meet exactly when a = (h_base + h_lid) / 2. Say so:
const fixed = clamshell.params({ axisZ: '(hBase + hLid) / 2' })
const Q = j.compile(fixed)
Q.param('axisZ')                           // → { value: 13.5 mm, expr: '(hBase + hLid) / 2', src: 'params', deps: ['hBase', 'hLid'] }
Q.sweep('h')                               // → { sweptInterference: 0 mm³, minClearance: 0.4 mm (knuckle gaps, printInPlace) }
j.check(Q, j.rules.printInPlace)
// → []   gaps ≥ 0.40 mm everywhere; knuckles are conical (45°) on their lower half, so no support is needed between parts

// ── 5. Poses are overrides; occurrences carry their transforms ──────────────
j.compile(fixed).occurrence('lid')
// → { joint: 'h', value: 0°, tx: identity, note: 'print pose (first limit)' }
j.compile(fixed.override({ h: deg(180) })).occurrence('lid')
// → { joint: 'h', value: 180°, tx: rotate(axis: x through (0, 0, 13.5), 180°), bbox: [[-30, -42, 15], [30, -2, 27]] mm }
j.compile(fixed.override({ h: deg(90) })).joint('h')
// → { kind: 'revolute', value: 90°, limits: [0°, 180°], dof: 1, reactions: 'n/a (kinematics only)' }

// ── 6. Hardware, explode, BOM ───────────────────────────────────────────────
const latched = fixed
  .add('magnet', j.lib.magnet({ d: mm(6), h: mm(3) }), { qty: 2, at: j.frame.on(j.on('base', j.sel.faces('<Y').of('base'))) })   // front rim latch
  .explode([{ id: 'lid', tx: j.tx.move(0, 0, mm(30)) }, { id: 'magnet', tx: j.tx.move(0, 0, mm(15)) }])

j.compile(latched).bom({ group: 'part' })
// → [{ item: 'clamshell (base + lid + knuckles, printed in place)', qty: 1, kind: 'printed', material: 'PETG', mass: 24.3 g },
//    { item: 'magnet 6×3 mm', qty: 2, kind: 'purchased' }]
j.compile(latched).dof()                   // → { total: 1, joints: { h: 1 }, grounded: 'base' }
