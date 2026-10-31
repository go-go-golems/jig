// 14 · Printable joints and hardware: where plastic meets metal, and plastic meets itself
//
// Model
//   A lib item is a parametric part or feature with ports (frames you can mate to) and a fit-aware size.
//   Every hole size is resolved in context: modelled Ø = nominal + 2·c(class) + holeComp(printer).
//   Cantilever snap hook (rectangular section, constant thickness), from beam theory:
//     strain at the root ε = 1.5·t·y / L²   ⇔   permissible deflection y = 0.67·ε·L² / t
//   A living hinge is a thin flexure (t ≈ 2 layers) whose life depends on the extrusion direction, not just the material.
//   Embedded parts (magnets, nuts) need a pause at the layer where the pocket is bridged over: z_top / layer.
//
// Grounding
//   Cantilever beam theory as used in snap-fit design guides (y = 0.67·ε·L²/t); insert and fastener sizes
//   from vendor tables and ISO standards.
//
// Notice
//   - Hardware sizes come from standards tables, and clearances come from the fit profile, so one design adapts per printer.
//   - j.inspect.snap uses the beam formula the design check uses; the suite tests it as snap.deflection.
//   - Orientation matters as much as geometry: hooks and hinges must bend within layers, not across them.
//   - Ports turn "put the screw here" into a frame that survives edits (used in 15).
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, lw, layer } from 'jig'

// ── Fixture: the bottom shell of a small sensor case ─────────────────────────
const shell = j.part('sensor-case')
  .material(j.material('PETG'))
  .extrude(j.sketch('b', { on: j.plane.XY }).rect('r', 60, 40, { center: true, r: 4 }).profiles(), mm(20), { id: 'body' })
  .shell(j.feat('body').endFace(), lw(4), { id: 'walls' })                      // 1.8 mm walls, 1.8 mm floor
const floor = j.feat('walls').faces().and(j.sel.faces('+Z')).expect(1)

// ── 1. Heat-set insert bosses ───────────────────────────────────────────────
const insert = j.lib.insert('M3x5.7')
const withBosses = shell
  .add(insert.boss({ wall: lw(3) }), { at: j.frame.on(floor).moved(j.tx.move(-24, -14, 0)), id: 'boss' })
  .pattern(j.feat('boss'), j.pattern.mirror(j.plane.YZ).times(j.pattern.mirror(j.plane.XZ)), { id: 'bosses' })
  .port('lid', j.frame.on(j.feat('body').endFace()))

j.compile(withBosses).feature('boss')
// → { hole: Ø4.0 × 6.7 mm (insert 5.7 + 1.0 melt room), boss: Ø6.7 mm (4.0 + 2·lw(3)), height: 8 mm,
//     suggests: { modifier: 'walls 4 within 2 mm of the hole' } }   (picked up by the print job, see 19)

// ── 2. Screws: clearance, self-tap, and a side-loaded nut trap ──────────────
const ear = j.sketch('ear', { on: j.feat('body').sideFace('r.right') }).rect('e', 12, 8, { at: [0, 4], center: true })
const mounted = withBosses
  .extrude(ear.profiles(), mm(8), { id: 'ear' })
  .hole([j.point.center(j.feat('ear').endFace())], j.hole.clearance('M3', { fit: 'slide', depth: mm(8) }), { id: 'through' })
  .hole([j.pt(0, -14, 1.8)], j.hole.tapped('M3', { depth: mm(8), method: 'self-tap' }), { id: 'pcbScrew' })
  .hole([j.pt(-20, 0, 10)], j.hole.nutTrap('M3', { kind: 'hex', from: 'side' }), { id: 'trap' })

const M = j.compile(mounted)
M.feature('through').modelled              // → Ø3.5 mm   = 3 + 2 × 0.20 (slide) + 0.1 (holeComp)
M.feature('pcbScrew').modelled             // → Ø2.9 mm   prints ≈ 2.75 mm, so the screw cuts its own thread
M.feature('trap').modelled
// → { slot: 5.9 × 2.8 mm (AF 5.5 + 2 × 0.2; nut 2.4 + 0.4), roof: 'bridge 5.9 mm', bolt: Ø3.5 mm }
j.check(M, j.rules.fdm).filter(d => d.at === 'trap')    // → []   bridge 5.9 mm ≤ 10 mm

// ── 3. A cantilever snap-fit, and its law ───────────────────────────────────
const hook = j.lib.snap.cantilever({
  length: mm(12), thickness: mm(1.6), deflection: mm(1.0),
  material: j.material('PETG'), angle: deg(30), retention: deg(90),
})
j.inspect.snap(hook)
// → { strain: 0.0167 (1.5·1.6·1.0/12²), allowable: 0.025 (PETG), permissibleDeflection: 1.51 mm (0.67·0.025·144/1.6), ratio: 0.67 }
j.compile(mounted.add(hook, { at: j.frame.on(j.feat('walls').faces().and(j.sel.faces('-X')).expect(1)) })).metric('snapStrain')
// → 0.67   (peak strain / allowable)

const stubby = j.lib.snap.cantilever({ length: mm(8), thickness: mm(1.6), deflection: mm(1.0), material: j.material('PETG') })
j.compile(shell.add(stubby, { at: j.frame.on(floor) })).diagnostics
// → [{ level: 'error', kind: 'print.snapStrain', message: 'ε = 3.75 % > 2.5 % allowable (PETG)',
//      fix: 'length ≥ 9.8 mm at t = 1.6 mm, or thickness ≤ 1.07 mm at L = 8 mm' }]

// Orientation: the hook must bend in the XY plane of the print, or it splits along a layer line.
j.compile(j.print('case', { parts: [mounted.add(hook, { at: j.frame.on(floor) })] }).use(j.preset.functional)).summary().orientation
// → { 'sensor-case': '+Z', reason: 'functional: snap hooks bend within layers (layerStrengthRisk 0.00)' }

// ── 4. A living hinge: thickness in layers, life in line direction ──────────
const cap = j.part('flip-cap')
  .material(j.material('PP'))
  .extrude(j.sketch('c', { on: j.plane.XY }).rect('base', 30, 20, { at: [0, 0] }).rect('lid', 30, 20, { at: [31, 0] }).profiles(), mm(2), { id: 'leaves' })
  .add(j.lib.hinge.living({ length: mm(30), thickness: layer(2), material: 'PP' }),
    { at: j.frame({ origin: j.pt(30.5, 10, 0), x: j.dir('+Y'), z: j.dir('+Z') }), id: 'hinge' })
j.compile(cap).feature('hinge')
// → { thickness: 0.4 mm (2 layers), gap: 1 mm, bendRadius: 0.5 mm, mustPrint: 'flat, first layers, lines across the hinge' }
const capJob = j.print('cap', { material: j.material('PP'), parts: [cap] })
  .modifier(j.feat('hinge').faces(), { lineAngle: 'across' })           // lines along the hinge break within a few flexes

// ── 5. A dovetail with a fit class ──────────────────────────────────────────
const tail = j.lib.dovetail({ width: mm(20), depth: mm(6), angle: deg(15), fit: 'slide' })
const left = j.part('left').extrude(j.region.rect(80, 40), mm(10), { id: 'b' })
  .add(tail, { at: j.frame.on(j.sel.faces('>X').of('left').expect(1)), op: 'join', id: 'dovetail' })
const right = j.part('right').extrude(j.region.rect(80, 40), mm(10), { id: 'b' })
  .add(tail, { at: j.frame.on(j.sel.faces('<X').of('right').expect(1)), op: 'cut', id: 'dovetail' })
j.compile(right).feature('dovetail').modelled
// → { socket: 20.4 × 6.2 mm at 15°, gap: 0.2 mm per flank (slide) }   (op 'cut' gets the gap; op 'join' stays nominal)

// ── 6. A magnet pocket, closed over with a pause ────────────────────────────
const magnet = j.lib.magnet({ d: mm(6), h: mm(3) })
const tile = left.add(magnet, { at: j.frame.on(j.sel.faces('<Z').of('left')).moved(j.tx.move(0, 0, 1.0)), op: 'cut', fit: 'press', id: 'magnet' })
j.compile(tile).feature('magnet').modelled                       // → { pocket: Ø6.2 × 3.2 mm, z: 1.0–4.2 mm, closed: true (10 mm tile) }
const tileJob = j.print('tile', { parts: [tile] })
  .modifier(j.feat('magnet').faces(), { pause: 'before-cover', message: 'insert 6×3 magnet, north up' })
j.compile(tileJob).layers.pauses
// → [{ afterLayer: 21, z: 4.2 mm, message: 'insert 6×3 magnet, north up' }]   (4.2 / 0.2 = 21; layer 22 bridges the pocket)

// ── 7. Pins and ports ───────────────────────────────────────────────────────
const dowel = j.lib.dowel({ d: mm(3), l: mm(10), fit: 'press' })   // a steel dowel aligning the two dovetailed halves
const pinned = left.add(dowel, { at: j.frame.on(j.sel.faces('>X').of('left')).moved(j.tx.move(0, 12, 0)), op: 'cut', id: 'pin' })
j.compile(pinned).feature('pin').modelled                        // → { hole: Ø3.2 × 5.5 mm }  = 3 + 2 × 0.05 (press) + 0.1 (holeComp)
const screw = j.lib.screw('ISO 7380', 'M3x8')
screw.port('head')                                               // → Frame at the bearing face, z along the axis
screw.port('tip')
j.compile(withBosses).node('port:lid')
// → { kind: 'port', frame: { origin: [0, 0, 20], z: '+Z' }, from: 'body/end' }   mate 'sensor-case:lid' in an assembly (15)
