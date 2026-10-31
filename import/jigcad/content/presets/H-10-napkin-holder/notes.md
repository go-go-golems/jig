# Napkin holder

A holder for a stack of paper napkins on the kitchen table: two walls on a base, 170 mm long, with pointed windows that show the napkins' colour and save filament. It is one U-shaped profile extruded along the napkins, and one patterned cut through both walls. The idea it teaches is a cut that goes through everything: one window sketch makes an opening in each wall.

> **Try it.** [Look at it from the front](lab:view/stage?view=front) to see the profile. Then [make room for a thicker stack](lab:param/gap=55), [have three windows instead of four](lab:param/n=3), or [select the inside of a wall](lab:select/body/side[side.u.4]).

## How it is built

`side` is a closed polyline of eight corners on the XZ plane: the base `b` thick, two walls `t` thick and `H` tall, `gap` apart. `body` extrudes it `W` symmetrically along Y. `inside` rounds the two inside corners by 6 mm, picked as the concave edges along Y, so the bottom napkin slides out cleanly; `tops` rounds the walls' tops.

`windows` is a sketch on the YZ plane, so its x is world Y. One window is a six-point outline with 45° points at both ends, at the first position `-(n - 1) * pitch / 2`, and `j.pattern.linear` repeats it `n` times along the sketch's x. `{ through: 'all' }` cuts in both directions along X, through both walls. With `n` at 0 the walls are solid.

## Printing it

Upright on its base. The walls are vertical and the windows' tops are 45° points, so nothing is bridged. It is 89,943 mm³, 91 g of PLA and about 4 h 14 min: most of it is the walls, so `t` is the number to change if you want it quicker.

> **Exercise.** Make a holder for 24 cm cocktail napkins: set `W` to 130 mm and `H` to 60 mm, then choose `n` and `pitch` so the windows stay at least 6 mm from the ends.

## Where next

[S-10 Phone stand](lab:preset/S-10) is another profile extruded to width. [D-01 Pen cup](lab:preset/D-01) cuts pointed windows the same way, round a hexagon.
