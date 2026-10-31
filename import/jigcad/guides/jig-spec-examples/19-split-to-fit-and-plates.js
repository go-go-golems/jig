// 19 · Split to fit, plates, colours: when the object is bigger than the printer
//
// Model
//   A part fits a bed B when some orientation and placement puts its footprint inside B and its height under B_z.
//   Splitting cuts a solid S by planes into pieces Sᵢ with ∪ Sᵢ = S (volumes add exactly: Σ vol Sᵢ = vol S).
//   The seam cost of a cut plane is the area of S ∩ plane that ends up on visible faces; jig minimises it subject to fit.
//   Joints restore alignment: each dowel needs material d + 2·lw(2) around it, so thin walls get local bosses.
//   Plates are 2D bin packing of footprints (NP-hard; skyline heuristic by default).
//   Packing bound: Σ footprint areas ≤ plates × bed area, so plates ≥ ⌈Σ A / A_bed⌉.
//
// Grounding
//   Plane partitions of solids; 2D bin packing with no-fit polygons, reported against the area lower bound.
//
// Notice
//   - Splitting is a print-job decision, not a modelling one: the part stays whole and parametric.
//   - The cut position is a decision with a reason, and the rejected positions stay listed as alternatives.
//   - Hardware the split needs (dowels) joins the job automatically, so the BOM and plates stay honest.
//   - Colour and material are assigned by selector, so they survive edits like everything else.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── Fixture: a desk tray longer than the bed ─────────────────────────────────
const tray = j.part('tray')
  .params({ L: mm(320), W: mm(140), H: mm(40), wall: mm(3) })
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 'L', 'W', { r: 6 }).profiles(), 'H', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .emboss(j.region.text('DESK', { size: mm(12), font: 'Inter Black', at: [160, 70] }), mm(0.6),
    { on: j.feat('shell').faces().and(j.sel.faces('+Z')).expect(1), op: 'join', id: 'label' })   // on the floor, x ≈ 140–180
  .add(j.box(10, 10, 1.5), { at: j.tx.move(10, 10, -1.5), id: 'foot' })
  .pattern(j.feat('foot').body(), j.pattern.mirror(j.plane.offset(j.plane.YZ, mm(160))).times(j.pattern.mirror(j.plane.offset(j.plane.XZ, mm(70)))))

const mk4 = j.printer('mk4')            // bed 250 × 210 × 220 mm
const job = j.print('desk', { printer: mk4, material: j.material('PLA') })
  .add('tray', tray)

// ── 1. Too big: the diagnostic says why, and what would work ─────────────────
j.compile(job).diagnostics
// → [{ level: 'error', kind: 'print.bedFit', at: 'tray',
//      message: '320 × 140 × 41.5 mm does not fit 250 × 210 × 220 mm in any orientation (even diagonally: the bed diagonal is 326 mm)',
//      fix: "job.split('tray', { fit: 'bed' })" }]

// ── 2. Split: the default chooses the cut and the joints ─────────────────────
const split = job.split('tray', { fit: 'bed', by: 'auto', joint: j.lib.dowel({ d: mm(4), l: mm(12), fit: 'press' }) })
const S = j.compile(split)

S.decisions.find(d => d.kind === 'split')
// → { at: 'tray', kind: 'split', chose: 'plane x = 130 mm',
//     reason: 'seam 642 mm² (same for every x-cut), avoids label (x 140–180), both pieces fit (130 and 190 ≤ 250)',
//     alternatives: [{ plane: 'x = 160', rejected: 'cuts through label' }, { plane: 'y = 70', rejected: '2 cuts needed (320 > 250)' }] }
// seam = floor 140 × 3 + two walls 2 × 3 × 37 = 420 + 222 = 642 mm²
S.metric('seamArea')                    // → 642 mm²

S.decisions.filter(d => d.kind === 'joint')
// → [{ kind: 'joint', chose: '3 × dowel Ø4 × 12 (press)', reason: 'two walls + floor centre' },
//    { kind: 'boss', chose: '3 × Ø 8 mm boss, 12 mm long each side', reason: 'dowel needs 4 + 2 × 0.9 = 5.8 mm of material; wall is 3 mm' }]
S.bom()
// → [{ part: 'tray.a', qty: 1 }, { part: 'tray.b', qty: 1 }, { part: 'dowel Ø4×12', qty: 3, source: 'printed' }]

S.body('tray.a').volume().add(S.body('tray.b').volume()).sub(S.feature('bosses').volume)
  .eq(j.compile(tray).metric('volume'))   // → true   (the halves partition the tray; the suite checks split.partition)

// ── 3. Choosing the cut yourself: wrap the default ───────────────────────────
// Keep the default's choice unless the cut lands within 20 mm of a foot.
const careful = job.split('tray', {
  fit: 'bed',
  by: (part, ctx) => {
    const cut = ctx.default(part)
    return j.inspect.distance(cut, j.feat('foot').faces()).lt(mm(20)) ? j.plane.offset(j.plane.YZ, mm(120)) : cut
  },
})
j.compile(careful).decisions.find(d => d.kind === 'split').chose   // → 'plane x = 130 mm'   (feet are at x 10–20 and 300–310)

// ── 4. Plates: packing the job ───────────────────────────────────────────────
const bin = j.part('bin').extrude(j.sketch('b', { on: j.plane.XY }).rect('r', 40, 40, { r: 4 }).profiles(), mm(30), { id: 'body' })
  .shell(j.feat('body').endFace(), mm(1.6), { id: 'shell' })

const batch = split
  .add('bin', bin, { qty: 6 })
  .plates({ pack: 'skyline', spacing: mm(5) })

const B = j.compile(batch)
B.plates
// → [{ plate: 1, items: ['tray.b (190 × 140)', 'bin × 1', 'dowel × 3'], utilisation: 0.54 },
//    { plate: 2, items: ['tray.a (130 × 140)', 'bin × 5'], utilisation: 0.50 }]
// The halves cannot share a plate: side by side needs 130 + 5 + 190 = 325 mm > 250 (or 140 + 5 + 140 = 285 > 210 stacked).

B.plates.lowerBound
// → { footprints: 54'544 mm², bedArea: 52'500 mm², plates: 2 }   and the packer used 2
// Σ A = 26'600 + 18'200 + 6 × 1'600 + 3 × 48 = 54'544 mm² → ⌈54'544 / 52'500⌉ = 2: the skyline packing is optimal here.

// ── 5. Colour and material by selector ───────────────────────────────────────
const styled = batch
  .color(j.on('tray', j.feat('label').faces()), 'white')                        // a filament swap for the label layers
  .color(j.on('tray', j.sel.bodies().minus(j.feat('label').body())), 'black')
  .material(j.on('tray', j.feat('foot').body()), j.material('TPU-95A'))         // soft feet, a second material

j.compile(styled).summary()
// → { plates: 2, colors: { black: 'tray, bins, dowels', white: 'label' }, materials: { PLA: 'tray, bins, dowels', 'TPU-95A': '4 feet' },
//     swaps: 6 (label on tray.b: 3 layers × 2 swaps, plate 1 only), purge: 4.1 g, printTime: 9 h 40 min }
j.compile(styled).diagnostics
// → [{ level: 'warning', kind: 'print.firstLayer', at: 'tray.a/foot', message: 'TPU feet start on the first layer; PLA–TPU adhesion is weak on the bed side',
//      fix: 'print feet separately or move them 0.2 mm up into the floor' }]
