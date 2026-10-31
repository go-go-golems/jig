// 12 · Fields: signed distance, smooth blends, graded lattices
//
// Model
//   A Field is f : ℝ³ → ℝ (mm), and its solid is { p | f(p) ≤ 0 }. A signed distance field has |∇f| = 1.
//   union = min, intersect = max, subtract(a, b) = max(a, −b). Pointwise, (min, max) form a distributive lattice.
//   min and max of 1-Lipschitz functions are 1-Lipschitz, so they stay safe bounds for meshing and sphere tracing.
//   smoothUnion(a, b, k) = min(a, b) − h²k/4 with h = max(k − |a − b|, 0)/k. Its gradient is a convex combination
//   of ∇a and ∇b, so it stays 1-Lipschitz. It deviates from min by at most k/4, so it → union as k → 0.
//   shell(t) = |f| − t/2   offset(d) = f − d   gyroid g = sin x cos y + sin y cos z + sin z cos x, x = 2π·pₓ/cell
//   A TPMS sheet |g| ≤ w is not a distance; jig normalises it by |∇g| so `thickness` means millimetres.
//
// Grounding
//   Signed distance fields and Lipschitz bounds (Hart 1996); polynomial smooth minimum; dual contouring (Ju
//   et al. 2002); the gyroid (Schoen 1970) in its trigonometric approximation.
//
// Notice
//   - Fields never fail a boolean: there is no topology to repair until meshing.
//   - Meshing is a lowering with a report. It names features thinner than the voxel instead of losing them silently.
//   - Grading is a lambda over space: walls thicken where the load goes and thin out where it doesn't.
//   - The mesh cache is per voxel brick, so a local edit re-meshes locally.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, lw } from 'jig'

// ── 1. Distance, and the lattice laws ───────────────────────────────────────
const ball = j.field.sphere(mm(10))
const slab = j.field.box(mm(30), mm(30), mm(6), { r: mm(1) })
ball.at(j.pt(0, 0, 0))                    // → −10 mm   (inside: negative)
ball.at(j.pt(15, 0, 0))                   // → 5 mm     (the distance to the surface)

const pod = slab.union(ball.map(j.tx.move(0, 0, 8)))
const cut = slab.subtract(j.field.cyl(mm(3), mm(20)))

// union = min and intersect = max are total functions, so a field boolean never fails, and a min of distance
// fields is still a distance bound, so meshing can take safe steps (suite: field.lattice).
pod.at(j.pt(0, 0, 8))                     // → −10 mm   (inside the ball, deeper than the slab)

// ── 2. Smooth union, and its limit ──────────────────────────────────────────
const seam = j.pt(8.66, 0, 3)                        // on both surfaces: slab top z = 3 meets the sphere (√(10² − 5²) = 8.66)
;[mm(4), mm(2), mm(1), mm(0.1), mm(0)].map(k => slab.smoothUnion(ball.map(j.tx.move(0, 0, 8)), k).at(seam))
// → [−1 mm, −0.5 mm, −0.25 mm, −0.025 mm, 0 mm]      the deviation −k/4 at |a − b| = 0 vanishes with k

const blended = slab.smoothUnion(ball.map(j.tx.move(0, 0, 8)), mm(2))
blended.mesh({ voxel: mm(0.5) }).report.warnings   // → []   (polynomial smooth-min keeps the distance bound)

// A raw trig field is not a distance, and meshing says so.
const raw = j.field.fn((p, ctx) => {
  const [x, y, z] = [p.x, p.y, p.z].map(v => 2 * Math.PI * v.div(mm(5)).value)
  return mm(Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x))
})
raw.mesh({ voxel: mm(0.5) }).report.warnings
// → [{ kind: 'field.notDistance', maxSlope: 1.9, fix: 'use j.field.gyroid(cell, { thickness }), which normalises by |∇g|' }]

// ── 3. A shelled, blended organic shape ─────────────────────────────────────
const pebble = j.field.sphere(mm(18))
  .smoothUnion(j.field.sphere(mm(14)).map(j.tx.move(22, 0, -3)), mm(8))
  .smoothUnion(j.field.capsule(j.pt(-20, 0, 0), j.pt(20, 0, 0), mm(9)), mm(6))   // rigid maps keep the distance property
const vessel = pebble.shell(lw(4)).intersect(j.field.plane(j.plane.offset(j.plane.XY, mm(8))))   // a 1.8 mm wall, open at z = 8

// ── 4. Gyroid infill, graded thicker near the load ──────────────────────────
// A bracket made the usual way, then filled with a field instead of the slicer's infill.
const bracket = j.part('bracket')
  .extrude(j.sketch('s', { on: j.plane.XZ }).polyline('L', [[0, 0], [60, 0], [60, 12], [12, 12], [12, 50], [0, 50]], { closed: true }).profiles(),
    { symmetric: mm(24) }, { id: 'body' })
  .hole([j.pt(45, 0, 12)], j.hole.clearance('M4', { fit: 'free' }), { id: 'load' })

const loadPoint = j.pt(45, 0, 6)
const infill = j.field.gyroid(mm(8), { thickness: mm(0.6) })
  .grade('thickness', (p, ctx) => mm(0.6).add(mm(1.0).mul(Math.exp(-p.sub(loadPoint).norm().div(mm(15)).value))))   // 1.6 mm at the hole → 0.6 mm far away

const filled = bracket.infill(j.sel.bodies().of('bracket'), infill.clip(j.field.sdf(bracket).offset(lw(-3))))   // inside the walls only

j.compile(filled).feature('infill1')
// → { cell: 8 mm, thickness: [0.6, 1.6] mm, relativeDensity: [23 %, 62 %]   (≈ 3.09 · t / cell),
//     selfSupporting: true, overhangArea: 0 mm² beyond 45° }
j.compile(filled).diagnostics
// → [{ level: 'info', kind: 'ref.autoId', at: 'infill1', message: 'generated id; pass { id } to reference it' }]

// ── 5. Meshing is a lowering, with a report ─────────────────────────────────
const fine = vessel.mesh({ voxel: lw(0.5) })            // 0.225 mm, dual contouring
j.compile(fine).mesh()
// → { faces: 412'880, watertight: true, manifold: true, genus: 0,
//     report: { method: 'dual-contouring', voxel: 0.225 mm, maxDeviation: 0.03 mm, featuresBelowVoxel: 0 } }

const coarse = j.compile(filled.use(j.preset.iterate))   // iterate: voxel lw(2) = 0.9 mm
coarse.diagnostics.filter(d => d.kind === 'field.featureBelowVoxel')
// → [{ level: 'warning', kind: 'field.featureBelowVoxel', at: 'infill1', message: 'gyroid walls 0.6–0.9 mm vs voxel 0.9 mm: 41 % of the sheet may vanish',
//      fix: 'mesh({ voxel: lw(0.5) }) before printing' }]

// ── 6. The per-brick cache ──────────────────────────────────────────────────
const filledWith = gain => bracket.infill(j.sel.bodies().of('bracket'),
  j.field.gyroid(mm(8), { thickness: mm(0.6) })
    .grade('thickness', (p, ctx) => mm(0.6).add(gain.mul(Math.exp(-p.sub(loadPoint).norm().div(mm(15)).value))))
    .clip(j.field.sdf(bracket).offset(lw(-3))))

const P1 = j.compile(filledWith(mm(1.0)))
const P2 = j.compile(filledWith(mm(1.4)))                // stronger near the hole; everything else identical
P1.trace.find(t => t.pass === 'field.mesh')             // → { pass: 'field.mesh', level: 'L6', ms: 2'140, cached: false, note: 'bricks 1'536' }
P2.trace.find(t => t.pass === 'field.mesh')
// → { pass: 'field.mesh', level: 'L6', ms: 310, cached: 'partial', note: 'bricks 1'536: 214 re-meshed, 1'322 cached' }
// The change is negligible beyond ~4·15 mm from the hole (e^{−4} < 2 %), so only bricks inside that radius re-mesh.
