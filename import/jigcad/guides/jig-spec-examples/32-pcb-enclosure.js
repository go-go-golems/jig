// 32 · PCB enclosure: from a board file to a two-part print that fits on the first try
//
// Model
//   The board is the input; the enclosure is a function of it. The outline comes from DXF,
//   the mounting holes and connectors from CSV. Every gap is a fit class, not a magic number:
//     port = connector ⊕ free gap,   lid lip = inner wall ⊖ slide gap,   insert hole = heat-set spec.
//   The assembly places the PCB as a reference body (never printed), checks interference, and
//   the print job takes only the two printable parts, with the lid flipped.
//
// Notice
//   - Ports are cut by folding over the connector table: one row, one cut, on a face chosen by selector.
//   - Base and lid share one params object, so hooks and windows cannot drift apart.
//   - The snap hook is checked by its beam law before anything is printed.
//   - The interference check finds a real clash (hook vs capacitor); the fix is one override.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg } from 'jig'

// ── 1. Inputs: outline, holes, connectors ────────────────────────────────────
const board = await j.load.dxf('board/sensor-hub.dxf')
const outline = board.region({ layer: 'Edge.Cuts' })            // 70 × 50 mm, origin at the board centre
const holes = (await j.load.csv('board/holes.csv')).rows        // x, y, d: (±31, ±21), Ø3.2 mm
const connectors = (await j.load.csv('board/connectors.csv')).rows
// → [{ name: 'usb-c',  face: 'front', u: -15, v: 1.6, w: 8.94, h: 3.26, r: 1.63 },
//    { name: 'barrel', face: 'back',  u: 20,  v: 6.5, d: 8.0 }]

const { w: bw, d: bd } = j.inspect.bbox(outline)
const shared = { bw, bd, gap: mm(1), wall: mm(2), h: mm(23), hookX: mm(22) }
const shell = id => j.sketch(id, { on: j.plane.XY })
  .rect('r', 'bw + 2 * (gap + wall)', 'bd + 2 * (gap + wall)', { center: true, r: 3 })   // 76 × 56 mm outside

// ── 2. The base: shell, standoffs with heat-set inserts ──────────────────────
const base = j.part('base')
  .params({ ...shared, standoff: mm(5) })
  .extrude(shell('s').profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })     // the floor is a wall too: 2 mm
  .add(j.lib.insert('M3x5.7').boss({ wall: mm(2), height: 'standoff' }),
    { at: holes.map(p => j.pt(p.x, p.y, 2)), op: 'join' })
  .cut(j.sketch('win', { on: j.feat('body').sideFace('r.top') })
    .rect('w', 7, 2, { at: ['hookX', 'h - 4'], center: true }).profiles(), mm(4), { id: 'window' })
  .pattern(j.feat('window'), j.pattern.mirror(j.plane.XZ).times(j.pattern.mirror(j.plane.YZ)), { id: 'windows' })   // 4 windows
  .port('rim', j.frame.on(j.feat('body').endFace()))
  .port('standoffs', j.frame({ origin: j.pt(0, 0, 7), x: j.dir('+X'), z: j.dir('+Z') }))   // floor 2 + standoff 5

// ── 3. Ports from the connector table: a fold over rows ──────────────────────
const faceOf = { front: 'r.bottom', back: 'r.top', left: 'r.left', right: 'r.right' }
const free = j.fit.gap('free')                                   // resolved from the fit profile in context
const boardTop = 7 + 1.6

const ported = connectors.reduce((part, c) => {
  const sk = j.sketch(`port-${c.name}`, { on: j.feat('body').sideFace(faceOf[c.face]).expect(1) })   // x along the wall, y up
  const opening = c.d
    ? sk.circle('o', mm(c.d / 2).add(free), { at: [c.u, boardTop + c.v] })
    : sk.rect('o', mm(c.w).add(free.mul(2)), mm(c.h).add(free.mul(2)), { at: [c.u, boardTop + c.v], center: true, r: mm(c.r).add(free) })
  return part.cut(opening.profiles(), mm(4), { id: `port-${c.name}` })
}, base)

// ── 4. The lid: plate, lip, snap hooks, vents, label ─────────────────────────
const hook = j.lib.snap.cantilever({ length: mm(8), thickness: mm(1.2), deflection: mm(0.6), material: 'PETG',
  angle: deg(30), retention: deg(90) })
j.inspect.snap(hook)
// → { strain: 0.0169 (= 1.5 · 1.2 · 0.6 / 8²), allowable: 0.025, permissibleDeflection: 0.89 mm, ratio: 0.68 }

const lid = j.part('lid')
  .params(shared)
  .extrude(shell('p').profiles(), mm(2), { id: 'plate' })
  .extrude(j.sketch('lip', { on: j.feat('plate').startFace() })
    .rect('r', j.fit.pin(j.expr('bw + 2 * gap'), 'slide'), j.fit.pin(j.expr('bd + 2 * gap'), 'slide'), { center: true, r: 1 })
    .profiles(), mm(3), { id: 'lip' })
  .shell(j.feat('lip').endFace(), mm(1.6), { id: 'lipShell' })
  .add(hook, { at: [['hookX', 'bd / 2'], ['-hookX', 'bd / 2'], ['hookX', '-bd / 2'], ['-hookX', '-bd / 2']].map(([x, y]) => j.pt(x, y, 0)) })
  .cut(j.sketch('vent', { on: j.feat('plate').endFace() }).polygon('v', 6, 1.8, { at: [-8, 0] }).profiles(), { through: 'all' }, { id: 'vent' })
  .pattern(j.feat('vent'), j.pattern.hex(j.plane.XY, { pitch: mm(5), count: [9, 4] }), { id: 'vents' })
  .emboss(j.region.text('SENSOR HUB', { size: mm(6), font: 'Inter Bold' }), mm(0.6),
    { on: j.feat('plate').endFace(), op: 'cut', id: 'label' })
  .port('seat', j.frame.on(j.feat('plate').startFace(), { flip: true }))

// ── 5. Assembly with the PCB as a reference body ─────────────────────────────
const pcb = j.part('pcb')
  .extrude(outline, mm(1.6), { id: 'board' })
  .extrude(j.region.circle(mm(4), { at: [22, 21] }), mm(13.6), { id: 'cap' })   // 470 µF electrolytic, 12 mm above the board
  .port('bottom', j.frame.on(j.feat('board').startFace(), { flip: true }))

const asm = (basePart, lidPart) => j.assembly('sensor-hub')
  .add('base', basePart.fit('mk4-petg'))
  .add('pcb', pcb)
  .add('lid', lidPart.fit('mk4-petg'))
  .joint('mount', j.joint.rigid(), 'pcb:bottom', 'base:standoffs')
  .joint('close', j.joint.snap(), 'lid:seat', 'base:rim')
  .interference({ clearance: mm(0.3) })

j.compile(asm(ported, lid)).diagnostics
// → [{ level: 'error', kind: 'asm.interference', at: ['lid/hook#1', 'pcb/cap'], message: 'overlap 18 mm³ near [22, 23.6, 17]',
//      fix: 'move the hooks along x (hookX) or onto the short walls' }]

const fix = { hookX: mm(12) }                                   // one value, both parts
const [baseOk, lidOk] = [ported.override(fix), lid.override(fix)]
const A = j.compile(asm(baseOk, lidOk))
A.metrics()   // → { interferenceVolume: 0, assemblyDOF: 0, parts: 3, uniqueParts: 3 }
A.bom()
// → [{ part: 'base', qty: 1 }, { part: 'lid', qty: 1 }, { part: 'pcb', qty: 1, note: 'reference, not printed' },
//    { part: 'insert M3x5.7', qty: 4 }]

// ── 6. Print the two printable parts ─────────────────────────────────────────
const job = j.print('enclosure', { printer: j.printer('mk4'), material: j.material('PETG') })
  .add('base', baseOk)
  .add('lid', lidOk, { orient: '-Z' })                          // flipped: the label prints on the bed, hooks point up
  .fit('mk4-petg')
  .use(j.rules.fdm)

const P = j.compile(job)
P.summary()
// → { plates: 1, orientation: { base: '+Z', lid: '-Z (given)' }, supports: 0 mm³,
//     bridges: { 'base.port-usb-c': 9.5 mm, 'base.port-barrel': 8.6 mm, 'base.windows': 7.0 mm }, warnings: 0 }
P.param('lid.lip')   // → { value: 71.6 × 51.6 mm, src: 'fit mk4-petg (slide 0.20 mm per side)', expr: 'pin(bw + 2·gap, slide)' }
P.metrics()          // → { printTime: 2 h 31 min, filament: 42.0 g, cost: 0.92 usd, supportVolume: 0 }

const { report } = j.export.tmf(P, { plates: true, settings: true })
report               // → { kept: ['plates', 'settings', 'part names'], approximated: ['mesh, max deviation 0.009 mm'], dropped: [] }
j.export.step(A)     // the whole assembly, PCB included, for the electronics side of the team
