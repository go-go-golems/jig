# Screw-on wall hook

A hook for a coat, a bag or a dog lead, screwed to the wall or the back of a door with two 4 mm screws. It stands 38 mm off the wall and has a 22 mm lip so the loop cannot slide off. The idea it teaches is printing for strength: the hook lies on its side, so the profile is in every layer, and its screw holes become teardrops with countersunk mouths.

> **Try it.** [Look at the profile](lab:view/stage?view=front). Then [select the plate's front face](lab:select/body/side[side.p.6]), [make it reach further for a thick coat](lab:param/reach=50) and [raise the lip](lab:param/lip=30).

## How it is built

`side` is one closed polyline on the XZ plane, eight corners written in params: x runs out of the wall, z up. `body` extrudes it `w` (22 mm) symmetrically about the plane. The corners of the profile are now the body's edges along Y, so two fillets pick them by shape: `edges('|Y').where(e => e.concave)` are the two inside corners, rounded to `arm / 2` (4.5 mm) because that is where the load concentrates; `where(e => e.convex)` are the outside corners, rounded to 2 mm.

`screws` drills two M4 clearance holes (4.4 mm with the slide class) from the plate's front face. `countersink` then chamfers their mouths by `sink`, 2.4 mm at 45°: a 90° cone, the shape of a countersunk head, opened to 9.2 mm. The chamfer picks its edges as the ones the front face, `sideFace('p.6')`, shares with the holes.

## Printing it

The job fixes `+Y` up, so the hook lies on its side. A hook loaded at the lip bends at the root of the arm; on its side, every layer runs round that corner and the arm cannot split between layers, which it would if printed upright. The holes now run across the build direction, so the kernel makes them 45° teardrops pointing up (two `teardrop` decisions in the [trace](lab:show/trace)), and the chamfer follows the teardrop, so the countersink needs no support either. It is 17,345 mm³, 11 g of PETG and about 34 min.

## Changing it

`H`, `reach`, `lip` and `w` are exposed. Hold `t` at 6 mm or more: the countersink takes 2.4 mm of it. For a heavy winter coat, widen it to 30 mm and add a third screw.

> **Exercise.** Add a third screw at mid-height: add a third point to `screws` and check that `countersink` sinks it too, with no other change, because it selects edges by what they belong to.

## Where next

[S-01 Cable clip](lab:preset/S-01) is another side profile printed on its side. [H-11 Shelf bracket](lab:preset/H-11) carries a heavier load with a gusset.
