# jigcad kernel API (owner: kernel)

The kernel half of `j` (core's half is in CORE-API.md), the worker protocol and ProgramData notes.
Status: ✓ works end to end and is tested in `test/engine/run.mjs` · ◐ partial (the limits are listed) · ✗ throws or gives a `feature.unsupported` warning.
Units: mm and rad inside. In slots, bare numbers are mm or degrees. Strings are expressions over params.

## Parts: `j.part(name)` (README §4.6)

| Call | Status |
|---|---|
| `.params({…}) .configs({…}) .config(n) .override({…}) .expose(names, { labels, ranges, steps })` | ✓ |
| `.material(m) .color(c) .color(sel, c) .port(name, frame) .fit(profile) .set(k, v) .use(...fns or rules) .with(fn)` | ✓ (`color(sel, c)` is only recorded) |
| `.extrude(profile, extent, { op, taper, twist, herringbone, id })`. Extent: `Q` · `{ symmetric }` · `{ two: [a, b] }` · `{ through: 'all' }` · `{ to: faceSel }` | ✓ (`to` uses the face centre) |
| `extrude(…, { twist: deg(a) })`: the end section is turned by a about the sketch normal; `{ twist, herringbone: true }` turns the middle section by a and brings the end back. Holes twist too; circles on the axis stay exact | ✓ (not with `taper`) |
| `.cut(profile, extent, opts)`: an explicit cut goes into the material when everything lies behind the plane | ✓ |
| `.revolve(profile, axis, angle = turn(1), opts)`: the axis must lie in the profile plane, and the profile must stay on one side of it | ✓ |
| `.loft([profiles], { ruled, id })` | ✓ |
| `.sweep(profile, path, { frame: 'rmf' \| 'frenet' \| 'fixed', id })`. Path: `j.sketch3d(…)` (helix, line, polyline, spline) or `sketch.wire([...])` | ✓ (frame lambdas use rmf) |
| `.hole(at, spec, opts)`. `at`: 2D points (drilled from the top surface), 3D points (along the face normal), a sketch with points, a face or circle-edge selector, `j.point.center(sel)` | ✓ |
| `.fillet(edges, r \| (edge, ctx) => r, { id })`: concave edges first (a decision); `fillet.tooLarge` reports the largest radius that works | ✓ |
| `.chamfer(edges, d, { d2, angle, id })`: with `d2`/`angle`, `d` is measured on the edge's first face in name order (caps last, then alphabetical), so a loop of edges is consistent | ✓ |
| `.shell(openFaces, t, { direction: 'in' \| 'out', id })`: `brep.invalid` when t is too thick | ✓ |
| `.draft(faces, angle, { pull = '+Z', neutral })`: neutral plane defaults to the lowest plane along `pull` | ✓ |
| `.rib(sketch.wire([...]), t, { direction })`: a wall of thickness t grown from lines until it leaves the bounding box | ✓ |
| `.thicken(faces, t, { op })` | ✓ |
| `.emboss(region, depth, { on: faceSel, op: 'join' \| 'cut', id })`: centred on the face unless the region has `at` | ✓ (planar faces only, no wrap) |
| `.pattern(j.feat(id) \| bodySel, j.pattern.*, { onFail })` · `.mirror(targets, plane)`: replays the feature's tool | ✓ |
| `.boolean(op, targetSel, shapeOrSel)` · `.split(bodySel, plane)` · `.move(sel, tx)` · `.copy(sel, tx)` · `.pushPull(planarFaces, d)` | ✓ |
| `.add(shape \| part \| libFeature, { at: tx \| frame \| point, op, leaf, fit, id })` | ✓ |
| `.feature(id, (bodies, ctx) => shapes)` · `.suppress(id) .unsuppress(id) .rollback(id) .insertAfter(id, fn) .features()` | ✓ |
| `.deleteFace` · `.import` | ✗ |

A cut or join that changes no volume raises `feature.noEffect` (warning). Explicit-mode sketches report implied helper constraints (fillets, chamfers) as one `sketch.implied` info, not `sketch.redundant` warnings.

Ops: `'new' | 'join' | 'cut' | 'intersect'`. The default is `new` for the first feature, then `join` if the feature touches a body, else `new`. The choice is recorded as an `op` decision.

## Shapes, regions, text

| Call | Status |
|---|---|
| `j.box(w, d, h, { center: true \| 'xy' })` `j.cyl(r, h, { center })` `j.sphere(r)` `j.cone(r1, r2, h)` `j.torus(R, r)` | ✓ |
| Shape methods: `.union .subtract .intersect .moved(tx) .volume() → Quantity .bbox()` | ✓ |
| `j.region.rect(w, h, { center = true, at, r })` `.circle(r, { at })` `.polygon(pts)` `.slot(a, b, width)` `.subtract .union .on(plane) .area()` | ✓ (`union` fuses overlapping regions into one; disjoint ones stay separate bodies. `subtract` keeps holes that lie strictly inside as exact loops, otherwise a 2D boolean; result segments keep their `src` names) |
| `j.region.text(str, { size, font: 'sans' \| 'mono', align: 'left' \| 'center' \| 'right', valign: 'baseline' \| 'middle' \| 'top' \| 'bottom', at, spacing })`: a plain string is the text; `j.ref('name')`, `j.expr('n * 2')` or `p => …` resolve over params (declare text params with `j.lit('ABC')`; overrides of a text param are text) | ✓ |
| `sketch.text(id, str, { size, font, at, align })`: core imports it as a fixed outline | ✓ |

Text `size` is the **cap height** in mm. Fonts are OFL: Atkinson Hyperlegible Bold (`sans`) and IBM Plex Mono Bold (`mono`). The sources are in `vendor/fonts/`, and the bytes ship in `fonts-data.js`. Glyph curves are exact Béziers.

## Holes: `j.hole.*`

| Spec | Modelled size | Status |
|---|---|---|
| `simple(d, depth \| 'through')` | d as given (pass `j.fit.hole(d, cls)` for a fit-aware size) | ✓ |
| `counterbore(d, cbD, cbDepth, depth)` · `countersink(d, csD, angle, depth)` | as given | ✓ |
| `countersink('M3', { fit, depth })` | ISO 10642 head: bore = d + 2·gap + holeComp; sink = head + 2·gap at 90° | ✓ |
| `clearance('M3', { fit: 'slide', depth })` | d + 2·gap + holeComp (no holeComp on teardrops) | ✓ |
| `tapped('M3', { depth, method: 'self-tap' })` | d − 0.1 mm | ✓ |
| `tapped('M3', { depth \| 'through', method: 'printed', fit })` | a modelled ISO internal thread: core Ø = D1 + 2·gap, 0.5 mm above the mouth; a through thread stops at the far side of the material | ✓ |
| `insert('M3x5.7')` | hole Ø4.0 × (length + 1) mm | ✓ |
| `nutTrap('M3', { kind: 'hex', from: 'top' \| 'side' })` | AF + 2·slide, nut height + 0.4 mm, plus a bolt hole | ✓ |

Hole points may be expressions (`[['x', 0]]`, `['x', 'y']`). Where a size is expected, a thread name is `'M3'`-like; any other string is an expression (`countersink('screw_d', csD, angle)`, `clearance('screw_d')`). A hole whose axis is perpendicular to the build direction becomes a 45° teardrop; a counterbore or countersink keeps its round head (only the bore is a teardrop, noted in the decision). The tip points up, and a `teardrop` decision is recorded. Face names are `<id>/bore[<label>]`, plus `floor`, `cbore`, `cbFloor`, `csink`, `tear.l`, `tear.r` and `nut.*`.

## Library: `j.lib.*`

| Call | Status |
|---|---|
| `thread('M8x1.25' \| 'M8' \| 'Tr40x3' \| { d, pitch }, { length, internal, profile: 'iso' \| 'trapezoid' \| 'buttress', fit = 'slide' \| Q, starts = 1, hand, through = true, core = true, bore })`: runs along the frame's z from 0 to length. External adds material; `core: false` adds only the ridge (join it to a neck of radius = modelled minor/2, e.g. a jar); `bore: Q` makes a threaded tube. `internal: true` (or `op: 'cut'`) cuts, 0.5 mm past both ends (`through: false`: past z = 0 only) | ✓ |
| `gear.spur({ module, teeth, pressure = 20°, shift = 0, backlash = 'fit', width, bore })` | ✓ |
| `gear.helical({ …, helix = 30°, hand = 'right' })` · `gear.herringbone({ …, helix, hand })` | ✓ (module is the transverse module) |
| `gear.internal({ …, rim = 3, herringbone, helix, hand })` · `gear.rack({ module, teeth, width, base = 2m, backlash })` | ✓ |
| `gear.bevel` | ✗ |
| `hinge.pin({ knuckles = 5, length = 30, d = 3, clearance = 'printInPlace' \| Q, wall = 1.6, plates: { width, thickness } })` with `add(…, { at, leaf: 'a' \| 'b' \| 'both' })` | ✓ |
| `hinge.living({ length, thickness = 0.4, gap = 1, overlap = 2, material = 'PP' })` | ✓ (warns `print.layerStrength` below 5 % allowable strain) |
| `dovetail({ width, depth, angle = 15°, fit = 'slide', length })`: `op: 'join'` makes the tail, `op: 'cut'` the socket | ✓ |
| `insert('M3x5.7').boss({ wall, height })` | ✓ |
| `magnet({ d, h })` · `dowel({ d, l, fit })` | ✓ |
| `snap.cantilever({ length = 12, thickness = 1.6, deflection = 1, width = 6, material = 'PETG', angle = 30°, retention = 90° })`: beam along the frame's z, hook proud by `deflection` along +x with an insertion ramp at `angle` and a retention face at `retention` | ✓ (raises `print.snapStrain`; info has `strain`, `deflectionForce`, `insertionForce` in N) |
| `screw(std, 'M3x8')` · `nut(std, 'M3')` · `washer` · `pin({ d, l })` | ✓ (simple parts) |
| `snap.annular` · `snap.torsion` · `bearing` | ✗ |

Notes on the library:
- **Threads (build):** threads of 3.5 leads or more build one lead with the booleans and stack copies (sewn), about 1 s for M10 × 25.
- **Threads:** the tooth (ISO 68 60°: crest P/8, root P/4, depth 0.5413 P; Tr 30°; buttress 3°/30°) is swept along a helix with the axis as binormal, sunk into a core cylinder, fused and clipped by two planes. The solid is screw-invariant, so V = π·r_min²·L + A·2π·r̄·L/P exactly (A, r̄: tooth area and centroid radius); `call('feature', id)` reports `modelled { major, minor, depth }` and `volumePerMm`. Fit: radii move by the class gap (external −, internal +), so each flank gets c·sin 30° = c/2 normal clearance. Faces: `<id>/core`, `<id>/flank.lo`, `<id>/flank.hi`, `<id>/crest`, `<id>/start`, `<id>/end` (pieces `#a`…). Cost: about 1–2 s per thread (cached).
- **Gears:** teeth are generated by the ISO 53 rack (addendum m, dedendum 1.25 m, tip radius 0.38 m) rolling on the pitch circle: involute flanks (B-spline curves fitted through points of the exact involute, so not exact themselves), a trochoidal root fillet, and real undercut below z ≈ 17 (cure: `shift: 1 − z·sin²α/2`). `backlash: 'fit'` (default, = 'slide') or a class name thins every tooth by c / cos α on the pitch circle, from the compile's fit context (so a printed pair has 2c between the idle flanks); a length thins by that much. Ports: `axis` (origin, z up) and `pitch` (on the pitch circle at +x). The spec sits in `gear.meta.sets.gear`. Faces: `gear/side[gear.t<i>.flankR|flankL|filletR|filletL|tip|root]`. Internal gears stop their tips at the base circle.
- **`j.inspect.gearMesh(a, b, { centreDistance, tolerance = 0.01 })`** → `{ ok, module, pressure, workingPressure, centreDistance (with profile shift: inv αw = inv α + 2 tan α Σx/Σz), standardCentreDistance, contactRatio, ratio, backlash (normal), messages }`. Not ok when modules or pressure angles differ, helical hands are wrong (external pairs opposite, internal the same), the contact ratio is under 1.1, a ring is fewer than 10 teeth bigger than its pinion, or a given centre distance is off. Undercut is a message only. With a rack: `pitchLineDistance`, `travelPerTurn`.
- **Pin hinge:** the axis runs along the frame's z from 0 to `length`. Knuckle radius R = d/2 + clearance + wall; knuckles are clearance apart. Leaf `a` gets knuckles 1, 3, 5… and the pin; leaf `b` gets knuckles 2, 4…, bored to d + 2·clearance. Each leaf first cuts room (R + clearance, clearance past the ends) for the other leaf's knuckles out of the bodies it is added to, then joins its knuckles, so a lid and a box (separate parts in an assembly) can each carry a leaf. `plates` adds flat leaves along +x (a) and −x (b), flush with the knuckles' underside (y = −R): the open hinge prints flat with the frame's +y up. `leaf: 'both'` builds both leaves at once as separate bodies of one part and reports `gap` (an `asm.interference` error under the clearance). The clearance comes from the fit class (`printInPlace` = 0.4 mm by default).
- **Library item steps:** a lib item may return ordered `steps: [{ op: 'join' \| 'cut' \| 'new', solids }]` instead of `add`/`cut`; a cut on an empty part is skipped.

## Fit, inspect, print, rules, assemblies, explore, laws

| Call | Status |
|---|---|
| `j.fit.classes(obj?)` · `j.fit.profile(name, { classes, holeComp: Q \| fn, xyComp, elephantFoot })` · `j.fit.gap/hole/pin` · `j.fit.coupon({ kind, range, steps })` (a printable part) · `j.fit.calibrate(rows)` · `j.stack(name).add().worstCase().rss().monteCarlo()` | ✓ |
| `j.material(name).with({…})` · `j.inspect.mass(t, { walls, infill })` · `.bbox` `.section(t, plane)` (area, centroid, I, Z) `.overhang(t, { dir, max })` `.bedContact` `.distance` `.mobility(asm)` `.snap(hook)` `.gearMesh(a, b)` | ✓ |
| `j.printer('generic-fdm' \| 'mk4' \| 'mini' \| 'x1c' \| 'generic-msla' \| {…})` · `j.print(name, { printer, material, fit, parts })` | ✓ |
| Print job: `.add(id, part \| assembly, { qty, orient })` `.orient('auto' \| '+Y' \| 'min-height' \| 'max-contact' \| fn)` `.supports(false \| { kind, angle })` `.plates({ spacing })` `.slice({ layer, walls, infill })` `.fit(p)` | ✓ |
| Layer sections (`print.layers.sample`, Σ area·t) | only with `job.slice(…)` or compile `options.layers: true` (the Layers overlay should pass it); layer count, cusp and print time are always there. Freeform or many-faced bodies slice their display mesh |
| `.split(id, { fit: 'bed', by: 'auto' \| plane(s) \| fn, joint: j.lib.dowel({ d, l, fit }) \| j.lib.dovetail({ width, depth, angle, fit }) })` | ✓ (pieces `<id>.a`, `.b`; dowel holes where the section has room; a dovetail tail joins the piece below each cut and its socket (+ the fit gap per flank) is cut from the piece above, sliding along the in-plane direction nearest +Z, width and depth capped at half the section; else `print.split`) |
| `.modifier` `.color` `.material(sel, m)` `.seam` `.brim` `.ironing` | ◐ (only recorded) |
| G-code | ✗ |
| Overhang checks (`print.overhang`, `j.rule.overhang`, `j.inspect.overhang`) use the exact normals of planes, cylinders, cones and spheres, so an exact 45° cone or chamfer is not flagged; other faces use facet normals with 0.5° tolerance | ✓ |
| `j.rules(name, [...])` · `j.rule.overhang/bedFit/minHole/minWall/holeOrientation/firstLayer/custom` · `j.rules.fdm/msla/printInPlace` · `j.check(prog, rules)` | ✓ |
| `j.rule.bridge/minFeature/text` | ◐ (no-ops) |
| `j.assembly(name).add(id, part, { at, ground, params }) .joint(id, j.joint.rigid/revolute/slider(…), 'a:port', 'b:port') .printInPlace(ids, { clearance, pose, check }) .interference({ exact })` · `prog.bom() .dof() .occurrence(id)` | ✓ (no nested assemblies; joint ends must be ports; `at` may use param expressions) |
| Gap/interference check | only on request: `.interference()`, `printInPlace(ids, { check: true })` or compile `options.interference`. Far pairs are ruled out by boxes; plane/cylinder bodies get the exact B-rep distance, freeform ones (gears) a mesh distance (`≈`), `{ exact: true }` forces B-rep. It runs at the print pose when the joints carry other values; trace pass `interference` |
| Assemblies in print jobs | one item in the print pose (`printInPlace` pose, else joint values), oriented and packed together; bodies `<item>/<component>.<body>` |
| `j.print(…).params({ W: mm(80) })` | shared params: bound into every part that declares the name, listed once as `W` (`shared: true`); override `W` for all, `lid.W` for one |
| `j.design(params, fn)` (`.lhs(n, { seed })`, `.sample`) · `j.param.range/choice/int/dir` · `j.search.grid/random/lhs` · `j.objective.minimize/maximize/weighted/lexicographic/pareto/require` · `j.metric` · `j.evaluate` · `j.stage` | ✓ (minimal). `lhs` is a real Latin hypercube (each parameter's n strata used once). `pareto` ranks by non-dominated front (`row.front`, 1 = Pareto-optimal), then crowding distance (`row.crowding`, NSGA-II); `result.front` is front 1 |
| `j.laws.check(j.laws.suite, { n, seed, only })` with `extrude.volume`, `revolve.volume`, `brep.eulerPoincare`, `compile.deterministic`, `shape.boolean` · `j.law(name, gen, prop, { justifies })` | ✓ |
| `j.export.stl/step/tmf/svg/ir(prog, opts)`: each returns `{ data, report }` | ✓ |
| `j.compile(model)` → Program: `summary() metrics() metric(n) why(t) param(n) feature(id) faces(sel) sketch(id) ir(L, { node }) find(kind) body(id) genealogy(name)`, and `layers` `plates` | ✓ |
| `j.field.*` · `j.mesh` · `j.load.*` | ✗ |

## Selectors

- `j.sel.faces/edges/vertices/bodies(q)` take the CadQuery mini-language: `+Z -X |Z #Z >Z <Z %plane %cylinder %line %circle and or not`, any axis or `(x,y,z)`.
- `j.feat(id)`: `.faces(q) .edges(q) .body() .endFace() .startFace() .sideFaces() .sideFace('l1') .holes() .bores() .capFaces()`.
- Steps: `.of .where .type .radius .near .adjacent .tangentChain .loop .largest .smallest .sortBy .first .last .nth .and .or .minus .not .faces .edges .vertices .created .modified .bed .query .expect`. `.nth` raises `ref.fragile`.
- Edge predicates: `e.convex`, `e.concave`, `e.smooth`, `e.length`, `e.radius`, `e.dir`.
- Face predicates: `f.normal`, `f.area`, `f.center`, `f.radius`, `f.axis`.

## Worker extras beyond BUILD.md

- **Script errors:** `compile` replies `ok: false` with `error { message, line, column, file }` plus an error `program`.
- **What-if compiles:** `options.keep: false` leaves the current Program in place.
- **Overrides:** numbers in the param's unit, or quantity text like `'80 mm'`. Keys may be `param`, `<part name>.param`, `<job item or component id>.param` or `gap.<class>`. Multi-part param rows carry `part` (item id), `partName` and `local`; `lab:param` links accept a plain name when one part has it and `<part name>.<param>` (src/host/param-names.js).
- **Fit values in params and expressions:** `gap.<class>` (e.g. `'w + gap.slide'`) is a name in every expression and slot, and a `j.fit.gap/hole/pin(…)` value may be a param (`params({ g: j.fit.gap('slide') })`); both resolve in the compile's fit context, and features using them recompute when it changes. A `j.fit.profile` `holeComp` may be a function `(d: Quantity, { fit }) → Quantity`.
- **Expressions in placements:** `j.tx.move('w / 2', 0, 'k')`, `j.tx.rotate(axis, 'a')`, `j.frame({ origin: j.pt('w', 0, 3) })` and `j.axis.through(j.pt('a', 10, 0), …)` resolve at compile (deferred). Core note: geom.js `resolveDatum` resolves any `through` as a plane; the kernel resolves `axis.through` itself.
- **Fit values are lazy core Quantities** (`j.fit.gap/hole/pin`): arithmetic works (`j.fit.pin(5, 'slide').div(2)`), and they resolve in the compile's fit context in sketches, params, regions and slots.
- **Sketch holes:** `.hole(sketch)` drills at every point, pattern and mirror copies included.
- **Region areas:** `region.area()` is exact for lines, arcs, circles and ellipses (Green's theorem); splines and Béziers use fine polylines.
- **`run`:** `files` is in scope, and `compile(text)` compiles `text` as script.js without replacing the current Program.
- **`call`:**
  - `faces(sel | query text | name)` returns face records `{ name, body, index, kind, area, center, normal?, axis? }`.
  - `why(face name | edge name | feature id | param | selector)`.
  - `edges(...)`.
- **Graph ids:** sketch nodes are `sketch:<id>`.
- **Sketch warm start:** a constrained sketch whose text is unchanged starts from its last solution in this worker (`env.warm`), so moving a parameter keeps the solution branch. An edited sketch, explicit-mode sketches and a fresh worker solve cold. Drags (`solveSketch`) never feed compiles.
- **Coordinates:** body-local. `bodies[].transform` places a body in the world. Print plates carry their own item transforms.
