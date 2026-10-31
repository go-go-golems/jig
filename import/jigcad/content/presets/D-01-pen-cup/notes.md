# Pen cup with pointed windows

A hexagonal pen cup, 70 mm across the flats and 100 mm tall, with six tall windows in its sides. It is made by one extrude, one fillet, one shell and one cut that a pattern repeats. The idea it teaches is printability by shape: the windows are pointed at both ends, so their tops print as 45° slopes instead of a bridge that needs support.

> **Try it.** [Select one of the flats](lab:select/body/side[base.hex.2]), then [make the windows 20 mm wide](lab:param/win_w=20) and [look at it from the front](lab:view/stage?view=front). Open [the trace](lab:show/trace) to see which features were computed again.

## How it is built

`base` is a hexagon given by its apothem: `polygon('hex', 6, 'af / 2', { inscribed: false })`, so `af` is the width across the flats you would measure with a calliper. `body` extrudes it by `h`, `round` rounds the six vertical edges by `r`, and `shell` hollows it with 1.8 mm walls (`lw(4)`, four perimeters of a 0.45 mm line) and an open top.

`window` is one closed polyline on the XZ plane, cut symmetrically through two opposite flats. `windows` turns that cut 60° and 120° about Z, so three tool solids make six openings.

## Printing it

Printed upright with the floor on the bed: 38.6 cm³, about 48 g of PLA and 152 min on a generic 0.4 mm printer. The bottom edge has a 0.6 mm chamfer (`foot`) rather than a fillet: a chamfer on a bed edge hides elephant's foot and needs no support. The overhang check finds nothing, because every downward-facing edge of a window is at 45°.

## Changing it

`af`, `h`, `win_w` and `wall` are exposed. The sill and lintel (12 mm each) keep a solid band at the floor and the rim, so a wider or taller cup keeps its stiffness. With `win_w` above about 24 mm the posts between windows get thinner than the windows, and the cup flexes when you grab it.

## Where next

- [D-02 Business-card holder](lab:preset/D-02): a side profile extruded to width.
- [A-01 A box with walls](lab:preset/A-01): the shell on its own.
