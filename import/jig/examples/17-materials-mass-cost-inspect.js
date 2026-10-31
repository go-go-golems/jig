// 17 · Materials, mass, cost, and the printability analyses
//
// Model
//   Solid mass is a volume integral: m = ρ ∫_V dV, computed on the B-rep via the divergence theorem.
//   As printed, a part is three regions: perimeters (walls · lw deep from every side face), solid top/bottom
//   skins (layers · t), and the interior at infill fraction φ:   V_print = V_walls + V_skins + φ · V_interior.
//   Filament length = V_print / (π · (1.75 mm / 2)²);   cost = mass · price.
//   Overhang, measured from vertical: a face with unit normal n and build direction u overhangs when
//   n·u < 0 and θ = arcsin(−n·u) > θ_max (vertical wall θ = 0°, downward ceiling θ = 90°).
//   Bridges are downward faces supported at both ends; islands are layers that start in mid-air.
//
// Grounding
//   Volume integrals via the divergence theorem; filament length from the filament's cross-section. As-
//   printed mass is an approximate wall-and-infill model.
//
// Notice
//   - Material is excluded from geometry cache keys: switching PLA → PETG recomputes mass, not shape.
//   - The as-printed estimate uses the same slicer settings the print job will use, so it agrees with 20.
//   - Every analysis returns located, named results that diagnostics and rules can point at.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, lw, nozzle } from 'jig'

// ── 1. The material library ──────────────────────────────────────────────────
const pla = j.material('PLA')
// → { name: 'PLA', density: 1.24 g/cm³, cost: 22 usd/kg, modulus: 3.5 GPa, allowableStrain: 0.02,
//     glassTransition: 60 °C, shrink: 0.003 }
const petg = j.material('PETG')       // density 1.27 g/cm³, glassTransition 80 °C, allowableStrain 0.025
const abs = j.material('ABS')         // density 1.04 g/cm³, glassTransition 105 °C, shrink 0.007
const cheapPla = pla.with({ cost: j.q('17 usd/kg') })   // a value; the library entry is unchanged

// ── 2. Solid versus as-printed ───────────────────────────────────────────────
const block = j.part('block').material(pla)
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 40, 40, { center: true }).profiles(), mm(20), { id: 'body' })

j.inspect.mass(block)
// → { volume: 32'000 mm³, mass: 39.7 g, filamentLength: 13.30 m, cost: 0.87 usd }

j.inspect.mass(block, { walls: 3, infill: 0.15 })   // 0.45 mm lines, 0.2 mm layers, 4 bottom / 5 top
// → { volume: 10'477 mm³, mass: 13.0 g, filamentLength: 4.36 m, cost: 0.29 usd,
//     parts: { walls: 4'174 mm³,       // 160 mm perimeter × 20 mm × 1.35 mm, less corner overlap
//              skins: 2'504 mm³,       // (40 − 2.7)² × 9 layers × 0.2 mm
//              infill: 3'798 mm³ } }   // 0.15 × 37.3² × (20 − 1.8)
// filament: 10'476 / (π · 0.875²) = 10'476 / 2.405 = 4'355 mm

// ── 3. One geometry, three materials ─────────────────────────────────────────
for (const m of [pla, petg, abs]) j.inspect.mass(block.material(m), { walls: 3, infill: 0.15 }).mass
// → 13.0 g, 13.3 g, 10.9 g          (geometry compiled once; the trace shows body cached: true twice)
j.inspect.mass(block.material(cheapPla), { walls: 3, infill: 0.15 }).cost   // → 0.22 usd

// ── 4. A probe part that fails in every interesting way ─────────────────────
const probe = j.part('probe').material(pla)
  .add(j.box(40, 20, 30), { id: 'block' })
  .add(j.box(15, 20, 5), { at: j.tx.move(40, 0, 25), id: 'ledge' })         // a cantilever ledge
  .add(j.box(3, 20, 6), { at: j.tx.move(52, 0, 19), id: 'lip' })            // a lip hanging under its tip
  .add(j.box(12, 20, 8), { at: j.tx.move(14, 0, 6), op: 'cut', id: 'tunnel' })   // a 12 mm wide tunnel along Y
  .add(j.box(0.6, 20, 10), { at: j.tx.move(-0.6, 0, 0), id: 'rib' })        // a 0.6 mm fin on the side
  .emboss(j.region.text('v2', { size: mm(4) }), mm(0.4), { on: j.sel.faces('>Y').of('block'), op: 'join', id: 'label' })

// ── 5. Walls and thin features ───────────────────────────────────────────────
j.inspect.wall(probe, { min: lw(2) })        // lw(2) = 0.90 mm
// → { min: 0.6 mm, violations: [{ at: 'rib', t: 0.6 mm, min: 0.90 mm }] }
j.inspect.thin(probe, { min: nozzle(1) })    // nozzle(1) = 0.40 mm
// → [{ at: 'label', width: 0.36 mm, note: 'strokes of "v2" at 4 mm; below one nozzle width' }]

// ── 6. Overhangs, bridges, islands ───────────────────────────────────────────
j.inspect.overhang(probe, { dir: '+Z', max: deg(45) })
// → { area: 300 mm², faces: [
//      { name: 'ledge/bottom', theta: 90°, area: 240 mm² },   // x 40–52; the lip covers the last 3 mm
//      { name: 'lip/bottom',   theta: 90°, area: 60 mm² } ],
//    excluded: [{ name: 'tunnel/top', reason: 'bridge (supported at both ends)' }] }

j.inspect.bridges(probe, { dir: '+Z' })
// → [{ face: 'tunnel/top', span: 12 mm, length: 20 mm, max: 10 mm, ok: false }]

j.inspect.islands(probe, { dir: '+Z' })
// → [{ z: 19 mm, area: 60 mm², at: 'lip', note: 'starts below the ledge it hangs from; nothing underneath' }]

// The ledge underside is an overhang, not an island: its first layer touches the block in the same layer.
// Turn the ledge into a 45° wedge and the overhang disappears, because 45° from vertical is the limit.
const wedge = j.sketch('wedge', { on: j.plane.XZ }).polyline('p', [[40, 30], [55, 30], [55, 25], [40, 10]], { closed: true })
const probe2 = probe.suppress('ledge').suppress('lip').extrude(wedge.profiles(), mm(20), { id: 'wedge' })
j.inspect.overhang(probe2, { dir: '+Z', max: deg(45) }).area   // → 0 mm²   (wedge/bottom: θ = 45°, at the limit)

// ── 7. Bed contact, and analyses become diagnostics ─────────────────────────
j.inspect.bedContact(probe, { dir: '+Z' })   // → { area: 812 mm², regions: 1 }   40 × 20 + 0.6 × 20 (the fin is fused to the block)
j.compile(probe.use(j.rules.fdm)).diagnostics.map(d => d.kind)
// → ['print.thinWall', 'print.thinFeature', 'print.overhang', 'print.bridge', 'print.island']
