// 06 · Extrude and revolve: Cavalieri and Pappus as executable laws
//
// Model
//   extrude : Region × Length → Shape                 vol = area(R) · h                    (Cavalieri)
//   revolve : Region × Axis × Angle → Shape           vol = θ · r̄ · area(R)                (Pappus–Guldinus)
//     where r̄ is the distance from the region's centroid to the axis.
//   A part is a timeline of features. Each feature is an endomorphism on the set of bodies,
//   and `op` says how its result combines: new | join | cut | intersect.
//   Taper turns a prism into a frustum: vol = h/3 · (A₀ + A₁ + √(A₀A₁)) for similar sections.
//
// Grounding
//   Cavalieri's principle, the Pappus–Guldinus centroid theorem, and the frustum volume formula.
//
// Notice
//   - The volume laws hold exactly for exact B-reps, so they double as kernel tests.
//   - Mass and cost come from the same volume integral once a material is attached (see 17).
//   - The op default (first 'new', later 'join' when touching) is recorded as a decision, never hidden.
//   - Volume as a function of h is linear, so search over h can use the closed form (staging, see 21).
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, turn } from 'jig'

// ── 1. A plate: one extrude, then holes cut through ───────────────────────────
const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('r', 80, 50, { center: true, r: 4 })               // rounded rectangle, fully constrained by the helper
  .circle('h1', 1.7, { at: [32, 17] })
  .pattern(['h1'], j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))   // mirror in X, then Y: four holes

const plate = j.part('plate')
  .material(j.material('PETG'))
  .extrude(outline.profiles(), mm(4), { id: 'body' })      // holes are inner loops of the profile, so they come out cut

const P = j.compile(plate)
P.sketch('outline')                    // → { dof: 0, status: 'fully', conflicts: [], redundant: [] }
P.metric('volume')                     // → 15'800 mm³ = (80·50 − 4·(1 − π/4)·4² − 4·π·1.7²) · 4
// The suite checks this against the kernel as extrude.volume (Cavalieri); here it buys a closed form (section 6).
P.metric('mass')                       // → 20.1 g   (PETG, 1.27 g/cm³, solid; as-printed mass is in 17)

// ── 2. Op defaults are decisions you can read ─────────────────────────────────
const plateWithBoss = plate
  .extrude(j.sketch('b', { on: j.feat('body').endFace() }).circle('c', 6, { at: [0, 0] }).profiles(), mm(8), { id: 'boss' })
  .extrude(j.sketch('t', { on: j.plane.offset(j.plane.XY, mm(30)) }).circle('c', 3, { at: [60, 0] }).profiles(), mm(5), { id: 'tab' })

j.compile(plateWithBoss).decisions
// → [{ at: 'boss', kind: 'op', chose: 'join', alternatives: ['new'], reason: 'starts on body/end, which touches body1' },
//    { at: 'tab',  kind: 'op', chose: 'new',  alternatives: ['join'], reason: 'does not touch any body; created body2' }]

// ── 3. A taper: the frustum law ────────────────────────────────────────────────
const sq = j.sketch('sq', { on: j.plane.XY }).rect('r', 30, 30, { center: true })
const frustum = j.part('frustum').extrude(sq.profiles(), mm(20), { taper: deg(-10), id: 'f' })
const F = j.compile(frustum)
// top side = 30 − 2·20·tan 10° = 22.95 mm  →  A₀ = 900, A₁ = 526.6
F.metric('volume')                     // → 14'100 mm³ = 20/3 · (900 + 526.6 + √(900 · 526.6))

// ── 4. Revolve: Pappus–Guldinus ───────────────────────────────────────────────
// A vase-like ring: a 10 × 4 mm rectangle whose centroid sits 25 mm from the Z axis.
const ringSection = j.sketch('sec', { on: j.plane.XZ })
  .rect('r', 4, 10, { at: [23, 0] })                       // x from 23 to 27 → centroid at x = 25
const ring = j.part('ring').revolve(ringSection.profiles(), j.axis.Z, turn(1), { id: 'rev' })
j.compile(ring).metric('volume')       // → 6'283.2 mm³ = 2π · 25 · 40
// The suite uses Pappus as an oracle for the kernel's revolve (revolve.volume): a closed form to compare against.

// A partial revolve is the same law with θ < 2π.
const quarter = j.part('quarter').revolve(ringSection.profiles(), j.axis.Z, deg(90), { id: 'q' })
j.compile(quarter).metric('volume')    // → 1'570.8 mm³

// ── 5. Revolve a spline profile: a printable vase in four lines ──────────────
const vaseProfile = j.sketch('vp', { on: j.plane.XZ })
  .spline('outer', [[20, 0], [32, 40], [18, 90], [24, 120]], { fit: 'interp' })
  .line('top', 'outer.end', [0, 120]).line('axis', [0, 120], [0, 0]).line('base', [0, 0], 'outer.start')
const vase = j.part('vase')
  .revolve(vaseProfile.profiles(), j.axis.Z, turn(1), { id: 'solid' })
  .shell(j.feat('solid').endFace(), mm(1.2), { id: 'walls' })    // open top; or print solid in vase mode (see 20)

j.compile(vase).summary()
// → { bodies: 1, features: 2, volume: 52.3 cm³, bbox: [64, 64, 120] mm, sketchDOF: 0 (vp has 4 spline points fixed) }

// ── 6. Volume is linear in h: the closed form a search can use ────────────────
const plateSpace = j.design({ h: j.param.range(mm(2), mm(10), { default: mm(4) }) },
  p => j.part('plate').material(j.material('PETG')).extrude(outline.profiles(), p.h, { id: 'body' }))
const staged = j.stage(plateSpace)
staged.residual.mass                   // → h ↦ 5.02 g/mm · h   (exact: ρ · area(R) · h; no recompiles needed)
staged.residual.mass(mm(6))            // → 30.1 g
staged.note                            // → 'mass is linear in h (Cavalieri); geometry compiled once at h = 4 mm'
