// 13 · Mesh remixing: topology you can count, repairs you can audit
//
// Model
//   A mesh is a simplicial 2-complex (V, E, F). It is printable when it is a closed, oriented 2-manifold:
//   every edge has exactly two faces, consistent winding, no self-intersections.
//   Euler characteristic per shell: χ = V − E + F = 2 − 2g − b, where g is the genus and b the boundary loops.
//   For a closed triangle mesh E = 3F/2, so χ = V − F/2.
//   Hausdorff distance d_H(A, B) = max(sup_a d(a, B), sup_b d(b, A)) bounds what decimation or fitting moved.
//   Remixing is a pure function of a loaded, content-hashed value; attribution travels in L0.
//
// Grounding
//   Simplicial complexes and the Euler characteristic; ICP registration (Besl & McKay 1992); Hausdorff
//   distance for deviation.
//
// Notice
//   - Loading is the only effect. After `await`, the STL is a value with a hash, and every step below is cached.
//   - Every repair is reported as data: what was filled, flipped, removed. Nothing is "fixed" silently.
//   - Mesh and B-rep mix: a downloaded mesh can be the base feature of a parametric part.
//   - The licence and the original author ride along into the 3MF metadata.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── 1. Load (the effect), then look before touching ──────────────────────────
const src = await j.load.stl('downloads/headphone-hook.stl')
src.hash                                   // → 'sha256:9f2c…e41a'   (pure from here on)

const raw = j.mesh(src)
j.compile(raw).mesh()
// → { faces: 48'212, vertices: 24'113, manifold: false, watertight: false, shells: 3, boundaryLoops: 2,
//     selfIntersections: 14, eulerChar: { main: -2, debris: [2, 2] }, genus: null (open) }
j.compile(raw).diagnostics.map(d => d.kind)
// → ['mesh.open', 'mesh.nonManifold', 'mesh.selfIntersecting']

// ── 2. Repair, with a receipt ───────────────────────────────────────────────
const fixed = raw.repair({ holes: true, normals: true, selfIntersections: true, degenerate: true, shells: 'keep-largest' })
const F = j.compile(fixed)
F.mesh()
// → { faces: 48'200, vertices: 24'100, manifold: true, watertight: true, shells: 1, boundaryLoops: 0,
//     selfIntersections: 0, eulerChar: 0, genus: 1 }        (the hook's screw hole is the one handle)
F.decisions.filter(d => d.kind.startsWith('repair'))
// → [{ kind: 'repair.holes', chose: 'fill 2 loops (38 triangles)' }, { kind: 'repair.shells', chose: 'drop 2 debris shells (12 triangles)' },
//    { kind: 'repair.selfIntersections', chose: 'resolve 14 by local remesh' }, { kind: 'repair.normals', chose: 'flip 210 faces' }]

// χ = V − E + F = 24'100 − 72'300 + 48'200 = 0 = 2 − 2g, so g = 1. A closed triangle mesh has E = 3F/2,
// so these counts are consistent; the suite checks this on every repaired mesh (mesh.euler) before slicing.

// ── 3. Cut off the old base, and cap the cut ────────────────────────────────
const trimmed = fixed.cut(j.plane.offset(j.plane.XY, mm(4)), { keep: 'above', cap: true })
j.compile(trimmed).mesh().watertight        // → true   (the cap is a planar triangulation of the cut loops)

// ── 4. Add a parametric clamp tab: mesh as the base feature of a part ──────
// A C-clamp under the hook: a 40 × 45 × 45 mm block with a desk-sized gap open towards +Y.
const hook = j.part('hook-desk-clamp')
  .params({ desk: mm(25), jaw: mm(10) })
  .import(trimmed, { id: 'remixed' })
  .extrude(j.sketch('tab', { on: j.plane.offset(j.plane.XY, mm(4)) })
    .rect('t', 40, 'desk + 2 * jaw', { center: true }).profiles(), mm(-45), { op: 'join', id: 'clamp' })   // z from 4 to −41
  .cut(j.sketch('slot', { on: j.plane.YZ })
    .rect('s', 37.5, 'desk', { at: [6.25, -18.5], center: true }).profiles(), { through: 'all' }, { id: 'jawGap' })   // y −12.5…25, z −31…−6
  .hole([j.pt(0, 6.25, -41)], j.hole.insert('M4x8.1', { kind: 'heat-set' }), { id: 'thumbscrew' })   // into the 10 mm lower jaw

const H = j.compile(hook)
H.decisions.find(d => d.at === 'clamp')
// → { kind: 'op', chose: 'join', reason: 'mesh–B-rep boolean: remixed is faceted; faces born from clamp stay exact' }
H.summary().faces                            // → { faceted: 46'930, exact: 17 }   selectors work on the exact ones

// Same remix as a pure mesh pipeline, when you don't need parameters:
const quick = trimmed.boolean('union', j.box(mm(40), mm(45), mm(45)).moved(j.tx.move(0, 0, -41)))

// ── 5. Decimate, and bound the damage ───────────────────────────────────────
const light = fixed.decimate({ ratio: 0.2, keep: 'features' })
j.inspect.hausdorff(fixed, light)
// → { max: 0.031 mm, mean: 0.004 mm, at: j.pt(12.4, -3.1, 40.2) }     well under lw(0.25) = 0.11 mm: invisible once printed
j.compile(light).mesh().faces                // → 9'640

// ── 6. Hollow for resin, with a drain ──────────────────────────────────────
const resin = fixed.hollow(mm(2), { drain: { at: j.pt(0, 0, 4.2), d: mm(3) } })
const R = j.compile(resin)
R.mesh()                                     // → { shells: 2 → 1 after the drain joins inner and outer, genus: 2, eulerChar: -2 }
j.inspect.mass(resin, { material: j.material('resin-standard') })
// → { volume: 11.2 cm³ (was 38.4), mass: 12.8 g, saved: 71 % }
R.diagnostics
// → []   (no trapped volume: every cavity reaches a drain; see j.rules.msla for the suction-cup check)

// ── 7. Back to B-rep where the geometry is prismatic ───────────────────────
const brep = fixed.toBrep({ mode: 'fit', tol: mm(0.05) })
j.compile(brep).summary()
// → { bodies: 1, faces: 41, fitted: { plane: 30, cylinder: 9, freeform: 2 }, maxDeviation: 0.048 mm }
// Now selectors work: j.sel.faces('%cylinder').radius(mm(2.1)) finds the old screw hole.

// ── 8. Attribution travels with the model ──────────────────────────────────
const mine = j.remix(hook, { from: 'alex.k / headphone-hook (Printables)', license: 'CC BY 4.0' })
j.compile(mine).ir.text('L0')
// → L0 source
//     model  hook-desk-clamp  sha256:51ab…
//     remix  of 'alex.k / headphone-hook (Printables)'  licence CC BY 4.0  input sha256:9f2c…e41a
//     edits  repair(4 kinds) · cut(z = 4 mm) · import → part · clamp · jawGap · thumbscrew
j.export.tmf(j.compile(j.print('hook', { parts: [mine] }))).report.kept
// → ['plates', 'settings', 'Designer: alex.k (original), remix by you', 'License: CC BY 4.0']
