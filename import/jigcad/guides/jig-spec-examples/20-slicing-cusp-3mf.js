// 20 · Slicing, cusp height, adaptive layers, 3MF and G-code
//
// Model
//   Slicing is a family of level sets: layer k is S_k = M ∩ { z = (k + ½)·t }, a planar region printed t thick.
//   Σ area(S_k)·t is the midpoint rule for ∫ area(z) dz, so it converges to the volume as t → 0 with error O(t²)
//   (Cavalieri again; see 06).
//   Cusp height (the stair-step error) on a face whose normal makes angle θ with the build direction: c = t·|cos θ|.
//   Adaptive layers invert it: t(z) = clamp(c_max / max |cos θ| over faces at height z, t_min, t_max).
//   Print time ≈ Σ toolpath length / speed + per-layer overheads, so it grows with layer count, weighted by area.
//
// Grounding
//   Planar sectioning for layered manufacturing; cusp height (Dolenc & Mäkelä 1994); the layer sum is
//   Cavalieri again.
//
// Notice
//   - The slice law and the cusp law are checks on the slicer, the same way Cavalieri checks the kernel.
//   - Horizontal faces are snapped to layer boundaries, so their cusp is 0 and features keep their heights.
//   - G-code flavour is a four-way slot: a lambda can wrap the default, here to pause for an insert.
//   - Every export says what it kept, approximated and dropped.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, turn } from 'jig'

// ── Fixture: a dome paperweight with a cavity for steel shot and three inserts underneath ─
const weight = j.part('weight').material(j.material('PLA'))
  .revolve(j.sketch('q', { on: j.plane.XZ }).arc('a', { center: [0, 0], start: [40, 0], end: [0, 40] })
    .line('l1', 'a.end', [0, 0]).line('l2', [0, 0], 'a.start').profiles(), j.axis.Z, turn(1), { id: 'dome' })
  .revolve(j.sketch('cav', { on: j.plane.XZ }).polyline('p', [[0, 3], [15, 3], [15, 13], [0, 28]], { closed: true }).profiles(),
    j.axis.Z, turn(1), { op: 'cut', id: 'cavity' })              // a 45° conical roof prints without support
  .hole(j.sketch('ins', { on: j.plane.XY }).point('c', [25, 0]).pattern(['c'], j.pattern.circular(j.axis.Z, { count: 3 })),
    j.hole.insert('M3x5.7', { kind: 'heat-set' }), { id: 'inserts' })

// volume = ⅔π·40³ − (π·15²·10 + ⅓π·15²·15) − 3·π·2²·6.7 = 134'041 − 10'603 − 253 = 123'186 mm³   (dome − cavity − insert holes)

const job = j.print('weight', { printer: j.printer('mk4'), material: j.material('PLA'), parts: [weight] })
const P = j.compile(job)

// ── 1. Layers are level sets ─────────────────────────────────────────────────
P.layers.length                        // → 200   (40 mm / 0.2 mm)
P.layers[0]                            // → { k: 0, z: [0, 0.2] mm, area: 4'989 mm², regions: 1, holes: 3 }   π·40² − 3 insert holes
P.layers[15]                           // → { k: 15, z: [3.0, 3.2] mm, area: 4'252 mm², regions: 1, holes: 4 }   the cavity appears at z = 3

P.layers.reduce((v, L) => v.add(L.area.mul(mm(0.2))), j.q('0 mm^3'))
// → 123'190.2 mm³   against the exact 123'185.8 mm³: Σ area · t is Cavalieri again, with error O(t²).
//   The slicer gets an as-printed volume for free, and the suite uses the comparison as slice.volume.

// ── 2. Cusp height ───────────────────────────────────────────────────────────
// On the dome, cos θ = z / R: vertical at the equator (no stairs), flat at the pole (a full layer).
// Cusp height = t · |cos θ| (Dolenc & Mäkelä 1994). It costs nothing to evaluate, so adaptive slicing uses it
// to pick each layer's height (section 3), and the suite compares it with the measured stair steps (slice.cusp).
P.metrics()
// → { layers: 200, cuspMax: 0.20 mm, cuspMean: 0.10 mm, printTime: 190 min, filament: 52 g, supportVolume: 0 }
// cuspMean = 0.2 · mean(z / R) = 0.1 mm: on a sphere, area is uniform in z (Archimedes), so mean(z / R) = ½.

// ── 3. Adaptive layers: spend layers where the surface is flat ───────────────
const smooth = job.slice({ adaptive: { maxCusp: mm(0.05), min: mm(0.05), max: mm(0.3) } })
const A = j.compile(smooth)
A.metrics()
// → { layers: 411, cuspMax: 0.05 mm, printTime: 300 min }
// t(z) = min(0.3, 0.05 · 40 / z) = min(0.3, 2 / z): 0.3 mm up to z = 6.7 mm, then thinner towards the pole.
// layers = 6.7 / 0.3 + ∫ z/2 dz from 6.7 to 40 = 22 + 389 = 411
j.compile(job.slice({ layer: mm(0.05) })).metrics()
// → { layers: 800, cuspMax: 0.05 mm, printTime: 760 min }   the same surface quality, 2.5× the time
A.layers.filter(l => l.snapped).map(l => l.z[1])
// → [3.0 mm, 13.0 mm]   cavity floor and roof start: horizontal faces stay layer boundaries

// ── 4. Per-region settings: modifiers ────────────────────────────────────────
const strong = smooth.modifier(j.on('weight', j.feat('inserts').bores()),
  { grow: mm(3), walls: 6, infill: { density: 0.6 } })     // solid material for heat-set inserts to melt into
j.compile(strong).summary().modifiers
// → [{ region: 'inserts.bores ⊕ 3 mm', bodies: 3, walls: 6, infill: 0.6, addedTime: 4 min, addedFilament: 1.1 g }]

// ── 5. G-code: flavours, and a lambda that wraps one ─────────────────────────
const G = j.compile(strong)
G.gcode({ flavor: 'marlin' }).report
// → { kept: ['toolpaths', 'temperatures', 'fan', 'progress M73'], approximated: ['arcs as segments'], dropped: ['part names'] }
G.gcode({ flavor: 'klipper' }).report.kept
// → ['toolpaths', 'temperatures', 'fan', 'EXCLUDE_OBJECT labels per part']

// Pause before the cavity roof closes, to pour in the steel shot.
const withPause = G.gcode({
  flavor: (lyr, ctx) => lyr.z[0].eq(mm(13)) ? ['M0 Pour steel shot into the cavity', ...ctx.default(lyr)] : ctx.default(lyr),
})
withPause.report.notes                 // → ['custom flavor: wraps marlin; 1 layer modified (k = 53, z = 13.0 mm)']
// k = 53: 22 layers of 0.3 mm up to z = 6.7, then ∫ z/2 dz from 6.7 to 13 = 31 adaptive layers

// ── 6. 3MF and STL: what survives the trip ───────────────────────────────────
const tmf = j.export.tmf(G, { plates: true, settings: true, colors: true })
tmf.report
// → { kept: ['units (mm)', 'plates', 'part names', 'slicer settings incl. adaptive layers', 'modifiers', 'colors'],
//     approximated: ['B-rep → mesh: 21'340 triangles, max deviation 0.008 mm'],
//     dropped: ['parametric history', 'persistent names', 'fit provenance'] }
const stl = j.export.stl(G, { chord: mm(0.01), binary: true })
stl.report
// → { kept: ['geometry'], approximated: ['B-rep → mesh: 21'340 triangles, max deviation 0.008 mm'],
//     dropped: ['units (STL has none; assumed mm)', 'settings', 'modifiers', 'plates', 'part names', 'pause'] }
