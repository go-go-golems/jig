---
part: V · Inside the solver
partAbout: How a constrained sketch becomes equations, how its freedom is counted, how the equations are solved, and how solved curves become profiles.
presets: A-03
docs: solver
---
# Constraints as equations

Chapter 3 treated the solver as a box that takes a sketch and returns a DOF, a status and a list of diagnostics. This chapter opens the box at its input. It lists the unknowns of each kind of entity, writes every constraint kind jig has as a residual function, defines the Jacobian and computes one by hand, and then explains the choices inside a residual that decide whether the solver and the rank count behave: components instead of a distance, signed instead of unsigned, normalised products, angles without a jump, and tangency where two curves already share a point. It ends with dimensions, whose values are expressions of params. By the end you can write down the equations jig builds for a small sketch, count them by kind, compute its Jacobian and check the rank against the IR, and recognise a residual form that will mislead the count.

## 11.1 Entities and their unknowns

A constrained sketch is compiled to a **parameter vector** $x$: every number that places an entity, in one array. The solver changes these numbers and nothing else. Each kind of entity has a fixed set:

| entity | made by | unknowns | count |
|---|---|---|--:|
| point | `.point` | x, y | 2 |
| line | `.line`, `.polyline`, `rect`, … | start (x, y), end (x, y) | 4 |
| circle | `.circle` | centre (x, y), radius r | 3 |
| arc | `.arc`, `fillet`, `slot` | centre, r, start angle a₀, end angle a₁ | 5 |
| ellipse | `.ellipse` | centre, rx, ry, rotation φ | 5 |
| spline | `.spline` | x, y of each control point | 2k |
| rigid frame | `.import` | x, y, rotation of a fixed shape | 3 |

Everything else a constraint names is a function of these. A line's `mid` is the mean of its ends; an arc's `start` is $c + r(\cos a_{0}, \sin a_{0})$, not a pair of unknowns. The choice is a design decision. Lines by their ends make the commonest constraints (joined ends, horizontal, vertical, fix) linear. An arc by centre, radius and angles cannot leave its circle, so it needs no equation to stay an arc, at the price of trigonometric joins; centre plus two end points (6 unknowns) and one equation keeping the ends equidistant has linear joins instead. Both have 5 degrees of freedom.

**External** geometry, projected or intersected from a body, has its parameters fixed: it enters equations as constants. In an explicit sketch every primitive's parameters are fixed, which is why chapter 3's drawing had $n = 0$. **Construction** geometry, `.construction(id)`, keeps its unknowns and equations and is only left out of the profiles.

```figure
// view: plan
return j.sketch('zoo', { on: j.plane.XY, mode: 'constrained' })
  .point('p', [0, 0])
  .line('l', [10, -5], [30, 5])
  .circle('c', 5, { at: [45, 0] })
  .arc('a', { center: [62, -4], start: [70, -4], end: [62, 4] })
  .ellipse('e', 8, 4, { at: [88, 0] })
  .spline('s', [[0, 20], [10, 28], [20, 20], [30, 28]])
  .import('r', [[45, 18], [60, 18], [60, 28], [45, 28]])
  .line('axis', [-5, 12], [100, 12])
  .construction('axis')
```

**Figure 11.1.** One entity of each kind, unconstrained, in constrained mode. The IR lists `p point 2 · l line 4 · c circle 3 · a arc 5 · e ellipse 5 · s spline 8 · r rigid 3 · axis line 4`, Σ 34: with no equations the rank is 0, the DOF 34, and every entity is its own cluster (8 of them). The dashed construction line has 4 unknowns and no profile; the profiles are the rectangle, ellipse and circle (150, 100.531 and 78.5398 mm²).

## 11.2 Constraints as residuals

A **residual** is a function $f(x)$ that is zero exactly when a relation holds. A constraint contributes one or more residuals, and the sketch becomes the system $F(x) = 0$ with $F$ from $n$ unknowns to $m$ equations. jig keeps every residual in millimetres or radians, so one tolerance means the same everywhere: the solver stops when every residual is below 10⁻¹⁰.

The tables below list every constraint kind of `j.c` and the residuals it adds, from `src/engine/sketch/constraints.js`. Notation: points $p$ and $q$; a line $l$ from $a$ to $b$ with direction $u = b - a$; a second line with direction $v$; the 2D cross product $u \times v = u_{1}v_{2} - u_{2}v_{1}$; and the **signed distance** of a point from a line, $s(p, l) = u \times (p - a) / ‖u‖$, positive on the left. A sign $σ = ±1$ is fixed once from the drawing, as section 11.4 explains. Each count was checked by compiling the constraint on a test sketch and reading the equation count in the IR.

**Incidence.** Where things are relative to each other.

| constraint | applies to | residuals | equations |
|---|---|---|--:|
| `coincident` | two points | $p - q$, both components | 2 |
| `coincident` | point and curve | as `on` | 1 |
| `coincident` | two circles or arcs | centres, then $r_{1} - r_{2}$ | 3 |
| `on` | point, line | $s(p, l)$ | 1 |
| `on` | point, circle or arc | $‖p - c‖ - r$ | 1 |
| `on` | point, ellipse | scaled $‖(u/rx, v/ry)‖ - 1$ in the ellipse's frame | 1 |
| `midpoint` | point, line or arc | $p$ minus the midpoint | 2 |
| `concentric` | circles, arcs, points | $c_{1} - c_{2}$ | 2 |
| `collinear` | two lines | $s$ of both ends of the second from the first | 2 |
| `symmetric` | two points, line axis | projection of $q - p$ on the axis; $s$ of the midpoint | 2 |
| `symmetric` | two points, point axis | $p + q - 2o$ | 2 |
| `symmetric` | two lines; two circles | end by end; centres and radii | 4; 3 |
| `fix` | point, line, circle, arc, ellipse | each unknown minus its drawn value | 2, 4, 3, 5, 5 |

**Orientation.** Directions, independent of position.

| constraint | applies to | residual | equations |
|---|---|---|--:|
| `horizontal` | a line, or two points | $y_{2} - y_{1}$ | 1 |
| `vertical` | a line, or two points | $x_{2} - x_{1}$ | 1 |
| `parallel` | two lines | $(u \times v)/(‖u‖‖v‖)$, the sine of the angle | 1 |
| `perpendicular` | two lines | $(u \cdot v)/(‖u‖‖v‖)$, the cosine | 1 |
| `angle` | two lines | angle from atan2, minus a target, wrapped to (−π, π] | 1 |

**Metric.** Sizes; each takes a value $d$.

| constraint | applies to | residual | equations |
|---|---|---|--:|
| `distance` | two points | $‖p - q‖ - d$ | 1 |
| `distance` | point and line; line and circle | $σ s - d$ (for the circle, $s$ of its centre) | 1 |
| `distance` | two lines | $σ s$ of the second line's midpoint, minus $d$ | 1 |
| `distance` | point and circle | $σ(‖p - c‖ - r) - d$ | 1 |
| `distance` | two circles | $‖c_{1} - c_{2}‖ - d$ | 1 |
| `distanceX`, `distanceY` | two points | $σ$ times the difference in x (or y), minus $d$ | 1 |
| `length` | line; arc | $‖u‖ - d$; $r$ times the sweep, minus $d$ | 1 |
| `radius`, `diameter` | circle or arc | $r - d$; $2r - d$ | 1 |
| `equal` | lines; circles or arcs; ellipses | $‖u‖ - ‖v‖$; $r_{1} - r_{2}$; both radii | 1; 1; 2 |

**Tangency.**

| constraint | applies to | residual | equations |
|---|---|---|--:|
| `tangent` | line, circle or arc | $σ s(c, l) - r$ | 1 |
| `tangent` | two circles or arcs | $‖c_{1} - c_{2}‖ - (r_{1} + r_{2})$, or $‖c_{1} - c_{2}‖ - σ(r_{1} - r_{2})$ | 1 |
| `tangent` | line and arc sharing an end $p$ | $u \cdot (p - c)/(‖u‖‖p - c‖)$ | 1 |
| `tangent` | two arcs sharing an end $p$ | $(p - c_{1}) \times (p - c_{2})$, normalised | 1 |
| `tangent` | two lines; spline end | as `parallel`; the end tangent against the line or radius | 1 |

Helpers, mirrors, patterns and offsets add internal kinds (`coord`, `mapPoint`, `mirrorAngle`, `scalarRel`, `offsetLine`, `offsetCirc`) of the same shape. Two details matter in practice: `on` an arc means on its whole circle, not between its ends; and a distance between two lines is measured from the second line's midpoint, so it is meaningful for parallel lines.

## 11.3 The Jacobian

The **Jacobian** $J$ of $F$ is the $m \times n$ matrix of first derivatives, $J_{ij} = \partial f_{i} / \partial x_{j}$. A **row** is the gradient of one residual: the direction in parameter space along which that residual changes fastest. To first order, a small change $δx$ keeps every constraint satisfied exactly when $J δx = 0$. A **column** belongs to one unknown and shows which equations it enters. Most entries are zero: `horizontal` reads 2 of its line's 4 unknowns.

Take the smallest sketch that has every ingredient: two lines joined at a corner, the first fixed at the origin and horizontal, the second perpendicular to it, with lengths 40 and 30 mm.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('L', { on: j.plane.XY })
  .line('l1', [0, 0], [40, 0])
  .line('l2', 'l1.end', [40, 30])
  .constrain(j.c.fix('l1.start'), j.c.horizontal('l1'),
    j.c.perpendicular('l1', 'l2'))
  .dim('l1', 40).dim('l2', 30)
```

**Figure 11.2.** The worked example: $n = 8$ unknowns, 8 equations (`coincident (2) · fix (2) · horizontal (1) · perpendicular (1) · length×2 (2)`), rank 8, 0 DOF, status `fully`.

Name the ends $P_{1} = (x_{1}, y_{1})$ and $P_{2} = (x_{2}, y_{2})$ for `l1`, $P_{3}$ and $P_{4}$ for `l2`. Writing `'l1.end'` as the start of `l2` adds the coincidence $P_{3} - P_{2} = 0$. Each linear residual has constant derivatives: the coincidence gives −1 and +1, `fix` gives 1, `horizontal` gives $∂(y_{2} - y_{1})$, and a length $‖u‖ - d$ has gradient $±u/‖u‖$, the unit direction, which is $(±1, 0)$ for `l1` and $(0, ±1)$ for `l2`. The one interesting row is the perpendicularity $g = u \cdot v/(‖u‖‖v‖)$ with $u = P_{2} - P_{1} = (40, 0)$ and $v = P_{4} - P_{3} = (0, 30)$. At the solution $u \cdot v = 0$, so the derivative of the denominator multiplies zero and only $∂(u \cdot v)/(‖u‖‖v‖)$ survives: $∂g/∂P_{2} = v/1200 = (0, 1/40)$, $∂g/∂P_{1} = (0, -1/40)$, $∂g/∂P_{4} = u/1200 = (1/30, 0)$ and $∂g/∂P_{3} = (-1/30, 0)$. The whole matrix:

| equation | x₁ | y₁ | x₂ | y₂ | x₃ | y₃ | x₄ | y₄ |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| coincident, x | 0 | 0 | −1 | 0 | 1 | 0 | 0 | 0 |
| coincident, y | 0 | 0 | 0 | −1 | 0 | 1 | 0 | 0 |
| fix, x | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fix, y | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| horizontal(l1) | 0 | −1 | 0 | 1 | 0 | 0 | 0 | 0 |
| perpendicular | 0 | −1/40 | 0 | 1/40 | −1/30 | 0 | 1/30 | 0 |
| length(l1) | −1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| length(l2) | 0 | 0 | 0 | 0 | 0 | −1 | 0 | 1 |

Taken in a good order, each row introduces one new unknown: $x_{1}$ (fix), $y_{1}$ (fix), $x_{2}$ (length), $y_{2}$ (horizontal), $x_{3}$ and $y_{3}$ (coincidence), $x_{4}$ (perpendicular), $y_{4}$ (length). The matrix is triangular after reordering, so its rank is 8 and its determinant is ±1/30, the one entry that is not ±1. The IR agrees: rank 8, DOF 0. The Jacobian jig computed for this sketch matches the table to 4.5 × 10⁻¹¹ in every entry.

jig does not differentiate the residuals symbolically. It estimates each nonzero entry by the five-point **central difference**

$$
\frac{\partial f}{\partial x_{j}} \approx \frac{8(f(x + h e_{j}) - f(x - h e_{j})) - (f(x + 2h e_{j}) - f(x - 2h e_{j}))}{12h} ,
$$

with $h = 10^{-4} \max(1, |x_{j}|)$. The formula is exact for polynomials up to degree 4; for a smooth $f$ its truncation error is $h^{4} f^{(5)}/30$. Rounding adds an error of order $ε‖x‖/h$, where $ε \approx 1.1 \times 10^{-16}$ is the machine precision, because $f$ is computed from coordinates of size $‖x‖$. $10^{-4}$ balances the two for features of a millimetre or more near the origin. Measured against the analytic gradients of a length and a parallel residual on a 50 mm line at the origin, the errors are 5.3 × 10⁻¹¹ and 6.8 × 10⁻¹³. Because $h$ grows with $|x_{j}|$ rather than with the size of the feature, small features far from the origin fare worse: a 1 mm line at (1000, 1000) mm has errors of 2.1 × 10⁻⁵ and 8.9 × 10⁻⁵, and at (10000, 10000) mm, where $h$ is as long as the line, the estimate is wrong in its first digit. Printed parts are sketched within a few hundred millimetres of the origin, where this does not show.

The alternatives are analytic derivatives, written by hand per residual, and **automatic differentiation**, which applies the chain rule to the operations a program performs and is exact to rounding: forward mode costs a few evaluations of $f$ per unknown, reverse mode a few per residual. Finite differences cost 4 evaluations per nonzero entry, negligible for residuals of at most ten unknowns, and a new constraint kind needs only its residual. The price is the accuracy just measured, and blindness to kinks: where $f$ is not differentiable the quotient returns a number anyway, as the next section shows.

## 11.4 Designing a residual

One relation has many residuals with the same zero set. They differ in their gradients, which are what the solver and the rank count see.

**Coincidence by components.** "$p$ and $q$ coincide" could be one equation, $‖p - q‖ = 0$. Its gradient is $(p - q)/‖p - q‖$: a unit vector that turns as $q$ circles $p$, and undefined at the solution. A difference quotient there is no derivative: for a step $h$ much larger than the leftover gap $δ$, the five-point formula returns about $1.17δ/h$, a number set by the step, not by the geometry, and exactly 0 when $δ = 0$. Either way the row says the equation removes almost nothing, and one equation could not remove two degrees of freedom to first order anyway. jig writes coincidence as two equations, $p - q = 0$ by components, whose gradients are constant, and it rewrites a zero point-to-point distance the same way.

```sketch
// title: A coincidence written as a distance
// Read the IR: distance (2), not (1). Make it 0.5 mm and read it again.
return j.sketch('pts', { on: j.plane.XY })
  .point('a', [0, 0])
  .point('b', [10, 5])
  .constrain(j.c.fix('a'), j.c.distance('b', 'a', 0))
```

Compiled, it reports `fix (2) · distance (2)`, rank 4, 0 DOF, and solves in 3 iterations, exactly as `coincident('b', 'a')` does.

**Signed distances choose a side.** The distance from a point to a line, $|s(p, l)| = d$, has two solutions, one on each side, and the absolute value has a kink between them. jig uses $σ s(p, l) - d$ with $σ$ the sign of $s$ in the drawing: smooth, one branch, the one drawn. The same device fixes the side of a tangent line, the direction of `distanceX` and `distanceY`, and, for two circles, whether a tangency is external, $‖c_{1} - c_{2}‖ = r_{1} + r_{2}$, or internal, $‖c_{1} - c_{2}‖ = |r_{1} - r_{2}|$: jig takes whichever the drawn centre distance is closer to. A point-to-point distance needs no sign, because for $d > 0$ the solution stays away from the kink at zero.

```figure
// view: plan
// overlays: dims
return j.sketch('tangents', { on: j.plane.XY })
  .circle('c1', 10, { at: [0, 0] })
  .circle('c2', 6, { at: [18, 3] })
  .circle('c3', 10, { at: [50, 0] })
  .circle('c4', 6, { at: [52, 1] })
  .constrain(
    j.c.fix('c1.center'), j.c.fix('c3.center'),
    j.c.horizontal('c1.center', 'c2.center'),
    j.c.horizontal('c3.center', 'c4.center'),
    j.c.tangent('c1', 'c2'), j.c.tangent('c3', 'c4'))
  .dim('c1', 20).dim('c2', 12).dim('c3', 20).dim('c4', 12)
```

**Figure 11.3.** Two pairs with the same constraints, drawn differently. `c2`, drawn outside `c1`, solves to an external tangency with its centre at (16, 0); `c4`, drawn inside `c3`, to an internal one at (54, 0). Two clusters, rank 12, 0 DOF, 2 iterations each.

**Cross and dot products, normalised.** `parallel` is $\sin θ$ and `perpendicular` is $\cos θ$ of the angle $θ$ between the lines, each computed as a product divided by both lengths. Without the division the residual would be in mm², its gradient would grow with the lengths, and a line could satisfy it by shrinking to nothing, since $u \times v = 0$ when $u = 0$. The normalised form is dimensionless and has no such solution. It also conditions the Jacobian better. The **condition number** of $J$, the ratio of its largest to its smallest singular value, measures how much the solution of a linearised step can amplify errors. For Figure 11.2 it is 56.5; with the unnormalised $u \cdot v$ in the perpendicular row it would be 212.9. The smallest singular value, 0.0333, comes from the perpendicular row, whose entries are $1/L$: angle rows of long lines are small next to length rows.

**Each form where it is steep.** $\sin θ$ is steepest at $θ = 0$, where `parallel` is solved; $\cos θ$ at 90°, where `perpendicular` is solved. For a general angle either would fail somewhere: $\cos θ - \cos θ_{t}$ has zero derivative at $θ_{t} = 0$, a coincidence-like degeneracy. The general `angle` residual uses the angle itself, $\operatorname{atan2}(u \times v, u \cdot v) - θ_{t}$, whose derivative with respect to the angle is 1 everywhere. atan2 jumps by 2π at ±π, so the difference is wrapped into (−π, π]; the jump then sits where the residual is ±π, as far from the solution as possible. An angle between two lines is unoriented, so the target $θ_{t}$ is chosen once among $θ$, $-θ$, $π - θ$ and $θ - π$, whichever is nearest the drawing.

**Tangency where curves meet.** When a line and an arc already share an end, the distance form of tangency, $σ s(c, l) - r$, is the wrong equation. With the end on the arc, the distance from the centre to the line is at most $r$, with equality exactly at tangency: tangency is a maximum, so the residual's gradient along every motion that keeps the shared end is zero. Its row therefore lies in the span of the coincidence rows. For a line from (0, 0) to (20, 0), fixed, and an arc of radius 10 centred at (20, 10) starting at the line's end:

| tangency row | l.ay | l.by | a.cy | a.r | a.a0 | rank (of 9) |
|---|--:|--:|--:|--:|--:|--:|
| distance form $σ s(c, l) - r$ | 0 | −1 | 1 | −1 | 0 | 7 |
| jig's form $u \cdot (p - c)/(‖u‖‖p - c‖)$ | 0.05 | −0.05 | 0 | 0 | 1 | 8 |

The distance row is identical to the y-row of the coincidence (the arc's start, $c + r(\cos a_{0}, \sin a_{0})$ at $a_{0} = -π/2$, minus the line's end). jig finds the shared end through the coincidences and uses the angle form, "the radius at the shared point is perpendicular to the line": rank 8, DOF 1 (the arc's sweep). Rounded rectangles, slots and sketch fillets rely on it.

## 11.5 Dimensions: driving and driven

A **dimension** is a constraint with a value. `.dim(target, value)` picks the kind from the target: a line gets a `length`, a circle a `diameter`, an arc a `radius`; two lines get an `angle` for an angle value, a `distance` for a length, and otherwise whichever the drawing suggests (a distance if they are parallel); other pairs get a `distance`; `{ h: [a, b] }` and `{ v: [a, b] }` get `distanceX` and `distanceY`. The value can be a number, a quantity, or an expression of params such as `'w'` or `'d / 2'`, resolved through the part's params when the sketch is built. A coordinate written as an expression, `['w', 0]`, becomes a `coord` equation, $x = w$, so it drives the geometry in a constrained sketch instead of being a starting guess.

A **driving** dimension adds an equation whose constant is the value. A param changes the constant, not the form of the residual, so the Jacobian keeps its structure, and the compile starts from the sketch's last solution (the warm start of the [solver page](lab:doc/solver)), which keeps the drawn branch. The plate of [A-03](lab:preset/A-03) has 22 unknowns and these equations, as the IR prints them:

```text
coincident×4 (8) · fix (2) · horizontal×2 (2) · vertical×2 (2) · equal (1)
· length×2 (2) · diameter (1) · distanceX (1) · distanceY×2 (2)   Σ 21
rank 21 · dof 1 · status under
```

The holes are drawn at 4 mm and dimensioned `hole_d` = 4.5 mm; a diameter residual is linear, so the solve takes 1 iteration and ends at a residual of 6 × 10⁻¹⁴. The free DOF is `h2 (1: center.x)`, left on purpose.

A **driven** dimension, `.dim(target, null)` or `{ driven: true }`, adds no equation. It is measured after the solve and reported with the solution. Measurements are unsigned, and an angle is measured between the two lines' direction vectors, from 0° to 180°. At a polyline corner, where one line arrives and the next leaves, that is the exterior angle: a driven angle at a 30° corner of a triangle reads 150°. A driving angle accepts either value, since its target comes from the drawing.

> **Try it.** [Load A-03](lab:preset/A-03), [show the IR](lab:show/ir) and find the sketch `outline` at level L3: it prints the unknowns per entity and the equations per kind above. Then [make the plate 120 mm wide](lab:param/w=120): the counts and the rank stay; only the coordinates change.

## 11.6 What jig does and does not do

jig turns each constraint into the residuals of section 11.2 over the unknowns of section 11.1, in millimetres and radians, normalises products of directions, takes signs and branches from the drawing, uses an angle form for tangency at shared ends, and differentiates by five-point central differences.

It does not differentiate analytically or automatically, so its Jacobian carries the errors of section 11.3, with a step relative to each coordinate rather than to the sketch. It has no inequality constraints (a length of at least 3 mm), no constraint kinds a script can define, no 3D sketch constraints and no points on splines. Apart from the zero distance of section 11.4 it does not rewrite degenerate requests. Signs are chosen once per compile, so a drawing on the wrong side keeps that side; chapter 13 treats branches.

## 11.7 Key points

- Unknowns: point 2, line 4, circle 3, arc 5, ellipse 5, spline 2 per control point, rigid frame 3. External geometry is fixed; construction geometry has unknowns but no profile.
- Every constraint is one or more residuals in mm or radians; coincidence of two points is 2, a dimension 1, a fixed arc 5.
- A row of the Jacobian is one residual's gradient; $J δx = 0$ are the first-order motions that keep every constraint.
- jig estimates $J$ by five-point central differences with $h = 10^{-4} \max(1, |x|)$: errors near 10⁻¹¹ at mm scale near the origin, worse for small features far from it.
- A good residual has a gradient that is defined and nonzero at the solution: components, not a distance, for coincidence; signed distances; normalised sines and cosines where they are steep; atan2 for general angles; an angle form for tangency at a shared end.
- Dimensions are driving equations whose constants are expressions of params; driven dimensions add no equation and are measured after the solve.

## Exercises

> **Exercise.** Write the sketch of Figure 11.2 and remove `.dim('l1', 40)`. Predict the rank and the DOF, check them in the IR, and find by hand a vector $δx$ with $J δx = 0$ using the table of section 11.3 without its `length(l1)` row.

> **Exercise.** In the workbench, draw a line and an arc that share an end, constrain them tangent, and read the rank. Then give the arc its own start point a few millimetres away and add `j.c.on('a.start', 'l')`: which tangency form does jig use now, and does the rank change?

> **Exercise.** Show that the five-point formula of section 11.3 is exact for $x^{4}$, and predict its error for $x^{5}$ at $x = 1$ with $h = 10^{-4}$.

> **Exercise.** Add a driven angle `.dim(['t.3', 't.1'], null)` at a 30° corner of a triangle in the workbench and read its value. Explain the number from the directions of the two lines.

## Further reading

- Sutherland, *Sketchpad: A Man-Machine Graphical Communication System*, PhD thesis, MIT, 1963: the first interactive drawing program with geometric constraints, satisfied numerically.
- Light and Gossard, *Modification of geometric models through variational geometry*, Computer-Aided Design 14(4), 1982: dimensions as a system of equations solved together by Newton's method, the idea behind variational sketchers.
- Hoffmann and Joan-Arinyo, *A brief on constraint solving*, Computer-Aided Design and Applications 2(5), 2005: a survey of numerical, symbolic and graph-based approaches to geometric constraints.
- Nocedal and Wright, *Numerical Optimization*, 2nd edition, Springer, 2006: finite-difference derivatives and their errors, and the least-squares methods of chapter 13.
- Griewank and Walther, *Evaluating Derivatives: Principles and Techniques of Algorithmic Differentiation*, 2nd edition, SIAM, 2008: forward and reverse automatic differentiation and what each costs.
