# Toothbrush holder

A 70 mm square cup for four toothbrushes, with a divider cross that keeps the heads apart and a drain hole in each compartment. The holes run into two tunnels under the floor, so the cup can stand on a flat shelf and still empty. The idea it teaches is the rib: a wall grown from a sketched line until it meets the part.

> **Try it.** [Look down into it](lab:view/stage?view=plan). Then [make the dividers taller](lab:param/drop=15), [make the cup wider for a family](lab:param/W=86), or [select one face of the dividers](lab:select/dividers/start#a).

## How it is built

`body` is a rounded square `W` across and `H` tall, and `cup` cuts its inside from the top down to `floor`, 6.4 mm above the bed. `cross` is a sketch of two lines, drawn across the inside at `H - drop`, 30 mm below the rim. `dividers` is `.rib(cross.wire(['a', 'b']), 'div', { direction: '-Z' })`: each line becomes a wall `div` thick (`lw(3)`, three line widths) that grows down until it leaves the part, so it reaches the floor whatever the height.

`drain` drills one 5 mm hole in the middle of each compartment, at ±`q`, from 3D points on the inside floor. `tunnels` cuts two channels along X at y = ±`q`, under the holes and out through both walls. Their roofs are 45° points, so they need no bridge. `scoop` rounds every inside corner at the floor, walls and dividers alike, so nothing collects in a corner.

## Printing it

Upright. The walls are vertical, the tunnels have pointed roofs and the holes open into them, so there is nothing to support. It is 85,512 mm³, 109 g of PETG and about 5 h. Most of that is the 6.4 mm floor, which also makes the cup hard to knock over.

> **Exercise.** Make six compartments: move line `b` to x = `-W / 6`, add a line `c` at x = `W / 6`, and list it in `cross.wire([...])`. The new wall reaches the floor with no other change; then move the drain holes to the new compartments.

## Where next

[H-02 Soap dish](lab:preset/H-02) drains the same way through slats. [H-13 Spice-jar insert](lab:preset/H-13) divides a drawer into rows.
