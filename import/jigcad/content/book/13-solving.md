---
part: V · Inside the solver
presets: A-03
docs: solver
---
# Solving the equations

A constrained sketch hands the solver a system of equations and a drawing; this chapter is about finding a point that satisfies the equations. It derives Newton's method, Gauss–Newton with its minimum-norm step, Levenberg–Marquardt and Powell's dog leg, compares how fast and how safely each converges, and shows what jig runs and how a sketch chooses another method. It then turns to what the workbench shows: geometric equations usually have several solutions, and the drawing decides which one the solver finds. By the end you can predict roughly how many iterations a solve takes and why, explain why a sketch solved to its mirror image, and tell a starting point the solver cannot leave from a real conflict.

## 13.1 The problem

Write the unknowns of a cluster as a vector $x$ with $n$ entries and its equations as $F(x) = 0$ with $m$ entries. The **residual** is $r = F(x)$: millimetres for distances, radians for angles, pure numbers for the normalised parallel and perpendicular forms. The solvers in this chapter work on the sum of squares

$$
f(x) = \tfrac{1}{2} ‖F(x)‖^2 ,
$$

which is zero exactly at a solution. Its gradient is $g = J^T r$, where $J$ is the $m × n$ **Jacobian**, the matrix of partial derivatives $\partial F_i / \partial x_j$. The starting point $x_0$ is the drawing: the coordinates written in the script.

The running example is a triangle with its base fixed and two sides dimensioned. Its three lines have $n = 12$ parameters; the polyline's three corners give 6 coincidence equations, fixing the base 4 and the two lengths 2, so $m = 12$, and the L3 dump reports rank 12 and 0 DOF. Fixing is an equation, not a deletion: the base's four coordinates stay unknowns, held in place by equations of the form $x_i - c_i = 0$. With the base from (0, 0) to (60, 0), side t.3 of 40 mm ending at the origin and side t.2 of 35 mm starting at (60, 0), the apex is where two circles meet:

$$
x = \frac{40^2 - 35^2 + 60^2}{2 \cdot 60} = 33.125, \quad y = \pm \sqrt{40^2 - x^2} = \pm 22.4217 .
$$

Drawn with its apex at (30, 30), the sketch solves to (33.125, 22.4217) in 4 iterations with a final residual of 1e−14, and its profile measures 672.6522 mm², which is $\tfrac{1}{2} \cdot 60 \cdot 22.4217$.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('tri', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(j.c.fix('t.1'))
  .dim('t.2', 35).dim('t.3', 40)
```

**Figure 13.1.** The running example: base fixed, sides 35 and 40 mm, apex drawn at (30, 30). It solves to (33.125, 22.4217) in 4 dog-leg iterations; $n = 12$, rank 12, 0 DOF.

jig stops iterating when the largest residual, $‖r‖∞$, is at most 10⁻¹⁰, calls a solve converged at 10⁻⁹, and treats a cluster whose residual is at most 10⁻⁸ as feasible. These are absolute and far below anything a printer resolves: whether a solve succeeds depends on the method and the start, not on the tolerance.

## 13.2 Newton's method

Expand $F$ around the current point: $F(x + h) = F(x) + J(x) h + O(‖h‖^2)$. Dropping the last term and asking for zero gives the **Newton step**, the solution of the linear system $J h = -r$, and the iteration

$$
x_{k+1} = x_k - J(x_k)^{-1} F(x_k)
$$

for a square, nonsingular $J$. It has **quadratic convergence**: if $J$ is nonsingular at a root $x*$ and changes smoothly near it (Lipschitz continuous), there is a ball around $x*$ in which $‖x_{k+1} - x*‖ \le C ‖x_k - x*‖^2$. In one variable the proof is two lines. Taylor's theorem with remainder gives $0 = F(x*) = F(x_k) + F'(x_k)(x* - x_k) + \tfrac{1}{2} F''(\xi)(x* - x_k)^2$ for some $\xi$ between them; divide by $F'(x_k)$ and use $x_{k+1} = x_k - F(x_k)/F'(x_k)$ to get

$$
x_{k+1} - x* = \frac{F''(\xi)}{2 F'(x_k)} (x_k - x*)^2 .
$$

The error is squared at each step: the correct digits roughly double. jig's `newton` on the triangle, started from the drawing, shows it:

| k | apex (mm) | largest residual | ratio to previous squared |
|---|---|--:|--:|
| 0 | (30, 30) | 7.426 | |
| 1 | (33.5355, 23.0330) | 0.6836 | 0.0124 |
| 2 | (33.1212, 22.4289) | 7.564 × 10⁻³ | 0.0162 |
| 3 | (33.1250005, 22.4217397) | 8.242 × 10⁻⁷ | 0.0144 |
| 4 | (33.125, 22.4217389) | 1.4 × 10⁻¹⁴ | round-off |

The last column plays the part of $C$ (for residuals rather than errors): steady at about 0.015 until floating point takes over.

Both hypotheses matter. Far from the root the linear model is poor, and the step can be enormous; Section 13.5 shows a start from which Newton's step is 318 metres long. At a root where $J$ is singular, convergence drops to linear. Give the triangle sides of 35 and 25 mm, so the only solution has the apex on the base, where the two length gradients are parallel and $J$ loses rank. From the fourth iteration on, each iteration halves the apex height; the solver needs 19 iterations and stops with the apex 7.0 × 10⁻⁵ mm above the base and a residual of 9.8 × 10⁻¹¹. The residual is quadratic in the height ($|P| - 25 \approx y^2 / 50$), so a residual tolerance of 10⁻¹⁰ pins the height only to about $\sqrt{50 \cdot 10^{-10}} \approx 7 \times 10^{-5}$ mm. Chapter 14 returns to such barely solvable systems.

## 13.3 Gauss–Newton and the minimum-norm step

A sketch is rarely square. An under-constrained one has more unknowns than independent equations, and $J h = -r$ has infinitely many solutions; an over-constrained one may have none. **Gauss–Newton** treats the problem as least squares. The Hessian of $f$ is $J^T J + \sum r_i \nabla^2 F_i$; dropping the second term, which vanishes at a zero-residual solution, leaves the normal equations $J^T J h = -J^T r$ of the linear least-squares problem $\min ‖J h + r‖$. Gauss–Newton converges quadratically on zero-residual problems with full row rank, which is what a consistent sketch is, and only linearly when the minimum has a nonzero residual.

When many steps solve the linearised equations, jig takes the one of **minimum norm**, $h = -J^T (J J^T)^{-1} r$ for full row rank, written $h = -J^{+} r$ with the pseudo-inverse in general. It lies in the row space of $J$, so it moves nothing that no equation touches. For linear constraints one such step lands on the solution closest to the drawing, the orthogonal projection of $x_0$ onto the solution set: of all the shapes that satisfy the constraints, the sketch gets the least change, and keeps the look of its drawing.

Draw a rectangle by hand, corners (0, 0), (50, 2), (47, 31) and (2, 29), fix the first corner and make the sides horizontal and vertical (Figure 13.2). That is $n = 16$, 14 equations, rank 14 and 2 DOF; all the equations are linear. jig solves it in 1 iteration to a 48.5 × 30 mm rectangle: the right side sits at the mean of the drawn 50 and 47, the top at the mean of 31 and 29. A projection computed independently in numpy gives the same rectangle and a change of $\sqrt{29} = 5.385$ mm in the parameter vector. A solver that satisfied the constraints one at a time, moving the second point each time, would give 50 × 31 and a change of $\sqrt{42} = 6.481$ mm: also a solution, further from the drawing.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('box', { on: j.plane.XY })
  .polyline('p', [[0, 0], [50, 2], [47, 31], [2, 29]], { closed: true })
  .constrain(j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'),
    j.c.horizontal('p.3'), j.c.vertical('p.4'))
```

**Figure 13.2.** A rectangle drawn by hand, made square by four constraints. One minimum-norm step gives 48.5 × 30 mm, the averages of the drawn sides, with 2 DOF left (width and height).

```sketch
// title: Least change from a sloppy drawing
// Move the corner [47, 31] to [55, 35] and Run: the width becomes 52.5 mm.
return j.sketch('box2', { on: j.plane.XY })
  .polyline('p', [[0, 0], [50, 2], [47, 31], [2, 29]], { closed: true })
  .constrain(j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'),
    j.c.horizontal('p.3'), j.c.vertical('p.4'))
```

"Least" is measured in the parameter vector, so it depends on the parametrisation. A corner shared by two lines is stored once per line and counts twice; a radius counts like a coordinate; an arc's angles count in radians beside millimetres.

jig computes the step without forming $J^T J$. It factors $J^T$ by Householder QR with column pivoting, $J^T P = Q R$; then $J h = b$ becomes $R^T (Q^T h) = P^T b$, a forward substitution over the first $\operatorname{rank} J$ rows gives $y = Q^T h$, and $h = Q y$ lies in the row space. Working on $J$ keeps the condition number $\kappa(J)$, which the normal equations would square. Rows the pivoting finds dependent are not used: harmless when they agree, and the subject of [Chapter 14](lab:book/14) when they do not.

## 13.4 Levenberg–Marquardt

Levenberg and Marquardt damp the Gauss–Newton equations:

$$
(J^T J + \mu I) h_{lm} = -g, \quad \mu > 0 .
$$

The matrix is positive definite for any $\mu > 0$, so the step always exists, even when $J$ is rank-deficient. Small $\mu$ gives nearly the Gauss–Newton step; large $\mu$ gives $h_{lm} \approx -g / \mu$, a short step down the gradient. By the identity $(J^T J + \mu I)^{-1} J^T = J^T (J J^T + \mu I)^{-1}$ the step also lies in the row space of $J$, so it shares the least-change property.

The damping adapts. The **gain ratio** compares the actual decrease with the decrease the linear model $L(h) = \tfrac{1}{2} ‖r + J h‖^2$ predicted:

$$
\rho = \frac{f(x) - f(x + h)}{L(0) - L(h)}, \quad L(0) - L(h) = \tfrac{1}{2} h^T (\mu h - g) .
$$

jig uses the rule from Madsen, Nielsen and Tingleff's notes: start with $\mu = \tau \cdot \max_i (J^T J)_{ii}$ and $\tau = 10^{-3}$; if $\rho > 0$, accept the step and multiply $\mu$ by $\max(1/3, 1 - (2\rho - 1)^3)$; otherwise reject it, multiply $\mu$ by $\nu$ and double $\nu$, which starts at 2. It solves the damped system by Cholesky factorisation and stops after 200 iterations at most. Moré (1978) showed that the LM step solves the trust-region problem of the next section for the radius $‖h_{lm}‖$, so LM is a trust-region method with the radius set through $\mu$.

On the triangle from (30, 30) LM needs 5 iterations to Newton's 4. Its largest residuals are 7.426, 0.6744, 8.691 × 10⁻³, 6.455 × 10⁻⁶, 3.928 × 10⁻⁹ and 1.037 × 10⁻¹²: fast, but the ratio to the previous residual squared grows from 0.012 to 94, so this is not quadratic convergence. $\mu$ falls by at most a factor of 3 per accepted step, so the damping still bends the steps near the root.

## 13.5 Trust regions and Powell's dog leg

A **trust region** is a ball $‖h‖ \le \Delta$ inside which the linear model $L(h)$ is trusted. Each iteration picks a step inside the ball, computes the gain ratio $\rho$, and adapts the radius: jig sets $\Delta \leftarrow \max(\Delta, 3‖h‖)$ when $\rho > 0.75$ and halves it when $\rho < 0.25$. The first radius is $\max(1, \tfrac{1}{4} ‖x_0‖∞)$, 15 mm for the triangle.

Powell's **dog leg** (1970) chooses the step from two candidates. The Gauss–Newton step $h_n$ is good near a root. The **Cauchy point** $h_s = -\alpha g$ minimises the model along the steepest-descent direction: $L(-\alpha g) = \tfrac{1}{2} ‖r - \alpha J g‖^2$ has derivative $-g^T g + \alpha ‖J g‖^2$ in $\alpha$, because $(J g)^T r = g^T g$, so

$$
\alpha = \frac{‖g‖^2}{‖J g‖^2} .
$$

The step is $h_n$ if $‖h_n‖ \le \Delta$; the gradient step cut to the boundary, $-(\Delta / ‖g‖) g$, if even the Cauchy point lies outside; otherwise the point where the segment from $h_s$ to $h_n$ crosses the boundary, $h_s + \beta (h_n - h_s)$ with $\beta$ the positive root of the quadratic $‖h_s + \beta (h_n - h_s)‖ = \Delta$. The path from the origin to $h_s$ and on to $h_n$ bends like a dog's leg. jig accepts any step that lowers $f$, tries up to 30 radii per iteration, and stops after 100 iterations, or earlier when progress stalls or the linear model cannot reach zero, which ends the solve of an inconsistent system quickly.

The difference from Newton shows near the singular line of the triangle, where the apex lies on the base and the two length gradients are parallel. Start with the apex at (30, 0.001). The Gauss–Newton step there is 3.18 × 10⁵ mm long, almost all of it straight up; jig's Newton halves it 12 times without finding a decrease and stops after 0 iterations. Dog leg converges in 6:

| k | apex (mm) | largest residual | step length (mm) |
|---|---|--:|--:|
| 0 | (30, 0.001) | 10.0 | |
| 1 | (28.5296, 10.0850) | 4.41 | 15.0 |
| 2 | (32.1330, 25.6580) | 3.10 | 22.5 |
| 3 | (33.1564, 22.5067) | 7.37 × 10⁻² | 4.706 |
| 4 | (33.12496, 22.42186) | 1.04 × 10⁻⁴ | 0.128 |
| 5 | (33.125, 22.421739) | 1.74 × 10⁻¹⁰ | 0.0002 |
| 6 | (33.125, 22.421739) | 1.9 × 10⁻²⁶ | |

Step lengths are in the 12-dimensional parameter vector. The first step is cut to the radius of 15 mm; the radius then grew to 45 mm and was halved to 22.5 when the Gauss–Newton step overshot; from the third step on the Gauss–Newton step fits and convergence is quadratic. Lower starts separate the methods further (the methods called directly; a compile adds the restart of Section 13.8, which rescues every failing start in this table):

| starting height (mm) | 0.01 | 0.003 | 10⁻⁸ | 10⁻⁹ | 10⁻¹⁰ | 10⁻¹² |
|---|--:|--:|--:|--:|--:|--:|
| Newton | 5 | fails | fails | fails | fails | fails |
| dog leg | 6 | 6 | 6 | fails | fails | fails |
| Levenberg–Marquardt | 8 | 11 | 14 | 16 | 18 | fails |

At 10⁻⁹ mm the two length rows of $J$ are parallel to within the QR's relative tolerance of 10⁻¹⁰, so one is treated as dependent, the step has no vertical part, and dog leg stalls. LM makes no rank decision: its damped matrix is always invertible, and the tiny vertical gradient, divided by a small $\mu$, grows into a real step.

| method | step | cost per iteration | near a regular root | far away or near singular $J$ |
|---|---|---|---|---|
| Newton | $J h = -r$ | one factorisation | quadratic | huge steps; halving may not rescue them |
| Gauss–Newton | $\min ‖J h + r‖$, minimum norm | one QR | quadratic if zero residual | as Newton |
| Levenberg–Marquardt | $(J^T J + \mu I) h = -g$ | Cholesky per trial | linear, improving as μ falls | always defined; short gradient steps |
| dog leg | $h_n$, $h_s$ or a blend, $‖h‖ \le \Delta$ | one QR, cheap retries | quadratic once $h_n$ fits | bounded steps; needs the GN direction |

## 13.6 What jig runs

Each cluster is solved by a **strategy**. The default is dog leg with Levenberg–Marquardt as the fallback: if dog leg does not converge, LM starts from dog leg's end point when that improved on the drawing, and from the drawing otherwise, and whichever result has the smaller residual is kept. The compiler records the choice per cluster. On the triangle every Gauss–Newton step fits inside the first radius, so dog leg's iterates are exactly Newton's: `tri/cluster0 solver → dogleg · default; converged in 4 iterations, residual 1e-14`. From a start of (30, 10⁻⁹) the fallback is visible: `lm · default; dogleg stalled, fell back to lm; converged in 16 iterations, residual 1e-12`.

The **solver slot** chooses another method for a sketch: `.solver('lm')`, `.solver('newton')`, or a parameterised strategy such as `.solver(j.solver.lm({ maxIter: 200 }))`. A function `(cluster, ctx) => …` chooses per cluster and can return `ctx.default`. A named method runs alone, without a fallback, and the decision says `slot`: on the triangle, `newton · slot; converged in 4 iterations` and `lm · slot; converged in 5 iterations`. jig's `newton` uses the same minimum-norm step as Gauss–Newton with a step-halving line search and at most 50 iterations.

On real sketches most solves are short, and a sketch drawn to size needs 0 iterations. Compiling every preset gives 380 cluster solves, and 379 take 0 iterations, because helpers such as `rect` add constraints that the drawn coordinates already satisfy. The exception is [A-03](lab:preset/A-03), whose outline ($n = 22$, rank 21, 1 DOF) takes 1 iteration to a residual of 6e−14: its holes are drawn with a 2 mm radius and the `hole_d` param asks for 4.5 mm, and those equations are linear, so one Gauss–Newton step solves them. A sketch whose text is unchanged starts from its last solution (a **warm start**), so moving a param re-solves from nearby.

> **Try it.** Open [A-03](lab:preset/A-03), [show the IR](lab:show/ir) and find the sketch's L3 block, with its solver, iterations and residual. Change `hole_d` and read it again; then add `.solver('lm')` to the sketch and compare.

## 13.7 Branches: the drawing chooses

The triangle has two solutions, mirror images in the base. Each method converges to one, and the drawing decides which. Drawn at (30, −30), every iterate of Section 13.2 is mirrored, ending at (33.125, −22.4217) after the same 4 iterations.

```figure
// view: plan
// overlays: dims
return j.sketch('two', { on: j.plane.XY })
  .polyline('u', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .line('d1', 'u.1.end', [30, -30])
  .line('d2', 'd1.end', 'u.1.start')
  .constrain(j.c.fix('u.1'))
  .dim('u.2', 35).dim('u.3', 40).dim('d1', 35).dim('d2', 40)
```

**Figure 13.3.** The same two lengths on the same base, drawn above and below: the apexes solve to (33.125, ±22.4217), in one cluster of rank 20 and 4 iterations.

```sketch
// title: Mirror the drawing
// The apex is drawn below the base. Change -30 to 30 and Run again.
return j.sketch('tri2', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], [30, -30]], { closed: true })
  .constrain(j.c.fix('t.1'))
  .dim('t.2', 35).dim('t.3', 40)
```

The drawing chooses in two ways. The first is the **basin of attraction** of each root, the set of starts from which the iteration reaches it. For the triangle the basins are the two half-planes: from 4,260 starting apexes on a 2 mm grid (x from −40 to 100 mm, y from −60 to 60 mm, y ≠ 0), Newton, dog leg and LM each reached the solution on the starting side every time. Newton needed 5.82 iterations on average (at most 9), dog leg 6.63 (at most 9), LM 7.28 (at most 15). The boundary is the line where $J$ is singular. Other systems have tangled basins; for Newton's method on $z^3 = 1$ in the complex plane the boundary is a fractal.

The second is a sign fixed when the equations are built. Signed residuals read their sign from the drawing and keep it for the whole solve: a point–line distance and a line–circle tangency keep the side drawn, a circle–circle tangency is internal or external by which is nearer in the drawing, an angle takes whichever of $\theta$, $-\theta$, $\pi - \theta$ and $\theta - \pi$ is nearest the drawn angle, and a horizontal or vertical distance keeps its direction. A point drawn 0.5 mm below a fixed line and given a distance of 10 mm from it solves to 10 mm below, (30, −10), although the solution above is nearer to the drawing.

```figure
// view: plan
// overlays: dims
return j.sketch('side', { on: j.plane.XY })
  .line('base', [0, 0], [60, 0])
  .point('p', [30, -0.5])
  .constrain(j.c.fix('base'), j.c.distance('p', 'base', 10),
    j.c.distanceX('base.start', 'p', 30))
```

**Figure 13.4.** A signed distance: the point was drawn 0.5 mm below the line, so the side is "below" and the solve gives (30, −10) in 1 iteration.

## 13.8 When the solver does not converge

A local method can fail on a consistent system, most clearly from a start on the singular set. Draw the triangle's apex exactly on the base, at (30, 0): the vertical columns of $J$ are zero there, the minimum-norm step has no vertical part, and every iterate of dog leg and of the LM fallback stays on the line. Before it calls a failed cluster a conflict, jig therefore solves once more from a slightly moved drawing: each unknown is shifted by at most 10⁻³ times the cluster's largest coordinate, in a fixed pseudo-random pattern. The flat triangle then solves to (33.125, 22.4217) in 6 iterations. The branch it lands on was chosen by the shift, not by the drawing.

```sketch
// title: A start on the singular line
// The apex is drawn on the base. Try [30, 1] and [30, -1] to choose a side.
return j.sketch('flat', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], [30, 0]], { closed: true })
  .constrain(j.c.fix('t.1'))
  .dim('t.2', 35).dim('t.3', 40)
```

A solve that stops for another reason is still taken for a contradiction. With `.solver(j.solver.lm({ maxIter: 3 }))` the triangle drawn at (30, 30) stops after three iterations, the restart stops too, and jig reports `sketch.overConstrained` with the set `fix(t.1) · length(t.2) = 35 mm · length(t.3) = 40 mm`, although Figure 13.3 shows two solutions. jig decides feasibility by whether a local solve reached a residual of 10⁻⁸, and a solve that stalls looks the same as one with nothing to find; `sketch.unsolved` ("the solver did not converge") appears only when the conflict search comes back empty.

```sketch
// title: A stall reported as a conflict
// expect: sketch.overConstrained
// Three LM iterations are too few. Raise maxIter to 20 and Run.
return j.sketch('cap', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(j.c.fix('t.1'))
  .dim('t.2', 35).dim('t.3', 40)
  .solver(j.solver.lm({ maxIter: 3 }))
```

So, plainly: jig finds one solution per cluster, near the drawing, with a local method and one perturbed restart; it neither enumerates solutions nor proves that none exists. Homotopy continuation, which tracks every isolated solution of a polynomial system, would list both apexes, at far greater cost, and would still leave the choice to the user. In jig the remedy for a stall and for a wrong branch is the same: draw the starting shape closer to the one you want.

## 13.9 Key points

- A solver minimises $\tfrac{1}{2} ‖F(x)‖^2$ from the drawing; jig stops at a largest residual of 10⁻¹⁰ and calls 10⁻⁸ feasible.
- Newton's method converges quadratically near a root where $J$ is nonsingular, and linearly, halving the error, at a singular root.
- For non-square or rank-deficient systems jig takes the minimum-norm Gauss–Newton step through QR of $J^T$; for linear constraints one step gives the solution closest to the drawing.
- Levenberg–Marquardt damps the normal equations; its step always exists, so it escapes near-singular starts.
- Powell's dog leg keeps steps inside a trust region, blending the Gauss–Newton and Cauchy steps; it solves starts where Newton's step is 318 m long.
- jig runs dog leg with an LM fallback; the solver slot chooses another method, without fallback.
- The drawing chooses the branch, through the basin it starts in and through signs read from it; a mirrored drawing gives the mirrored solution.
- A start on the singular set stalls; jig restarts once from a moved drawing, and a solve that still stalls is reported as a conflict.

## Exercises

> **Exercise.** In the sketch "Least change from a sloppy drawing", predict the solved width and height for corners (0, 0), (60, −4), (56, 20) and (−3, 24) before running it. Then run it in the workbench and check.

> **Exercise.** Show that the Levenberg–Marquardt step lies in the row space of $J$ by multiplying $(J^T J + \mu I) J^T = J^T (J J^T + \mu I)$ on both sides by the inverses. What does this mean for an entity no equation touches?

> **Exercise.** Draw a fixed horizontal line and a circle with a diameter dimension of 10 mm whose centre is drawn 2 mm below the line, and constrain them tangent. Run it in the workbench. Which side does the circle end on, and which residual sign from Section 13.7 decided it?

## Further reading

- Dennis and Schnabel, *Numerical Methods for Unconstrained Optimization and Nonlinear Equations*, Prentice-Hall, 1983 (SIAM reprint, 1996): Newton's method and its local convergence theory.
- Nocedal and Wright, *Numerical Optimization*, 2nd ed., Springer, 2006: trust regions, the dog leg, Gauss–Newton and Levenberg–Marquardt in one framework.
- Madsen, Nielsen and Tingleff, *Methods for Non-Linear Least Squares Problems*, 2nd ed., lecture notes, Technical University of Denmark, 2004: short derivations of LM and dog leg, with the damping update jig uses.
- Powell, "A hybrid method for nonlinear equations", in Rabinowitz (ed.), *Numerical Methods for Nonlinear Algebraic Equations*, Gordon and Breach, 1970: the original dog-leg method.
- Moré, "The Levenberg–Marquardt algorithm: implementation and theory", in *Numerical Analysis*, Lecture Notes in Mathematics 630, Springer, 1978: LM as a trust-region method.
- Golub and Van Loan, *Matrix Computations*, 4th ed., Johns Hopkins University Press, 2013: Householder QR with column pivoting and minimum-norm solutions.
