---
part: V · Inside the solver
presets: A-03
docs: solver
---
# Counting freedom

Chapter 3 defined the degrees of freedom of a sketch as $n - \operatorname{rank} J$ and showed one constraint whose row added no rank. This chapter asks when the rank can be predicted by counting, and when it cannot. It starts from what the rank measures, the motions a sketch still has, then states the two classic results for frameworks of bars, Maxwell's count and Laman's theorem, and shows the configurations where both fail. It explains the three rigid motions that every unanchored sketch keeps, how jig computes a rank in floating point and what happens near a configuration where the rank drops, and how jig turns the null space of $J$ into its list of free entities. By the end you can predict a sketch's DOF from its graph, recognise the special positions where the prediction is wrong, and read jig's free-entity report as a statement about the null space.

## 12.1 Motions and the null space

Let $F(x) = 0$ be the sketch's $m$ equations in $n$ unknowns and $x$ a solution. An **infinitesimal motion** is a vector $δx$ with $J δx = 0$: moving along it changes every residual by $O(t^{2})$ for a step $t$, so to first order every constraint still holds. The infinitesimal motions form the **null space** of $J$, and by the rank–nullity theorem its dimension is $n - \operatorname{rank} J$. That is the number jig reports as DOF. Where the rank of $J$ is the same at every nearby solution, the solutions near $x$ form a smooth family of exactly that dimension (the constant rank theorem), and the DOF counts real, finite motions. Section 12.5 is about the places where the rank is not constant.

Counting equations gives a bound, not the answer. Since $\operatorname{rank} J \le m$,

$$
\mathrm{DOF} = n - \operatorname{rank} J \ge n - m ,
$$

with equality exactly when the $m$ rows are independent. Every redundant row raises the DOF above the count by one.

Take the corner of chapter 11 (Figure 11.2) and remove the length of `l1`. Now $n = 8$, $m = 7$, and the rows are independent, so the DOF is 1. The motion can be read off the Jacobian table of section 11.3: move $P_{2}$, $P_{3}$ and $P_{4}$ right by the same amount, $δx = (0, 0, 1, 0, 1, 0, 1, 0)$ in the order $x_{1}, y_{1}, \ldots, y_{4}$. The coincidence row gives $-1 + 1 = 0$, the perpendicular row $-1/30 + 1/30 = 0$, and every other remaining row has zeros in those columns; jig's Jacobian times this vector is zero in every row. jig reports `1 DOF remain` with `free: l1 (1: end.x), l2 (1: start.x, end.x)`: one motion, moving two entities.

## 12.2 The three rigid motions

Most constraints do not care where the sketch is. A distance, an angle, a tangency or an equality has the same residual after the whole sketch is translated or rotated, so the generators of those motions are in the null space whatever the constraints are. For a point $(x, y)$ they are: translation in x, which adds $(1, 0)$; translation in y, $(0, 1)$; and rotation about the origin, $(-y, x)$. A circle's centre moves like a point and its radius does not change; an arc's two angles, and an ellipse's rotation, increase by 1 under the rotation.

A triangle of three lines with three lengths has $n = 12$, 6 coincidence equations and 3 lengths: rank 9, DOF 3. Built from jig's Jacobian at the solution, the three vectors give $‖J t‖$ of 4.6 × 10⁻¹¹, 6.4 × 10⁻¹¹ and 1.6 × 10⁻¹⁰: zero to the accuracy of the difference quotients. The triangle's shape is fixed; its 3 DOF are its position and turn.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('tri', { on: j.plane.XY })
  .polyline('t', [[0, 0], [40, 0], [40, 30]], { closed: true })
  .dim('t.1', 40).dim('t.2', 30).dim('t.3', 50)
```

**Figure 12.1.** A 30–40–50 triangle with its three sides dimensioned and nothing else: $n = 12$, rank 9, 3 DOF, status `under`. Every line is free, because every line moves when the triangle moves.

Only constraints that refer to the sheet's frame remove these motions: `fix`, `horizontal`, `vertical`, `distanceX`, `distanceY`, coordinates written as expressions, and angles to `X` or `Y`. **Anchoring** the triangle with `fix('t.1.start')` (2 equations) and `horizontal('t.1')` (1) brings it to rank 12, DOF 0, status `fully`. jig does not separate the rigid motions from the shape freedom: an unanchored sketch whose shape is fully determined reports 3 DOF and `under`.

## 12.3 Bar frameworks and Maxwell's count

Rigidity theory studies the simplest constraint systems. A **bar framework** in the plane is a graph $G = (V, E)$ with a point $p_{i}$ for each vertex (a **joint**) and, for each edge (a **bar**), the equation $‖p_{i} - p_{j}‖ = d_{ij}$. It has $2v$ unknowns for $v$ joints and one equation per bar. The Jacobian of the squared lengths, halved, is the **rigidity matrix**: the row of bar $ij$ holds $p_{i} - p_{j}$ in the columns of joint $i$ and $p_{j} - p_{i}$ in those of joint $j$. A framework is **rigid** if its only motions are the rigid ones, and **infinitesimally rigid** if its rigidity matrix has rank $2v - 3$ (for $v \ge 2$).

Maxwell observed in 1864 that each bar removes at most one degree of freedom and the rigid motions are never removed, so a framework with $e$ bars keeps at least $2v - 3 - e$ internal degrees of freedom. **Maxwell's count**: a framework in the plane with $v \ge 2$ joints can be rigid only if $e \ge 2v - 3$, and a **minimally rigid** one, rigid but no longer rigid after removing any bar, has exactly $e = 2v - 3$.

A sketch is easy to read as a framework: draw each bar as a line, join the lines at the joints, and dimension each line. A joint where $k$ lines meet costs $2(k - 1)$ coincidence equations, which add up to $2(2e - v)$ over the joints, so the $4e$ line unknowns leave $2v$ before the lengths and $2v - \operatorname{rank}$ after: the same count as points and distances. A 40 × 30 mm rectangle of four bars:

| framework | n | equations | rank | DOF | Maxwell: 2v − 3 − e |
|---|--:|--:|--:|--:|--:|
| 4 bars | 16 | 12 | 12 | 4 | 1 |
| 4 bars + 1 diagonal | 20 | 17 | 17 | 3 | 0 |
| 4 bars + 2 diagonals | 24 | 22 | 21 | 3 | −1 |

Four bars keep the 3 rigid motions and one shear. One diagonal makes two triangles and the frame rigid. The second diagonal brings nothing new: jig reports `length(d2) = 50 mm is implied by coincident×8 + dim×5; dropped`, and the DOF stays 3 where the count says 2.

The count is necessary but not sufficient, because it does not look at where the bars are. Keep both diagonals and add a fifth joint E at (80, 30), joined to C by one 40 mm bar. Now $v = 5$ and $e = 7 = 2v - 3$, exactly Maxwell's number for a minimally rigid framework. But the rectangle with two diagonals has a bar to spare, and E hangs from a single bar.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('frame', { on: j.plane.XY })
  .polyline('r', [[0, 0], [40, 0], [40, 30], [0, 30]], { closed: true })
  .line('d1', 'r.1.start', 'r.2.end')
  .line('d2', 'r.1.end', 'r.3.end')
  .line('e', 'r.2.end', [80, 30])
  .dim('r.1', 40).dim('r.2', 30).dim('r.3', 40).dim('r.4', 30)
  .dim('d1', 50).dim('d2', 50).dim('e', 40)
```

**Figure 12.2.** Seven bars on five joints, $e = 2v - 3$, yet not rigid: $n = 28$, 25 equations, rank 24, 4 DOF, with `length(d2)` reported redundant. The braced rectangle is over-braced by one bar and the bar `e` swings about C.

The count of bars is right; their distribution is wrong. jig measures both faults: one redundant length and 4 DOF, the 3 rigid motions plus the swing. Anchored with `fix('r.1.start')` and `horizontal('r.1')`, the frame has 1 DOF left, the swing of `e`:

```sketch
// title: Seven bars, five joints, still loose
// Delete d2 and its dim; brace E with .line('f', 'r.1.end', 'e.end')
// and .dim('f', 50). Read the DOF.
return j.sketch('frame', { on: j.plane.XY })
  .polyline('r', [[0, 0], [40, 0], [40, 30], [0, 30]], { closed: true })
  .line('d1', 'r.1.start', 'r.2.end')
  .line('d2', 'r.1.end', 'r.3.end')
  .line('e', 'r.2.end', [80, 30])
  .constrain(j.c.fix('r.1.start'), j.c.horizontal('r.1'))
  .dim('r.1', 40).dim('r.2', 30).dim('r.3', 40).dim('r.4', 30)
  .dim('d1', 50).dim('d2', 50).dim('e', 40)
```

## 12.4 Laman's theorem

The right count looks at every part of the graph. A joint set $S$ of $k \ge 2$ joints can carry at most $2k - 3$ independent bars, because the subframework on $S$ keeps its own three rigid motions; any further bar among them is redundant, whatever the rest of the graph does.

**Laman's theorem** (Laman 1970; proved earlier by Pollaczek-Geiringer, 1927). Let $G$ be a graph with $v \ge 2$ vertices and $e$ edges. A generic framework on $G$ in the plane is minimally rigid if and only if $e = 2v - 3$ and every subgraph with $k \ge 2$ vertices has at most $2k - 3$ edges.

**Generic** means that the joint coordinates satisfy no algebraic relation with rational coefficients. Generic positions are almost all positions, and rigidity is the same at all of them, so for generic frameworks rigidity is a property of the graph alone. A graph is generically rigid if it contains a spanning subgraph that satisfies Laman's condition.

In Figure 12.2 the four rectangle joints span 6 edges, more than $2 \cdot 4 - 3 = 5$, so the condition fails and Laman predicts what jig measured. The repair in the sketch's hint moves the spare bar: drop `d2` and brace E to B with a 50 mm bar `f`. Every subset now passes (the rectangle with one diagonal has 5 edges on 4 joints; the triangle B, C, E has 3 on 3), and jig reports rank 25, DOF 3: rigid up to the rigid motions.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('frame', { on: j.plane.XY })
  .polyline('r', [[0, 0], [40, 0], [40, 30], [0, 30]], { closed: true })
  .line('d1', 'r.1.start', 'r.2.end')
  .line('e', 'r.2.end', [80, 30])
  .line('f', 'r.1.end', 'e.end')
  .dim('r.1', 40).dim('r.2', 30).dim('r.3', 40).dim('r.4', 30)
  .dim('d1', 50).dim('e', 40).dim('f', 50)
```

**Figure 12.3.** The same seven bars with the spare one moved: a Laman graph. $n = 28$, 25 equations, rank 25, 3 DOF, no redundancy.

Testing the subset condition directly would look at exponentially many subsets. The **pebble game** of Jacobs and Hendrickson (1997) decides it, and finds the redundant bars and the rigid parts, in time quadratic in the number of joints. Laman graphs can also be built up from one bar by two moves (Henneberg's): add a joint with two bars, or split a bar with a new joint joined to one more joint. Two warnings bound the theorem. In three dimensions Maxwell's count becomes $e \ge 3v - 6$, and the analogue of Laman's condition is not sufficient: the "double banana", two rigid bananas hinged at their two ends, passes every count and still flexes. And CAD constraints are not bars: lines, circles and arcs have 4, 3 and 5 unknowns and constraints remove 1 or 2 each, so graph-based solvers use generalised counts over entities and constraints, with the same blind spots. Chapter 15 returns to them.

## 12.5 Special positions

Laman's theorem is about generic positions, and a sketch is rarely generic: designers draw right angles, collinear edges and parallel lines on purpose. Two kinds of non-generic sketch break every count.

The first is a **special position**: a configuration where rows that are independent elsewhere become dependent. Three bars of 30, 40 and 70 mm on three joints form a triangle, a Laman graph, but $30 + 40 = 70$ forces the joints onto one line.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('flat', { on: j.plane.XY })
  .polyline('t', [[0, 0], [30, 0], [70, 0]], { closed: true })
  .constrain(j.c.fix('t.1.start'), j.c.horizontal('t.3'))
  .dim('t.1', 30).dim('t.2', 40).dim('t.3', 70)
```

**Figure 12.4.** A flat triangle, anchored: $n = 12$, rank 11, 1 DOF, `free: t.1 (1: end.y), t.2 (1: start.y)`, and `length(t.3) = 70 mm is implied by coincident×3 + dim×2; dropped`.

Both statements are true to first order and false for finite motions. All three bar rows point along the line, so the middle joint can move perpendicular to it without changing any length to first order; but any finite move lengthens the two short bars together, so the triangle cannot move at all. Nor is `t.3` implied: without it the triangle opens. The framework is **infinitesimally flexible but rigid**, the distinction Asimow and Roth (1978) made precise. jig reports $n - \operatorname{rank} J$, the infinitesimal count, and so does every solver that counts with the Jacobian.

The second kind is a **dependence that a theorem guarantees**, at every configuration where the constraints hold. The angles of a triangle sum to 180°, so a third angle is implied by the other two whatever the triangle's size:

```figure
// view: plan
// overlays: dims,dof
return j.sketch('tri', { on: j.plane.XY })
  .polyline('t', [[0, 0], [40, 0], [40, 23]], { closed: true })
  .dim(['t.1', 't.2'], deg(90))
  .dim(['t.2', 't.3'], deg(60))
  .dim(['t.3', 't.1'], deg(30))
```

**Figure 12.5.** Three angles on a triangle: 9 equations, rank 8, 4 DOF (scale and the rigid motions), and `dim(t.3, t.1) = 30° is implied by dim×2; dropped`.

Make the third angle 31° and the same rows are inconsistent: jig reports a conflict whose minimal set is the three angles, and suggests making `dim(t.3, t.1)` driven, quoting the angle between the lines' directions, 150°, rather than the interior 30°. Parallelism is transitive for the same reason: three lines with `parallel(a, b)`, `parallel(b, c)` and `parallel(a, c)` have rank 2, and jig reports `parallel(a, c) is implied by parallel×2`. No count over the graph sees these dependencies, because they come from geometry, not from the number of unknowns each constraint touches.

## 12.6 Numerical rank

In floating point a Jacobian is never exactly singular, so "rank" needs a tolerance. The reference definition uses the **singular values** $σ_{1} \ge σ_{2} \ge \ldots \ge 0$ of $J$: the **numerical rank** for a tolerance $τ$ is the number of $σ_{i}$ larger than $τ σ_{1}$, and the smallest singular value is the distance from $J$ to the nearest matrix of lower rank. Computing singular values is more expensive than a QR factorisation, so solvers use **QR with column pivoting** (Businger and Golub, 1965): at each step the column with the largest norm outside the span of the columns already taken is moved forward, which makes the diagonal of $R$ decrease, $|r_{11}| \ge |r_{22}| \ge \ldots$, and the factorisation stops when the next diagonal is below $τ |r_{11}|$. It reveals the rank in practice, though not always: Kahan's matrix is the classic case where it misses a small singular value.

jig ranks its Jacobians in three places, with three tolerances:

- **The solver step.** QR with column pivoting of $J^{T}$, whose columns are the rows of $J$, stopping at $10^{-10} \max(1, |r_{11}|)$. It gives the rank, the minimum-norm Gauss–Newton step of chapter 13, and a basis of the null space, which a drag uses to move only what is free.
- **DOF and redundancy.** Rows are added one at a time to an orthonormal basis by Gram–Schmidt with a second pass for accuracy, implicit constraints first, then a helper's, then the user's in writing order. A row whose remainder is at most $10^{-8} \max(1, ‖\mathrm{row}‖)$ is dependent. There is no pivoting, on purpose: the constraint reported redundant is always the later one, a user's before a helper's. This basis size is the rank in the IR.
- **Free entities**, section 12.7, with a tolerance of $10^{-7}$.

To see a rank drop numerically, make the triangle of Figure 12.4 slightly less flat: bars 30 and 40 mm and a third of $70 - ε$, drawn at its solution. The middle joint then sits at a height $h$ above the base, and the smallest singular value of jig's Jacobian (computed from it with numpy) shrinks with it:

| ε (mm) | height h (mm) | σ smallest | jig rank (of 12) |
|--:|--:|--:|--:|
| 1 | 5.833 | 9.59 × 10⁻² | 12 |
| 10⁻⁴ | 0.0586 | 9.86 × 10⁻⁴ | 12 |
| 10⁻⁸ | 5.86 × 10⁻⁴ | 9.86 × 10⁻⁶ | 12 |
| 10⁻¹² | 5.84 × 10⁻⁶ | 9.83 × 10⁻⁸ | 12 |
| 0 | 0 | 7.6 × 10⁻¹⁷ | 11 |

The largest singular value is 2.07 throughout. The height grows like $\sqrt{ε}$ and the smallest singular value like the height, about $h/59$. jig's tolerance is so tight that it calls the rank full until the configuration is degenerate to rounding: a triangle 6 nanometres high is still a triangle. Near the special position the sketch is regular but ill-conditioned: a linearised step divides by $σ_{min}$, so small changes in a dimension move the middle joint a long way.

At the singular point itself the linearisation has nothing to offer. Draw the triangle flat and ask for a third side of 60 mm, a perfectly good triangle: along the line the three lengths are inconsistent to first order, and the one direction that would help, lifting the middle joint, has zero gradient, so a Gauss–Newton step cannot leave the line. jig handles this case explicitly. When a cluster fails to converge, it starts once more from the drawing moved by a small pseudo-random amount (10⁻³ of the largest coordinate) before it looks for a conflict. The flat drawing then solves in 6 iterations, to the triangle below the line, B = (24.1667, −17.7756): the perturbation, not the drawing, chose the side. Draw the middle joint 0.001 mm above the line and the 69.99 mm triangle solves in 5 iterations to B = (29.994286, 0.585517); 0.001 mm below gives its mirror image.

```sketch
// title: A flat drawing of a good triangle
// It folds below the line. Change [30, 0] to [30, 1] to choose the side.
return j.sketch('flat', { on: j.plane.XY })
  .polyline('t', [[0, 0], [30, 0], [70, 0]], { closed: true })
  .constrain(j.c.fix('t.1.start'), j.c.horizontal('t.3'))
  .dim('t.1', 30).dim('t.2', 40).dim('t.3', 60)
```

## 12.7 Which coordinates are free

The null space says more than its dimension. Let the rows of $Q$ be an orthonormal basis of the row space of $J$, which the Gram–Schmidt pass of section 12.6 has already built. Then $P = I - Q^{T} Q$ projects any change $δx$ onto the null space, and its diagonal entry $P_{kk}$ is the squared length of the projection of the unit change in coordinate $k$. jig calls coordinate $k$ **free** when $P_{kk} > 10^{-8}$: some motion changes it. An entity's **DOF** is the rank of $P$ restricted to the entity's columns, the number of independent ways the entity can move.

These numbers do not add up to the sketch's DOF, because one motion can move many entities. The outline of chapter 3 (Figure 3.2) has 3 DOF, and jig reports

```text
sketch.underConstrained: 3 DOF remain
free: p.2 (1: end.y), p.3 (2: end, start.y), p.4 (3: start, end),
p.5 (2: start, end.y), p.6 (1: start.y)
```

The entity DOFs add to 9: the outline's height moves `p.4`, `p.5` and `p.6` at once, the thickness of the foot moves `p.2`, `p.3` and `p.4`, and the upright's thickness moves `p.3`, `p.4` and `p.5`. In the corner of section 12.1, one motion gives `l1` and `l2` a DOF each.

On the sheet, the DOF overlay draws every entity with a free coordinate in blue and fills its free end points blue. The label beside each counts the entity's free coordinates, which can exceed the entity's DOF in the warning: each side of the triangle in Figure 12.1 has 4 free coordinates and 3 DOF, since its two ends cannot move independently of each other once its length is fixed. What jig does not show is the motions themselves, which coordinates move together and in what ratio; a drag on the sheet shows one of them at a time.

> **Try it.** [Load A-03](lab:preset/A-03) and [open the plate's sketch on the stage](lab:view/plan): the hole `h2` is blue, with one free coordinate, its centre's x. Add `.dim({ h: ['h2.center', 'l2.start'] }, 'edge')` and Run; the DOF becomes 0 and the blue goes.

## 12.8 What jig does and does not do

jig computes the DOF as $n - \operatorname{rank} J$ at the solved configuration, ranks with a tight relative tolerance, reports a redundant constraint as the later of the dependent ones and names the constraints its row depends on, and lists for each entity its DOF and its free coordinates. The three rigid motions count as DOF.

It does not test rigidity combinatorially: there is no Laman count or pebble game, so a sketch drawn in a special position reports the special rank, not the generic one, and a Laman-rigid graph drawn flat is reported as flexible and redundant. It does not distinguish infinitesimal from finite freedom, as Figure 12.4 shows. It does not compute singular values, so it cannot warn that a sketch is close to singular; the first sign of ill-conditioning is a solve that wanders or fails. From an exactly singular start it retries once from a perturbed drawing, so the branch it lands on is chosen by the perturbation. A finer analysis would also compare the rank at the drawn configuration with the rank at a random nearby one, to tell a special position from a generic flexibility; chapters 14 and 15 describe what such solvers do.

## 12.9 Key points

- DOF is the dimension of the null space of $J$, the infinitesimal motions; counting equations gives only $\mathrm{DOF} \ge n - m$.
- An unanchored sketch keeps 3 rigid motions in its null space; `fix`, `horizontal`, `vertical` and frame-referenced dimensions remove them.
- Maxwell's count, $e \ge 2v - 3$, is necessary for a plane framework to be rigid but not sufficient: seven bars on five joints can be both over-braced and loose.
- Laman's theorem: generically, $e = 2v - 3$ with at most $2k - 3$ edges on every $k$ joints is exactly minimal rigidity.
- Special positions (a flat triangle) and geometric theorems (angle sums, transitive parallelism) make rows dependent where no count predicts it.
- jig ranks by pivoted QR in the solver and by ordered Gram–Schmidt with tolerance 10⁻⁸ for the DOF; near-singular sketches are reported full rank and ill-conditioned.
- A free coordinate is one the null-space projector does not annihilate; entity DOFs can add up to more than the sketch's DOF.

## Exercises

> **Exercise.** A hexagon of six bars has how many internal DOF by Maxwell's count? Draw it as a closed polyline with six dims and check the DOF in the workbench. Then add diagonals one at a time, predicting each time whether the new bar is independent.

> **Exercise.** Build the sketch of section 12.3 and follow its hint. Check Laman's condition by hand on every subset of three and four joints of the repaired frame.

> **Exercise.** In Figure 12.4, change the third length to 69.9 and draw the middle joint at [30, 1]. Read the DOF, then compute the triangle's height by hand and compare it with the solved coordinates.

> **Exercise.** Write the three infinitesimal rigid motions for a circle with centre (10, 5) and an arc with centre (0, 0), radius 8, from 0 to 90°, as vectors in their unknowns. Which entries does the rotation change for the arc, and why?

## Further reading

- Maxwell, *On the calculation of the equilibrium and stiffness of frames*, Philosophical Magazine 27, 1864: the counting rule for frames.
- Laman, *On graphs and rigidity of plane skeletal structures*, Journal of Engineering Mathematics 4, 1970: the characterisation of generic minimal rigidity in the plane.
- Asimow and Roth, *The rigidity of graphs*, Transactions of the American Mathematical Society 245, 1978: generic points, and infinitesimal against finite rigidity.
- Graver, Servatius and Servatius, *Combinatorial Rigidity*, American Mathematical Society, Graduate Studies in Mathematics 2, 1993: the textbook account of rigidity matrices and Laman's theorem.
- Jacobs and Hendrickson, *An algorithm for two-dimensional rigidity percolation: the pebble game*, Journal of Computational Physics 137, 1997: Laman's condition tested in quadratic time.
- Golub and Van Loan, *Matrix Computations*, 4th edition, Johns Hopkins University Press, 2013: singular values, numerical rank and QR with column pivoting.
