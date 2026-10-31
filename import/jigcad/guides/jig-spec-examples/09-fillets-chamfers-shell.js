// 09 · Fillets, chamfers, shells and ribs: local operations with global consequences
//
// Model
//   A fillet of radius r replaces an edge by the surface a ball of radius r traces while touching both faces.
//   Locally it is an opening (convex edge: remove material) or a closing (concave edge: add material)
//   with a disk of radius r, applied only in the edge's neighbourhood; faces away from the edge keep their names.
//   Feasibility: r is bounded by the room on each adjacent face. Two fillets sharing a 30 mm side allow r ≤ 15 mm.
//   A chamfer cuts with a plane at setbacks (d, d2) or (d, angle). A shell is the erosion R ⊖ B_t with open faces
//   removed, so an outer corner radius r becomes an inner radius max(r − t, 0).
//   On a bed edge, a fillet's normal turns towards −Z: below z = r(1 − cos 45°) it overhangs more than 45°.
//
// Grounding
//   Rolling-ball blends from solid-modelling practice. The 45° bed-edge chamfer follows the FDM overhang
//   rule, which is a calibrated heuristic.
//
// Notice
//   - Concave edges are filleted before convex ones by default; the order is a recorded decision.
//   - fillet.tooLarge reports the largest radius that would work, not just "failed".
//   - The radius slot takes a lambda per edge, and the shape slot can wrap ctx.default.
//   - Print opinion: bed edges get a 45° chamfer (no overhang, absorbs elephant's foot), not a fillet.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, lw, layer } from 'jig'

const base = j.sketch('base', { on: j.plane.XY }).rect('r', 60, 40, { center: true })
const block = j.part('caddy')
  .params({ wall: mm(2) })
  .extrude(base.profiles(), mm(30), { id: 'body' })                     // 72'000 mm³

// ── 1. Fillets are local ─────────────────────────────────────────────────────
const corners = j.feat('body').sideFaces().edges('|Z').expect(4)
const rounded = block.fillet(corners, mm(5), { id: 'corners' })

const R = j.compile(rounded)
R.metric('volume')               // → 71'356 mm³ = 72'000 − 4 · (1 − π/4) · 5² · 30
R.genealogy('corners/face[body/side[base.r.top] ∩ body/side[base.r.right]]')
// → { feature: 'corners', kind: 'fillet', from: ['body/side[base.r.top]', 'body/side[base.r.right]'], radius: 5 mm }
R.trace.filter(t => t.level === 'L4').map(t => [t.pass, t.note])
// → [['feature:body', 'extrude, 6 faces'], ['feature:corners', 'fillet, 4 edges; modified 6 faces; 0 faces renamed']]

// ── 2. Concave before convex ─────────────────────────────────────────────────
const mount = j.part('mount')
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', 50, 30, { center: true }).profiles(), mm(4), { id: 'plate' })
  .extrude(j.sketch('b', { on: j.feat('plate').endFace() }).circle('c', 6, { at: [0, 0] }).profiles(), mm(10), { id: 'boss' })
  .fillet(j.feat('boss').edges('%circle'), mm(1.5), { id: 'blend' })   // the root (concave) and the rim (convex)

j.compile(mount).decisions.find(d => d.at === 'blend')
// → { at: 'blend', kind: 'fillet.order', chose: ['boss/side ∩ plate/end (concave)', 'boss/side ∩ boss/end (convex)'],
//     reason: 'concave first: the root blend adds material, so the rim keeps a full face to roll on' }

// ── 3. Too large: report the feasible maximum ────────────────────────────────
const tooBig = mount.fillet(j.feat('plate').sideFaces().edges('|Z'), mm(20), { id: 'huge' })
j.compile(tooBig).diagnostics
// → [{ level: 'error', kind: 'fillet.tooLarge', at: 'huge',
//      message: 'r = 20 mm exceeds 15 mm on 4 edges: two fillets share each 30 mm side',
//      fix: 'r ≤ 15 mm (a full round end); 14.9 mm keeps a 0.2 mm flat' }]

// ── 4. Per-edge radius, and a shape slot that wraps the default ──────────────
const soft = block.fillet(
  j.feat('body').sideFaces().edges('|Z').or(j.feat('body').endFace().edges()),
  (edge, ctx) => edge.convex ? (edge.length.gt(mm(35)) ? mm(3) : mm(2)) : mm(1),
  { shape: (edge, ctx) => edge.length.gt(mm(50)) ? 'g2' : ctx.default, id: 'soft' })   // curvature-continuous on long, visible edges

j.compile(soft).feature('soft').edges.map(e => [e.name, e.radius, e.shape])
// → [['body/side[base.r.top] ∩ body/end', 3 mm, 'g2'], ['body/side[base.r.right] ∩ body/end', 3 mm, 'rolling-ball'],
//    …, ['body/side[base.r.top] ∩ body/side[base.r.right]', 2 mm, 'rolling-ball'], …]   (60 mm edges: g2; 40 mm: default)

// ── 5. Bed edges: chamfer, not fillet ────────────────────────────────────────
const bedEdges = j.sel.faces('<Z').of('caddy').edges()
const bedRound = block.fillet(bedEdges, mm(3), { id: 'bedRound' })
const bedChamfer = block.chamfer(bedEdges, mm(0.4), { angle: deg(45), id: 'bedChamfer' })

j.compile(j.print('a', { parts: [bedRound] })).diagnostics
// → [{ level: 'warning', kind: 'print.overhang', at: 'bedRound',
//      message: 'fillet on bed edges: the lowest 0.88 mm of the 3 mm round overhangs > 45° (90° at the bed)',
//      fix: 'chamfer at 45° instead: block.chamfer(bedEdges, mm(3), { angle: deg(45) })' }]
j.compile(j.print('b', { parts: [bedChamfer] })).diagnostics     // → []

// preset.fdm does this for you, using s.bed(): the edges on the plate in the chosen orientation.
// Orientation is decided by the print job, so this is one of the fixpoints in 21.
j.compile(j.print('c', { parts: [block.use(j.preset.fdm)] })).decisions.find(d => d.kind === 'bedChamfer')
// → { at: 'caddy', kind: 'bedChamfer', chose: '0.4 mm × 45° on 4 edges', reason: 'elephant’s foot: first layers squish ≈ 0.2 mm outwards' }

// ── 6. Shell with open faces ─────────────────────────────────────────────────
const caddy = rounded
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })     // open top

const C = j.compile(caddy)
C.metric('volume')               // → 15'125 mm³ = 71'356 − (56 × 36 − 4·(1 − π/4)·3²) × 28
C.feature('shell')
// → { open: ['body/end'], thickness: 2 mm, innerCornerRadius: 3 mm (= 5 − 2), note: 'offset of a fillet is a fillet' }

// Shelling thicker than the corner radius gives sharp inner corners: max(r − t, 0).
j.compile(rounded.shell(j.feat('body').endFace(), mm(6), { id: 'thick' })).feature('thick').innerCornerRadius   // → 0 mm

// ── 7. Ribs: walls grown from a line ─────────────────────────────────────────
const divider = j.sketch('div', { on: j.plane.XZ }).line('l', [-28, 25], [28, 25])
const sorted = caddy
  .rib(divider.wire(['l']), mm(1.6), { direction: '-Z', id: 'divider' })          // grows down to the floor, out to the walls
  .chamfer(j.feat('shell').faces().edges().and(j.sel.edges('>Z')), mm(0.6), { id: 'lead' })   // lead-in for a lid

j.compile(sorted).metric('volume')   // → 17'153 mm³ = 15'125 + 1.6 × 56 × 23 (rib) − 0.18 mm² × 179 mm (inner-rim chamfer)
j.compile(sorted.use(j.rules.fdm)).diagnostics
// → []   (rib 1.6 mm = 3.6 lw ≥ 2 lw; walls 2 mm; no overhangs beyond 45° with the open top up)
