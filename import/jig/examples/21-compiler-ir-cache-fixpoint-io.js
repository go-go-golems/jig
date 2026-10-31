// 21 · The compiler: IR levels, caching, fixpoints, staging, honest exports
//
// Model
//   compile = L0 source → L1 feature graph → L2 resolved → L3 solved sketches → L4 topology → L5 world → L6 products.
//   Each pure unit of work (a sketch, a feature, a mesh, a layer) is cached under a content hash of everything
//   that can change its output, and nothing else. A change invalidates only its downstream cone.
//   Cycles (orientation ⇄ teardrops, in-context sizes) are fixpoints: iterate until values stop changing, cap at 4.
//   Staging splits the work: finite unknowns are tabulated now, continuous ones become a residual program.
//   Exports are lowerings; each reports what it kept, approximated and dropped.
//
// Grounding
//   Compiler practice: content-addressed caching, fixpoint iteration, and partial evaluation for staging.
//
// Notice
//   - Every level has a text dump and a JSON form; the IR bundle ships them together for review, bug reports and agents.
//   - The trace shows cached: true where the cache hit, so you can see why a rebuild was fast or slow.
//   - Non-convergence is a diagnostic with the cycle in it, never a hang.
//   - Determinism is a law: the same model hashes to the same products.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg } from 'jig'

// ── Fixture: a print-in-place hinged box with S/M/L configurations ───────────
const box = j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd').profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .port('hinge', j.frame.on(j.feat('body').sideFace('r.top').edges('>Z').expect(1)))
const lid = j.part('lid')
  .params({ w: mm(60), d: mm(40), t: mm(2), label: 'PARTS' })
  .extrude(j.sketch('ls', { on: j.plane.XY }).rect('r', 'w', 'd').profiles(), 't', { id: 'plate' })
  .emboss(j.region.text(j.ref('label'), { size: mm(8) }), mm(0.6), { on: j.feat('plate').endFace(), op: 'cut', id: 'label' })
  .port('hinge', j.frame.on(j.feat('plate').sideFace('r.top').edges('<Z').expect(1)))
const kitOf = label => j.assembly('hinged-box')
  .params({ w: mm(60), d: mm(40), h: mm(30), label })
  .configs({ S: { w: mm(40), d: mm(30), h: mm(20) }, L: { w: mm(90), d: mm(60), h: mm(40) } })
  .add('box', box, { ground: true, params: { w: 'w', d: 'd', h: 'h' } })
  .add('lid', lid, { params: { w: 'w', d: 'd', label: 'label' } })
  .add('pin', j.lib.hinge.pin({ knuckles: 5, clearance: 'printInPlace' }), { params: { length: 'w' } })
  .joint('hinge', j.joint.revolute({ limits: [deg(0), deg(180)] }), 'box:hinge', 'lid:hinge')
  .printInPlace(['box', 'lid', 'pin'], { pose: { hinge: deg(180) } })      // printed open, lid flat beside the box
const jobOf = kit => j.print('hinged-box', { printer: j.printer('mk4'), material: j.material('PETG'), parts: [kit] }).fit('mk4-petg')

const job = jobOf(kitOf('PARTS'))
const P = j.compile(job)

// ── 1. Seven levels, each answering one question ────────────────────────────
P.ir.text('L0')   // What was asked?
// → print 'hinged-box' #9c41e2 · printer mk4 #11ab · material PETG #04cd · fit 'mk4-petg' #a3f9 (2026-10-12)
//   └─ assembly 'hinged-box' #c310  params { w: 60 mm, d: 40 mm, h: 30 mm, label: 'PARTS' }  configs [S, L]
//      ├─ part 'box' #5e02    ├─ part 'lid' #77d1    └─ lib hinge.pin@1.2 #e0a7
P.ir.text('L1')   // What operations, on what references?
// → box: base(sketch) → body(extrude h) → shell(wall)              port hinge ← body/side[base.r.top] edge >Z
//   lid: ls(sketch) → plate(extrude t) → label(emboss, cut)        port hinge ← plate/side[ls.r.top] edge <Z
//   hinged-box: hinge = revolute(box:hinge, lid:hinge) [0°, 180°] · printInPlace {box, lid, pin} @ hinge = 180°
//   job: orient(auto) ⇄ teardrops · slice(default) · plates(skyline)
P.ir.text('L2')   // What value, and why?
// → box.w = 60 mm ← hinged-box.w (bound in add) ← params      box.wall = 2 mm ← box.params
//   hinge.clearance = 0.35 mm ← fit 'mk4-petg'.printInPlace (calibrated 2026-10-12, coupon 71c2…)
P.ir.text('L3')   // Are the sketches determined?
// → base: 4 lines, 8 → 0 DOF, fully · ls: 4 lines, 8 → 0 DOF, fully
P.ir.text('L4', { node: 'box' })   // What topology, from where?
// → box/body1: 11 faces · 24 edges · 16 vertices · 12 loops · Euler–Poincaré 16 − 24 + 11 − 1 − 2 = 0 ✓
//   body/start · body/side[base.r.top] · … · body/end ∖ shell (the rim, 2 loops) · shell/floor · shell/wall[base.r.top] · …
P.ir.text('L5')   // Where is everything?
// → box @ identity (ground) · lid @ rot(hinge axis, 180°), gap 0.35 mm · pin @ hinge axis · DOF 1
//   plate 1: hinged-box '+Z' as posed: support 0 mm³, bed contact 4'690 mm² · teardrops: 5 knuckle bores (axis X ⟂ Z)
P.ir.text('L6')   // What goes to the printer?
// → plate 1: 18'204 triangles (max deviation 0.008 mm) · 150 layers × 0.2 mm · supports 0 · 2 h 05 min · 41 g PETG
//   3MF 412 kB · G-code (marlin) 1.9 MB

// ── 2. Change one thing; watch the cache ─────────────────────────────────────
const P2 = j.compile(jobOf(kitOf('SCREWS')))
P2.trace
// → [{ pass: 'parse',    level: 'L1', ms: 0.4 },
//    { pass: 'resolve',  level: 'L2', ms: 0.1, note: "1 change: lid.label 'PARTS' → 'SCREWS'" },
//    { pass: 'sketch',   level: 'L3', ms: 0.0, cached: true, note: '2/2' },
//    { pass: 'features', level: 'L4', ms: 41,  cached: 'partial', note: '5/6 cached; recomputed lid.label' },
//    { pass: 'world',    level: 'L5', ms: 3.2, cached: false, note: 'lid geometry changed: joints re-solved, sweep re-checked' },
//    { pass: 'orient',   level: 'L5', ms: 0.9, cached: false, note: 'same result: +Z' },
//    { pass: 'teardrops', level: 'L4', ms: 0.0, cached: true },
//    { pass: 'fixpoint', note: 'converged in 1 (orientation unchanged)' },
//    { pass: 'mesh',     level: 'L6', ms: 12,  cached: 'partial', note: 'box, pin cached; lid re-meshed' },
//    { pass: 'slice',    level: 'L6', ms: 22,  cached: 'partial', note: '3/150 layers recomputed: the label lies in z 0–0.6 on the bed face' }]
P2.metric('cacheHitRate')   // → 0.86

P2.feature('lid.label').cache
// → { key: 'f3a0…',
//     includes: { type: 'emboss', params: { depth: 0.6 mm, text: 'SCREWS', size: 8 mm, font: 'Inter Regular@4.0' },
//                 inputs: ['lid/plate body #77d1…'], refs: ['plate/end'], strategy: 'default', fit: {}, tol: '1e-7 mm', tables: [] },
//     excludes: ['color', 'material', 'display name'] }

// ── 3. Fixpoints: converging, and refusing to loop ───────────────────────────
P.trace.find(t => t.pass === 'fixpoint')   // → { pass: 'fixpoint', note: 'converged in 2' }   (iteration 2 confirmed '+Z' with teardrops)

const fickle = job.orient((part, ctx) => ctx.previous?.dir === '+X' ? '+Y' : '+X')   // a lambda that always flips
j.compile(fickle).diagnostics
// → [{ level: 'error', kind: 'fixpoint.notConverged', at: 'orient',
//      message: 'orient ⇄ teardrops did not converge in 4 iterations: +X → +Y → +X → +Y',
//      fix: 'make the orient lambda independent of the previous decision, or fix a direction' }]

// ── 4. Staging: tabulate the finite, leave the continuous for run time ──────
const live = j.stage(job)
live.tabulated              // → { config: ['default', 'S', 'L'], compiled: 3, ms: 410 }
live.residual               // → { joints: ['hinge: revolute angle, continuous'], metrics: ['sweptInterference', 'minClearance'] }
live.at({ config: 'L', hinge: deg(80) })
// → { ms: 0.6, solved: 'hinge only (warm start)', sweptInterference: 0 mm³, minClearance: 0.33 mm }

// ── 5. Exports are lowerings, with reports ───────────────────────────────────
j.export.step(P, { schema: 'AP242' }).report
// → { kept: ['exact B-rep per part', 'assembly structure', 'names', 'colors'], approximated: [],
//     dropped: ['plates', 'slicer settings', 'fit provenance'] }
j.export.tmf(P).report
// → { kept: ['units', 'plates', 'settings', 'part names'], approximated: ['B-rep → mesh, max deviation 0.008 mm'],
//     dropped: ['parametric history', 'persistent names', 'joints'] }
j.export.stl(P, { perPart: true }).report
// → { kept: ['geometry (3 files)'], approximated: ['B-rep → mesh, max deviation 0.008 mm'],
//     dropped: ['units (assumed mm)', 'plates', 'settings', 'pose (parts exported in their own frames)'] }

// ── 6. The IR bundle, and determinism ────────────────────────────────────────
j.export.ir(P)
// → { files: ['manifest.json', 'trace.json', 'diagnostics.json', 'decisions.json',
//             'L0.txt', 'L0.json', 'L1.txt', 'L1.json', …, 'L6.txt', 'L6.json'], bytes: 1.4 MB }
j.hash(j.compile(job)) === j.hash(j.compile(job))
// → true   (the hash covers L1–L6 products, not trace timings; the suite runs this as compile.deterministic)
