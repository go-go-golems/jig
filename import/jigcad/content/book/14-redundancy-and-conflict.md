---
part: V · Inside the solver
presets: A-03
docs: solver
---
# Redundancy and conflict

A constraint whose equations add no rank either agrees with the others or contradicts them. Chapter 3 showed both cases and the messages jig prints; this chapter explains how those messages are computed. It shows how dependent rows of the Jacobian are found one at a time, how a dependent row is written as a combination of earlier rows to name the constraints it repeats, what a least-squares solve reveals about an inconsistent system, and how a deletion filter shrinks a conflict to a minimal set, at what cost and relative to what. It ends with the case between the two: a sketch that is solvable, but only barely. By the end you can predict which of two equivalent constraints jig calls redundant, read a conflicting set as a dependency among equations, estimate what a conflict search costs, and recognise a sketch whose solution moves a lot when a dimension moves a little.

## 14.1 Two kinds of dependence

At a point $x$, the rows of the Jacobian $J$ are **dependent** when some nonzero vector $w$ gives $w^T J = 0$: a weighted sum of the equations' gradients cancels. For a linear system $A x = b$ the consequence is classical. The system is solvable exactly when $\operatorname{rank} A = \operatorname{rank} [A \mid b]$ (the Rouché–Capelli theorem), which is the same as asking $w^T b = 0$ for every such $w$. If $w^T b = 0$ the dependent equation is **redundant**: it follows from the others and can be dropped without changing the solutions. If $w^T b \ne 0$ it is **conflicting**: no $x$ satisfies them all, and $|w^T b|$ measures by how much.

Sketch equations are nonlinear, so dependence is a property of a point, and jig tests it at the solution it found. Two examples carry the chapter. The fully constrained L-outline of Chapter 3 (six lines, $n = 24$, rank 24) with a 25th equation, `parallel(p.1, p.3)`, is redundant. The same outline with `length(p.3) = 50 mm` is conflicting: the other lengths make p.3 measure 60 − 8 = 52 mm.

## 14.2 Finding dependent rows one at a time

After a cluster is solved, jig walks its constraints in a fixed order (implicit constraints such as a polyline's corner coincidences first, then those added by helpers, then the ones you wrote, in the order written) and offers each constraint's rows to an incrementally built orthonormal basis of the row space. For a new row $v$ it subtracts the projections onto the basis vectors $q$ found so far, twice for numerical safety (modified Gram–Schmidt with re-orthogonalisation):

$$
w = v - \sum (q^T v) q .
$$

If $‖w‖ > 10^{-8} \max(1, ‖v‖)$ the row is independent and $w / ‖w‖$ joins the basis; otherwise it is dependent, and its constraint is marked redundant. A row of zeros is always dependent. The basis size at the end is the rank. Each row costs $O(\operatorname{rank} \cdot n)$ operations, so the whole pass costs $O(m \cdot \operatorname{rank} \cdot n)$, small for clusters of tens of unknowns.

Because the test is incremental, the order decides *which* of two equivalent constraints is called redundant. With `parallel(p.1, p.3)` written after the six horizontals and verticals, it is the parallel that adds nothing: rank 24, and

```text
sketch.redundant: parallel(p.1, p.3) is implied by horizontal×2; dropped
```

Write the parallel before the horizontals and the rank is still 24, but now `horizontal(p.3)` arrives second: `horizontal(p.3) is implied by parallel(p.1, p.3) + horizontal(p.1); dropped`. Both answers are correct; the set of solutions is the same either way.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'),
    j.c.parallel('p.1', 'p.3'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8)
```

**Figure 14.1.** The fully constrained outline with a 25th equation, `parallel(p.1, p.3)`, written last. Rank 24 of 24, 0 DOF, and a warning that the parallel is implied by the two horizontals.

```sketch
// title: Which constraint is redundant
// Parallel is written first. Move it after vertical('p.6') and Run again.
return j.sketch('outline2', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'), j.c.parallel('p.1', 'p.3'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8)
```

"Dropped" refers to the analysis: the redundant rows do not count toward the rank, and a drag leaves the constraint out. The compile's own solve keeps it, which is harmless because it agrees. A constraint with two equations can be **partly** redundant, one row dependent and one not; the warning then says "partly implied" and nothing is dropped. The orthonormal basis plays the role of the rank-revealing QR of Chapter 12, built row by row so that each dependence is charged to the constraint that caused it.

## 14.3 Naming who repeats whom

To say *what* a redundant constraint repeats, jig writes its row $v$ as a combination of the rows before it: it solves the least-squares problem $\min ‖\sum c_k a_k - v‖$ over the earlier rows $a_k$ through the normal equations, with a damping of 10⁻¹² so that dependent earlier rows do no harm, and names every constraint whose coefficient is larger than 10⁻⁶ of the largest.

The parallel case can be done by hand. The residual of `parallel` is the normalised cross product $(u_1 v_2 - u_2 v_1) / (‖u‖ ‖v‖)$ of the two direction vectors $u = (u_1, u_2)$ and $v = (v_1, v_2)$. With p.1 running from (0, 0) to (60, 0), $u = (60, 0)$; with p.3 running from (60, 8) to (8, 8), $v = (-52, 0)$. Differentiating at that configuration,

$$
\frac{\partial}{\partial u_2} = \frac{-v_1}{‖u‖ ‖v‖} = \frac{1}{60}, \quad \frac{\partial}{\partial v_2} = \frac{u_1}{‖u‖ ‖v‖} = \frac{1}{52} ,
$$

and since $u_2$ is exactly the residual of `horizontal(p.1)` and $v_2$ that of `horizontal(p.3)`, the parallel row is $\tfrac{1}{60}$ times the first plus $\tfrac{1}{52}$ times the second. Running jig's own routine on the finite-difference Jacobian gives the coefficients 0.016667 and 0.019231, that is 1/60.000 and 1/52.000, and rebuilds the row to within 3 × 10⁻¹⁴. The message groups the two names by kind: "implied by horizontal×2".

The coefficients are the dependency vector $w$ of Section 14.1, restricted to the rows that matter. They are unique when the earlier rows are independent; when they are not, the least-squares solution picks the smallest coefficients, and the names it reports are one valid explanation among several.

## 14.4 What a failed solve reveals

When a cluster's solve ends with a residual above 10⁻⁸ (and the restart from a slightly moved drawing, Chapter 13, fails too), jig treats the cluster as infeasible and looks for a conflict. The least-squares view says where to look. At any stationary point of $f = \tfrac{1}{2} ‖r‖^2$ the gradient vanishes, $J^T r = 0$. If the residual $r$ there is not zero, that equation says the rows of $J$ are dependent with the residuals themselves as coefficients. A conflict found by least squares therefore always shows up as a row dependency at the least-squares point, and the residual vector names it.

The conflicting outline shows this exactly. Run directly, Levenberg–Marquardt converges in 13 iterations to a point where $‖J^T r‖∞ = 5.6 \times 10^{-12}$ and twelve equations carry a residual of ±0.1667 mm each: the six corner coincidences in x, the three verticals and the three lengths 60, 8 and 50. Together they say that the x-extents around the outline, 60 − 50 − 8, must sum to zero; they leave 2 mm. For a linear system with a single dependency $w$, the least-squares residual is the projection of any residual $r_0$ onto $w$,

$$
r* = \frac{w^T r_0}{‖w‖^2} w ,
$$

and with twelve entries of ±1 in $w$ and $w^T r_0 = 2$ mm, each equation absorbs 2 / 12 = 0.1667 mm and $‖r*‖ = 2 / \sqrt{12} = 0.5774$ mm, as measured. The least-squares compromise spreads the contradiction evenly over the chain; it does not pick a culprit.

jig's default solve does not reach that point by itself. Dog leg stops after 2 iterations with a largest residual of 1.219 mm and $‖J^T r‖∞ = 1.0$, far from stationary: its Gauss–Newton step satisfies the independent rows exactly and ignores the dependent one, and after three iterations in which the linear model cannot halve the residual it stops. The LM fallback then takes over and reaches the least-squares point, which the conflict search uses. None of this is visible in the compile: once a constraint has been dropped, the cluster is solved again from the drawing, and the decision and the L3 dump report only that last solve, here `dogleg · default; converged in 0 iterations`.

A conflict need not be a linear dependency at the drawing. Give the fixed 60 mm base sides of 20 and 30 mm, which violates the triangle inequality. At the drawing the 12 rows are independent; at the least-squares point the apex lies on the base, the singular position of Chapter 13, and seven equations carry ±10/7 = 1.4286 mm each: three corner coincidences and two fixed coordinates in x, and the two lengths. jig reports

```text
sketch.overConstrained: no solution; minimal conflicting set:
fix(t.1) · length(t.2) = 20 mm · length(t.3) = 30 mm
fix: drop one of the 3; e.g. make dim(t.3) driven (it measures 47.989 mm)
```

Here `fix(t.1)` stands for the base's 60 mm, which is given by fixing both of its ends rather than by a dimension.

```sketch
// title: A triangle that cannot close
// expect: sketch.overConstrained
// 20 + 30 < 60. Make dim t.3 driven, or change 30 to 45.
return j.sketch('short', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(j.c.fix('t.1'))
  .dim('t.2', 20).dim('t.3', 30)
```

## 14.5 Minimal conflicting sets by deletion

A set of constraints is **infeasible** if no point satisfies all of them. An **irreducible infeasible subset** (IIS) is an infeasible set every proper subset of which is feasible: remove any one member and the rest can be satisfied. The name comes from linear programming; jig's "minimal conflicting set" is the same idea. The **deletion filter** of Chinneck and Dravnieks (1991) finds one:

```js
// S: an infeasible set of constraints; H: constraints never blamed
for (const c of [...S]) {
  if (!feasible([...H, ...S.filter(s => s !== c)])) S = S.filter(s => s !== c)
}
return S   // infeasible with H; drop any member and it is feasible
```

It is correct because feasibility is monotone: a subset of a feasible set is feasible. A constraint kept by the loop was needed when it was tested, and removing later constraints only makes the rest smaller, so it is still needed at the end. The cost is one feasibility test per candidate, $k$ tests for $k$ candidates, and each test is a full nonlinear solve. The result depends on the order of testing: a system can contain several IISs, and the filter returns the first one the order leads to.

jig runs the filter with these choices. The implicit constraints (a polyline's corners, an arc's ends) are never blamed. Candidates are tested in written order, each test is a dog-leg solve from the drawing capped at 60 iterations with the LM fallback, and the search stops after 60 tests or 4 seconds and reports what it has. A cluster with more than 10 candidates is first narrowed using Section 14.4: jig finds the rows that are dependent at the least-squares point and have a nonzero residual, adds the earlier rows that span them, and, if those constraints with everything else held fixed are still infeasible, keeps everything else as hard constraints and filters only those. At most three conflicts are reported per cluster: after each one, the latest-written member is dropped and the cluster solved again.

On the conflicting outline the narrowed filter needs 8 feasibility tests (one for the narrowing, one to check that the hard constraints alone are feasible, six deletions) and returns the six constraints of Chapter 3; a scratch copy of the solver with counters added measured 17 ms for the search. A plain deletion filter over all 12 written constraints, with only the corners held, needs 13 tests (34 ms) and returns seven: the same six and `horizontal(p.1)`. Both are right, about different questions. Without `horizontal(p.1)` the 60 mm line can tilt; tilted by an angle $\theta$, its x-extent shrinks by $60 (1 - \cos\theta) \approx 30 \theta^2$, and at $\theta = 14.8°$ it is the 58 mm the other dimensions need. The sketch below, with that one constraint removed, solves with p.1 ending at (58, 15.3623). The effect is second order in $\theta$, so the linear dependency at the least-squares point cannot see it, and the narrowing holds `horizontal(p.1)` fixed. jig's set is therefore irreducible *relative to* the constraints it held fixed; the plain filter's set is an IIS of the whole sketch.

```sketch
// title: The constraint the conflict set leaves out
// horizontal('p.1') is removed from Chapter 3's conflict: p.1 tilts.
return j.sketch('tilt', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8)
  .dim('p.3', 50)
```

The relative reading matters at the extremes. Add `perpendicular(p.1, p.3)` to the fully constrained outline, where both lines are horizontal: jig reports a "minimal conflicting set" of one constraint, `perpendicular(p.1, p.3)`, because the normalised dot product has zero gradient when the lines are parallel, its row is zero, and everything else is held. The IIS of the sketch is the perpendicular with the two horizontals. And with two independent conflicts in one cluster (Chapter 3's outline with p.3 = 50 mm and also p.4 = 30 mm, so that the heights fail by 2 mm as well) the first reported set mixes in two lengths from the height chain, and dropping one of those does not cure the width conflict; each conflict is reported correctly once the other is gone.

**QuickXplain** (Junker, 2004) finds a minimal conflict by divide and conquer: split the candidates in two, and if the first half together with what is already known is infeasible, recurse into it alone; otherwise keep it as background and look for the rest of the conflict in the second half. For a conflict of $s$ constraints among $k$ it needs on the order of $s \log(k / s)$ feasibility tests instead of $k$, which pays when conflicts are small and clusters large. jig does not implement it; with clusters of tens of constraints and narrowing, the deletion filter's cost stays at a few dozen milliseconds.

## 14.6 The suggested fix

Every conflict message ends with one concrete thing to try. jig picks the latest-written member of the set, on the reasoning that the newest constraint is the likeliest mistake. If it is a dimension, the cluster is solved again without it, from the drawing, and the fix reads "make … driven (it measures …)" with the value the dimension would have; if it is a dimensionless constraint, the fix is "remove …". A **driven** dimension, `.dim(target, null, { driven: true })`, adds no equation and reports the measured value instead.

The measured value is one solution among many. Without `length(t.3)`, the triangle of Section 14.4 has 1 DOF: the apex can be anywhere on the circle of radius 20 mm around (60, 0), so t.3 could measure anything from 40 to 80 mm. The re-solve from the drawing returns the apex at (45.8579, 14.1421), the point of that circle nearest the drawn apex (30, 30), which is (60, 0) + 20 · (−1, 1)/√2. The 47.989 mm in the message is the least-change value, and moving the drawn apex changes it.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('short2', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(j.c.fix('t.1'))
  .dim('t.2', 20).dim('t.3', null, { driven: true })
```

**Figure 14.2.** The fix applied: t.3 driven. The sketch solves with 1 DOF, the apex at (45.8579, 14.1421), the nearest point to the drawn apex on the circle of radius 20 mm, and t.3 measures 47.989 mm.

> **Try it.** Open the sketch "A triangle that cannot close" and read the diagnostic. Apply the fix it suggests and Run: the apex is now free on a circle around (60, 0), drawn in blue. Drag it, then [show the IR](lab:show/ir) and read the solved apex.

## 14.7 Near-conflicts and ill-conditioning

Between a solvable sketch and a conflicting one lies a sketch that is solvable but barely. Keep the triangle's base at 60 mm and t.2 at 35 mm, and make t.3 25 + ε mm, so that the sides exceed the base by ε. The apex height follows from Heron's formula; for small ε it is about $\sqrt{2 a b \varepsilon / c}$ with $a = 35$, $b = 25$, $c = 60$, so it grows like the square root of ε. jig's solves, and the singular values of its Jacobian at each solution (computed in numpy from the engine's matrix), give:

| ε (mm) | apex height (mm) | $\sqrt{2ab\varepsilon/c}$ | height change per mm of t.3 | $\sigma_{min}$ | κ(J) | iterations |
|--:|--:|--:|--:|--:|--:|--:|
| 1 | 5.4378 | 5.4006 | 2.76 | 0.0970 | 20 | 7 |
| 0.1 | 1.7090 | 1.7078 | 8.56 | 0.0312 | 62 | 8 |
| 0.01 | 0.5401 | 0.5401 | 27.0 | 0.00990 | 197 | 10 |
| 0.001 | 0.1708 | 0.1708 | 85.4 | 0.00313 | 623 | 11 |
| 0 | 7 × 10⁻⁵ (exact: 0) | 0 | | 1.3 × 10⁻⁶ | 1.5 × 10⁶ | 19 |

The **condition number** $\kappa(J) = \sigma_{max} / \sigma_{min}$, the ratio of the largest to the smallest singular value, measures how much the solution can move per unit change in the equations, and it grows like $1 / \sqrt{\varepsilon}$. At ε = 0.01 mm a change of 0.01 mm in t.3, the size of a rounding in a param expression, moves the apex by 0.224 mm (from 0.5401 to 0.7639 mm). The solve still succeeds in 10 iterations with a residual of 1e−23, and nothing in the compile warns.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('thin', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(j.c.fix('t.1'))
  .dim('t.2', 35).dim('t.3', 25.01)
```

**Figure 14.3.** A barely solvable triangle: 35 + 25.01 mm on a 60 mm base. The apex sits 0.5401 mm above the base, and κ(J) is about 200; one more hundredth of a millimetre on t.3 raises it by 0.224 mm.

At ε = 0 the only solution is degenerate, and the tolerances decide what jig reports. The solve converges linearly (Chapter 13) and stops 7 × 10⁻⁵ mm above the base; at that point the smallest singular value is 1.3 × 10⁻⁶, above the row test's 10⁻⁸, so the analysis counts rank 12 and reports `fully`. At the exact root the two length rows are parallel and the rank is 11, which the linearisation would read as 1 DOF; in fact the apex cannot move, because the solution is isolated. The reported 0 DOF is right about motion, for a reason that depends on where the iteration stopped. Rank decisions near such configurations are decisions about a tolerance.

What jig does here and what it does not: it decides dependence numerically, at the point the solver reached, with fixed tolerances (10⁻⁸ for the row test, 10⁻¹⁰ in the QR); it reports redundancy and conflicts but no condition number, so a near-conflict like Figure 14.3 compiles without a word. A fuller solver could report κ(J) or the smallest singular value with its direction, which names the motion that is barely held, and warn when it falls below a threshold.

## 14.8 Key points

- Dependent rows of $J$ are redundant when the equations agree ($w^T b = 0$ in the linear case) and conflicting when they do not.
- jig finds dependent rows one at a time with re-orthogonalised Gram–Schmidt and a 10⁻⁸ tolerance; the order (implicit, helper, user as written) decides which constraint is called redundant.
- A redundant row is named by least-squares coefficients over earlier rows: `parallel(p.1, p.3)` = (1/60) `horizontal(p.1)` + (1/52) `horizontal(p.3)`.
- At a least-squares point with nonzero residual, $J^T r = 0$: the residual vector is the dependency, spread evenly over the conflicting chain (±0.1667 mm on 12 equations for the outline).
- The deletion filter finds an irreducible infeasible subset with one nonlinear solve per candidate; jig narrows large clusters to the first-order dependency, so its set is minimal relative to the constraints it holds fixed.
- The suggested fix makes the latest-written dimension driven and quotes its least-change value from the drawing.
- Near a degenerate configuration κ(J) grows like $1 / \sqrt{\varepsilon}$, small dimension changes move the geometry a lot, and jig gives no warning.

## Exercises

> **Exercise.** Redo the hand calculation of Section 14.3 for p.3 drawn from (60, 8) to (20, 8). Predict the two coefficients, and say why the message "implied by horizontal×2" does not change.

> **Exercise.** In the workbench, add `j.c.perpendicular('p.1', 'p.3')` to the fully constrained outline of Figure 14.1 (without the parallel). Read the conflicting set. Which constraints form the IIS of the whole sketch, and why does jig name only one?

> **Exercise.** Open Figure 14.3's sketch in the workbench and change t.3 from 25.01 to 25.02 mm. Predict the new apex height from $\sqrt{2ab\varepsilon/c}$, then compare with the solved geometry in the IR. What does t.3 = 25 give?

> **Exercise.** A cluster has 40 candidate constraints and a conflict of 4. Count the feasibility tests the plain deletion filter needs, and estimate QuickXplain's. At 2 ms per test, when would the difference matter to someone dragging a point?

## Further reading

- Chinneck and Dravnieks, "Locating minimal infeasible constraint sets in linear programs", *ORSA Journal on Computing* 3(2), 1991: the deletion filter and its correctness.
- Chinneck, *Feasibility and Infeasibility in Optimization: Algorithms and Computational Methods*, Springer, 2008: deletion, additive and elastic filters, and the theory of irreducible infeasible subsets.
- Junker, "QUICKXPLAIN: Preferred explanations and relaxations for over-constrained problems", *Proceedings of AAAI*, 2004: divide and conquer for minimal conflicts.
- Björck, *Numerical Methods for Least Squares Problems*, SIAM, 1996: rank-deficient least squares, the pseudo-inverse and the geometry of the residual.
- Golub and Van Loan, *Matrix Computations*, 4th ed., Johns Hopkins University Press, 2013: Gram–Schmidt with re-orthogonalisation, numerical rank and condition numbers.
