// 04 · Sketch constraints and degrees of freedom
//
// Model
//   A sketch is a vector x of entity parameters and a system of equations g(x) = 0.
//   Entity DOF: point 2 · line 4 (two endpoints) · circle 3 (centre, r) · arc 5 (centre, r, two angles).
//   Each constraint adds rows to the Jacobian J = ∂g/∂x, and   DOF = n − rank J.
//   A redundant constraint adds a row in the span of the others with a consistent value (rank unchanged).
//   A conflicting one adds a dependent row with an inconsistent value: there is no solution, and the
//   solver reports a minimal conflicting set (an irreducible infeasible subsystem).
//   The default solver decomposes the constraint graph into rigid clusters and runs DogLeg per cluster.
//
// Grounding
//   Geometric constraint solving: DOF from the Jacobian's rank, decomposition plans (Hoffmann, Lomonosov &
//   Sitharam 2001), and DogLeg/LM solvers as in FreeCAD's Sketcher.
//
// Notice
//   - DOF is computed, not guessed: 18 entity DOF minus the numeric rank of J.
//   - Under-constrained is a warning while iterating and an error with .strict() or preset.production.
//   - A drag is a residual program: the system is compiled once and re-solved per mouse move, warm-started.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── 1. Entities add freedom ──────────────────────────────────────────────────
// A slot (stadium): two lines and two arcs. Endpoint refs ('l1.end') add coincidences automatically.
const s0 = j.sketch('slot', { on: j.plane.XY })
  .line('l1', [0, 0], [40, 0])
  .line('l2', [40, 10], [0, 10])
  .arc('a1', { center: [40, 5], start: 'l1.end', end: 'l2.start' })
  .arc('a2', { center: [0, 5], start: 'l2.end', end: 'l1.start' })

j.compile(s0).sketch('slot')
// → { dof: 10, status: 'under', entities: [l1 4, l2 4, a1 5, a2 5] = 18, equations: 4 coincident × 2 = 8 }

// ── 2. Constraints remove it ─────────────────────────────────────────────────
const s1 = s0.constrain(
  j.c.tangent('l1', 'a1'), j.c.tangent('l1', 'a2'),
  j.c.tangent('l2', 'a1'), j.c.tangent('l2', 'a2'))     // dof 6: two centres (4) and two radii (2)
const s2 = s1.constrain(j.c.equal('a1', 'a2'), j.c.horizontal('l1'))   // dof 4: position (2), length, radius
const s3 = s2.constrain(j.c.fix('l1.start')).dim('l1', 40).dim('a1', 5) // dof 0

;[s0, s1, s2, s3].map(s => j.compile(s).sketch('slot').dof)   // → [10, 6, 4, 0]

j.compile(s3).sketch('slot')
// → { dof: 0, status: 'fully', entityDOF: 18, equations: 18, rank: 18 }   (DOF = 18 − rank J; the suite checks it as sketch.dof)

// ── 3. Redundant versus conflicting ──────────────────────────────────────────
// Parallel lines are already implied by four tangencies plus equal radii: a redundant row.
const redundant = s3.constrain(j.c.parallel('l1', 'l2'))
j.compile(redundant).diagnostics
// → [{ level: 'warning', kind: 'sketch.redundant', at: 'slot', message: 'parallel(l1, l2) is implied by tangent×4 + equal(a1, a2); dropped',
//      fix: 'remove it, or keep it as a driven (reference) constraint' }]
j.compile(redundant).sketch('slot').dof   // → 0   (rank unchanged: 18)

// A 12 mm gap between the lines contradicts a 5 mm radius: tangency forces the gap to be 2r = 10 mm.
const conflicting = s3.dim(['l1', 'l2'], 12)
j.compile(conflicting).diagnostics
// → [{ level: 'error', kind: 'sketch.overConstrained', at: 'slot',
//      message: 'no solution; minimal conflicting set: dim(l1, l2) = 12 mm · radius(a1) = 5 mm · tangent(l1, a1) · tangent(l2, a1)',
//      fix: 'drop one of the four; e.g. make dim(l1, l2) driven (it measures 10 mm)' }]

// Driven (reference) dimensions measure without constraining.
j.compile(s3.dim(['l1', 'l2'], null, { driven: true })).sketch('slot').entities.find(e => e.driven)
// → { id: 'dim(l1, l2)', driven: true, value: 10 mm }

// ── 4. The solver slot: default, library, lambda ─────────────────────────────
const a = s3                                             // default: graph decomposition, DogLeg per cluster, LM fallback
const b = s3.solver('lm')                                // a library strategy by name
const c = s3.solver(j.solver.lm({ maxIter: 400 }))       // the same, with params
const d = s3.solver((cluster, ctx) =>                    // wrap the default: splines get LM, everything else stays default
  cluster.has('spline') ? j.solver.lm({ maxIter: 400 }) : ctx.default)

j.compile(a).decisions.filter(x => x.kind === 'solver')
// → [{ at: 'slot/cluster0', kind: 'solver', chose: 'dogleg', alternatives: ['lm', 'bfgs', 'newton'],
//      reason: 'default; converged in 4 iterations, residual 3e-14' }]

// ── 5. The L3 dump ───────────────────────────────────────────────────────────
j.compile(s3).ir.text('L3', { node: 'slot' })
// → sketch slot (L3) on XY · solver dogleg · 1 rigid cluster · 4 iterations · residual 3e-14
//     entities   l1 line 4 · l2 line 4 · a1 arc 5 · a2 arc 5                              Σ 18
//     equations  coincident×4 (8) · tangent×4 (4) · equal (1) · horizontal (1) · fix (2) · length (1) · radius (1)   Σ 18
//     rank 18 · dof 0 · status fully
//     solved     l1 (0,0)→(40,0) · l2 (40,10)→(0,10) · a1 c(40,5) r5 · a2 c(0,5) r5

// ── 6. Under-constrained: say what is still free ─────────────────────────────
const loose = j.compile(s1)
loose.diagnostics
// → [{ level: 'warning', kind: 'sketch.underConstrained', at: 'slot', message: '6 DOF remain',
//      fix: 'free: a1.center (2), a2.center (2), a1 radius, a2 radius; try equal(a1, a2), fix(l1.start), dim(a1)' }]
loose.sketch('slot').entities.map(e => [e.id, e.dof])
// → [['l1', 0], ['l2', 0], ['a1', 3], ['a2', 3]]   (lines are pinned by tangency; the arcs carry the freedom)

j.compile(s1.strict()).diagnostics[0].level    // → 'error'

// Independent clusters add their DOF and solve independently.
const twoParts = s3.circle('hole', 1.7, { at: [20, 5] })
j.compile(twoParts).sketch('slot').dof         // → 3   (the slot is rigid; the hole's centre and radius are free)

// ── 7. A drag is a staged residual ───────────────────────────────────────────
// s2 has 4 DOF. Dragging a1's centre re-solves only its cluster, starting from the last solution,
// and picks the least-change configuration (minimum-norm step in parameter space).
const drag = j.stage(s2)
drag.at({ 'a1.center': [52, 5] })
// → { moved: ['l1', 'l2', 'a1'], fixed: ['a2'], iterations: 2, ms: 0.2, length(l1): 52 mm }
drag.at({ 'a1.center': [52, 9] })
// → { moved: ['l1', 'l2', 'a1', 'a2'], iterations: 3, ms: 0.3, note: 'horizontal(l1) moved the whole slot up 4 mm' }
