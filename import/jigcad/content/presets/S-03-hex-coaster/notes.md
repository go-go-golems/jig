# Hex-pattern coaster

A 90 mm coaster with nineteen hexagonal pockets in its top. The pockets catch the drip that runs down a mug, and the solid rim keeps it off the table. The idea it teaches is a pattern in a sketch: one hexagon, copied onto a hexagonal lattice and filtered to the cells that fit inside the rim.

> **Try it.** [Look down on it](lab:view/stage?view=plan). Then [make the cells smaller](lab:param/cell=6) and watch the count grow in the trace, [widen the webs](lab:param/web=2), or [make it a 110 mm pot stand](lab:param/d=110).

## How it is built

`body` is a disc `d` across and `t`, 4 mm, thick. The sketch `cells` sits on its top face, `j.feat('body').endFace()`, and holds one closed polyline: a hexagon whose corners are `cell` from its centre. `.pattern(['cell'], …)` copies it with `j.pattern.hex`, pitch `cell * sqrt(3) + web`: two flat sides apart plus one web. The lattice frame is turned 30° so that neighbours sit across flat sides, which is what makes every web the same width.

The filter keeps a copy only when its centre's distance plus `cell` stays inside `d / 2 − rim`, so the rim is never thinner than `rim`. `pockets` then cuts all the cells 1.6 mm deep in one feature; the compiler records that it cut into the material because everything lies below the sketch plane. Each pocket floor is a face of its own, `pockets/start#a` and so on; [select one](lab:select/pockets/start#a).

## Printing it

Flat on the bed, top up: the pockets are open at the top, so nothing overhangs. The webs are `lw(3)`, three line widths, 1.35 mm, so the slicer lays them as three clean passes. The top rim has a 0.8 mm chamfer `edge`. It is 20,302 mm³, about 18 g of PLA at 15 % infill and about 46 min.

> **Exercise.** Change the polyline to a circle of radius `cell` and compare: circles leave triangular lands between them that hexagons do not.

## Where next

[S-02 Door wedge](lab:preset/S-02) builds a repeat with a loop instead. [H-02 Soap dish](lab:preset/H-02) uses a pattern of slots to drain water through.
