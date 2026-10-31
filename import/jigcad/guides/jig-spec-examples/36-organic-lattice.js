// 36 · Organic lattice: a TPU wrist rest built from distance fields
//
// Model
//   A field gives every point its signed distance to the surface (negative inside).
//   union = min, intersect = max, subtract = max(f, −g), so field booleans never fail. A true distance
//   field never changes faster than distance itself, and that bound lets the mesher step safely.
//   smoothUnion(k) blends within a band of width k.
//   The rest is a smooth outer body, a 1.2 mm skin, and a gyroid lattice inside that is graded
//   along x: firmer at the ends, softer under the wrist. A noise blend textures the top.
//   Meshing (dual contouring, voxel = lw(0.5)) is a lowering, and its report says what was lost.
//
// Notice
//   - Softness is designed in geometry (graded cell size and wall thickness), not set as slicer infill.
//   - The lattice walls never go below lw(2), so the minimum-wall rule holds without exceptions.
//   - The noise blend breaks the distance bound. Meshing reports it (field.notDistance) and shortens its step.
//   - Changing the noise seed re-meshes only the bricks the blend touches.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, lw } from 'jig'

// ── 1. The body: a capsule spine smoothly blended into a rounded slab ────────
const spine = j.field.capsule(j.pt(-95, 8, 9), j.pt(95, 8, 9), mm(11))           // top of the spine at z = 20, toward the back
const slab = j.field.box(240, 75, 12, { r: mm(6) }).map(j.tx.move(0, 0, 6))
const body = spine.smoothUnion(slab, mm(8))
  .intersect(j.field.box(240, 75, 20, { r: mm(4) }).map(j.tx.move(0, 0, 10)))    // envelope 240 × 75 × 20 mm, flat bottom

// Field booleans can't fail, and polynomial smooth-min keeps the distance bound, so the body meshes safely.

// ── 2. Skin, texture, lattice ────────────────────────────────────────────────
const skin = body.shell(mm(1.2))
  .blend(j.field.noise(mm(6), { seed: 7 }), (p, ctx) => p.z.gt(mm(14)) ? 0.06 : 0)   // ±0.4 mm texture on the top only

const along = p => Math.abs(p.x.div(mm(120)).value)                               // 0 at the centre, 1 at the ends
const lattice = j.field.gyroid(mm(12), { thickness: lw(2) })
  .grade('cell', (p, ctx) => mm(16).sub(mm(6).mul(along(p))))                     // 16 mm cells in the middle → 10 mm at the ends
  .grade('thickness', (p, ctx) => lw(2).add(lw(1).mul(along(p))))                 // 0.9 mm → 1.35 mm toward the ends

const pockets = [[-100, -25], [100, -25], [-100, 25], [100, 25]]
  .map(([x, y]) => j.field.cyl(mm(4), mm(1.5)).map(j.tx.move(x, y, 0)))          // Ø8 × 1.5 mm for silicone bumpers
  .reduce((a, f) => a.union(f))

const rest = skin.union(lattice.intersect(body.offset(mm(-1.2)))).subtract(pockets)

skin.mesh({ voxel: lw(0.5) }).report.warnings
// → [{ kind: 'field.notDistance', maxSlope: 1.07, note: 'the noise blend breaks the distance bound; meshing steps shrink by 1/1.07' }]

// ── 3. Meshing: a lowering with a report ─────────────────────────────────────
const meshed = rest.mesh({ voxel: lw(0.5), method: 'dual-contouring' })
const M = j.compile(meshed)
M.summary()
// → { voxel: 0.225 mm, bricks: 1'122 (34 × 11 × 3), triangles: 8.4 M, watertight: true, genus: 1'806,
//     maxDeviation: 0.11 mm (half a voxel), stepScale: 0.93 }
M.diagnostics
// → [{ level: 'info', kind: 'field.featureBelowVoxel', at: 'skin.blend', message: 'noise detail below 0.225 mm smoothed (3 % of texture energy)' }]

const reseeded = j.compile(skin.blend(j.field.noise(mm(6), { seed: 8 }), (p, ctx) => p.z.gt(mm(14)) ? 0.06 : 0)
  .union(lattice.intersect(body.offset(mm(-1.2)))).subtract(pockets).mesh({ voxel: lw(0.5) }))
reseeded.metrics().cacheHitRate
// → 0.67   (374 of 1'122 bricks re-meshed: only the top layer, where the blend weight is non-zero)

// ── 4. A part, a print job, the rules ────────────────────────────────────────
const wristRest = j.part('wrist-rest')
  .material(j.material('TPU-95A'))
  .import(j.mesh(meshed).decimate({ faces: 1_200_000, keep: 'features' }))

j.inspect.hausdorff(meshed, j.mesh(meshed).decimate({ faces: 1_200_000, keep: 'features' }))
// → { max: 0.04 mm, mean: 0.006 mm }   (well under one layer)

const job = j.print('wrist-rest', { printer: j.printer('mk4'), material: j.material('TPU-95A') })
  .add('rest', wristRest)
  .supports(false)                                             // flat bottom; the gyroid is self-supporting
  .slice({ layer: mm(0.2), walls: 2, top: 4, bottom: 3, infill: { density: 0 } })   // the lattice is the infill
  .seam('rear')
  .use(j.rules.fdm)

const P = j.compile(job)
P.diagnostics
// → []   (minWall: lattice walls ≥ 0.90 mm = lw(2); bedFit: 240 × 75 mm on 250 × 210 mm; pocket bridges 8 mm ≤ 10 mm)
P.summary()
// → { orientation: '+Z (flat bottom: bed contact 14'600 mm²)', supports: 0 mm³, layers: 100, plates: 1 }
P.metrics()
// → { printTime: 11 h 40 min, mass: 118 g, filament: 40.5 m, cost: 4.13 usd, supportVolume: 0, cuspMax: 0.2 mm }
//   filament = 97.5 cm³ / (π · 0.875² mm²) = 40.5 m;  mass = 97.5 cm³ · 1.21 g/cm³ = 118 g

// ── 5. Compared with the obvious alternative ─────────────────────────────────
const plainPart = j.part('plain').material(j.material('TPU-95A')).import(j.mesh(body.mesh({ voxel: lw(0.5) })))
const plain = j.compile(j.print('plain', { printer: j.printer('mk4'), material: j.material('TPU-95A') })
  .add('plain', plainPart)
  .slice({ walls: 3, infill: { density: 0.15, pattern: 'gyroid' } }))
plain.metrics()
// → { printTime: 9 h 10 min, mass: 92 g }   lighter and faster, but uniformly firm: the slicer's infill knows nothing about wrists

j.export.tmf(P).report
// → { kept: ['plates', 'settings', 'part names'], approximated: ['field → mesh (0.11 mm)', 'decimation (0.04 mm)'], dropped: [] }
