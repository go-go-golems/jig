---
id: solver
title: How sketches are solved
group: Modelling
about: Explicit and constrained sketches, degrees of freedom, redundant and conflicting constraints, and dragging.
order: 21
---
# How sketches are solved

A sketch is a set of 2D curves on a plane. jig treats it in one of two ways. An **explicit** sketch is a drawing: its numbers are coordinates and nothing moves. A **constrained** sketch is a system of equations: its numbers are a first guess, and the solver moves the geometry until every constraint and dimension holds. This page explains how the compiler chooses, how it counts what is still free, what it does with constraints that repeat or contradict each other, and how a drag on the sheet works. [Chapter 3](lab:book?ch=3) derives the same results with figures.

## Explicit or constrained

A sketch with no `.constrain()` and no `.dim()` is explicit. Every entity made by `point`, `line`, `polyline`, `arc`, `circle`, `ellipse`, `spline`, `text` and `import` is fixed where its numbers put it, so the sketch has no degrees of freedom and needs no solving. Most presets are written this way, with every coordinate an expression of the params:

```js
j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
```

Add one constraint or one dimension and the whole sketch becomes constrained: the same six points are now starting positions. The choice is a decision in the Program (`sketch.mode → constrained: constraints or dimensions given: coordinates are starting positions`), and `j.sketch(id, { mode: 'explicit' | 'constrained' })` overrides it. Helpers that take sizes (`rect`, `polygon`, `slot`, `fillet`, `chamfer`) add constraints for the sizes they are given in both modes, so a rectangle keeps its width while its neighbours move.

Why two modes: a drawing written as coordinates is exact and needs no solver, but it cannot be dragged and does not say which sizes matter. A constrained sketch says which sizes matter (this leg is 8 mm, these lines are parallel) and leaves the rest to the solver, at the price of having to say enough.

## Unknowns, equations and DOF

The solver turns the sketch into numbers. Each entity has parameters: a point has 2 (x, y), a line 4 (both ends), a circle 3 (centre and radius), an arc 5. Each constraint is one or more equations in those parameters: a coincidence is 2 equations, horizontal is 1, a length is 1, fixing a line is 4. Let $n$ be the number of parameters and $J$ the Jacobian of all equations with respect to them. The **degrees of freedom** are

$$
\mathrm{DOF} = n - \operatorname{rank} J .
$$

The rank, not the number of equations, is what counts, because some equations can follow from others. The L-shaped outline above, constrained, has 6 lines and so $n = 24$. Its 6 corner coincidences give 12 equations. Fixing the first corner, making the lines alternately horizontal and vertical and giving the bottom a length of 60 mm adds 9 more: rank 21, DOF 3. Those three are the height, the thickness of the foot and the thickness of the upright, and the warning `sketch.underConstrained: 3 DOF remain` lists the entities that can still move. Three more dimensions (`p.6` 40 mm, `p.2` 8 mm, `p.5` 8 mm) bring the rank to 24 and the status to `fully`.

Under-constrained is a warning, not an error: the sketch still solves, with the free parameters left where they started. `.strict()` makes it an error, for sketches that must not drift.

## Redundant and conflicting

Two things can go wrong with an equation that adds no rank.

A **redundant** constraint agrees with the others. In the fully constrained outline, `parallel(p.1, p.3)` already follows from `horizontal(p.1)` and `horizontal(p.3)`. The compiler finds that the new row lies in the span of the existing ones, drops it and warns: `sketch.redundant: parallel(p.1, p.3) is implied by horizontal×2; dropped`. The geometry is unchanged.

A **conflicting** constraint disagrees. Give the middle line `p.3` a length of 50 mm when the others already make it 60 − 8 = 52 mm, and no point satisfies all of them. Reporting "over-constrained" is not enough: the person needs to know which constraints to look at. It finds a **minimal conflicting set**, a set of constraints that cannot all hold but any one of which can be removed to fix it, by a deletion filter: drop each constraint in turn and keep it out if the rest still conflict. The diagnostic names six:

```text
sketch.overConstrained: no solution; minimal conflicting set:
vertical(p.2) · vertical(p.4) · vertical(p.6) · length(p.1) = 60 mm
· length(p.5) = 8 mm · length(p.3) = 50 mm
fix: drop one of the 6; e.g. make dim(p.3) driven (it measures 52 mm)
```

A **driven** dimension, `.dim('p.3', null, { driven: true })`, measures instead of constraining: it reports 52 mm and adds no equation.

## The solver

The compiler first splits the system into **clusters**, the connected components of the graph whose nodes are parameters and whose edges are equations, and solves each on its own. Two rectangles that share nothing are two clusters; a drag on one never touches the other.

Each cluster is solved by Powell's **DogLeg** method: a step that blends Gauss–Newton (the minimum-norm solution of the linearised equations, through a rank-revealing QR factorisation) with steepest descent, inside a trust region. If DogLeg does not converge, Levenberg–Marquardt takes over. The result is recorded per cluster: `outline/cluster0 solver → dogleg (default; converged in 0 iterations, residual 0e+0)`. Zero iterations means the starting positions already satisfied every equation, which is common when the coordinates were drawn to size. `.solver('lm')`, `.solver('newton')` or `j.solver.lm({ maxIter: 200 })` choose another method, and a lambda `(cluster, ctx) => ctx.default` can choose per cluster.

## Dragging

A sketch with free DOF can be dragged on the sheet: open a sketch-only program, or select a sketch in the graph, and the free points are drawn in blue. Dragging one sends a **drag** to the engine: move this ref to this point, keep every constraint, and change as little else as possible. The engine re-solves only the dragged point's cluster, starting from the current solution.

In the under-constrained outline (3 DOF), dragging the top of the upright, `p.4.end`, to (14, 46) moves the upright to x = 14 mm and the top to y = 46 mm. The first line, fixed and dimensioned, stays where it was, and the foot keeps its 8 mm height because nothing pulled it. The sketch still has 3 DOF afterwards: a drag moves the geometry; it adds no constraints. To keep a dragged size, write it as a dimension.

A drag changes only what the sheet shows; it never feeds a compile. Compiles have their own continuity: a constrained sketch whose text is unchanged starts from its last solution in the same worker (a **warm start**), so moving a parameter keeps the solver on the same branch, the same flip of an arc or side of a line, instead of jumping to another solution. An edited sketch, an explicit sketch and a fresh worker solve cold, from the coordinates in the script.

## When the solver gives up

`sketch.unsolved` means the cluster did not converge from the starting positions. A constrained sketch whose guesses are far from any solution, or whose constraints have two solutions and the guess sits between them (a tangent arc that could flip), is the usual cause. Draw the starting coordinates closer to the intended shape, or try `.solver('lm')`. `sketch.ref` means a constraint names something that does not exist, such as `p.l1` for a polyline whose lines are `p.1`, `p.2`, ….
