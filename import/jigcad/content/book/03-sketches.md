---
part: I · Foundations
presets: A-06, S-01
docs: solver
---
# Sketches as equations

Every solid in this book starts as a sketch: curves on a plane whose closed regions become profiles. A sketch can be a drawing, with every coordinate given, or a set of equations, with only the sizes that matter given and the rest solved. This chapter shows how jig decides which, how it counts the freedom a constrained sketch has left, how it tells a constraint that repeats another from one that contradicts it, and how a drag moves a sketch without breaking it. By the end you can predict a sketch's DOF from its entities and constraints, and read a conflict diagnostic as a list of things to check.

## 3.1 An explicit sketch is a drawing

The bracket outline below is six lines and a circle, written as coordinates. With no constraint and no dimension, the sketch is **explicit**: every number is where the entity is, nothing can move, and there is nothing to solve. The compiler records the choice as a decision, `sketch.mode → explicit (no constraints: coordinates are fixed)`, and reports 0 degrees of freedom.

What the sketch gives the solids that follow is its **profiles**: the bounded regions of the arrangement of its curves, nested even–odd. A region inside an odd number of loops is material and one inside an even number is a hole, so the circle inside the outline is a hole without being declared as one. The profile's area is

$$
A = 60 \times 8 + 8 \times 32 - \pi \cdot 2.2^2 = 736 - 15.21 = 720.79\ \mathrm{mm^2},
$$

and the compiler's profile reports 720.79 mm².

```figure
// view: plan
// overlays: dims,dof
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .circle('hole', 2.2, { at: [40, 4] })
```

**Figure 3.1.** An explicit sketch: an L-shaped outline 60 × 40 mm with 8 mm legs and a 4.4 mm hole. Its one profile has an area of 720.79 mm²; the hole is a second loop, so it is subtracted without being declared.

```sketch
// title: An L-bracket outline as a drawing
// Move the hole to [4, 20] and check the profile: it stays one region.
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .circle('hole', 2.2, { at: [40, 4] })
```

Explicit sketches are how most presets are written. In [S-01](lab:preset/S-01) every corner of the cable clip is an expression of five params, so a change to `desk` moves the jaws, with no solver involved. That is enough whenever you know how every point follows from the parameters.

## 3.2 A constrained sketch is a system of equations

Sometimes you know relations, not coordinates: these lines are horizontal, this leg is 8 mm, that corner is fixed. Add one constraint or dimension and the sketch becomes **constrained**: the coordinates are now only starting positions, and the solver moves the entities until every relation holds.

The solver works with **parameters**: a point has 2 (x, y), a line 4 (its two ends), a circle 3, an arc 5. The six lines of the outline have $n = 24$. Each relation is one or more equations: the six corners where the polyline's lines meet are 12 coincidence equations; fixing the first corner is 2; each horizontal or vertical is 1; each length is 1. If $J$ is the Jacobian of all the equations, the number of **degrees of freedom** is

$$
\mathrm{DOF} = n - \operatorname{rank} J .
$$

With the corner fixed, the six lines alternately horizontal and vertical, and the bottom 60 mm long, the rank is 21 and the DOF is 3. A count of equations would give the same here, but only because none repeats another; the next section shows why the rank is the quantity to count. Geometrically the three are the outline's height and the thickness of each leg: every other coordinate is now tied to one of them.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60)
```

**Figure 3.2.** The outline constrained: $n = 24$, rank 21, 3 DOF. The DOF overlay marks the points that can still move; the warning `sketch.underConstrained: 3 DOF remain` lists them as p.2 (end.y), p.3, p.4, p.5 and p.6 (start.y).

```sketch
// title: An outline with 3 DOF left
// Add .dim('p.6', 40) and watch the DOF pill drop to 2.
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60)
```

Three more dimensions, `p.6` 40 mm, `p.2` 8 mm and `p.5` 8 mm, bring the rank to 24 and the status to `fully`. An under-constrained sketch is a warning, not an error: it solves, and the free parameters stay where the starting positions put them. `.strict()` turns the warning into an error for a sketch that must not drift.

## 3.3 Redundant and conflicting constraints

A constraint whose equations add no rank is one of two things, and the difference matters.

A **redundant** constraint agrees with the others. In the fully constrained outline, `parallel(p.1, p.3)` follows from `horizontal(p.1)` and `horizontal(p.3)`: its row of $J$ lies in the span of theirs. Counting equations would say the sketch now has −1 DOF; the rank says 0, which is right. The compiler finds such rows incrementally, drops them, and says why:

```text
sketch.redundant: parallel(p.1, p.3) is implied by horizontal×2; dropped
fix: remove it, or keep it as a driven (reference) constraint
```

A **conflicting** constraint disagrees: no point satisfies all the equations. Give the middle line `p.3` a length of 50 mm while the others make it 60 − 8 = 52 mm, and the system has no solution. "Over-constrained" alone would leave the person searching, so the compiler finds a **minimal conflicting set**: constraints that cannot all hold, such that removing any one of them leaves the rest solvable. It does this with a deletion filter, dropping each constraint in turn and keeping it out when the rest still conflict:

```text
sketch.overConstrained: no solution; minimal conflicting set:
vertical(p.2) · vertical(p.4) · vertical(p.6) · length(p.1) = 60 mm
· length(p.5) = 8 mm · length(p.3) = 50 mm
fix: drop one of the 6; e.g. make dim(p.3) driven (it measures 52 mm)
```

The six are exactly the constraints involved in the arithmetic 60 − 8 = 52: the two horizontal lengths, the thickness of the upright, and the three verticals that make those lengths add along x. A **driven** dimension, `.dim('p.3', null, { driven: true })`, measures instead of constraining; it reads 52 mm and leaves the rank alone.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8)
  .dim('p.3', null, { driven: true })
```

**Figure 3.3.** Fully constrained: rank 24 of 24, 0 DOF, and a driven dimension on `p.3` that measures 52 mm. Replacing the driven dimension by `.dim('p.3', 50)` makes the six-constraint conflict of the text.

```sketch
// title: A conflict to find and fix
// expect: sketch.overConstrained
// This sketch does not solve. Read the diagnostic, then make dim p.3 driven.
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8)
  .dim('p.3', 50)
```

## 3.4 Clusters, solving and dragging

Before solving, the compiler splits the system into **clusters**: the connected components of the graph whose nodes are parameters and whose edges are equations. Two groups of entities that no constraint links are solved separately. Add the hole back to the constrained outline, fix its centre and give it a 4.4 mm diameter, and the sketch has $n = 27$, rank 27, and two clusters: the six lines, and the circle. The decision list records one solver run per cluster, `outline/cluster0 solver → dogleg` and `outline/cluster1 solver → dogleg`.

Each cluster is solved by Powell's DogLeg method: a trust-region step between Gauss–Newton (the minimum-norm solution of the linearised equations, through a rank-revealing QR factorisation) and steepest descent, with Levenberg–Marquardt as the fallback. This follows the decomposition-plan approach of Hoffmann, Lomonosov and Sitharam (2001) in a simple form: split first, then solve small systems. The point of splitting is locality. A **drag** moves one point to where the pointer is, keeps every constraint, and changes as little else as possible; it re-solves only the cluster that contains the point, starting from the current solution.

In the 3-DOF outline of Figure 3.2, dragging the top of the upright, `p.4.end`, to (14, 46) gives:

| line | before | after |
|---|---|---|
| p.1 | (0, 0) → (60, 0) | (0, 0) → (60, 0) |
| p.3 | (60, 8) → (8, 8) | (60, 8) → (14, 8) |
| p.4 | (8, 8) → (8, 40) | (14, 8) → (14, 46) |
| p.5 | (8, 40) → (0, 40) | (14, 46) → (0, 46) |

The fixed, dimensioned bottom stays; the upright and the top follow the pointer; the foot keeps its 8 mm height because nothing pulled it. The sketch still has 3 DOF: a drag moves geometry, it does not add constraints.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .circle('hole', 2.2, { at: [40, 4] })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'),
    j.c.fix('hole.center'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8)
  .dim('hole', 4.4)
```

**Figure 3.4.** Two clusters: the outline (24 parameters) and the hole (3), solved separately. Nothing links them, so a drag on one cannot move the other; to keep the hole in the foot when the foot moves, constrain its centre to the foot instead of fixing it.

```sketch
// title: Drag the upright
// Open it, then drag the top of the upright on the sheet: the bottom stays.
return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60)
```

> **Try it.** Open the last sketch in the workbench. Its free points are drawn in blue on the sheet; drag the top corner of the upright, and then add `.dim('p.6', 40)` and Run: that corner can now move only sideways.

## 3.5 Key points

- A sketch with no constraints and no dimensions is explicit: its coordinates are fixed and its DOF is 0.
- Any constraint or dimension makes the sketch constrained, and its coordinates become starting positions.
- Profiles are the bounded regions of the sketch's curves, nested even–odd, so a loop inside a loop is a hole.
- DOF is the number of parameters minus the rank of the constraint Jacobian, not minus the number of equations.
- A redundant constraint is dropped with a warning; a conflict is reported with a minimal conflicting set and a driven dimension to try.
- The solver splits a sketch into independent clusters and solves each with DogLeg, falling back to Levenberg–Marquardt.
- A drag re-solves one cluster from the current solution and adds no constraints.

## Exercises

> **Exercise.** A circle has 3 parameters. How many DOF does a sketch of two circles have after `j.c.concentric('c1', 'c2')` and `.dim('c1', 10)`? Write it, and check the count against the DOF pill.

> **Exercise.** In the conflicting sketch, remove `j.c.vertical('p.4')` instead of making `p.3` driven. Does it solve? What shape does the upright take, and why is the DOF still 0?

> **Exercise.** Write the outline of [A-06](lab:preset/A-06)'s plate (80 × 50 mm, 4 mm corners) as a constrained sketch: a rectangle helper, its centre fixed at the origin, its width and height as dimensions. Check that it reports `fully`.

## Further reading

- Hoffmann, Lomonosov and Sitharam, *Decomposition plans for geometric constraint systems* (2001): splitting a constraint system into small solvable pieces, the idea behind clusters.
- [How sketches are solved](lab:doc?id=solver): the same material as a reference page.
- [Part V, Inside the solver](lab:book/11): residuals, rank and Laman's theorem, the iterative methods, conflict sets, decomposition and dragging, and how curves become profiles, in Chapters 11–16.
