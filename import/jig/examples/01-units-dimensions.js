// 01 · Units and dimensions: a graded vector space you can print with
//
// Model
//   A Quantity is a value plus a dimension vector over (L, M, T, Θ, angle, money).
//   Quantities of one dimension form a vector space: add, subtract, scale by numbers.
//   Multiplication adds dimension vectors (L · L = L²), so the dimensions form a free abelian group.
//   Symbolic units (lw, layer, nozzle, bbox) are linear in a context variable and stay symbolic
//   until the printer context resolves them. resolve(ctx) is a linear map.
//
// Grounding
//   Dimensional analysis and the SI (BIPM SI Brochure). The printer-relative units follow slicer conventions
//   (line width, layer height, nozzle).
//
// Notice
//   - Adding unlike dimensions is a DimensionError at the call site, not a wrong print later.
//   - lw(3) means "three line widths"; the same model prints correctly on a 0.4 mm or a 0.6 mm nozzle.
//   - Typed slots coerce bare numbers: a Length slot reads 60 as 60 mm.
//   - The laws are executable, so the algebra stays honest.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, cm, inch, deg, rad, turn, gram, minute, usd, lw, layer, nozzle, bbox } from 'jig'

// ── 1. Constructors and the vector-space operations ─────────────────────────────
const a = mm(12)
const b = inch(0.25)                       // stored exactly as 0.25 in; converted only when combined
const c = a.add(b)                         // → 18.35 mm   (12 + 6.35)
const d = c.mul(2).sub(cm(1))              // → 26.7 mm
const e = j.q('1/4 in + 2 mm')             // the same algebra, parsed from a string
c.to('in')                                 // → 0.7224 in

// ── 2. Multiplication changes the dimension; addition refuses to ─────────────────
const area = mm(40).mul(mm(25))            // → 1000 mm²   dims { L: 2 }
const vol = area.mul(mm(30))               // → 30000 mm³  dims { L: 3 }
const density = j.q('1.24 g/cm^3')         // PLA          dims { M: 1, L: -3 }
const mass = vol.mul(density)              // → 37.2 g     dims { M: 1 }
const price = j.q('22 usd/kg')
const cost = mass.mul(price).to('usd')     // → 0.82 usd

try {
  mm(3).add(area)                          // L + L² is meaningless
} catch (err) {
  err.name                                 // → 'DimensionError'
  err.message                              // → 'cannot add mm (L¹) to mm² (L²) at 01-units-dimensions.js:41'
}

// Angles are dimensionless in SI, but jig tracks them, so 30 + 30° is rejected too.
deg(30).add(rad(Math.PI / 6))              // → 60°
turn(0.25).to('deg')                       // → 90°
j.q.sin(deg(30))                           // → 0.5   (a plain number: trig consumes the angle)

// ── 3. Symbolic units: printer-relative lengths ─────────────────────────────────
const wall = lw(3)                         // three extrusion line widths
const skin = layer(4)                      // four layer heights
const clearance = nozzle(0.5)
wall.toString()                            // → '3lw'
wall.add(mm(0.1)).toString()               // → '3lw + 0.1mm'   (still symbolic: a sum of terms)

const fdm04 = { lw: mm(0.45), layer: mm(0.2), nozzle: mm(0.4) }
const fdm06 = { lw: mm(0.68), layer: mm(0.3), nozzle: mm(0.6) }
wall.resolve(fdm04)                        // → 1.35 mm
wall.resolve(fdm06)                        // → 2.04 mm
bbox(0.05).resolve({ bboxDiag: mm(120) })  // → 6 mm   (used for field voxel sizes and analysis tolerances)

// resolve is linear: resolve(x + k·y) = resolve(x) + k·resolve(y). That is what lets a model built from
// symbolic units compile once and resolve per printer; the suite checks it as quantity.* (see 43).
const sides = wall.mul(2).add(clearance)   // still symbolic: '6lw + 0.5nozzle'
sides.resolve(fdm04)                       // → 2.9 mm  = 2 · 1.35 + 0.2
sides.resolve(fdm06)                       // → 4.38 mm = 2 · 2.04 + 0.3

// ── 4. Lambdas: a quantity that is a function of context ────────────────────────
// A wall that is never thinner than 1.2 mm, whatever the nozzle.
const sturdy = j.q(ctx => lw(3).resolve(ctx).max(mm(1.2)))
sturdy.resolve(fdm04)                      // → 1.35 mm
sturdy.resolve({ lw: mm(0.25), layer: mm(0.1), nozzle: mm(0.2) })  // → 1.2 mm

// ── 5. Comparisons are dimension-checked as well ────────────────────────────────
mm(1.35).gte(mm(1.2))                      // → true
mm(25.4).eq(inch(1))                       // → true   (equal within kernel tolerance)
// mm(1).lt(gram(1))                       // DimensionError: L vs M

// ── 6. Typed slots coerce bare numbers, so sketches stay readable ───────────────
const sk = j.sketch('s', { on: j.plane.XY })
  .line('l1', [0, 0], [60, 0])             // array coordinates: document units (mm)
  .dim('l1', 60)                           // a Length slot: 60 → 60 mm
  .dim(['l1', 'X'], 0)                     // an Angle slot: 0 → 0°

// Mixed-unit documents work, but they are worth knowing about.
const imperial = j.part('jig-plate').units({ length: 'in' }).params({ t: inch(0.125), lip: mm(2) })
j.compile(imperial).diagnostics
// → [{ level: 'info', kind: 'units.mixed', at: 'params.lip', message: 'mm value in an inch document; kept exact' }]

// ── 7. Time and money: print metrics are quantities too ─────────────────────────
const t = minute(95).add(j.q('1 hour'))    // → 155 min
const rate = j.q('0.05 usd/minute')        // machine time
t.mul(rate).add(cost)                      // → 8.57 usd
