# jig

**A composable grammar for modelling 3D-printable objects.** This is an API design sketch with examples only; there is no kernel.

> A jig holds the work and guides the tool.

jig is a JavaScript API for parametric, print-first CAD, a focused subset of what Fusion 360 and FreeCAD do. Every model is an **immutable builder value**. Underneath sits a **small grammar of mathematical sorts**: quantities, transforms, regions, selectors, constraints, patterns, distance fields. Each one comes from the model its field already uses (§1.3); abstract structure is used where it makes things compose, and every structure has to pay for itself (§3). The compiler lowers models through **seven inspectable IR levels**, from the source down to plates of sliced, supported parts. Defaults follow good printing practice. Every slot also accepts a lambda that receives the default, so users wrap an opinion instead of replacing it.

The same grammar serves three jobs:

1. **Production:** printable 3MF plates, G-code, STEP for others, parts that actually fit.
2. **Iteration:** design spaces, objectives (print time, filament, strength proxies), search, variants, remixes.
3. **Study:** experiments on printers (calibration), on the engine, on users, and on the design process itself.

**Status: Mode A, examples only.** Each file in `examples/` parses (`npm run check`). Results in `// →` comments show the *shape* of a result. Numbers that follow from formulas stated in files 01–21, 35 and 70 are recomputed by `tools/verify-numbers.py` (`npm run verify`, 488 checks); the rest are illustrative.

Contents: [1 Modules and foundations](#1-modules-and-foundations) · [2 Conventions](#2-the-six-conventions) · [3 Core grammar](#3-core-grammar) · [4 Module reference](#4-module-reference) · [5 IR levels and the Program](#5-ir-levels-and-the-program) · [6 Staging, caching, fixpoints](#6-staging-caching-fixpoints) · [7 Defaults](#7-opinionated-defaults) · [8 Laws](#8-laws-one-suite) · [9 Metrics and diagnostics](#9-metrics-and-diagnostics) · [10 Bare names](#10-bare-names) · [11 Example map](#11-example-map)

---

## 1. Modules and foundations

### 1.1 The print suite: 18 sub-languages

All 18 modules share the core grammar of §3. Each one adds a few sorts of its own, and each one lowers into the shared IR of §5.

| # | Module | Covers | Mathematics | Roughly corresponds to |
|---|---|---|---|---|
| **Foundation** |||||
| 1 | `units` | dimensioned quantities: length, angle, mass, time, temperature, money; symbolic units resolved by context (`lw`, `layer`, `nozzle`, `bbox`) | graded vector space; dimension exponents form a free abelian group | unit settings |
| 2 | `params` | user parameters, expressions, configurations (S/M/L), design tables | expression DAG; topological evaluation | Fusion *Change Parameters*, *Configurations*; FreeCAD *Spreadsheet*, *VarSet*; OpenSCAD Customizer |
| 3 | `geom` | points, vectors, transforms, datum planes and axes, frames | affine space; Lie group SE(3) ⊂ Sim(3) | construction geometry, datums |
| 4 | `select` | topology queries; persistent naming | Boolean algebra of sets; genealogy graph | face/edge picking; the topological naming problem |
| **Shape** |||||
| 5 | `sketch` | 2D curves, constraints, dimensions, projections, text, profiles | nonlinear equation systems; DOF = n − rank J; graph decomposition; planar arrangements | Fusion *Sketch*; FreeCAD *Sketcher* |
| 6 | `part` | extrude, revolve, sweep, loft, hole, fillet, chamfer, shell, rib, emboss, patterns, mirror, booleans, CSG primitives, direct edits, multi-body | regularised CSG; B-rep; sweeps in SE(3); group actions | Fusion *Solid*; FreeCAD *PartDesign*/*Part*; OpenSCAD |
| 7 | `field` | implicit modelling: signed distance fields, smooth blends, shells, offsets, TPMS lattices (gyroid), variable thickness, field-driven infill; meshed with a report | SDFs; Lipschitz bounds; min/max lattice; R-functions; level sets; marching cubes / dual contouring | nTop-style implicit modelling, libfive |
| 8 | `mesh` | STL/OBJ/3MF remixing and scans: repair, cut, split, boolean, hollow, remesh, decimate, align, mesh→B-rep | simplicial complexes; χ = V − E + F = 2 − 2g; ICP; Hausdorff distance | Fusion *Mesh*; FreeCAD *Mesh*; Meshmixer |
| **Joining & products** |||||
| 9 | `lib` | printable joints and hardware: screws, nuts, heat-set inserts, nut traps, magnets, pins, dowels, snap-fits, living hinges, dovetails, printed threads, gears, bearings, **ports** | beam theory (snap-fit strain); involutes; standards as finite functions | fastener/gear libraries; BOSL2 |
| 10 | `assembly` | multi-part objects, ports, joints, grounding, print-in-place, swept-interference motion checks, exploded views, BOM | joints as subgroups of SE(3); Grübler–Kutzbach; swept volumes | Fusion *Joints*; FreeCAD *Assembly* |
| 11 | `fit` | clearance classes calibrated per printer and material, hole/pin compensation, calibration coupons, interval stack checks | interval arithmetic; linear regression on coupons | "tolerance test" prints |
| 12 | `inspect` | materials (filaments, resins), mass, filament length, cost; measure; wall thickness, overhang, bridge, thin-feature and bed-contact analysis | volume integrals via the divergence theorem; distance fields; normal-angle predicates | Fusion *Inspect*; slicer previews |
| **Print output** |||||
| 13 | `print` | printer and material profiles, orientation, supports, split-to-fit with alignment joints, plates and packing, slicing, adaptive layers, multi-material/colour, print-in-place settings | optimisation on the sphere S²; level-set slicing; cusp height; 2D bin packing | slicers (PrusaSlicer, Cura, Bambu Studio); Fusion additive |
| 14 | `io` | load STL, 3MF, OBJ, STEP, SVG, DXF, images (effects); export 3MF with plates and settings, STL, STEP, OBJ, G-code, preview PNG; **lowering reports** | lossless versus lossy lowerings | import/export |
| **Process** |||||
| 15 | `rules` | print design rules: minimum wall, overhang, bridge span, minimum feature, hole orientation (teardrops), text legibility, bed fit, first-layer area | predicates over topology and analysis fields | slicer warnings, DFM checks |
| 16 | `explore` | design spaces, objectives, search, variants, versions, diffs, merges (remixes) | product spaces; Pareto order; Merkle DAG; three-way merge | configurations, versions, remixes |
| 17 | `ingest` | classify incoming data (image, SVG, CSV, JSON, STL, STEP, text spec) and route it to presets (lithophane, cookie cutter, sign, chart object, remix) | classification; routing | — |
| 18 | `process` | the design process as a value; experiments with pre-registered hypotheses | process algebra; experimental design | — |

### 1.2 What the full CAD map adds, and why it is left out here

| Module | Covers | Why it is not in the print suite |
|---|---|---|
| `surface`, `form` | NURBS surfacing, subdivision freeform | printers consume meshes; `field` covers organic shapes and blends more robustly for printing |
| `sheet`, `frame` | sheet metal, weldments | different manufacturing processes |
| `motion` (full) | drives, couplings, dynamics, IK | print-in-place needs only clearance sweeps, which live in `assembly` |
| `sim` | FEA | **the first extension to add** for load-bearing prints; anisotropic layer properties make it a project of its own |
| `generative` | topology optimisation | `field` lattices and grading cover most printable lightweighting |
| `drawing` | 2D documentation | rarely needed for printed parts |
| `cam` (subtractive), `nest` | milling, turning, laser nesting | other machines |
| `render` | scenes, animation | only preview thumbnails are kept, in `io` |

### 1.3 Foundations: where the maths comes from

Each module starts from the model its field already uses. Abstract patterns (§3) then describe how these pieces compose.

| Concern | Established model | Reference | Used for | Fidelity |
|---|---|---|---|---|
| Units | dimensional analysis, SI | the SI Brochure (BIPM) | `DimensionError`, conversion, symbolic printer units | exact |
| Placement | rigid motions SE(3), homogeneous coordinates | kinematics and robotics texts | transforms, ports, mirrors | exact |
| Sketch constraints | geometric constraint solving: DOF counting, decomposition, Newton-type solvers | Hoffmann, Lomonosov & Sitharam (2001), decomposition plans | DOF status, conflict sets, local drags | exact to solver tolerance |
| Solids | regularised sets, CSG, B-rep, Euler operators | Requicha (1980); Mäntylä (1988) | features, booleans, validity checks | exact to kernel tolerance |
| Persistent naming | naming faces by feature history | Kripac (1997) | selectors that survive edits | exact when genealogy resolves |
| Sweeps | rotation-minimising frames by double reflection | Wang, Jüttler, Zheng & Liu (2008) | sweeps, printed threads | exact frame; approx surface |
| Implicit modelling | signed distance fields, Lipschitz bounds; dual contouring | Hart (1996); Ju et al. (2002) | fields, blends, meshing | exact for primitives; bounds after blends |
| Lattices | triply periodic minimal surfaces (gyroid) | Schoen (1970) | lattices, graded infill | approx (trigonometric level-set form) |
| Meshes | simplicial complexes, Euler characteristic; ICP registration | Besl & McKay (1992) | repair, genus, scan alignment | exact / approx |
| Slicing | planar sections; cusp height | Dolenc & Mäkelä (1994) | layers, adaptive layer height | exact / approx |
| Snap-fits | cantilever beam theory with allowable strain | snap-fit design guides | hook sizing and checks | approx |
| Gears | involute gearing; basic rack | ISO 53 | gear generation and placement | exact geometry |
| Mechanisms | mobility (Grübler–Kutzbach), loop closure | kinematics texts | DOF analysis, print-in-place sweeps | approx (blind to special geometry) |
| Stacks | interval and statistical tolerance analysis | tolerance-analysis texts; ISO 286 for machined parts | stack-ups | exact arithmetic |
| Plates | 2D bin packing, no-fit polygons | the nesting literature | packing, with an area lower bound | approx packer, exact bound |
| Design spaces | Latin hypercube sampling; multi-objective search | McKay et al. (1979); Deb et al. (2002), NSGA-II | search, experiments | exact as procedures |

### 1.4 Hard problems that stay empirical

These are the things that most often ruin a print. None has a clean closed form that jig could build on, so each is a **calibrated metric or rule**, never a law, and the README says so instead of hiding it.

| Problem | What jig does instead |
|---|---|
| Warping and bed adhesion | first-layer rule, brim default, a material `shrink` value calibrated per printer |
| Layer adhesion (anisotropic strength) | `layerStrengthRisk`, a heuristic calibrated with tensile coupons (50); `preset.functional` orients against it |
| Bridging and overhang quality | per-printer thresholds (45°, 10 mm) in the printer profile, adjustable by calibration prints |
| Printed fit (shrinking holes, elephant's foot) | fit profiles calibrated with coupons (16, 50) |
| Print time | a motion model, calibrated against the printer's own estimate |
| Support removal and scarring | `supportVolume` as a proxy only |

FEA for printed parts is left out (§1.2) partly for the same reason: printed material behaves anisotropically and inconsistently from print to print.

---

## 2. The six conventions

| # | Convention | In jig |
|---|---|---|
| 1 | **Builders are immutable values.** Every fluent method returns a new builder, and there is no `.build()`. | `const tall = box.params({ h: mm(60) })` is a branch. Models hash, diff, cache and merge, which makes remixes first-class. `j.compile(model)` returns a Program. |
| 2 | **Every slot accepts four things:** nothing (the default), a value or partial params, a named strategy, or a lambda `(input, ctx) => out` where `ctx.default` is the default. A lambda may return a value, a named strategy, or what `ctx.default(input)` gives it. | `.orient((part, ctx) => part.tall ? 'min-height' : ctx.default(part))` |
| 3 | **Pure unless declared.** Features, fields, selectors, solves, slicing and analyses are pure. Loading files, printer connections, clocks and remote compute are effects. | Pure work is cached per feature by content hash. `await j.load.stl(url)` returns a pure, hashed value. |
| 4 | **Laws are declared, derived and justified** (§8). Declaring a structure generates its laws; hand-written invariants and oracles must say what they pay for and cite their source. | `j.structure(Shape, 'booleanAlgebra', …)` derives the boolean laws; `j.law('slice.cusp', …, { justifies: 'adaptive layers', source: 'Dolenc & Mäkelä 1994' })` |
| 5 | **Every quantity has a unit.** Symbolic units stay symbolic until a context resolves them, and a dimension error is an error. | `mm(2).mul(mm(3))` is an Area; `lw(2)` means "two extrusion line widths"; `layer(3)` means "three layer heights". |
| 6 | **Jargon only where the audience knows it.** The public API uses the words CAD and printing people already use, maths included: `union`, `offset`, `lerp`, DOF, SDF, gyroid, Pareto. Abstract-algebra terms (monoid, group action, lattice) live in §3, §8 and the maths examples, never in the quick start or the scenarios. | `part.pattern(holes, j.pattern.circular(j.axis.Z, { count: 6 }))`, not `act(C6, holes)` |

Also:

- **Presets are functions `builder → builder`:** `.use(j.preset.fdm, house)`, plus `.with(b => …)` and the raw `.set(key, v)`.
- **Every default is visible** in `prog.summary()`, in §7, and as provenance in the IR: "this 0.2 mm clearance came from fit class `slide` calibrated on printer `mk4-petg`".
- **Typed slots coerce bare numbers.** `.dim('l1', 60)` means 60 mm because the slot is a Length. Coordinates in arrays use document units (mm and deg by default). Anywhere else a bare number is dimensionless.

---

## 3. Core grammar

Fourteen sorts are shared by every module. Module sorts (Sketch, Part, Field, Assembly, Plate, …) are built from these.

| Sort | Constructors | Operators | Laws / structure |
|---|---|---|---|
| **Quantity** | `mm(3)` `inch(0.25)` `deg(45)` `gram(12)` `j.q('1/4 in + 2 mm')` `lw(2)` `layer(3)` `nozzle(1)` `bbox(0.05)` `j.q(ctx => …)` | `add sub mul div neg abs min max clamp to resolve pm` | vector space per dimension; `mul` adds dimension exponents; `add` of unlike dimensions throws `DimensionError` |
| **Expr** | `'wall * 2 + 1 mm'` `j.expr('…')` `ctx => ctx.p.wall` | `.params({…})` `.override` `.config` | acyclic DAG; evaluation is a topological fold; cycles are reported with their path |
| **Point / Vec / Dir** | `j.pt(x, y, z)` `j.vec(…)` `j.dir('+Z')` | `p − p → v`, `p + v → p`, `v + v`, `k·v`, `dot cross norm unit angleTo` | affine space: `p + p` is an error |
| **Transform** | `j.tx.move(…)` `j.tx.rotate(axis, a)` `j.tx.mirror(plane)` `j.tx.scale(k)` `j.tx.align(fa, fb)` `j.tx.identity` | `then inverse pow apply` | group SE(3) (rigid) inside Sim(3); `mirror` is an involution; rotations about one axis add |
| **Datum** | `j.plane.XY` `j.plane.offset(p, d)` `j.plane.on(sel)` `j.axis.Z` `j.axis.of(sel)` `j.frame({origin, x, z})` `j.frame.on(sel)` | `offset rotate flip moved` | frames are transforms; `offset(a).offset(b) ≡ offset(a + b)` |
| **Region** (2D) | `sketch.profiles()` `j.region.rect/circle/polygon/slot/text/svg` | `union subtract intersect offset area centroid` | regularised Boolean algebra; area(A ∪ B) = area A + area B − area(A ∩ B) |
| **Shape** (3D, exact) | feature results; `j.box` `j.cyl` `j.sphere` `j.cone` `j.torus` | `union subtract intersect moved volume` | regularised Boolean algebra; inclusion–exclusion on volume; Euler–Poincaré |
| **Field** (3D, implicit) | `j.field.sdf(shape)` `j.field.gyroid(cell)` `j.field.fn((p, ctx) => d)` | `union intersect subtract smoothUnion shell offset blend map` | min/max form a distributive lattice; exact SDFs are 1-Lipschitz; `smoothUnion(k)` → `union` as k → 0 |
| **Feature** | `part.extrude/revolve/sweep/loft/hole/fillet/…` `part.feature(id, fn)` | sequencing (the timeline), `suppress rollback insertAfter` | timeline is a monoid under concatenation; a feature is an endomorphism on body sets; suppressed = identity |
| **Selector** | `j.sel.faces('>Z')` `j.feat('boss').endFace()` | `and or minus not where of sortBy largest first nth expect` | Boolean algebra of sets; resolution via genealogy (persistent names) |
| **Constraint** | `j.c.tangent(a, b)` `.dim(…)` `j.joint.revolute()` | composition into systems | equations; DOF = n − rank J; adding a duplicate constraint is redundant, not new |
| **Pattern** | `j.pattern.linear/circular/grid/hex/path/mirror/points` | `times filter skip vary` | group action; \|G × H\| = \|G\|·\|H\|; mirror ∘ mirror = id; coincident instances merge |
| **Strategy** | `'dogleg'` `j.solver.lm({…})` `(input, ctx) => …` | params; `ctx.default` | four-way slot discipline |
| **Design** | `j.param.range/choice/int` `j.design(params, p => model, {objective})` | `at sample fix where` | product space → models; objectives induce orders (weighted, lexicographic, Pareto) |


**What each sort buys.** A structure stays in the grammar only if it pays for something: a rewrite, a cache rule, a closed form, a test oracle or a class of bug it catches.

| Sort | Structure | Grounding | Fidelity | Buys |
|---|---|---|---|---|
| Quantity | vector space per dimension | dimensional analysis | exact | dimension errors at the call site; printer-relative units that resolve late |
| Expr | acyclic DAG, topological evaluation | — | exact | a change recomputes only its downstream cone; cycle reports with the path |
| Point / Vec / Dir | affine space | affine geometry | exact | `AffineError` for position/offset mix-ups |
| Transform | group SE(3) | rigid motions | exact | fused transforms; ports align through inverses; mirrored pairs stay in sync |
| Datum | frames as transforms | — | exact | offsets compose without re-solving |
| Region | regularised Boolean algebra | Requicha (1980) | exact | profile booleans reorder freely; area inclusion–exclusion as a test oracle |
| Shape | regularised Boolean algebra, B-rep | Requicha (1980); Mäntylä (1988) | exact to tolerance | n-ary boolean rewrite; validity check after every feature |
| Field | min/max lattice, 1-Lipschitz bounds | Hart (1996) | exact for primitives | booleans never fail; safe meshing steps; per-brick cache |
| Feature | timeline under sequencing | — | exact | prefix caching; `insertAfter` and suppression without rebuilding the past |
| Selector | set algebra plus genealogy | Kripac (1997) | exact when genealogy resolves | references that survive edits; `expect` catches breaks |
| Constraint | equation systems, DOF = n − rank J | geometric constraint solving | exact to solver tolerance | DOF status; minimal conflict sets; local drags |
| Pattern | group action | — | exact | instance counts without building; coincident instances merge |
| Strategy | four-way slot | — | — | defaults that users wrap instead of replacing |
| Design | product space, objective orders | McKay et al. (1979); Deb et al. (2002) | exact as procedures | parameter-only filters before compiling; shared cache during search |

**Metrics** and **diagnostics** are registries, not sorts (§9).

---

## 4. Module reference

The signatures below are the contract that every example follows. `?` marks optional arguments, `sel` is a Selector, `Q` is a Quantity, and `opts` always accepts `{ id }` where it makes sense.

**Ids.** Things you reference by name take the id first: sketch entities, components, joints, plates. Features take `{ id }` because most are never referenced. Feature ids without `{ id }` are generated (`extrude1`); referencing a generated id raises the `ref.autoId` info diagnostic.

### 4.1 `units`
```js
mm(3) cm m um inch ft · deg rad turn · kg gram · N kN · MPa GPa · s minute hour · degC · usd eur
j.q('25 mm^2') j.q('1.24 g/cm^3') j.q('25 usd/kg') j.q(ctx => ctx.lw.mul(2))   // parsed or lambda quantities
lw(n)      // × the extrusion line width in context (default 0.45 mm for a 0.4 mm nozzle)
layer(n)   // × the layer height in context (default 0.2 mm)
nozzle(n)  // × the nozzle diameter in context
bbox(n)    // × the model's bounding-box diagonal
q.add(b) .sub .mul .div .neg .abs .min .max .clamp(lo, hi) .to('in') .resolve(ctx) .dims .value
q.gt(b) .gte .lt .lte .eq(b, tol?)                                  // comparisons, dimension-checked
q.pm(t) q.tol(lo, hi)                                              // → Toleranced (see fit)
j.q.sqrt(a) j.q.sin(angle) j.q.cos(angle) j.q.atan2(y, x)          // trig takes Angle and returns a dimensionless number
```

### 4.2 `params`
```js
model.params({ wall: lw(3), h: mm(40), boss_d: 'wall * 4', count: 6 })   // any builder
model.configs({ S: { h: mm(30) }, M: { h: mm(40) }, L: { h: mm(55) } })  // a finite set of overrides
model.configs(j.table(csvText, { key: 'name' }))                       // a design table
model.config('M')                                                      // choose one (still a value)
model.override({ wall: mm(2.5) })                                      // the highest-precedence layer
model.expose(['h', 'count'], { labels, ranges })                       // the customizer surface for sharing
j.expr('…') j.ref('wall')
prog.param('boss_d')  // → { value: 5.4 mm, expr: 'wall * 4', src: 'params', deps: ['wall'] }
```
Precedence from low to high: library default, then `.params`, then `.configs` row, then `.override`, then the design-space point. Provenance records which layer won.

### 4.3 `geom`
```js
j.pt(x, y, z?) j.vec(x, y, z?) j.dir('+Z' | x, y, z) j.origin      p.add(v) p.sub(q) v.mul(k) v.dot(w) v.cross(w) v.norm() v.unit() p.lerp(q, t)
j.tx.identity j.tx.move(v | x, y, z) j.tx.rotate(axis, angle) j.tx.mirror(plane) j.tx.scale(k, { about? }) j.tx.align(fromFrame, toFrame)
t.then(u) t.inverse() t.pow(n) t.apply(x) t.det   // det −1 for mirrors: handedness flips
j.plane.XY .XZ .YZ   j.plane.offset(p, d)  j.plane.angle(p, axis, a)  j.plane.through(a, b, c)
j.plane.on(faceSel)  j.plane.mid(selA, selB)  j.plane.normalTo(curveSel, { at: 0.5 })
j.axis.X .Y .Z   j.axis.through(p, q)  j.axis.of(sel)                 // the axis of a cylinder, cone, edge or circle
j.point.center(sel)  j.point.on(curveSel, { at })
j.frame({ origin, x, z })  j.frame.on(sel, { flip? })  f.offset(d) f.rotate(axis, a) f.flip() f.moved(t)

// Patterns (group actions). Instances carry { index, at, params }.
j.pattern.linear(dir, { count, step | extent })  j.pattern.circular(axis, { count, angle = turn(1) })
j.pattern.grid(dirA, dirB, { count: [a, b], step: [sa, sb] })  j.pattern.hex(plane, { pitch, rings | count: [a, b] })
j.pattern.path(curveSel, { count, align: 'tangent' })  j.pattern.mirror(planeOrAxis)  j.pattern.points(pts)
p.times(q)  p.filter((inst, ctx) => bool)  p.skip([i, …])  p.vary((inst, ctx) => ({ …feature params, e.g. extent }))
p.count  p.closed  p.eq(q)        // known before any geometry is built; closed: a full circular pattern, so the last step returns to the first
```

### 4.3b Regions
```js
j.region.rect(w, h, { center, at, r })  j.region.circle(r, { at })  j.region.polygon(pts)  j.region.slot(a, b, width)
j.region.text(str, { size, font, align })  j.region.svg(loadedSvg, { width })  loadedDxf.region({ layer })
r.union(o) r.subtract(o) r.intersect(o) r.offset(d, { join: 'round' | 'miter' }) r.area() r.centroid()
// offset(−d) then offset(+d) is a morphological opening: it removes every feature narrower than 2d
```

### 4.4 `select`
```js
j.sel.faces(q?) j.sel.edges(q?) j.sel.vertices(q?) j.sel.bodies(q?)
// The query mini-language is borrowed from CadQuery:
//   '+Z' normal points +Z   '|Z' parallel to Z (edge direction, face normal)   '#Z' perpendicular to Z
//   '>Z' / '<Z' farthest / nearest along Z   '%cylinder' '%plane' '%line' '%circle' geometry type
//   any axis works: '-X' '>Y' '|X' …   combine with 'and' 'or' 'not':  '|Z and %line'
// Resolved faces and edges expose .normal .area .length .convex .radius to where/sortBy lambdas.
s.of(target)            // restrict to a body, feature or component
s.where(pred) s.type(t) s.radius(r) s.near(pt) s.adjacent(sel) s.tangentChain() s.loop()
s.largest() s.smallest() s.sortBy(fn) s.first() s.last() s.nth(i)   // nth is index-based and raises ref.fragile
s.and(o) s.or(o) s.minus(o) s.not()
s.faces() s.edges() s.vertices()                                     // navigate the topology
s.created(featId) s.modified(featId)
s.bed()                 // faces/edges touching the build plate in the chosen orientation (see print)
s.expect(n | [min, max])                                              // a cardinality assertion; a mismatch is an error
j.feat(id)              // FeatureRef: .faces() .edges() .body() .endFace() .startFace() .sideFaces() .sideFace(sketchEntityId)
                        //             .holes() .bores() (hole)   .capFaces() (sweep/loft)
j.on(componentId, sel)  // a selector inside an assembly component
prog.why(sel)           // → resolved names, the genealogy chain, and why each candidate was kept or dropped
```
**Persistent names** come from genealogy, for example `boss/side[base.l3]` and `fillet2/face[boss/side[base.l3] ∩ boss/end]`. Selectors that resolve through genealogy survive upstream edits.

### 4.5 `sketch`
```js
j.sketch(id, { on: plane | faceSel, origin? })
  .point(id, at) .line(id, a, b) .polyline(id, pts, { closed })
  .arc(id, { center, start, end } | { through: [a, b, c] }) .circle(id, r, { at }) .ellipse(id, rx, ry, { at, angle })
  .spline(id, pts, { degree: 3, fit: 'interp' | 'control', closed })
  .rect(id, w, h, { at, center, r? }) .polygon(id, n, r, { at, inscribed }) .slot(id, a, b, width)
  .text(id, str, { font, size, at, align })
  .project(id, sel) .intersect(id, sel) .offset(id, srcIds, d) .fillet(id, cornerRef, r) .chamfer(id, cornerRef, d)
  .trim(id, at) .mirror(srcIds, axisId) .pattern(srcIds, pattern) .construction(...ids) .import(id, region)
  .constrain(...constraints) .dim(target, value, { driven? })
  .solver(slot)                         // default: graph-decomposed DogLeg with LM fallback
  .strict()                             // under-constrained is an error instead of a warning
// refs: 'l1', 'l1.start', 'l1.end', 'l1.mid', 'c1.center', 'origin', 'X', 'Y', 'rect1.top', 'rect1.tl'
j.c.coincident(a, b) .horizontal(a) .vertical(a) .parallel(a, b) .perpendicular(a, b)
    .tangent(a, b, { g: 1 | 2 }) .equal(a, b) .symmetric(a, b, axis) .midpoint(pt, line) .concentric(a, b)
    .collinear(a, b) .on(pt, curve) .fix(a) .distance(a, b, d) .angle(a, b, θ) .radius(c, r) .diameter(c, d) .length(l, d)
// dim targets: 'l1' (length) · 'c1' (diameter) · 'a1' (radius) · ['l1', 'l2'] (distance or angle by type) · { h: [a, b] } · { v: [a, b] }
s.profiles()            // RegionSet of all closed regions, nested even–odd
s.profile(pick)         // id | point inside | (region, ctx) => bool
s.wire(ids)             // an open or closed path for sweeps and ribs
j.sketch3d(id).line(id, a, b).polyline(id, pts).spline(id, pts).helix(id, { axis, pitch, turns, r })
prog.sketch(id)         // → { dof, status: 'fully' | 'under' | 'over', conflicts, redundant, entities }
```

### 4.6 `part`
```js
j.part(name?)
  .params({…}) .configs({…}) .material(m) .color(c) .color(sel, c) .port(name, frame)
  .extrude(profile, extent, { op, taper, id })   // profile: RegionSet | Region | a planar face selector
                                                  // extent: Q | { symmetric: Q } | { two: [Q, Q] } | { to: sel } | { through: 'all' }
  .cut(profile, extent, opts)                     // = extrude with op 'cut'
  .revolve(profile, axis, angle = turn(1), opts)
  .sweep(profile, path, { frame: 'rmf' | 'frenet' | 'fixed' | fn, twist, scale, id })
  .loft(profiles, { rails, centerline, ends: { start, end }, closed, id })
  .hole(at, spec, opts)                           // at: points | sketch points | sel;  spec: j.hole.*
  .fillet(edges, r, { shape: 'rolling-ball' | 'chordal' | 'g2', id })   // r may be (edge, ctx) => Q
  .chamfer(edges, d, { d2, angle, id })
  .shell(openFaces, t, { direction: 'in' | 'out' | 'both', id })
  .draft(faces, angle, { neutral, pull, id })
  .rib(wire, t, { direction, id })
  .emboss(region, depth, { on: faceSel, wrap, op: 'join' | 'cut', id })   // text, logos, labels
  .thicken(fieldOrSel, t, opts) .split(bodySel, toolSel, opts) .boolean(op, targets, tools, opts)
  .pattern(targets, pattern, { onFail: 'skip' | 'error', id }) .mirror(targets, plane, opts)
  .move(targets, tx, opts) .copy(targets, tx, opts)
  .add(libItem | shape | part, { at, op, id, leaf, fit })   // a lib feature (insert boss, snap hook), a primitive, or another part
                                                  // at: point | frame | [points]; leaf: 'a' | 'b' for two-sided items such as hinges
  .pushPull(faceSel, d) .offsetFace(faceSel, d) .deleteFace(faceSel, { heal: true })   // direct edits
  .import(shapeOrMesh, opts)                      // a base feature from a loaded STEP or mesh value
  .feature(id, (bodies, ctx) => bodies)           // custom pure feature
  .suppress(id) .unsuppress(id) .rollback(id) .insertAfter(id, b => b…) .features()   // rollback rewinds to just before id
j.hole.simple(d, depth | 'through') .counterbore(d, cbD, cbDepth, depth) .countersink(d, csD, angle, depth)
      .clearance('M3', { fit: 'slide' | 'snug' | 'free', depth }) .tapped('M3', { depth, method: 'self-tap' | 'printed' })
      .insert('M3x5.7', { kind: 'heat-set' }) .nutTrap('M3', { kind: 'hex' | 'square', from: 'side' | 'top' })
      // horizontal holes become teardrops or bridged holes relative to the print orientation (see 7 Defaults)
j.box(w, d, h, opts) j.cyl(r, h, opts) j.sphere(r) j.cone(r1, r2, h) j.torus(R, r)   // CSG primitives (Shape), OpenSCAD style
op: 'new' | 'join' | 'cut' | 'intersect'
```

### 4.7 `field`
```js
j.field.sdf(shapeOrPart)                          // the exact signed distance to a B-rep or mesh
j.field.sphere(r) .box(w, d, h, { r }) .cyl(r, h) .torus(R, r) .capsule(a, b, r) .plane(p)
j.field.gyroid(cell, { thickness }) .schwarzP(cell, opts) .diamond(cell, opts)     // TPMS lattices
j.field.lattice(cellKind, cell, { strut: mm(0.8) })                                 // 'cubic' | 'octet' | 'kelvin' | 'bcc'
j.field.noise(scale, { seed }) .fn((p, ctx) => distance)
f.union(g) .intersect(g) .subtract(g) .smoothUnion(g, k) .smoothSubtract(g, k) .shell(t) .offset(d)
f.blend(g, w | (p, ctx) => w) .map(tx) .twist(axis, perLength) .repeat(spacing) .clip(shape)
f.grade(param, (p, ctx) => value)                 // spatially varying thickness or cell size
f.at(p)                                           // → Quantity: the (bound on the) distance at a point
f.mesh({ voxel: mm(0.2), method: 'dual-contouring' | 'marching-cubes' })   // lowering, with a report (warns field.notDistance
                                                  // when the field's slope exceeds 1, since meshing steps assume a distance bound)
part.infill(bodySel, field) · part.thicken(field, t)
```

### 4.8 `mesh`
```js
j.mesh(src)                                    // src: a loaded STL/OBJ/3MF value | a Shape | a Field | j.points(…)
  .repair({ holes, normals, selfIntersections, degenerate, shells: 'keep-largest' | 'keep-all' })
  .remesh({ edge: mm(0.5), mode: 'isotropic' }) .decimate({ ratio | faces, keep: 'features' }) .smooth({ iterations, method: 'taubin' })
  .cut(plane, { keep: 'both' | 'above' | 'below', cap: true }) .split({ by: 'shells' | plane })
  .boolean(op, other) .hollow(t, { drain: { at, d } }) .offset(d) .scale(k | [kx, ky, kz])
  .segment({ method: 'region-growing' }) .fit(['plane', 'cylinder', 'sphere']) .align(target, { method: 'icp' })
  .toBrep({ mode: 'prismatic' | 'faceted' | 'fit', tol })
j.points(src).normals({ k: 16 }).reconstruct({ method: 'poisson', depth: 8 })
j.tessellate(shape, { chord: mm(0.01), angle: deg(10) })
prog.mesh() // → { faces, vertices, manifold, watertight, eulerChar, genus, shells, boundaryLoops, selfIntersections }
j.inspect.hausdorff(a, b)
```

### 4.9 `lib`
```js
j.lib.screw('ISO 7380', 'M3x8') .nut('ISO 4032', 'M3') .washer('ISO 7089', 'M3') .insert('M3x5.7') .magnet({ d: mm(6), h: mm(3) })
j.lib.pin({ d: mm(3), l: mm(10) }) .dowel({ d, l, fit: 'press' })
j.lib.snap.cantilever({ length, thickness, deflection, material, angle: deg(30), retention: deg(90) })
                                                   // checks strain ε = 1.5·t·y/L² against the material's allowable strain
j.lib.snap.annular({ d, undercut }) .snap.torsion({…})
j.lib.hinge.living({ length, thickness: layer(2), material: 'PP' }) .hinge.pin({ knuckles: 5, clearance: 'printInPlace' | Q })
j.lib.dovetail({ width, depth, angle: deg(15), fit: 'slide' }) .joint.puzzle(…) .joint.pinned(…)
j.lib.thread('M8x1.25', { length, internal, profile: 'iso' | 'trapezoid' | 'buttress', fit: 'slide' })
j.lib.gear.spur({ module: mm(1.5), teeth: 20, pressure: deg(20), width, backlash: 'fit' }) .herringbone({ …, helix: deg(30), hand })
          .internal({ …, herringbone, rim }) .rack({…}) .bevel({…})       // gears expose ports 'axis' and 'pitch'
j.lib.bearing('608') .catalog(rows, { key }) .nearest(std, { d: mm(3), l: x => x.gte(mm(8)) })
// Library items are part builders or features with ports: screw.port('head') .port('tip'); gear.port('axis')
// and bosses they need: j.lib.insert('M3x5.7').boss({ wall: lw(3), height }) is a feature you .add() to a part
```

### 4.10 `assembly`
```js
j.assembly(name?)
  .add(id, partOrAssembly, { at: tx | frame, ground, config, params, qty, color })
                                                    // params binds child params to parent expressions: { params: { w: 'w', length: 'w - 4 mm' } }
  .ground(id) .joint(id, kind, a, b, opts) .rigidGroup(ids)
  .pattern(compId, pattern) .mirror(compId, plane) .replace(id, part | (current) => part)
  .printInPlace(ids, { clearance: 'printInPlace', pose: { [jointId]: value } })   // one print, fit-class gaps, printed in a chosen pose
  .sweep(jointId, { steps: 36 })                    // move a joint through its range and check swept interference
  .couple(j.couple.gear(portA, portB, { ratio? }) | j.couple.rack(portR, portS) | j.couple.belt(portA, portB, { ratio? }))
                                                    // motion-lite; ratio is derived from the gears' teeth when omitted
// joint values are parameters named by joint id: asm.override({ hinge: deg(90) })
  .explode(steps) .solver(slot)                     // default: Newton on SE(3) with Lie-algebra updates
  .interference({ clearance: mm(0) })
// a, b: 'lid:hinge' (component:port) | j.on('lid', sel) | j.frame.on(j.on('lid', sel))
j.joint.rigid() .revolute({ axis?, limits?: [a, b] }) .slider({ dir?, limits? }) .cylindrical() .planar() .ball() .snap()
       // each is a subgroup of SE(3) with DOF 0, 1, 1, 2, 3, 3, 0 (snap is rigid once engaged)
prog.occurrence('lid') prog.dof() prog.joint(id) prog.bom({ group: 'part' | 'flat' }) prog.sweep(jointId)
```

### 4.11 `fit`
```js
j.fit.classes({ press: mm(0.05), snug: mm(0.1), slide: mm(0.2), free: mm(0.3), printInPlace: mm(0.4) })   // radial, per side
j.fit.profile(name, { printer, material, classes, holeComp: mm(0.1), xyComp: mm(0), elephantFoot: mm(0.2) })
j.fit.coupon({ kind: 'pin-hole' | 'slot' | 'thread' | 'print-in-place', range: [mm(0.05), mm(0.5)], steps: 10 })   // a printable test part
j.fit.classes()                                  // with no argument: the defaults in §7
j.fit.calibrate(rows, { model?, target?, by?, at? })   // regression from measured coupons (actual = a·nominal + b)
                                                 // → { hole: { a, b, r2 }, pinOversize, classes } — feed classes to j.fit.profile
j.fit.gap('slide') j.fit.hole(d, 'snug') j.fit.pin(d, 'press')   // nominal → modelled size, resolved in context
mm(10).pm(0.1) · j.stack(name).add(ref, { dir: +1 | -1 }).worstCase() .rss() .monteCarlo({ n, dist, truncate, seed })   // → .p(pred)
model.fit(profile | profileName)                 // sets the fit context for every fit-aware slot below it
prog.param('gap.printInPlace')                   // resolved fit values are parameters named gap.<class>, with provenance
```

### 4.12 `inspect`
```js
j.material('PLA' | 'PETG' | 'ABS' | 'ASA' | 'PP' | 'TPU-95A' | 'PA-CF' | 'resin-standard') m.with({ density, cost: j.q('22 usd/kg') })
// properties: density, cost, allowableStrain, modulus, strength: { inPlane, acrossLayers }, glassTransition, shrink, color
j.inspect.mass(target, { material?, infill?, walls? })   // solid or as-printed (walls + infill model): { volume, mass, filamentLength, cost }
j.inspect.distance(a, b) .angle(a, b) .bbox(target)
j.inspect.section(target, plane)                 // → { area, centroid, I, Z: { top, bottom } }: section modulus for σ = M / Z
j.inspect.wall(target, { min: lw(2) }) .thin(target, { min: nozzle(1) })
j.inspect.overhang(target, { dir: '+Z', max: deg(45) })   // faces whose downward normal exceeds the angle from vertical
j.inspect.bridges(target, { dir }) .bedContact(target, { dir }) .islands(target, { dir })   // per-layer islands needing support
j.inspect.clearance(a, b) .interference(asm)
j.inspect.mobility(asm)        // → { grubler: { n, joints, sumF, M }, solverDOF, redundant, note }: an analysis, not a law (§8)
j.inspect.snap(hook)           // → { strain, allowable, permissibleDeflection, ratio }  (beam theory)
j.inspect.gearMesh(a, b)       // → { ok, module, pressure, centreDistance }
```

### 4.13 `print`
```js
j.printer('generic-fdm' | 'mk4' | 'x1c' | 'generic-msla' | { bed: [mm(250), mm(210), mm(220)], nozzle: mm(0.4), kind: 'fdm' })
j.print(name, { printer, material, fit?, parts?: [part, …] })   // parts: shorthand for .add(part.name, part) each
  .add(id, partOrAssembly, { qty, orient?, color? })   // orient: the model direction that should point up (+Z on the bed)
  .fit(profile | profileName)
  .orient(slot)              // default 'auto': lexicographic (min support volume, max bed contact, min height); or a dir, or fn
                             // lambda: (part, ctx) => Dir | Orientation;  ctx.default(part) → Orientation, ctx.candidates(part) → ranked,
                             //         ctx.previous → last fixpoint iteration's choice
                             // Orientation: { dir, tx, supportVolume, bedContact, height, overhangArea, faceDown(sel), faceUp(sel) }
  .supports({ angle: deg(45), kind: 'tree' | 'grid', interface: layer(2), only: 'buildplate' | 'everywhere' } | false)
  .split(id, { fit: 'bed', by: planes | 'auto' | (part, ctx) => planes, joint: j.lib.dowel({ d: mm(4) }) | j.lib.dovetail({…}) })
  .plates({ pack: 'bottom-left' | 'skyline' | fn, spacing: mm(5) })
  .slice({ layer: mm(0.2), adaptive: { maxCusp: mm(0.05), min, max }, walls: 3, top: 5, bottom: 4,
           infill: { density: 0.15, pattern: 'gyroid' }, mode: 'normal' | 'vase' })
  .material(sel, m) .color(sel, c)                 // multi-material and colour by selector or field
  .modifier(selOrRegion, { infill, walls, grow, lineAngle, pause, message })   // per-region settings; pause = pause at that layer
  .seam('aligned' | 'rear' | fn) .brim(w | false) .ironing(sel)
prog.plates (.lowerBound) prog.supports prog.printTime prog.filament prog.bom()
prog.layers                                        // [k] → { k, z, area, regions, holes, snapped }; .pauses
prog.gcode({ flavor: 'marlin' | 'klipper' | 'bambu' | (layer, ctx) => lines })
```

### 4.14 `io`
```js
await j.load.stl(src) .tmf(src) .obj(src) .step(src) .svg(src) .dxf(src) .image(src) .csv(src) .json(src) .font(src)   // effects
j.export.tmf(prog, { plates: true, settings: true, colors: true }) .stl(prog, { chord, angle, binary, perPart })
        .step(prog, { schema: 'AP242' }) .obj .gcode(prog, opts) .png(prog, { view: 'iso', size: 512 })   // png = preview thumbnail
j.export.to(format, prog, opts)   // generic form
// every export returns { data, report }, where report = { kept, approximated, dropped, maxDeviation }
j.export.ir(prog)                 // the IR bundle: manifest, trace, diagnostics, L0–L6 as text and JSON
```

### 4.15 `rules`
```js
j.rules(name, [ j.rule.minWall({ min: lw(2) }), j.rule.overhang({ max: deg(45) }), j.rule.bridge({ max: mm(10) }),
                j.rule.minFeature({ min: nozzle(1) }), j.rule.holeOrientation({ horizontal: 'teardrop' }),
                j.rule.text({ minStroke: lw(1), minDepth: layer(3) }), j.rule.bedFit(), j.rule.firstLayer({ minArea: j.q('100 mm^2') }),
                j.rule.custom(name, (prog, ctx) => diagnostics) ])
j.rules.fdm j.rules.msla j.rules.printInPlace         // presets
j.rules(name, [j.rules.fdm, j.rule.bridge({ max: mm(6) })])   // rule sets nest; later rules win by name (right-biased merge)
model.use(j.rules.fdm)  ·  j.check(prog, rules) → diagnostics  ·  j.objective.require(rules)
// under preset.production an export with errors is refused: { data: null, report: { refused: true, reason } }
```

### 4.16 `explore`
```js
j.param.range(lo, hi, { step, default }) .choice([...], { default }) .int(lo, hi, { default }) .dir({ samples })   // dir: orientations on S²
j.design(params, p => model, { objective })   d.at(point) d.defaults() d.sample(n, { seed }) d.fix({…}) d.where(pred) d.size
j.objective.minimize(metric) .maximize(metric) .weighted({ name: [metric, w] }) .lexicographic([...]) .pareto([...]) .require(predOrRules)
j.metric(name, (prog) => value, { dir: 'min' | 'max', unit, about })
await j.search.grid(d, opts) .random(d, { budget, seed }) .lhs(d, { budget, seed }) .descent(d, { from, steps }) .nsga2(d, { pop, gens, seed })
r.best (.point .metrics) r.ranked r.front r.table() r.stats (compiles, cached features, cacheHitRate, ms)    j.evaluate(objective, prog)
j.stage(designOrModelOrJob)   // → Residual: .tabulated (finite unknowns, compiled now), .residual (closed forms where linear,
                              //   e.g. .residual.mass(h)), .at(point) solves the rest at run time, .summary(), .note
j.hash(anyValue) j.diff(a, b) j.version
j.merge(base, ours, theirs, { resolve?: (conflict, ctx) => choice })   // → { model, conflicts, decisions }; ctx.default keeps base
j.remix(model, { from: author/url, license })            // a fork that keeps attribution in L0
```

### 4.17 `ingest`
```js
j.ingest.auto(src)       // → { kind, confidence, ranked, features }
// kinds: 'image-photo' | 'image-silhouette' | 'svg-outline' | 'dxf-outline' | 'points-csv' | 'table-csv' | 'json-data'
//        | 'stl-mesh' | 'step-part' | 'font' | 'spec-text'
j.ingest.route(src, { [kind]: preset })   // presets are (data, ctx) => model
j.ingest.heightmap(image, { size, minT, maxT, invert })   // lithophanes and reliefs
j.ingest.trace(image, { threshold, smooth })              // → Region
```

### 4.18 `process`
```js
j.process.step(name, fn) .diverge(n, fn) .converge(objective) .critique(rules | fn) .print(fn) .measure(spec) .loop(body, { until, max })
proc.then(other) proc.replace(stepName, step) proc.steps   // then composes processes; a run reuses the cached result of a shared prefix
j.process.run(proc, { input, effects, seed })   // → run { value, trace, metrics, replay(), elapsedUntil(pred) }
                                                // effect handlers get (input, ctx) with ctx.random, ctx.lastPrint, and may add helpers to ctx (e.g. ctx.adjustFor)
j.metric(name, run => value, opts)              // metrics may be defined over process runs as well as Programs
j.experiment({ hypothesis, factors, responses, design: 'full-factorial' | 'lhs' | 'latin' | 'graeco-latin', replicates, randomize, wholePlots, protocol, seed })
exp.runs exp.sequences exp.wholePlots (rows offer .shuffle(parts))  exp.record(rows) → recorded: .analyze(opts) (.coefficients .hypotheses .summary .table(by)) .means(by) .rank(objective, opts)
```

### Presets
```js
j.preset.iterate      // coarse meshing of fields, warnings stay warnings, no interference sweep
j.preset.production   // strict sketches, interference on, rules enforced as errors, export check
j.preset.fdm j.preset.msla j.preset.printInPlace
j.preset.functional | j.preset.functional({ load: { at, dir, force }, fixed })   // walls 4; orient so the load path stays within layers
j.preset(name, b => b…)   // define your own: a function from builder to builder
```

---

## 5. IR levels and the Program

| Level | Name | Question it answers | Text dump shows |
|---|---|---|---|
| **L0** | source | What was asked, and by whom? | builder values with hashes; loaded files with content hashes; remix attribution |
| **L1** | feature graph | What operations, on what references, in what order, with what stable ids? | the DAG of sketches, features, fields, components, print jobs; references still symbolic |
| **L2** | resolved | What is every parameter and fit value, and why? | values in canonical units, each with provenance (`params` / config / override / fit profile / design point) |
| **L3** | solved sketches | Is each sketch fully constrained? Which constraints conflict? | per sketch: entities, equations, DOF, status, minimal conflicting set |
| **L4** | topology | What solid did each feature produce, and where did each face come from? | bodies → faces/edges with persistent names; selector resolutions; feature decisions; fields still implicit |
| **L5** | world | Where is every part, which joints hold, how is each part oriented on which plate? | occurrence tree with transforms; joint states; orientations; splits; plate layout |
| **L6** | products | What goes to the printer? | meshes (with deviation), supports, layers, toolpaths, G-code/3MF, each with a lowering report |

**The Program** (`j.compile(model, { config?, override?, fit?, tol?, seed? })`):

```
summary()  metrics()  metric(name)  diagnostics  trace  decisions  why(target)
node(id)  find(kind | pred)  feature(id)  sketch(id)  body(id?)  faces(sel)  genealogy(faceName)
param(name)  params()  mass()  hit(ray)  ir.text(level, { node? })  ir.json(level)
// assemblies: occurrence(id) dof() joint(id) bom() sweep(jointId)
// print jobs:  plates layers supports printTime filament gcode(opts)
```

`why(target)` accepts a selector, a quantity, `'param:name'` or `'feature:id'`. `body(id).topology` gives `{ V, E, F, L, S, G, residual }` (the Euler–Poincaré check). `feature(id).cache` shows the cache key with what it includes and excludes. `summary()` also reports `configs` and the exposed `customizer`.

`trace` holds `[{ pass, level, ms, cached, note }]`. `decisions` holds `[{ at, kind, chose, alternatives, reason }]`, for example "extrude3 op → join (touches body1)", "hole h2 → teardrop (axis ⟂ build direction)" or "orient → +Y up (support 0 mm³ vs 1.8 cm³)".

---

## 6. Staging, caching, fixpoints

**Staging rule.**

| Input | Decision |
|---|---|
| Known, and the work is pure | Compile time, cached per feature by hash. |
| Unknown but finite (configurations S/M/L, standard sizes M2–M8, fit classes, printer profiles) | Tabulate at compile time. |
| Unknown and continuous (a hinge angle in a clearance sweep, a sketch drag, a customizer slider, an extrude height for mass) | Emit a residual program: `j.stage(…)`. Linear dependence gives closed forms: m(h) = ρ·A·h for a prism, and print time is close to linear in layers. |
| Effects (file loads, printer connections, remote compute, clocks, user input) | Always run time. |

**Cache key per feature.** A hash of:

- the feature type;
- resolved parameters in canonical units;
- content hashes of the input bodies the feature touches;
- persistent names of the resolved references;
- the strategy identity (a lambda's source hash plus its declared closure values);
- the resolved fit values it uses;
- the kernel tolerance;
- the versions of the standards tables used.

The key **excludes** display names, colour and the material, because material changes mass but not geometry. Mass, slicing and print caches add material and printer back in. Changing `wall` recomputes only `wall`'s downstream cone, and the trace shows `cached: true` for everything else.

Meshing a **field** is cached per voxel brick, keyed by the field's hash and the brick's bounds. Editing one blend re-meshes only the bricks its support touches.

**Fixpoints.** Two print-specific cycles exist:

1. **Orientation ↔ geometry.** Horizontal holes become teardrops relative to the build direction, but the automatic orientation depends on the geometry, holes included.
2. **In-context fit.** A lid is sized from an assembled housing whose screw bosses reference the lid.

jig iterates until orientation, persistent names and parameter values stop changing, caps the loop at **4 iterations**, and records convergence in the trace (`fixpoint: converged in 2`).

**Lowering honestly.** STEP AP242 is lossless for B-rep. STL, OBJ and 3MF meshes record their measured maximum deviation. Field meshing reports the voxel size and the features lost below it. Slicing reports cusp height and features thinner than one line width. G-code depends on the flavour. Every export returns a report of what was kept, approximated and dropped.

---

## 7. Opinionated defaults

| Decision | Default | Why | Override |
|---|---|---|---|
| Document units | mm, deg, gram, minute | slicer conventions | `.units({ length: 'in' })` |
| Kernel tolerance | 1e-7 mm linear, 1e-12 rad angular | the values of OpenCascade's `Precision::Confusion` / `Angular` | `j.compile(m, { tol: { linear: um(0.1) } })` |
| Process context | FDM, 0.4 mm nozzle, `lw` = 0.45 mm, `layer` = 0.2 mm, PLA | the most common desktop setup | `j.printer(…)`, `j.preset.msla` |
| Sketch solver | graph decomposition, then DogLeg per cluster with LM fallback | DogLeg is FreeCAD Sketcher's default; decomposition keeps drags local | `.solver('lm')`, `.solver((sys, ctx) => …)` |
| Under-constrained sketch | warning; error under `preset.production` | iterate freely, release strictly | `.strict()` |
| Conflicting / redundant constraints | error with the minimal conflicting set / warning, then dropped | explain the problem instead of failing silently | — |
| Profiles | all closed regions, even–odd nesting; construction geometry excluded | almost always what is meant | `s.profile(pick)` |
| Feature op | first is `new`; later ones `join` if touching a body, else `new` (recorded as a decision) | matches how users expect solids to accumulate | `{ op }` |
| Fillet | rolling ball, G1, constant radius; concave edges before convex | robust and conventional | `{ shape: 'g2' }`, a per-edge lambda |
| Bed edges | 0.4 mm × 45° chamfer on edges touching the bed (`preset.fdm`) | counters elephant's foot without a separate compensation | `.use(j.preset.fdm({ bedChamfer: false }))` |
| Sweep frame | rotation-minimising frame (double reflection, Wang et al. 2008) | the Frenet frame flips at inflections and is undefined on straight segments | `{ frame: 'frenet' \| 'fixed' \| fn }` |
| Holes | horizontal holes (axis ⟂ build direction) become 45° teardrops; vertical holes get fit compensation; screws self-tap into `d − 0.1 mm` | prints without support, and holes print undersized | `j.hole.*` options, `j.rules.fdm` |
| Fit classes (per side) | press 0.05, snug 0.10, slide 0.20, free 0.30, print-in-place 0.40 mm, until calibrated | common starting points for a 0.4 mm FDM nozzle; replace them with `j.fit.calibrate` | `j.fit.profile(…)` |
| Pattern failures | skip the instance and warn `pattern.instanceSkipped` | a partial result beats a total failure while iterating | `{ onFail: 'error' }` |
| Selector resolution | genealogy first; `nth()` flagged fragile; a failed `expect()` is an error | defends against topological naming breaks | — |
| Field meshing | dual contouring, voxel = `lw(0.5)`; `preset.iterate` uses `lw(2)` | dual contouring keeps sharp features; finer than half a line width is wasted on FDM | `.mesh({ voxel })` |
| Smooth blends | `smoothUnion` with polynomial smooth-min, k = 2 mm | stays Lipschitz-bounded so meshing is robust | `k` argument |
| Assembly | first component grounded; Newton on SE(3) | users expect a fixed reference | `.ground(id)`, `.solver(…)` |
| Interference | off while iterating; swept-interference check on every revolute/slider joint under `preset.production` | print-in-place parts fail by fusing | `.interference({ clearance })`, `.sweep(…)` |
| Orientation | `auto`: lexicographic (min support volume, max bed contact, min height) over 26 axis-aligned and diagonal directions, refined on S² | support removal is the dominant cost; `preset.functional` adds "load not across layers" first | `.orient('+Z' \| fn)` |
| Supports | tree supports, only from the build plate, for overhangs beyond 45° from vertical | the 45° rule; buildplate-only keeps surfaces clean | `.supports({…})` |
| Bridges | spans up to 10 mm allowed without support | typical PLA bridging | `j.rule.bridge({ max })` |
| Slicing | 0.2 mm layers, 3 walls, 5 top / 4 bottom layers, 15 % gyroid infill; adaptive layers off | balanced strength and time | `.slice({…})` |
| Splitting | split only when a part exceeds the bed; 4 mm dowels with `press` fit, cut planes chosen to minimise visible seam area | — | `.split(id, { by, joint })` |
| Plates | skyline packing with 5 mm spacing; heavy and tall parts centred | stable first layers | `.plates({ pack })` |
| Export | 3MF with plates, settings and colours; STL binary at 0.01 mm chord, 10° angle per part | 3MF keeps units and intent; STL for compatibility | `j.export.*` options |
| Determinism | compile is deterministic; every random process takes `seed` | reproducible search and science | `{ seed }` |

---

## 8. Laws: one suite

Laws are tests that pay for something. There is one way to state a law and one runner, and the examples don't call laws inline: only example 43 shows the suite.

```js
j.structure(Sort, kind, ops)   // Sort: j.Quantity j.Point j.Transform j.Region j.Shape j.Field j.Pattern … ; kind: 'vectorSpace' | 'affine' | 'group' | 'monoid' | 'booleanAlgebra' | 'lattice' | 'action'
                               // → the structural laws for that kind, derived (nobody writes associativity by hand)
j.law(name, gen, prop, { tier: 'invariant' | 'oracle', justifies, source, tolerance })
j.gen.quantity .transform .region .polygon .shape .csg .field .sketch .params(model)   // generators, each with a shrinker
j.laws.suite                   // the built-in suite below
j.laws.for(model)              // the suite instantiated on a model's own fixtures (e.g. refs.robust over its parameters)
j.laws.check(laws, { n: 200, seed: 1, only? })   // → [{ law, tier, ok, n, counterexample?, shrunk?, justifies, source? }]
```

A law without `justifies` is rejected; it belongs in an example as a plain assertion. Heuristics (the 45° overhang rule, layer-strength risk, fit classes) never become laws. They are calibrated metrics (§9).

| Law | Tier | Statement | Justifies | Source |
|---|---|---|---|---|
| `quantity.*` | structural | a vector space per dimension; multiplying adds dimension exponents | `DimensionError` at the call site; `resolve` is linear, so symbolic values cache before a printer is known | dimensional analysis (SI) |
| `point.affine` | structural | (p − q) + q = p; p + p is an error | `AffineError` catches position/offset mix-ups | affine geometry |
| `transform.group` | structural | associativity, identity, inverses; mirror² = id | rewrite: consecutive moves and coaxial rotations fuse; ports align through inverses | rigid motions, SE(3) |
| `shape.boolean`, `region.boolean` | structural | regularised union/intersection laws, inclusion–exclusion on volume and area | rewrite: chains of unions become one n-ary boolean (faster, fewer slivers) | Requicha (1980), regularised sets |
| `field.lattice` | structural | min/max form a lattice; exact SDFs are 1-Lipschitz | booleans on fields never fail; meshing and ray steps are safe | Hart (1996), sphere tracing |
| `selector.boolean` | structural | set algebra on resolved sets | selector simplification; `expect` counts | — |
| `timeline.monoid` | structural | sequencing is associative; a suppressed feature is the identity | prefix caching: an edit recomputes only the features after it | — |
| `pattern.action` | structural | patterns act as groups; `times` multiplies orbit sizes | instance counts without building; coincident instances merge | group actions |
| `params.merge` | structural | right-biased merge is associative | layered precedence with provenance | — |
| `brep.eulerPoincare` | invariant | V − E + F − (L − F) − 2(S − G) = 0 | catches an invalid solid after every boolean | Mäntylä, *An Introduction to Solid Modeling* (1988) |
| `mesh.euler` | invariant | closed orientable mesh: V − E + F = 2 − 2g | watertightness check before slicing | Euler characteristic |
| `sketch.dof` | invariant | DOF = Σ entity DOF − rank J | the constraint status shown to users is right | geometric constraint solving |
| `refs.robust` | invariant | selectors resolve to the same genealogy under parameter perturbation | catches topological naming breaks before users do | — |
| `split.partition` | invariant | split pieces union to the original, with disjoint interiors | split-to-fit loses no material | — |
| `compile.deterministic` | invariant | hash(compile(m)) is stable across runs | caching; reproducible search and science | — |
| `extrude.volume` | oracle | vol = area(R) · h | kernel test; closed-form mass(h) for staging | Cavalieri |
| `revolve.volume` | oracle | vol = θ · r̄ · area(R) | kernel test | Pappus–Guldinus |
| `slice.volume` | oracle | Σ layer area · t → volume, error O(t²) | slicer test; cheap as-printed volume | Cavalieri |
| `slice.cusp` | oracle | cusp height = t · \|cos θ\| for a face at angle θ to the build direction | adaptive layers choose t from it | Dolenc & Mäkelä (1994) |
| `snap.deflection` | oracle | y = 0.67 · ε · L² / t for a rectangular cantilever | the snap-fit check in `lib` and `j.inspect.snap` | beam theory, as used in snap-fit design guides |
| `gear.centreDistance` | oracle | a = m(z₁ + z₂)/2 (internal: m(z₂ − z₁)/2) | placing meshing gears in assemblies | involute gearing |
| `stack.soundness` | oracle | every Monte Carlo sample lies inside the worst-case interval | the tolerance engine's sampling is consistent | interval arithmetic |
| `plates.bound` | oracle | plates ≥ ⌈Σ footprint / bed area⌉ | the packing report (`prog.plates.lowerBound`) | bin-packing lower bound |

**Analyses, not laws.** Some domain formulas can legitimately disagree with the solver, so they are reported rather than asserted:

- `j.inspect.mobility(asm)`: Grübler–Kutzbach against the solver's DOF. Special geometry, such as two coaxial hinges, makes the formula wrong.
- `j.inspect.snap(hook)`: strain and permissible deflection from beam theory, against the material's allowable strain.
- `j.inspect.gearMesh(a, b)`: module, pressure angle and centre distance agreement.

---

## 9. Metrics and diagnostics

**Metrics registry** (`j.metric(name, fn, { dir, unit, fidelity, source, about })` adds more). Fidelity is **exact**, **approx** (a model with a known error source) or **heuristic** (a proxy that must be calibrated before you trust it).

| Metric | Level | dir | Unit | Fidelity | About |
|---|---|---|---|---|---|
| `volume` `mass` `filament` `cost` | L4/L6 | min | mm³, g, m, usd | exact when solid; approx as printed (wall + infill model; calibrate by weighing prints) | material use |
| `bbox` `height` | L5 | min | mm | exact | size in print orientation |
| `faces` `features` | L4/L1 | min | count | exact | complexity |
| `sketchDOF` | L3 | min | count | exact | remaining DOF summed over sketches |
| `fragileRefs` | L4 | min | count | exact | index-based or lost references |
| `rebuildMs` `cacheHitRate` | trace | min / max | ms, ratio | measured | compile cost |
| `minWall` `thinFeatures` | L4 | max / min | mm, count | approx (sampled) | printability |
| `overhangArea` `bedContact` `islands` | L5 | min / max / min | mm², mm², count | exact for a given threshold; the 45° threshold is heuristic and printer-calibrated | orientation quality |
| `supportVolume` | L6 | min | mm³ | approx (the support generator's model) | support cost |
| `printTime` | L6 | min | min | approx (motion model; calibrate against the printer's own estimate) | throughput |
| `layers` `plates` | L6 | min | count | exact | throughput |
| `cuspMax` `cuspMean` | L6 | min | mm | approx (closed form, Dolenc & Mäkelä) | stair-step surface error |
| `seamArea` | L5 | min | mm² | exact | visible split seams |
| `layerStrengthRisk` | L5 | min | ratio | heuristic (calibrate with tensile coupons, see 50) | share of the load path running across layers |
| `snapStrain` | L4 | min | ratio | approx (beam theory; allowable strain from material data) | peak / allowable strain in snap-fits |
| `assemblyDOF` `interferenceVolume` | L5 | – / min | –, mm³ | exact | assembly |
| `sweptInterference` `minGap` | L5 | min / max | mm³, mm | approx (sampled at the sweep's steps) | print-in-place |
| `fitWorstCase` | L5 | min | mm | exact given the fit classes; the classes themselves are calibrated | stack result |
| `meshDeviation` | L6 | min | mm | measured | lowering error |

**Diagnostics** are data: `{ level: 'error' | 'warning' | 'info', kind, at, message, fix? }`. Kinds include:

- `units.dimension` `units.mixed` `param.cycle`
- `sketch.underConstrained` `sketch.overConstrained` `sketch.redundant`
- `ref.fragile` `ref.lost` `ref.autoId` `ref.expect`
- `feature.failed` `fillet.tooLarge` `boolean.nonManifold` `brep.invalid` `pattern.instanceSkipped`
- `mesh.nonManifold` `mesh.open` `mesh.selfIntersecting` `field.featureBelowVoxel` `field.notDistance`
- `joint.unsolved` `asm.interference` `asm.sweptInterference` `fit.uncalibrated`
- `print.overhang` `print.bridge` `print.thinWall` `print.thinFeature` `print.island` `print.bedFit` `print.firstLayer` `print.textIllegible` `print.snapStrain` `print.layerStrength`
- `export.lossy` `fixpoint.notConverged`

---

## 10. Bare names

Scripts import these names, so they are taken. Don't redeclare them.

```
j  mm cm m um inch ft  deg rad turn  kg gram  N kN  MPa GPa  s minute hour  degC  usd eur  lw layer nozzle bbox
```

`in` is a JavaScript keyword, hence `inch`. Avoid `m`, `s` and `N` as local variable names, and avoid `layer`, which is a unit. Some early examples write forces as `j.q('100 N')`, which is equivalent to `N(100)`.

Error names: `DimensionError` (unlike dimensions), `AffineError` (adding two points), `ParamCycleError`, `RefError` (a failed `expect`). Each one is also reported as a diagnostic when it happens inside `compile`.

---

## 11. Example map

| Section | Files | Content |
|---|---|---|
| **A. Foundations and the maths of shape** | 01–13 | units · params and configurations · transforms and datums · sketch constraints and DOF · regions, profiles, text · Cavalieri and Pappus · CSG, booleans, B-rep · selectors and persistent naming · fillets, chamfers, shells · patterns as group actions · sweeps, lofts, printed threads · fields, SDFs, lattices · mesh remixing |
| **B. Joining, products, fit** | 14–17 | printable joints and hardware · assemblies and print-in-place · fit calibration and stacks · materials, mass, cost, analysis |
| **C. Print output and the compiler** | 18–21 | orientation, overhangs, supports · split-to-fit and plates · slicing, cusp height, 3MF · compiler IR, cache, fixpoint, io |
| **D. Real-world scenarios** | 30–36 | quick start · random-input router · PCB enclosure · grid storage bins · print-in-place mechanism · functional bracket · organic lattice |
| **E. Design process** | 40–45 | design spaces and configurations · objectives and metrics · search · laws, property tests, fuzzing · variants, remixes, merges · print rules |
| **F. Scientific study** | 50–52 | factorial calibration experiment · human-study protocol · corpus measurement |
| **G. Meta-design and capstone** | 60–61, 70 | process as a value · designing the design process · capstone: print-in-place planetary gearbox |

Shared fixtures used across the examples: `box` (a 60 × 40 × 30 mm open box with 2 mm walls), `plate` (80 × 50 × 4 mm with four M3 holes), `hook` (a cantilever snap hook), the `M3` hardware set (screw, nut, heat-set insert), and the CSV `points.csv` (x, y columns).
