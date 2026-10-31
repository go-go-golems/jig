# Gridfinity baseplate

A 3 × 2 baseplate for the Gridfinity storage system: six 42 mm sockets that bins drop into and stay put, in a drawer or on a shelf. It is the open-bottomed light plate, only the socket profile and nothing under it, so it prints in 25 min. The idea it teaches is a lofted tool: one loft through four rounded squares makes the stepped 45° socket, and a grid pattern repeats it.

> **Try it.** [Make it four cells across](lab:param/nx=4), then [open the params](lab:show/params) and pick the `5x4` configuration, the largest that fits a 250 × 210 mm bed; `2x2` and `3x2` are the others. [Select the front face](lab:select/plate/side[base.r.bottom]), only 4.65 mm tall, and [look at the plate from above](lab:view/stage?view=plan).

## The Gridfinity profile

Gridfinity is Zack Freedman's open grid: a 42 mm pitch, heights in 7 mm units, bins 41.5 mm square so there is 0.25 mm all round. A baseplate socket is, from the top down, a 2.15 mm step at 45°, a 1.8 mm straight band and a 0.7 mm step at 45°: 4.65 mm deep, 42 mm across at the top with 4 mm corners and 36.3 mm at the bottom. The plate is exactly that tall, `h = s1 + s2 + s3`, so the sockets go right through.

## One loft, repeated

`section(id, z, inset)` is a rounded square `pitch − 2 · inset` across, at height `z`, with a corner radius of `r_top − inset`. Shrinking the radius by the inset makes each corner a true 45° cone, the offset of the one above. `socket` lofts four sections with `ruled: true`, so the faces between them are flat:

| section | z | inset | across |
|---|--:|--:|--:|
| `s-bottom` | −0.5 mm | 3.35 mm | 35.3 mm |
| `s-low` | 0.7 mm | 2.15 mm | 37.7 mm |
| `s-high` | 2.5 mm | 2.15 mm | 37.7 mm |
| `s-top` | 5.15 mm | −0.5 mm | 43 mm |

The first and last sections carry the slopes 0.5 mm past the plate (`over`), so the cut leaves no skin on either face, and next to each other the tools overlap above the plate. The ridges between cells come to a sharp edge at 4.65 mm, as in the Gridfinity drawings. `sockets` repeats the cut on an `nx` × `ny` grid at the pitch, one boolean per cell, so the compile time grows with the number of cells: a 5 × 4 plate takes several times as long as this one.

## Printing it

Flat, as it lies: 7.7 cm³, about 10 g of PLA and 25 min. The 45° slopes face up and need no support; the bed sees a lattice of ridges 5.7 mm wide. The outer edge is 4 mm round to match the corner of a socket, so plates butt up against each other in a drawer and the grid carries on across the joint.

## Where next

- [D-10 Gridfinity bin](lab:preset/D-10): the bins that sit in these sockets.
- [D-03 Desk tray](lab:preset/D-03): fixed compartments in one block.
