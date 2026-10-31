# jigcad core API (owner: core)

Pure ES modules, no dependencies, no OpenCascade. Millimetres and radians internally.
Import from `src/engine/core.js` (re-exports every module below). Tests: `node test/engine-core/run.mjs`.

| Module | Main exports |
|---|---|
| `units.js` | `Quantity Toleranced DimensionError AffineError q coerce toQuantity isQuantity dimsKind units BARE_NAMES UNIT_TABLE DEFAULT_CTX resolveCtx parseUnit fmtNum describe rates` + `mm cm m um inch ft deg rad turn kg gram N kN MPa GPa s minute hour degC usd eur lw layer nozzle bbox` |
| `expr.js` | `Expr expr ref ExprError parseExpr deps evaluate printExpr` |
| `params.js` | `resolveAll paramLayers paramRows paramInfo explainParam activeConfig configNames table exposeMeta Literal ParamCycleError codeOf` |
| `geom.js` | `Point Vec Dir Transform Frame Axis Deferred IDENTITY pt vec dir origin tx plane axis frame point resolveDatum isDeferred toVec3 asPoint asAxis asPlane asFrame` |
| `pattern.js` | `Pattern pattern` |
| `sketch/index.js` | `Sketch sketch ProfileSet Sketch3D sketch3d keyOf c solver SolvedSketch` |
| `core.js` | all of the above + `makeJCore() bareNames() buildProfiles System SOLVER_METHODS` |

`makeJCore()` → `{ q units coerce Quantity Toleranced expr ref table lit param:{expose} pt vec dir origin tx plane axis frame point pattern sketch sketch3d c solver Point Vec Dir Transform Frame Axis Pattern Sketch Expr DimensionError AffineError ParamCycleError ExprError bare }` (`bare` = the README §10 unit constructors for script scope).

## Units
- `mm(3)` etc. → frozen `Quantity`. Canonical: L mm, M g, T s, Θ K-difference, angle rad, money usd (`units.rates.eur` = usd per eur, default 1.08, settable).
- `.value` canonical number (symbolic/lazy resolve with defaults lw 0.45, layer 0.2, nozzle 0.4, bboxDiag 100 mm); `.dims` sparse `{ L: 2 }`; `.unit`; `.isSymbolic`; `.isLazy`; `.key()`.
- `add sub mul div neg abs min max clamp pow sqrt to(unit) in(unit)→number resolve(ctx) gt gte lt lte eq(b, tol?) pm(t) tol(lo, hi) toString() toJSON()`. Bare numbers mix only with dimensionless quantities in `add/sub`.
- Symbolic: `lw(3).add(mm(0.1))` → `'3lw + 0.1mm'`; `resolve({ lw, layer, nozzle, bboxDiag })` (Quantities or mm numbers). sym × sym and min/max of symbolic values are lazy (still resolvable).
- `q('1/4 in + 2 mm' | 25 | ctx => …)`; `q.sqrt q.sin q.cos q.tan q.asin q.acos q.atan2 q.min q.max`.
- `coerce(x, 'length'|'angle'|'number'|'any', scope?)`: numbers → mm / **degrees** / plain; strings → evaluated with `scope` (object or `name => value`) or returned as `Expr` when no scope.

## Expressions
`parseExpr(text)` (cached AST) · `deps(ast|text)` (sorted free names) · `evaluate(ast|text, scope)` → Quantity | number. Units after numbers (`2 mm`, `1/4 in` = (1/4) in, `25 mm^2`, `1.24 g/cm^3`, `30°`), names may contain dots (`gap.slide`), functions `min max abs sqrt sin cos tan asin acos atan atan2 floor ceil round clamp hypot pow lerp`, constant `pi`. Errors: `ExprError { column, kind: 'expr.syntax' | 'param.unknown' }`, `DimensionError { column }` with message `"'w - count': cannot subtract 1 (dimensionless) from mm (L¹)"`.

## Parameters
```js
const layers = paramLayers({ defaults, params: [obj, …], configs /* {S:{…}} | table() */, config /* name | null → middle row */, overrides: [obj, …], compileOverride, point })
const res = resolveAll(layers, printerCtx, { exposed: exposeMeta(names, { labels, ranges, steps }), lookup: name => value /* e.g. gap.<class> */ })
// res = { values: { name: Quantity|number|string }, info: { name: { value, text, raw, expr, src, shadowed:[{src,value,code}], deps, via, level, kind, exposed } },
//         order, levels, declOrder, failed, diagnostics, ok }
paramRows(res)          // ProgramData rows { name, value (mm | deg | display unit), unit, text, expr, src, deps, exposed, canonical, kind, raw, shadowed, via, level }
paramInfo(name, res)    // prog.param(name) shape { value, expr, src, deps, shadowed?, via? }
explainParam(name, res) // 'inner_w = w − 2·wall = 120 mm − 2·2 mm = 116 mm; w from configs.tray-3 (table row 2), wall from override'
```
Layer srcs: `default params configs.<name> | configs.<name> (table row k) override compile.override point`. Values may be Quantity, number, boolean, expression string, `Expr`, `Literal`, or `ctx => value` (`ctx.p.<name>` reads params, `ctx.lw` etc.). Never throws: diagnostics `param.cycle` (message `'wall → floor → wall'`, `path`, `fix`), `units.dimension`, `param.unknown`, `expr.syntax`.

## Geometry
- `pt vec dir('+Z' | x,y,z) origin`; `p.add(v) p.sub(q|v) p.lerp v.dot→Quantity v.cross v.norm()→Quantity v.unit()→Dir angleTo→Quantity`; `p.add(p)` throws `AffineError`.
- `Transform` (`m`: Float64Array(16), column-major): `tx.identity move rotate(axis, angle) mirror(plane | axis) scale(k | [3], { about }) align(from, to) matrix(arr)`; `t.then(u)` = first t then u; `inverse pow(n) apply(Point|Vec|Dir|Frame|Axis|[x,y(,z)]) det eq isIdentity translation toArray key toString`.
- `Frame { origin, x, y, z }` (planes are frames; `.normal` = z): `offset flip rotate moved toTransform toPlaneData() → {origin,x,y,normal} toWorld([u,v]) toLocal key`. `plane.XY/XZ/YZ` follow replicad (XZ normal −Y, y = +Z; YZ x = +Y). `plane.offset angle through mid(frames) on mid normalTo`, `axis.X/Y/Z through of`, `frame({ origin, x, z })`, `frame.on(sel, { flip })`, `point.center/on`.
- `Deferred { kind: 'deferred', type, op, args, chain }` for topology (`on of mid normalTo center frame.on point.on`) and for parameter-valued datums (`plane.offset(p, 'floor')`, `pt('w/2', 0, 0)`). `resolveDatum(d, { scope, resolve(op, args, type) })`.

## Patterns
`pattern.linear(dir, { count, step | extent }) circular(axis, { count, angle }) grid(dA, dB, { count:[a,b], step:[sa,sb] }) hex(plane, { pitch, rings | count:[a,b] }) path(sel, { count, align }) mirror(planeOrAxis) points(pts)`; `times filter skip vary`; `count closed eq`.
`p.expand(ctx)` → `{ instances: [{ index, tx, at, params }], count, total, filtered, skipped, deduped, decisions, diagnostics, deferred }`; `p.instances(ctx)` = the list. ctx: `{ scope, base: Point, samples: [[x,y,z]…] (feature points: dedupe by symmetry), path: { at(t) → { point, tangent }, closed }, at: featureId, dedupe: false }`. Dedupe decision: `{ at, kind: 'pattern.dedupe', chose, alternatives: [N], reason }`.

## Sketches
Builder per README §4.5 (immutable). Conventions:
- **Mode** (`j.sketch(id, { on, mode })`, integrator's rule). Default: a sketch with no `.constrain()` and no `.dim()` is **explicit**: the parameters of entities made by `point line polyline arc circle ellipse spline text import` (and trim splits) are fixed (not constraints, not user constraints) → DOF 0, `'fully'`, no warning. Any constraint or dimension makes the whole sketch **constrained** (example 04: numbers are starting positions). `mode: 'explicit' | 'constrained'` overrides. Decision `{ at: <sketch id>, kind: 'sketch.mode', chose, alternatives: [other], reason }` ('no constraints: coordinates are fixed' / 'constraints or dimensions given: coordinates are starting positions' / "set by { mode: '…' }"). `sk.mode` → `{ mode, reason }`.
- **Primitives** in constrained mode: numbers are initial positions (no constraints); string refs (`'l1.end'`) add coincidences; **expression strings** in coordinates or radii are driving dimensions.
- **Helpers** (`rect polygon slot`, `fillet chamfer`, offset/mirror/pattern copies) add entities *and* constraints for every dimension given, in both modes (so they are fixed in explicit mode too); position is pinned by `at`/`center` (rect default: bottom-left at the origin).
- Ids: rect `r` → `r.bottom r.right r.top r.left`, corners `r.bl r.br r.tr r.tl` (points; corner arcs when `r:` is given), `r.center`; polygon `p` → `p.1…p.n p.center p.circle`; slot `s` → `s.l1 s.l2 s.a1 s.a2`, centres `s.a s.b`; polyline `p` → `p.1…`; mirror copy `<src>.m`; pattern copy `<src>.p<index>`; fillet/chamfer `f` + `f.corner`; offset `o.1…`, open-path caps `o.cap…`; trim split `<id>.2`. Refs: `id`, `id.start|end|mid|center`, `sp.p<k>`, `id#param`, `origin`, `X`, `Y`, `[x, y]`.
- `c.coincident horizontal vertical parallel perpendicular tangent equal symmetric midpoint concentric collinear on fix distance distanceX distanceY angle radius diameter length` (all accept `{ id }`). `.dim(target, value, { driven })`: `'l1'` length, circle diameter, arc radius, `[a, b]` distance or angle (by type/value), `{ h: [a, b] }`, `{ v: [a, b] }`; value Quantity | number (mm/deg) | expression | null+driven.
- `.solver(undefined | 'dogleg' | 'lm' | 'newton' | solver.lm({ maxIter }) | { maxIter } | (cluster, ctx) => ctx.default | strategy)`; cluster has `has(kind) entities cols n m`. `.strict()`.

**Solving** (kernel): `const solved = sk.solve(env)` with `env = { scope: res.values, ctx: printerCtx, plane: resolvedFrame /* when sk.on is a selector or Deferred */, external: (id, op, args) => curves /* project | intersect | text */, warm: previousSolved }`. Cached per env object and per (scope object, plane, ctx). `sk.key()` is a stable cache key; `sk.on` is the plane slot as given.

`SolvedSketch`: `dof status ('fully'|'under'|'over') rank n conflicts redundant diagnostics decisions point(ref) entityData() constraintData() profiles() profile(pick) wire(ids) drag(ref, [x, y]) toSketchData() ir()`.
- `drag` re-solves only the ref's cluster from the current solution (least-change step, constraints kept) → new `SolvedSketch` with `moved`, `fixed`, `dragInfo`.
- Profiles (regions): `{ kind: 'region', id: 'outer∖{hole, window}', area: Quantity mm², areaValue, holes, loops: [[[x,y]…]] (outer CCW, holes CW, arcs sampled ≤ 6°/0.05 mm chord), segments: per loop exact `{kind:'line',a,b,src} | {kind:'arc',c,r,a0,a1,ccw,a,b,src} (a1 = a0 ± sweep, midpoint at (a0+a1)/2) | {kind:'circle',c,r,ccw,src} | {kind:'ellipse',c,rx,ry,angle,src} | {kind:'spline',pts,fit,degree,closed,src}`, srcs, outerSrcs, contains([x,y]) }` in sketch-plane coordinates. Construction geometry is excluded; every bounded face of the arrangement is a profile when its nesting depth is odd.
- `ProfileSet` (from `sk.profiles()/profile(pick)/wire(ids)`, usable before compile): `{ kind: 'profiles'|'wire', sketch, pick, ids, resolve(env) → { profiles | wire, solved } }`.
- `toSketchData()` = BUILD.md SketchData + `rank n redundant clusters diagnostics`, entities carry `dof dofFree group external line`, ellipses/imports come as `kind: 'spline'` with `shape`, `pts`; constraints carry `value` (mm or deg), `unit`, `text`, `expr` (the expression the value came from, `'w'`, `'d / 2'`, or null for a literal), `axis` ('x'|'y', coord only), `src` ('implicit'|'helper'|'user'), `status` ('ok'|'redundant'|'conflict'), `impliedBy`, `line`; profiles carry `id` and `segments`.
- **Lines.** Every builder op and every `c.*` value records its script.js line (`src/engine/callsite.js`, shared with the kernel; a non-enumerable `line`, so keys and caches ignore it). `line` on an entity is its op's; on a constraint, its own `c.*` line inside `.constrain(…)`, else its op's (`.dim`, the helper call for helper constraints, the entity's call for implicit ones). `solved.lineOf(rec)`; `solved.withSketch(sk)` reads the same solution through another builder with the same key (a feature cached across compiles), so lines follow the new script.

Diagnostics (`at` = sketch id): `sketch.underConstrained` (warning; error with `.strict()`; `fix` lists free entities), `sketch.redundant` (warning, `'parallel(l1, l2) is implied by …; dropped'`), `sketch.overConstrained` (error, minimal conflicting set, `conflict: [ids]`, fix suggests a driven dim with its measured value), `sketch.unsolved`, `sketch.ref`, `sketch.unsupported`, `sketch.op`. Decisions: `{ at: '<sketch>/cluster<k>', kind: 'solver', chose, alternatives, reason }`, `sketch.offset`, `pattern.dedupe`.

`sketch3d(id).line/polyline/spline/helix({ axis, pitch, turns, r })` → `items: [{ id, kind, pts: [[x,y,z]…], helix? }]`, `toData()`.
