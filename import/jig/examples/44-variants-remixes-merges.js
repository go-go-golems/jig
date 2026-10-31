// 44 · Variants, remixes and merges: models are values, so history is algebra
//
// Model
//   A model is an immutable value with a content hash, the root of a Merkle DAG of features.
//   j.diff(a, b) compares feature graphs, not files: params, features, specs and references.
//   j.merge(base, ours, theirs) is a three-way merge on that graph. A change made on one side only
//   is applied, the same change made on both sides is applied once, and different changes to the same
//   path are conflicts. Conflict resolution is a slot: the default keeps base and reports, and a lambda wraps it.
//   j.remix(model, { from, license }) records attribution in L0, where it travels with every export.
//
// Notice
//   - Branches need no branching tool: const thin = mine.params({ t: mm(3) }) is a branch.
//   - The merge re-resolves references through genealogy, so my logo stays on the top face after upstream edits.
//   - Attribution changes the hash of the value but not the geometry, so every feature cache still hits.
//   - Upstream can keep publishing. Rebasing a remix is the same merge again.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm } from 'jig'

// ── Fixture: the author's model family and two published versions ────────────
const deskPlate = ({ t, fit }) => j.part('desk-plate')
  .params({ t })
  .extrude(j.sketch('outline', { on: j.plane.XY }).rect('r', 80, 50, { center: true, r: 4 }).profiles(), 't', { id: 'body' })
  .hole(j.sketch('holes', { on: j.plane.XY }).point('h1', [32, 17])
    .pattern(['h1'], j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y))), j.hole.clearance('M3', { fit }), { id: 'mount' })

const v1 = deskPlate({ t: mm(4), fit: 'snug' })
const v2 = deskPlate({ t: mm(3.5), fit: 'slide' })    // upstream: "holes were tight; also saves 12 % filament"

j.hash(v1)                          // → 'b3:4e1a07…'
j.diff(v1, v2)
// → { added: [], removed: [],
//     changed: [{ path: 'params.t', from: 4 mm, to: 3.5 mm }, { path: 'mount.spec.fit', from: 'snug', to: 'slide' }] }

// ── 1. A remix: fork with attribution ────────────────────────────────────────
const logo = await j.load.svg('my-logo.svg')                       // an effect; the result is a hashed value
const upstream = j.remix(v1, { from: 'ana/desk-plate', license: 'CC-BY-4.0' })
const mine = upstream
  .params({ t: mm(5) })                                            // stiffer, for a monitor arm clamp
  .emboss(j.region.svg(logo, { height: mm(20) }), mm(0.6), { on: j.feat('body').endFace(), op: 'join', id: 'logo' })

j.hash(upstream) === j.hash(v1)     // → false   (attribution is part of the value)
j.compile(upstream).trace.every(p => p.cached)   // → true    (geometry identical: every feature is a cache hit)
j.compile(mine).ir.text('L0').split('\n').slice(0, 3)
// → ['source desk-plate  b3:9d22c1…',
//    '  remix-of ana/desk-plate @ b3:4e1a07…  license CC-BY-4.0',
//    '  loaded my-logo.svg  sha256:51f0…']

j.diff(v1, mine)
// → { added: ['logo (emboss, join, on body/end)'], removed: [],
//     changed: [{ path: 'params.t', from: 4 mm, to: 5 mm }], meta: ['remix-of ana/desk-plate'] }

// ── 2. Three-way merge: upstream's fix into my remix ─────────────────────────
const m1 = j.merge(v1, mine, v2)    // base, ours, theirs
m1.conflicts
// → [{ path: 'params.t', kind: 'both-changed', base: 4 mm, ours: 5 mm, theirs: 3.5 mm }]
j.diff(mine, m1.model)
// → { changed: [{ path: 'mount.spec.fit', from: 'snug', to: 'slide' }],          (theirs, applied)
//     unresolved: ['params.t kept at base (4 mm) until resolved'] }            (the default for conflicts)

// ── 3. Resolving the conflict: two ways ──────────────────────────────────────
// (a) As a value edit, like any other change:
const resolvedA = m1.model.params({ t: mm(5) })

// (b) As a slot: wrap the default resolver with a lambda that knows my intent.
const m2 = j.merge(v1, mine, v2, {
  resolve: (c, ctx) => c.path === 'params.t' ? c.ours : ctx.default(c),
})
m2.conflicts                        // → []
j.hash(m2.model) === j.hash(resolvedA)   // → true   (both routes give the same value)

const M = j.compile(m2.model)
M.why(j.feat('body').endFace())     // → { resolved: ['body/end'], chain: ['extrude(outline) cap'], note: 'unchanged by the merge' }
M.param('t')                        // → { value: 5 mm, src: 'merge: ours (resolver lambda)', deps: [] }
M.decisions.filter(d => d.at.startsWith('mount'))
// → [{ at: 'mount', kind: 'hole', chose: 'vertical: Ø3.4 mm + slide 0.2 mm', reason: 'fit class from upstream v2' }]

// ── 4. Branches are plain values ─────────────────────────────────────────────
const branches = {
  mine:  m2.model,
  thin:  m2.model.params({ t: mm(3) }),
  thick: m2.model.params({ t: mm(6) }),
  plain: m2.model.suppress('logo'),
}
Object.entries(branches).map(([name, b]) => [name, j.hash(b).slice(0, 10), j.compile(b).metric('mass')])
// → [['mine',  'b3:7c10ae', 25.1 g],      plate area ≈ 3'950 mm² (PLA, solid)
//    ['thin',  'b3:e2245f', 15.3 g],      3 mm: 14.7 g + 0.6 g logo
//    ['thick', 'b3:0b9d31', 30.0 g],      6 mm: 29.4 g + 0.6 g logo
//    ['plain', 'b3:51c6d8', 24.5 g]]      5 mm, no logo

// ── 5. Upstream publishes again: rebasing is the same merge ──────────────────
const v3 = deskPlate({ t: mm(3.5), fit: 'slide' }).fillet(j.sel.edges('>Z').of('body'), mm(1), { id: 'soften' })
const rebased = j.merge(v2, m2.model, v3, { resolve: (c, ctx) => c.path === 'params.t' ? c.ours : ctx.default(c) })
rebased.conflicts                   // → []
rebased.decisions
// → [{ kind: 'order', chose: ['logo', 'soften'], reason: 'both sides appended after mount; supports are disjoint, so they commute' }]
j.diff(m2.model, rebased.model)
// → { added: ['soften (fillet on the outer top edges; the logo edges belong to feature logo, so of(body) excludes them)'] }
j.export.tmf(j.compile(rebased.model)).report.kept
// → ['plates', 'settings', 'part names', 'attribution: ana/desk-plate (CC-BY-4.0)']
