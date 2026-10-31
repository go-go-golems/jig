# Soap dish with drain slots

A 110 × 75 mm soap dish for a shower shelf or the edge of a basin. The soap rests on slats; water runs down through ten slots into channels underneath and out through the front and back walls, so the bar dries between uses instead of sitting in a puddle. The idea it teaches is designing out overhangs: nothing in this part is printed over air.

> **Try it.** [Look at it from the side](lab:view/stage?view=side). Then [space the slots wider](lab:param/pitch=12) and watch the count drop to eight, [make it fit a long shelf](lab:param/W=140), or [select the wall of the first slot](lab:select/channels/side[channels.c.2]): the slot and its channel share one face.

## How it is built

`body` is a rounded rectangle 20 mm tall. `foot` chamfers its bed edges first, while the outline is still eight edges. `well` cuts the pocket from the top down to `top`, 6 mm above the bed: `lift` (4 mm of channel) plus `floor` (2 mm of slat).

`channels` is a five-point outline on the XZ plane, a 3 mm tunnel with a 45° roof, patterned across X and cut through the whole depth of the dish. `slots` is a 3 mm rectangle patterned the same way and cut down from the floor into the channels. Its depth is negative, `-(floor + slot_w / 2)`: the sketch plane has material on both sides, so the cut is told which way to go. Both patterns use `n = floor((W - 2 * wall - 20 mm) / pitch) + 1`, the number of slots that fit, so a longer dish gets more of them. `scoop` rounds the floor into the walls; `rim` rounds the top.

## Printing it

Flat on the bed. Every slat runs down to the bed between two channels, so it is supported along its length; the channels' roofs are 45° points, so they need no bridge; the slots are open at the top. The overhang check finds nothing. It is 48,919 mm³, 46 g of PETG and about 2 h. PETG, because a shower is warm and wet and PLA slowly creeps there.

> **Exercise.** Make the slots 2 mm wide for a small guest soap and set `pitch` to 6 mm. Check the slat between slots stays at least 4 mm, three line widths and a bit.

## Where next

[S-03 Hex coaster](lab:preset/S-03) patterns pockets in a sketch the same way. [H-03 Toothbrush holder](lab:preset/H-03) drains through its floor too.
