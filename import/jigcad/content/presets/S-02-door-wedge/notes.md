# Door wedge with grip ribs

A 120 mm door wedge that slides under an interior door and stops it swinging shut. The underside carries fifteen V-grooves; the ribs between them catch on carpet, tiles and mats, where a flat wedge skates. Like S-01 it is one sketch and one extrude, but the outline is written by a loop: the script is JavaScript, and a `for` loop is the shortest way to say "fifteen grooves".

> **Try it.** [Look at it from the front](lab:view/stage?view=front) to see the grooves. Then [make it taller for a wide gap](lab:param/H=40), [deepen the grooves](lab:param/rib=2.5) and [select the slope the door rides up](lab:select/body/side[side.outline.2]).

## How it is built

The outline starts at the tip, climbs the slope to `H` at the back, comes down and runs back along the floor. On the way back the loop adds three points per groove, `[x + rib, 0]`, `[x, rib]`, `[x − rib, 0]`: a 90° V `rib` deep. Each `x` is an expression, `margin + i * (L − 2 * margin) / 14`, so changing `L` spreads the grooves out instead of leaving a gap. The count, 15, is a constant in the script because it shapes the outline itself; change it in the code and press [Run](lab:run).

The circle `hang` sits inside the outline, so it becomes a hole in the profile: one extrude makes the wedge and its 8 mm hanging hole together.

## Printing it

The job lays the wedge on its side (`-Y` up): the outline is the first layer, so the grooves and the hole print without support and the slope is smooth. It is 60,059 mm³ as a solid, about 29 g of PLA at 15 % infill, and takes about 83 min. PLA is enough; a wedge printed in TPU grips even better and needs a slower print.

> **Exercise.** Make a low wedge for a 6 mm gap: set `H` to 15 mm and `tip` to 1.2 mm, then look at the front view and decide whether `margin` should shrink too.

## Where next

[S-01 Cable clip](lab:preset/S-01) is the same build with a profile that flexes. [S-03 Hex coaster](lab:preset/S-03) uses a pattern instead of a loop.
