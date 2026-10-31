---
id: reference
title: Reference
group: Start here
about: Every j.* name in this build, by module: signature, what it does, status and a short example.
order: 0
---
# Reference

Every name in the `j` namespace that this build of jigcad implements, grouped by module, with its signature, what it does, its status and a short example. Units are millimetres and radians inside the engine; a bare number in a length slot is millimetres and in an angle slot is degrees. A string in a slot is an expression over the part's params.

Status: ✓ works end to end and is tested · ◐ partial, with the limit stated · ✗ not in this build (it throws, or compiles to a `feature.unsupported` diagnostic that says so).

## Scripts and bare names

A preset's `script.js`, a figure in the Book and a sketch opened from it are all the **body of a function** that returns a builder: a part, sketch, assembly, print job, region, shape or design. These names are in scope:

```text
j  mm cm m um inch ft  deg rad turn  kg gram  N kN  MPa GPa
s minute hour  degC  usd eur  lw layer nozzle bbox  data
```

`data` holds the preset's data files, parsed: `.json` as an object, `.csv` as `{ columns, rows }`, anything else as a string. `in` is a JavaScript keyword, hence `inch`. Do not redeclare these names, and avoid `m`, `s`, `N` and `layer` as local variables.

```js
// the smallest complete script: one part, one feature
return j.part('plate')
  .params({ w: mm(60), d: mm(40), t: mm(4) })
  .extrude(j.region.rect('w', 'd'), 't', { id: 'body' })
```

Builders are immutable: every method returns a new builder, and there is no `build()`. Every slot accepts nothing (the default), a value, a named strategy, or a lambda `(input, ctx) => out` whose `ctx.default` is the default.

## Units

- `mm cm m um inch ft` ✓: lengths, canonical unit mm. Example: `inch(0.25)` is 6.35 mm.
- `deg rad turn` ✓: angles, canonical unit rad. Example: `turn(1)` is 2π rad.
- `kg gram` ✓: mass, canonical g. Example: `gram(12)`.
- `N kN MPa GPa` ✓: force and stress. Example: `MPa(50)`.
- `s minute hour` ✓: time, canonical s. Example: `minute(42)`.
- `degC` ✓: temperature difference. Example: `degC(20)`.
- `usd eur` ✓: money; `j.units.rates.eur` is usd per eur (1.08). Example: `eur(10).to('usd')` is 10.8 usd.
- `lw(n)` ✓: n extrusion line widths, resolved by the printer. Example: `lw(3)` is 1.35 mm on mk4.
- `layer(n)` ✓: n layer heights, resolved by the printer. Example: `layer(5)` is 1 mm at 0.2 mm.
- `nozzle(n)` ✓: n nozzle diameters. Example: `nozzle(1)`.
- `bbox(n)` ✓: n times the model's bounding-box diagonal. Example: `bbox(0.05)`.
- `j.q(text | number | ctx => Q)` ✓: parse a quantity or wrap a lambda. Example: `j.q('1/4 in + 2 mm')`.
- `j.q.sqrt sin cos tan asin acos atan2 min max` ✓: maths on quantities; trig takes angles. Example: `j.q.sin(deg(30))` is 0.5.
- `j.units` ✓: every unit constructor, plus `rates`. Example: `j.units.mm(3)`.
- `j.coerce(x, kind, scope?)` ✓: a bare number to mm, degrees or plain. Example: `j.coerce(30, 'angle')` is 30°.
- `j.Quantity` `j.Toleranced` ✓: the classes, for `instanceof`. Example: `x instanceof j.Quantity`.
- `j.DimensionError` ✓: thrown by arithmetic on unlike dimensions. Example: `mm(2).add(deg(3))` throws.

A quantity's methods:

- `.value` `.dims` `.unit` ✓: canonical number, dimension exponents, display unit. Example: `mm(3).dims` is `{ L: 1 }`.
- `.add .sub .mul .div .neg .abs` ✓: arithmetic; `mul` adds exponents. Example: `mm(2).mul(mm(3))` is 6 mm².
- `.min .max .clamp(lo, hi) .pow .sqrt` ✓: more arithmetic. Example: `mm(4).pow(2)`.
- `.to(unit)` `.in(unit)` ✓: convert; `in` returns a number. Example: `inch(1).in('mm')` is 25.4.
- `.gt .gte .lt .lte .eq(b, tol?)` ✓: comparisons, dimension-checked. Example: `mm(3).gt(mm(2))`.
- `.resolve(ctx)` ✓: fix symbolic units: `{ lw, layer, nozzle, bboxDiag }`. Example: `lw(3).resolve({ lw: mm(0.42) })`.
- `.isSymbolic .isLazy` ✓: whether it still needs a printer. Example: `lw(2).isSymbolic` is true.
- `.pm(t)` `.tol(lo, hi)` ✓: a toleranced value for stacks. Example: `mm(10).pm(0.1)`.
- `.toString()` ✓: text with unit. Example: `lw(3).add(mm(0.1))` prints `3lw + 0.1mm`.

## Expressions and parameters

- `.params({ … })` ✓: declare params on any builder; values are quantities, numbers, booleans, expression strings or lambdas. Example: `.params({ wall: lw(3), boss: 'wall * 4' })`.
- `.configs({ name: { … } } | j.table(…))` ✓: a finite set of overrides; with none chosen, the middle row. Example: `.configs({ S: { h: mm(30) }, L: { h: mm(55) } })`.
- `.config(name)` ✓: choose a configuration (still a value). Example: `.config('L')`.
- `.override({ … })` ✓: the highest-precedence layer in the script. Example: `.override({ wall: mm(2.5) })`.
- `.expose(names, { labels, ranges, steps })` ✓: the sliders in Params. Example: `.expose(['h'], { ranges: { h: [mm(10), mm(80)] } })`.
- `j.expr(text)` ✓: an expression value. Example: `j.expr('wall * 2 + 1 mm')`.
- `j.ref(name)` ✓: a reference to one param. Example: `j.ref('wall')`.
- `j.lit(text)` ✓: a string kept as text, not parsed. Example: `j.lit('w * 2')`.
- `j.table(csv | rows, { key })` ✓: a design table for `.configs`. Example: `j.table('name,d\nS,10\nL,20')`.
- `j.param.expose` ✓: the expose metadata helper. Example: `j.param.expose(['h'])`.
- `j.Expr j.ExprError j.ParamCycleError` ✓: classes and errors. Example: `e instanceof j.ExprError`.

Expressions take units after numbers (`2 mm`, `1/4 in`, `25 mm^2`, `30°`), names with dots (`gap.slide`), the functions `min max abs sqrt sin cos tan asin acos atan atan2 floor ceil round clamp hypot pow lerp` and the constant `pi`. Precedence, low to high: library default, `.params`, a config row, `.override`, the Params view. A cycle is the diagnostic `param.cycle` with its path (`wall → floor → wall`); unlike dimensions are `units.dimension` (`'w - 3': cannot subtract 1 (dimensionless) from mm (L¹)`).

## Geometry

- `j.pt(x, y, z?)` ✓: a point; `p.sub(q)` is a vector, `p.add(p)` throws `AffineError`. Example: `j.pt(10, 0, 5)`.
- `j.vec(x, y, z?)` ✓: a vector: `add sub mul div dot cross norm unit angleTo`. Example: `j.vec(1, 0, 0).cross(j.vec(0, 1, 0))`.
- `j.dir('+Z' | x, y, z)` ✓: a unit direction. Example: `j.dir('-X')`.
- `j.origin` ✓: the point (0, 0, 0). Example: `j.origin`.
- `j.tx.identity` ✓: the identity transform. Example: `j.tx.identity`.
- `j.tx.move(v | x, y, z)` ✓: a translation. Example: `j.tx.move(0, 0, 5)`.
- `j.tx.rotate(axis, angle)` ✓: a rotation about an axis. Example: `j.tx.rotate(j.axis.Z, deg(60))`.
- `j.tx.mirror(plane | axis)` ✓: a reflection; `det` is −1. Example: `j.tx.mirror(j.plane.YZ)`.
- `j.tx.scale(k | [3], { about })` ✓: a scaling. Example: `j.tx.scale(2)`.
- `j.tx.align(from, to)` ✓: the motion taking one frame to another. Example: `j.tx.align(j.plane.XY, j.plane.XZ)`.
- `j.tx.matrix(arr)` ✓: a transform from 16 numbers, column-major. Example: `j.tx.matrix(m)`.
- `t.then(u) .inverse() .pow(n) .apply(x) .det` ✓: compose (first t, then u), invert, apply. Example: `a.then(b).apply(j.pt(1, 0, 0))`.
- `j.plane.XY .XZ .YZ` ✓: the base planes; XZ's normal is −Y. Example: `j.plane.XZ`.
- `j.plane.offset(p, d)` ✓: a parallel plane; `d` may be an expression. Example: `j.plane.offset(j.plane.XY, 'h')`.
- `j.plane.angle(p, axis, a)` ✓: a plane turned about an axis. Example: `j.plane.angle(j.plane.XY, j.axis.X, deg(30))`.
- `j.plane.through(a, b, c)` ✓: the plane through three points. Example: `j.plane.through(p, q, r)`.
- `j.plane.on(faceSel)` ✓: the plane of a planar face. Example: `j.plane.on(j.feat('body').endFace())`.
- `j.plane.mid(a, b)` `j.plane.normalTo(sel, { at })` ✓: mid-plane; plane normal to a curve. Example: `j.plane.mid(f1, f2)`.
- `j.axis.X .Y .Z` ✓: the base axes. Example: `j.axis.Z`.
- `j.axis.through(p, q)` `j.axis.of(sel)` ✓: an axis through points, or of a cylinder, edge or circle. Example: `j.axis.of(j.feat('bore').faces())`.
- `j.frame({ origin, x, z })` ✓: a frame (planes are frames). Example: `j.frame({ origin: j.origin, x: j.dir('+Y'), z: j.dir('+X') })`.
- `j.frame.on(sel, { flip })` ✓: the frame of a face. Example: `j.frame.on(j.feat('body').endFace())`.
- `j.point.center(sel)` `j.point.on(sel, { at })` ✓: a point from topology. Example: `j.point.center(j.feat('boss').endFace())`.
- `frame.offset .rotate .flip .moved .toWorld .toLocal` ✓: frame operations. Example: `j.plane.XY.offset(mm(5))`.
- `j.Point j.Vec j.Dir j.Transform j.Frame j.Axis j.AffineError` ✓: classes and errors. Example: `p instanceof j.Point`.

## Patterns

A pattern is a group acting on a feature or on sketch entities. Its instance count is known before any geometry is built.

- `j.pattern.linear(dir, { count, step | extent })` ✓: copies along a direction. Example: `j.pattern.linear(j.dir('+X'), { count: 4, step: mm(10) })`.
- `j.pattern.circular(axis, { count, angle })` ✓: copies about an axis; `angle` defaults to a full turn. Example: `j.pattern.circular(j.axis.Z, { count: 6 })`.
- `j.pattern.grid(dA, dB, { count: [a, b], step: [sa, sb] })` ✓: a rectangular grid. Example: `j.pattern.grid(j.dir('+X'), j.dir('+Y'), { count: [3, 2], step: [20, 20] })`.
- `j.pattern.hex(plane, { pitch, rings | count })` ✓: a hexagonal lattice; `rings: 3` has 37 cells. Example: `j.pattern.hex(j.plane.XY, { pitch: mm(10), rings: 3 })`.
- `j.pattern.path(sel, { count, align })` ✓: copies along a curve. Example: `j.pattern.path(edge, { count: 8 })`.
- `j.pattern.mirror(planeOrAxis)` ✓: one reflected copy. Example: `j.pattern.mirror(j.axis.Y)`.
- `j.pattern.points(pts)` ✓: copies at listed points. Example: `j.pattern.points([[0, 0], [20, 0]])`.
- `p.times(q)` ✓: the product: counts multiply. Example: `mx.times(my).count` is 4.
- `p.filter((inst, ctx) => bool)` `p.skip([i])` ✓: drop instances. Example: `hex.filter(c => Math.hypot(c.at.x, c.at.y) < 20)`.
- `p.vary((inst, ctx) => ({ … }))` ✓: per-instance feature params. Example: `p.vary(i => ({ extent: mm(2 + i.index) }))`.
- `p.count p.closed p.eq(q)` ✓: size, whether a full turn, equality. Example: `j.pattern.circular(j.axis.Z, { count: 6 }).closed`.
- `p.expand(ctx)` `p.instances(ctx)` ✓: the instances with their transforms; coincident ones merge (`pattern.dedupe`). Example: `p.expand({ base: j.pt(20, 0, 0) })`.

## Regions and primitives

- `j.region.rect(w, h, { center = true, at, r })` ✓: a rectangle, optionally rounded. Example: `j.region.rect(60, 40, { r: 3 })`.
- `j.region.circle(r, { at })` ✓: a disc. Example: `j.region.circle('d / 2')`.
- `j.region.polygon(pts)` ✓: a polygon. Example: `j.region.polygon([[0, 0], [10, 0], [0, 10]])`.
- `j.region.slot(a, b, width)` ✓: a stadium from a to b. Example: `j.region.slot([0, 0], [20, 0], 6)`.
- `j.region.text(str, { size, font, align, valign, at, spacing })` ✓: text outlines; `size` is the cap height. Example: `j.region.text('PLA', { size: 6 })`.
- `r.union(o) r.subtract(o) r.on(plane)` ✓: region booleans, and a plane to sit on. Example: `j.region.rect(20, 10).subtract(j.region.circle(2))`.
- `r.area()` ◐ (counts straight edges and full circles only: arcs, slots and text come out too small): the region's area. Example: `j.region.circle(5).area()`.
- `j.box(w, d, h, { center: true | 'xy' })` ✓: a box, corner at the origin by default. Example: `j.box(60, 30, 5)`.
- `j.cyl(r, h, { center })` ✓: a cylinder along Z. Example: `j.cyl(mm(5), mm(40), { center: true })`.
- `j.sphere(r)` `j.cone(r1, r2, h)` `j.torus(R, r)` ✓: more primitives. Example: `j.sphere(mm(13))`.
- `shape.union .subtract .intersect .moved(tx)` ✓: exact regularised booleans. Example: `cube.intersect(ball).subtract(rods)`.
- `shape.volume() shape.bbox()` ✓: measured on the kernel. Example: `j.sphere(10).volume()`.

Fonts are OFL: Atkinson Hyperlegible Bold (`sans`) and IBM Plex Mono Bold (`mono`).

## Sketches and constraints

A sketch with no `.constrain()` and no `.dim()` is **explicit**: its numbers are fixed and its DOF is 0. Any constraint or dimension makes it **constrained**: the numbers become starting positions. `j.sketch(id, { mode })` overrides the choice. The [solver doc](lab:doc?id=solver) explains both.

- `j.sketch(id, { on, mode })` ✓: a sketch on a plane or a planar face. Example: `j.sketch('base', { on: j.plane.XY })`.
- `.point(id, at)` ✓: a point. Example: `.point('p', [20, 6])`.
- `.line(id, a, b)` ✓: a segment; ends may be refs. Example: `.line('l2', 'l1.end', [40, 30])`.
- `.polyline(id, pts, { closed })` ✓: segments `id.1`, `id.2`, …. Example: `.polyline('p', pts, { closed: true })`.
- `.arc(id, { center, start, end } | { through })` ✓: an arc. Example: `.arc('a', { center: [0, 0], start: [40, 0], end: [0, 40] })`.
- `.circle(id, r, { at })` ✓: a circle. Example: `.circle('hole', 2.2, { at: [40, 4] })`.
- `.ellipse(id, rx, ry, { at, angle })` ✓: an ellipse. Example: `.ellipse('e', 10, 6)`.
- `.spline(id, pts, { degree, fit, closed })` ✓: a B-spline through or controlled by points. Example: `.spline('s', pts, { fit: 'interp' })`.
- `.rect(id, w, h, { at, center, r })` ✓: sides `id.bottom right top left`, corners `id.bl br tr tl`. Example: `.rect('outline', 'w', 'd', { center: true, r: 'r' })`.
- `.polygon(id, n, r, { at, inscribed })` ✓: a regular polygon; `inscribed: false` takes the apothem. Example: `.polygon('hex', 6, 'af / 2', { inscribed: false })`.
- `.slot(id, a, b, width)` ✓: a slot: `id.l1 l2 a1 a2`. Example: `.slot('s', [0, 0], [20, 0], 6)`.
- `.text(id, str, { size, font, at, align })` ✓: text as a fixed outline. Example: `.text('t', 'jig', { size: 5 })`.
- `.offset(id, srcIds, d)` ✓: offset curves. Example: `.offset('o', ['p'], -1.2)`.
- `.fillet(id, cornerRef, r)` `.chamfer(id, cornerRef, d)` ✓: round or cut a corner. Example: `.fillet('f', 'r.tr', 3)`.
- `.trim(id, at)` ✓: split an entity at a point. Example: `.trim('l1', [20, 0])`.
- `.mirror(srcIds, axisId)` `.pattern(srcIds, pattern)` ✓: copies `<src>.m`, `<src>.p<k>`. Example: `.pattern(['h1'], j.pattern.mirror(j.axis.X))`.
- `.construction(...ids)` ✓: reference geometry, left out of profiles. Example: `.construction('axis')`.
- `.project(id, sel)` `.intersect(id, sel)` ✓: curves from the model. Example: `.project('e', j.feat('body').endFace().edges())`.
- `.import(id, region)` ✓: a region as fixed curves. Example: `.import('logo', j.region.text('A'))`.
- `.constrain(...cs)` ✓: add constraints. Example: `.constrain(j.c.horizontal('l1'))`.
- `.dim(target, value, { driven })` ✓: a dimension: line length, circle diameter, arc radius, `[a, b]` distance or angle, `{ h }`, `{ v }`. Example: `.dim('l1', 60)`.
- `.solver(slot)` ✓: `'dogleg'` (default), `'lm'`, `'newton'`, `j.solver.lm({ maxIter })` or a lambda. Example: `.solver('lm')`.
- `.strict()` ✓: under-constrained becomes an error. Example: `.strict()`.
- `.profiles()` `.profile(pick)` `.wire(ids)` ✓: every closed region (even–odd nesting), one of them, or an open path. Example: `sk.profiles()`.
- `j.c.coincident horizontal vertical parallel perpendicular tangent equal symmetric midpoint concentric collinear on fix distance distanceX distanceY angle radius diameter length` ✓: constraints; each takes refs and an optional `{ id }`. Example: `j.c.tangent('a1', 'l2')`.
- `j.solver.dogleg lm newton bfgs` ✓: solver strategies. Example: `j.solver.lm({ maxIter: 200 })`.
- `j.sketch3d(id).line .polyline .spline .helix(id, { axis, pitch, turns, r })` ✓: 3D paths for sweeps. Example: `j.sketch3d('path').helix('h', { pitch: mm(4), turns: 3, r: mm(10) })`.
- `j.Sketch` ✓: the class. Example: `sk instanceof j.Sketch`.

Refs: `'l1'`, `'l1.start'`, `'l1.end'`, `'l1.mid'`, `'c1.center'`, `'origin'`, `'X'`, `'Y'`, `[x, y]`. Diagnostics: `sketch.underConstrained` (warning, with the free entities), `sketch.redundant` (warning; the constraint is dropped), `sketch.overConstrained` (error, with the minimal conflicting set and a driven dimension to try), `sketch.ref`.

## Parts and features

- `j.part(name)` ✓: an empty part. Example: `j.part('box')`.
- `.material(m) .color(c)` ✓: material for mass; display colour. Example: `.material(j.material('PETG'))`.
- `.color(sel, c)` ◐ (recorded only): per-face colour. Example: `.color(j.feat('body').endFace(), 'red')`.
- `.port(name, frame)` ✓: a named frame for joints. Example: `.port('hinge', j.frame({ … }))`.
- `.fit(profile)` ✓: the fit profile for every fit-aware slot. Example: `.fit(j.fit.profile('mk4-petg', { … }))`.
- `.set(k, v) .use(...fns) .with(fn)` ✓: raw settings, presets and rule sets, a builder function. Example: `.use(j.rules.fdm)`.
- `.extrude(profile, extent, { op, taper, twist, herringbone, id })` ✓ (`to` uses the face centre): extent: `Q`, `{ symmetric }`, `{ two: [a, b] }`, `{ through: 'all' }`, `{ to: faceSel }`. Example: `.extrude(sk.profiles(), 'h', { id: 'body' })`.
- `.extrude(…, { twist: deg(a) })` ✓ (not with `taper`): the end section turned by a about the sketch normal; with `herringbone: true` the middle section is turned and the end brought back. Example: `.extrude(j.region.rect(20, 10), mm(30), { twist: deg(90) })`.
- `.cut(profile, extent, opts)` ✓: extrude with `op: 'cut'`; goes into the material. Example: `.cut(pocket.profiles(), 'h - floor', { id: 'pocket' })`.
- `.revolve(profile, axis, angle = turn(1), opts)` ✓: the axis lies in the profile's plane. Example: `.revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'ring' })`.
- `.sweep(profile, path, { frame, id })` ✓: frame `'rmf'` (default), `'frenet'`, `'fixed'`. Example: `.sweep(c.profiles(), helix, { id: 'wire' })`.
- `.loft([profiles], { ruled, id })` ✓: a solid through sections. Example: `.loft([a.profiles(), b.profiles()], { id: 'duct' })`.
- `.hole(at, spec, opts)` ✓: holes at points, sketch points or circle edges. Example: `.hole(pts, j.hole.clearance('M3'), { id: 'holes' })`.
- `.fillet(edges, r | (edge, ctx) => r, { id })` ✓: rolling-ball fillet, concave edges first. Example: `.fillet(j.feat('body').sideFaces().edges('|Z'), mm(3), { id: 'round' })`.
- `.chamfer(edges, d, { d2, angle, id })` ✓: a chamfer. Example: `.chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })`.
- `.shell(openFaces, t, { direction, id })` ✓: hollow with open faces. Example: `.shell(j.feat('body').endFace(), 'wall', { id: 'shell' })`.
- `.draft(faces, angle, { pull, neutral })` ✓: taper faces against a pull direction. Example: `.draft(j.feat('body').sideFaces(), deg(2))`.
- `.rib(wire, t, { direction })` ✓: a wall grown from lines. Example: `.rib(sk.wire(['l1']), mm(2))`.
- `.thicken(faces, t, { op })` ✓: a solid from faces. Example: `.thicken(j.feat('s').faces(), mm(1))`.
- `.emboss(region, depth, { on, op, id })` ✓ (planar faces, no wrap): raised or cut text and logos on a planar face. Example: `.emboss(j.region.text('PLA', { size: 5 }), mm(0.6), { on: j.feat('body').endFace() })`.
- `.pattern(j.feat(id) | bodySel, pattern, { onFail, id })` ✓: replay a feature's tool. Example: `.pattern(j.feat('boss'), j.pattern.circular(j.axis.Z, { count: 6 }), { id: 'bosses' })`.
- `.mirror(targets, plane, { id })` ✓: replay a feature reflected. Example: `.mirror(j.feat('pin'), j.plane.YZ, { id: 'pins' })`.
- `.boolean(op, targetSel, shapeOrSel)` ✓: an explicit boolean. Example: `.boolean('cut', j.sel.bodies(), j.cyl(2, 20))`.
- `.split(bodySel, plane)` ✓: cut a body in two. Example: `.split(j.feat('body').body(), j.plane.YZ, { id: 'cut' })`.
- `.move(sel, tx)` `.copy(sel, tx)` ✓: move or copy bodies. Example: `.copy(j.feat('body').body(), j.tx.move(50, 0, 0))`.
- `.pushPull(planarFaces, d)` ✓: move a planar face. Example: `.pushPull(j.feat('body').endFace(), mm(5))`.
- `.add(shape | part | libItem, { at, op, leaf, fit, id })` ✓: add a primitive, part or library feature. Example: `.add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })`.
- `.feature(id, (bodies, ctx) => shapes)` ✓: a custom pure feature. Example: `.feature('twin', (b) => [...b, j.box(5, 5, 5)])`.
- `.suppress(id) .unsuppress(id) .rollback(id) .insertAfter(id, fn) .features()` ✓: edit the timeline. Example: `.insertAfter('body', b => b.chamfer(…))`.
- `.deleteFace` `.offsetFace` `.import` ✗: direct edits and imports.

`op` is `'new'`, `'join'`, `'cut'` or `'intersect'`. The first solid feature is `new`; later ones `join` when they touch a body, else `new`; the choice is an `op` decision. Give `{ id }` to anything you refer to: a generated id (`extrude1`) raises `ref.autoId`. Failures are diagnostics: `feature.failed`, `fillet.tooLarge` (with the largest radius that works), `fillet.tangent` (the rim lands exactly on another feature's edge; with radii either side that work), `brep.invalid` (with the wall that would work; as a warning, a body whose genus is not a whole number), `boolean.nonManifold`, `pattern.instanceSkipped`.

## Selectors and naming

Faces and edges are named by genealogy: `<feature>/<role>[<source>]`, as in `body/side[base.outline.bottom]`, `body/end`, `body/start`, `shell/inner[body/side[base.outline.bottom]]` and `round/face[body/side[base.r.left] ∩ body/end]`. A face split by a later feature keeps its name with `#a`, `#b`. The [naming doc](lab:doc?id=naming) explains why these survive edits.

- `j.sel.faces(q?) .edges(q?) .vertices(q?) .bodies(q?)` ✓: a query over the whole model. Example: `j.sel.faces('>Z')`.
- `j.sel.names(kind, names)` ✓: entities by persistent name. Example: `j.sel.names('faces', ['body/end'])`.
- `j.feat(id)` ✓: a feature's own topology: `.faces(q) .edges(q) .body() .endFace() .startFace() .sideFaces() .sideFace('l1') .holes() .bores() .capFaces()`. Example: `j.feat('body').endFace().edges()`.
- `j.on(componentId, sel)` ✓: a selector inside an assembly component. Example: `j.on('lid', j.sel.faces('<Z'))`.
- `.of(target) .where(pred) .type(t) .radius(r) .near(pt)` ✓: restrict. Example: `.where(e => e.convex)`.
- `.adjacent(sel) .tangentChain() .loop()` ✓: grow along topology. Example: `.tangentChain()`.
- `.largest() .smallest() .sortBy(fn) .first() .last()` ✓: pick by measure. Example: `j.sel.faces('%plane').largest()`.
- `.nth(i)` ✓ (raises `ref.fragile`): pick by index. Example: `j.sel.edges().nth(3)`.
- `.and(o) .or(o) .minus(o) .not()` ✓: set algebra. Example: `a.or(b)`.
- `.faces() .edges() .vertices()` ✓: navigate. Example: `j.feat('body').endFace().edges()`.
- `.created(featId) .modified(featId)` ✓: by history. Example: `j.sel.faces().created('pocket')`.
- `.bed()` ✓: faces touching the bed in the chosen orientation. Example: `j.sel.faces().bed()`.
- `.expect(n | [min, max])` ✓: a count assertion; a mismatch is the error `ref.expect`. Example: `.edges('|Z').expect(4)`.
- `j.isSelector(x)` ✓: test. Example: `j.isSelector(j.sel.faces())`.

The query language is CadQuery's: `+Z` (normal points +Z), `|Z` (parallel), `#Z` (perpendicular), `>Z` and `<Z` (farthest and nearest along Z), `%plane %cylinder %line %circle`, any axis or `(x,y,z)`, combined with `and`, `or`, `not`. Predicates in `where`: edges have `convex`, `concave`, `smooth`, `length`, `radius`, `dir`, `center`; faces have `normal`, `area`, `center`, `radius`, `axis`.

## Holes

- `j.hole.simple(d, depth | 'through')` ✓: a plain bore at `d`. Example: `j.hole.simple(j.fit.hole('pin', 'slide'), mm(6))`.
- `j.hole.counterbore(d, cbD, cbDepth, depth)` ✓: a bore with a counterbore. Example: `j.hole.counterbore(mm(3.4), mm(6.5), mm(3))`.
- `j.hole.countersink(d, csD, angle, depth)` ✓: a bore with a countersink. Example: `j.hole.countersink(mm(3.4), mm(7), deg(90))`.
- `j.hole.countersink('M3', { fit, depth })` ✓: ISO 10642 head, fit-aware. Example: `j.hole.countersink('M3', { fit: 'slide' })`.
- `j.hole.clearance('M3', { fit, depth })` ✓: d + 2·gap + hole compensation: M3 slide is 3.5 mm. Example: `j.hole.clearance('M4', { fit: 'free' })`.
- `j.hole.tapped('M3', { depth, method })` ✓: `'self-tap'` drills d − 0.1 mm; `'printed'` models an ISO internal thread with core Ø = D1 + 2·gap, starting 0.5 mm below the mouth; `depth: 'through'` runs it to the far side. Example: `j.hole.tapped('M3', { depth: mm(8), method: 'printed' })`.
- `j.hole.insert('M3x5.7')` ✓: a heat-set insert hole, Ø4.0 × 6.7 mm. Example: `j.hole.insert('M3x5.7')`.
- `j.hole.nutTrap('M3', { kind, from })` ✓: a hex pocket and a bolt hole. Example: `j.hole.nutTrap('M3', { from: 'side' })`.

A hole whose axis is perpendicular to the build direction becomes a 45° teardrop, tip up, recorded as a `teardrop` decision. Face names: `<id>/bore[<point>]`, `floor`, `cbore`, `cbFloor`, `csink`, `tear.l`, `tear.r`, `nut.*`.

## Library

- `j.lib.thread('M8x1.25' | 'M8' | 'Tr40x3' | { d, pitch }, { length, internal, profile, fit, starts, hand, through })` ✓ (1–2 s cold, then cached): an ISO 68, trapezoid or buttress thread along the frame's z; `internal: true` or `op: 'cut'` cuts it for nuts and lids. The fit class moves the radii, so an M8 slide thread is modelled at 7.6 mm major and 6.247 mm minor. Faces `<id>/core`, `flank.lo`, `flank.hi`, `crest`, `start`, `end`. Example: `j.lib.thread('M8x1.25', { length: mm(12) })`.
- `j.lib.gear.spur({ module, teeth, pressure = 20°, shift = 0, backlash = 'fit', width, bore })` ✓: involute flanks from the ISO 53 rack (B-splines fitted through points of the exact curve), a trochoidal root and real undercut below about 17 teeth; `backlash` thins each tooth by the fit class; ports `axis` and `pitch`. Example: `j.lib.gear.spur({ module: mm(1.5), teeth: 20, width: mm(6) })`.
- `j.lib.gear.helical({ …, helix = 30°, hand })` ✓ (module is the transverse module): a helical gear. Example: `j.lib.gear.helical({ module: mm(1.5), teeth: 20, width: mm(8) })`.
- `j.lib.gear.herringbone({ …, helix, hand })` ✓: a herringbone gear. Example: `j.lib.gear.herringbone({ module: 1, teeth: 24, helix: deg(30) })`.
- `j.lib.gear.internal({ …, rim = 3, herringbone, helix, hand })` `j.lib.gear.rack({ module, teeth, width, base = 2m, backlash })` ✓: ring gear and rack. Example: `j.lib.gear.rack({ module: 1, teeth: 20 })`.
- `j.lib.gear.bevel` ✗: bevel gears.
- `j.lib.hinge.pin({ knuckles = 5, length = 30, d = 3, clearance = 'printInPlace', wall = 1.6, plates })` ✓: a print-in-place pin hinge along the frame's z; add with `{ leaf: 'a' | 'b' }` to two parts, or `{ leaf: 'both' }` for both leaves as separate bodies of one part; `plates: { width, thickness }` adds flat leaves. Example: `.add(j.lib.hinge.pin({ length: mm(30), plates: { width: mm(20), thickness: mm(2) } }), { leaf: 'both' })`.
- `j.lib.hinge.living({ length, thickness = 0.4, gap = 1, overlap = 2, material = 'PP' })` ✓: a living hinge; warns `print.layerStrength` when the material's allowable strain is under 5 %. Example: `j.lib.hinge.living({ length: mm(30) })`.
- `j.lib.dovetail({ width, depth, angle, fit, length })` ✓: tail with `op: 'join'`, socket with `op: 'cut'`. Example: `j.lib.dovetail({ width: mm(10), depth: mm(5) })`.
- `j.lib.insert('M3x5.7').boss({ wall, height })` ✓: a boss with an insert hole. Example: `j.lib.insert('M3x5.7').boss({ wall: lw(3) })`.
- `j.lib.magnet({ d, h })` `j.lib.dowel({ d, l, fit })` ✓: a press-fit pocket; a dowel. Example: `j.lib.magnet({ d: mm(6), h: mm(3) })`.
- `j.lib.snap.cantilever({ length = 12, thickness = 1.6, deflection = 1, width = 6, material = 'PETG', angle = 30°, retention = 90° })` ✓: a snap hook along the frame's z with an insertion ramp and a retention face, strain-checked (`print.snapStrain`); its info gives strain and the deflection and insertion forces in N. Example: `j.lib.snap.cantilever({ length: mm(12), thickness: mm(1.6), deflection: mm(1) })`.
- `j.lib.screw(std, 'M3x8')` `j.lib.nut(std, 'M3')` `j.lib.washer` `j.lib.pin({ d, l })` ✓: simple hardware parts. Example: `j.lib.screw('ISO 7380', 'M3x8')`.
- `j.lib.snap.annular` `j.lib.snap.torsion` `j.lib.bearing` ✗.

## Fit

- `j.fit.classes(obj?)` ✓: the clearance classes per side; with no argument, the defaults. Example: `j.fit.classes()`.
- `j.fit.profile(name, { classes, holeComp, xyComp, elephantFoot })` ✓: a calibrated profile. Example: `j.fit.profile('mk4-petg', { classes: { slide: mm(0.135) } })`.
- `j.fit.gap(cls)` ✓: the gap per side of a class. Example: `j.fit.gap('printInPlace')` is 0.4 mm.
- `j.fit.hole(d, cls)` ✓: modelled hole: d + 2·gap + hole compensation. Example: `j.fit.hole(mm(3), 'slide')` is 3.5 mm.
- `j.fit.pin(d, cls)` ✓: modelled pin: d − 2·gap + 2·xyComp. Example: `j.fit.pin(mm(3), 'press')` is 2.9 mm.
- `j.fit.coupon({ kind, range, steps, pin })` ✓: a printable test part with graded gaps. Example: `j.fit.coupon({ kind: 'pin-hole', steps: 10 })`.
- `j.fit.calibrate(rows)` ✓: least squares `actual = a·nominal + b`, and classes from the outcomes. Example: `j.fit.calibrate([{ pin: 6.04, holes, outcomes }])`.
- `j.stack(name).add(q.pm(t), { dir })` ✓: a tolerance stack: `.worstCase() .rss() .monteCarlo({ n, seed, dist })`. Example: `j.stack('gap').add(mm(56).pm(0.15))`.

Default classes, per side: press 0.05, snug 0.10, slide 0.20, free 0.30, printInPlace 0.40 mm; hole compensation 0.1 mm. Resolved values are params named `gap.<class>`, with provenance. Until a profile is calibrated, a fit-aware feature raises the info `fit.uncalibrated`.

## Inspect and materials

- `j.material(name)` ✓: PLA, PETG, ABS, ASA, PP, TPU-95A, PA-CF, resin-standard. Example: `j.material('PETG')` (1.27 g/cm³).
- `m.with({ … })` ✓: change properties. Example: `j.material('PLA').with({ cost: j.q('30 usd/kg') })`.
- `j.inspect.materials()` ✓: the material names. Example: `j.inspect.materials()`.
- `j.inspect.mass(t, { walls, infill })` ✓: solid, or as printed with a walls and infill model. Example: `j.inspect.mass(part, { walls: 3, infill: 0.15 })`.
- `j.inspect.bbox(t)` ✓: the bounding box. Example: `j.inspect.bbox(part)`.
- `j.inspect.section(t, plane)` ✓: area, centroid, second moments, section moduli. Example: `j.inspect.section(block, j.plane.offset(j.plane.XY, mm(10)))`.
- `j.inspect.overhang(t, { dir, max })` ✓: faces past the overhang angle. Example: `j.inspect.overhang(part, { max: deg(45) })`.
- `j.inspect.bedContact(t, { dir })` ✓: area on the bed. Example: `j.inspect.bedContact(part)`.
- `j.inspect.distance(a, b)` ✓: distance between bodies or faces. Example: `j.inspect.distance(selA, selB)`.
- `j.inspect.mobility(asm)` ✓: Grübler–Kutzbach against the solver's DOF. Example: `j.inspect.mobility(asm)`.
- `j.inspect.snap(hook)` ✓: strain ε = 1.5·t·y/L² against the allowable. Example: `j.inspect.snap(hook)`.
- `j.inspect.gearMesh(a, b, { centreDistance, tolerance })` ✓: module, working pressure angle, centre distance (with profile shift), contact ratio, ratio and backlash; not ok when modules or pressure angles differ, helical hands are wrong or the contact ratio is under 1.1. Example: `j.inspect.gearMesh(g1, g2)`.

## Print

- `j.printer(name | { … })` ✓: `generic-fdm`, `mk4`, `mini`, `x1c`, `generic-msla`, or your own: `{ bed, nozzle, lw, layer, kind, maxOverhang, bridge }`. Example: `j.printer('x1c')` (lw 0.42 mm).
- `j.print(name, { printer, material, fit, parts })` ✓: a print job. Example: `j.print('cup', { printer: j.printer('mk4'), parts: [cup] })`.
- `.add(id, part, { qty, orient })` ✓: add parts. Example: `.add('bin', bin, { qty: 6 })`.
- `.orient('auto' | '+Y' | 'min-height' | 'max-contact' | fn)` ✓: build direction; auto is lexicographic: least support, most bed contact, least height. Example: `.orient('+Z')`.
- `.supports(false | { kind, angle })` ✓: support estimate. Example: `.supports({ kind: 'grid' })`.
- `.plates({ spacing })` ✓: skyline packing. Example: `.plates({ spacing: mm(5) })`.
- `.slice({ layer, walls, infill })` ✓: layers, cusp height, filament, print time. Example: `.slice({ layer: mm(0.2) })`.
- `.split(id, { fit: 'bed', by, joint })` ✓: split a part that does not fit; pieces `<id>.a`, `.b`. Example: `.split('tray', { fit: 'bed', joint: j.lib.dowel({ d: mm(4) }) })`.
- `.fit(p) .set .use .with` ✓: as for parts. Example: `.fit('mk4-petg')`.
- `.modifier .color .material(sel, m) .seam .brim .ironing` ◐ (recorded only): slicer settings. Example: `.brim(mm(5))`.
- `j.preset(name, b => b…)` ✓: a preset of your own: a function from builder to builder. Example: `.use(j.preset('house', b => b.material(j.material('PETG'))))`.
- `j.preset.production .functional` ◐ (set a flag only): strict mode; orient against load across layers. Example: `.use(j.preset.production)`.
- `j.preset.fdm .msla .printInPlace .iterate` ◐ (identity functions in this build: no bed chamfer is added). Example: `.use(j.preset.fdm)`.
- G-code ✗.

The orientation decision reads like `lexicographic: support 0 mm³ → bed contact 1765 mm² → height 45.0 mm (next: +Y, support 51 mm³)`. Orientation and teardrops form a fixpoint: the compiler iterates until the direction stops changing, at most four times (`fixpoint: converged in 2`). The [printing doc](lab:doc?id=printing) covers the defaults.

## Rules

- `j.rules(name, [...])` ✓: a rule set; later rules win by name. Example: `j.rules('mine', [j.rules.fdm, j.rule.bridge({ max: mm(6) })])`.
- `j.rules.fdm .msla .printInPlace` ✓: preset rule sets. Example: `.use(j.rules.fdm)`.
- `j.rule.overhang({ max })` `j.rule.bedFit()` `j.rule.minHole({ min })` `j.rule.minWall({ min })` `j.rule.holeOrientation({ horizontal })` `j.rule.firstLayer({ minArea })` ✓: checks that add `print.*` diagnostics; defaults 45°, the printer's bed, 1.0 mm, 0.9 mm, teardrops, 100 mm². Example: `j.rule.minWall({ min: lw(2) })`.
- `j.rule.custom(name, (prog, ctx) => diagnostics)` ✓: your own. Example: `j.rule.custom('ribs', p => [])`.
- `j.rule.bridge .minFeature .text` ◐ (no-ops). Example: `j.rule.bridge({ max: mm(10) })`.
- `j.check(prog, rules)` ✓: run rules on a compiled program. Example: `j.check(j.compile(part), j.rules.fdm)`.

## Assemblies and joints

- `j.assembly(name)` ✓: an assembly. Example: `j.assembly('clamshell')`.
- `.add(id, part, { at, ground, params })` ✓: a component. Example: `.add('base', base, { ground: true })`.
- `.joint(id, kind, 'a:port', 'b:port')` ✓ (joint ends must be ports): join two ports. Example: `.joint('h', j.joint.revolute(), 'base:hinge', 'lid:hinge')`.
- `.printInPlace(ids, { clearance, pose })` ✓: one print with fit-class gaps, in a pose. Example: `.printInPlace(['base', 'lid'], { pose: { h: deg(180) } })`.
- `.ground .interference .sweep .explode .params .configs .override .use .with` ✓: more assembly settings. Example: `.ground('base')`.
- `j.joint.rigid revolute slider cylindrical planar ball snap` ✓: joints with DOF 0, 1, 1, 2, 3, 3, 0. Example: `j.joint.revolute({ limits: [deg(0), deg(180)] })`.
- nested assemblies ✗.

## The Program and exports

`j.compile(model)` returns a Program. In a script you rarely need it; in the agent's eval and in `run` code you do.

- `j.compile(model, opts)` ✓: compile: `summary() metrics() metric(n) why(t) param(n) feature(id) faces(sel) sketch(id) ir(L, { node }) find(kind) body(id) genealogy(name)`. Example: `j.compile(part).metric('volume')`.
- `j.export.stl(prog, opts)` ✓: binary STL; the report gives the measured deviation and what was dropped. Example: `j.export.stl(prog)`.
- `j.export.tmf(prog, opts)` ✓: 3MF with units, plates, part names and settings. Example: `j.export.tmf(prog)`.
- `j.export.step(prog)` ✓: STEP AP242, exact B-rep. Example: `j.export.step(prog)`.
- `j.export.svg(prog, { view })` ✓: a preview drawing. Example: `j.export.svg(prog, { view: 'iso' })`.
- `j.export.ir(prog)` ✓: the IR bundle: manifest, trace, diagnostics, L0–L6. Example: `j.export.ir(prog)`.
- `j.export.to(format, prog, opts)` ✓: the generic form. Example: `j.export.to('stl', prog)`.
- `j.hash(x)` `j.diff(a, b)` `j.version` ✓: content hash; features added, changed, removed; the build. Example: `j.diff(a, b)`.

Every export returns `{ data, report }`, and the report says what was kept, approximated and dropped: an STL keeps the geometry, approximates the B-rep by a mesh and reports the largest deviation it measured (0.094 mm for the box of A-01, whose corners are 3 mm arcs), and drops units, names and colours; STEP keeps the exact B-rep and drops names, plates and slicer settings.

## Explore and laws

- `j.param.range(lo, hi, { step, default })` `.choice([...])` `.int(lo, hi)` `.dir()` ✓: the axes of a design space. Example: `j.param.range(mm(4), mm(8), { step: mm(1) })`.
- `j.design(params, p => model, { objective })` ✓: a design space: `at(point) defaults() sample(n, { seed }) fix({…}) where(pred) size`. Example: `j.design({ t }, p => hook(p.t))`.
- `j.objective.minimize(m) .maximize(m) .weighted({ … }) .lexicographic([...]) .require(rules)` ✓: orders on compiled points. Example: `j.objective.minimize('mass')`.
- `j.objective.pareto([...])` ◐ (ranks lexicographically; no front yet).
- `j.metric(name, prog => value, { dir, unit })` ✓: a metric of your own. Example: `j.metric('capacity', p => …)`.
- `j.evaluate(objective, prog)` ✓: score one program. Example: `j.evaluate(obj, prog)`.
- `j.search.grid(d, { objective, steps })` `j.search.random(d, { budget, seed })` ✓: search; results have `best ranked front stats table()`. Example: `await j.search.grid(space, { objective })`.
- `j.search.lhs(d, { budget, seed })` ◐ (draws plain uniform samples; no Latin stratification yet). Example: `await j.search.lhs(space, { budget: 9 })`.
- `j.stage(design)` ✓: finite params tabulated; mass as a closed form in one length. Example: `j.stage(d).residual.mass(mm(7))`.
- `j.laws.check(laws, { n, seed, only })` ✓: run property tests. Example: `j.laws.check(j.laws.suite, { n: 8 })`.
- `j.laws.suite` ✓: `extrude.volume revolve.volume brep.eulerPoincare compile.deterministic shape.boolean`. Example: `j.laws.suite`.
- `j.laws.for(model)` ✓: the suite on a model's fixtures. Example: `j.laws.for(part)`.
- `j.law(name, gen, prop, { justifies, source })` `j.structure(Sort, kind)` `j.gen.box .length .rect` ✓: your own laws and generators. Example: `j.structure(j.Quantity, 'vectorSpace')`.

## Not in this build

| name | what happens |
|---|---|
| `j.field.*` (signed distance fields, lattices) | throws `j.field.<name> is not supported by this kernel yet` |
| `j.mesh(…)` (mesh remixing) | throws |
| `j.load.*` (STL, STEP, SVG, images) | throws: put data files in the preset and read them from `data` |
| `.deleteFace` `.offsetFace` `.import` | `feature.unsupported` |
| `j.lib.gear.bevel` `j.lib.snap.annular` `j.lib.snap.torsion` `j.lib.bearing` | throws |
| G-code, `j.ingest`, `j.process`, `j.experiment`, `j.merge`, `j.remix` | not present |
