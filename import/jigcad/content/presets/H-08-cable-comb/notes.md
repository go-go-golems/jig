# Cable comb

A comb for dressing a bundle of cables: twelve Cat6 network cables, or the leads behind a desk, held parallel at the same spacing so the bundle stays tidy. Each cable snaps in sideways through a slit narrower than itself, so the comb can be added to a bundle that is already plugged in. The idea it teaches is drawing one closed outline from lines and an arc, then mirroring and patterning it inside the sketch.

> **Try it.** [Look down on it](lab:view/stage?view=plan). Then [switch to thin USB leads](lab:param/cable=4), [add holes](lab:param/n=8), or [select the round end of the first hole](lab:select/slots/side[slots.a]).

## How it is built

The outline of one hole and its slit is a polyline `u` of three lines (up the slit's right side, across beyond the edge, down its left side) and an arc `a` about the hole's centre from the left side round the bottom to the right. They share end points, so the sketch finds one closed loop, and the slit and the hole are cut together. `y0`, where the slit meets the circle, is `row + sqrt(r * r - slit * slit / 4)`, so the lines end exactly on the arc.

`.mirror(['u', 'a'], 'X')` adds the lower row's copy, with its slit facing the other edge. `.pattern(['u', 'a', 'a.m'], j.pattern.linear(…, { count: 'n', step: 'pitch' }))` repeats both across the comb; `u` stands for its segments and their mirror copies, the arc's copy is named on its own. One cut, `slots`, then makes all twelve.

The hole is `cable / 2 + 0.2 mm` in radius, a loose fit; the slit is `cable * 0.75`, 4.7 mm for a 6.2 mm cable, so the cable squeezes through and stays. `ease` chamfers the top edges of every hole and slit by 0.6 mm.

## Configs

`cat6` (6.2 mm, six per row) is the default; `usb` makes eight 4 mm holes per row, `power` four 8 mm ones. `pitch`, the plate's size and the hole positions are expressions of `cable` and `n`, so each row fits.

## Printing it

Flat on the bed. The holes are vertical and the bed edges stay square, because a chamfer there would overhang. It is 8,068 mm³, 7 g of PETG and about 19 min. PETG, because the teeth flex every time a cable goes in; PLA teeth snap after a few.

> **Exercise.** Make a round comb for a 24-cable bundle: a disc with the holes on two rings, the slits running outward. Use `j.pattern.circular` in place of the linear pattern.

## Where next

[S-01 Cable clip](lab:preset/S-01) holds one cable at a desk's edge. [H-05 Key rack](lab:preset/H-05) repeats a feature with a param count.
