# A constrained sketch

An 80 × 40 mm mounting plate whose outline and holes are solved from constraints instead of typed as coordinates. It is the preset to read first if you want to see the sketch solver at work: what it fixes, what it leaves free and what happens when you drag.

> **Try it.** [Open the sketch on the stage](lab:sketch/outline), then drag hole `h2` along the plate: it slides in x and keeps its height, because that is the one degree of freedom left. [Make the plate 120 mm wide](lab:param/w=120) and watch `h1` keep its 12 mm from the left edge.

## How it is built

The outline is four lines. Writing `'l1.end'` as the start of `l2` makes the two lines share a point, so the corners stay closed. `horizontal` and `vertical` keep the sides square, `fix('l1.start')` pins the corner at the origin, and two dimensions size it: `l1` is `w` and `l2` is `d`.

Hole `h1` has its diameter from `hole_d` and its centre placed by two dimensions, 12 mm from the left edge and half the depth up. Hole `h2` is `equal` to `h1` and has a vertical distance of 0 mm to it, so it shares the size and the height but not the x position.

## What the solver reports

Because the sketch has constraints, it is solved in **constrained** mode: the numbers written in the code are only starting positions. The compile reports 1 DOF left, `h2:center.x`, as a `sketch.underConstrained` warning, and the sketch inspector lists it under *Still free*. Dragging on the sheet solves only the cluster that holds `h2`, from where it is now, so nothing else moves.

To fix the last DOF, add a dimension for `h2` from the right edge, for example `.dim({ h: ['h2.center', 'l2.start'] }, 'edge')`, and press Run: the status becomes fully constrained, 0 DOF.

## Where next

[A-01](lab:preset/A-01) uses a rectangle helper instead, which constrains itself. Chapter 3 of the [book](lab:show/book), *Sketches as equations*, explains DOF, rank and conflicts.
