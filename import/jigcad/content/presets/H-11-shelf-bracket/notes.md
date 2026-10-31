# Shelf bracket

A bracket for a 150 mm shelf: a wall leg, a shelf leg and a diagonal gusset that turns the two into a triangle, with two countersunk screws into the wall and two up into the shelf. The idea it teaches is a frame whose window is solved from the gusset's width, and printing a loaded part so that the load runs along its layers.

> **Try it.** [Look at the profile](lab:view/stage?view=front). Then [make the gusset wider](lab:param/b=10), [size it for a 200 mm shelf](lab:param/D=200), or [select the gusset's inside face](lab:select/body/side[frame.inner.3]).

## How it is built

`frame` holds two closed polylines on the XZ plane. `outer` is the triangle: down the wall, out along the shelf, and back down the gusset's outer face from the shelf's tip to the foot of the wall leg. `inner` is the window, and the sketch makes it a hole in the profile because it lies inside `outer`. Two of its corners come from the gusset's inner face, a line `b` from the outer one: it meets the wall leg at height `b * hyp / (D - t)` and the shelf leg at `D - b * hyp / (H - t)`, where `hyp = hypot(D - t, H - t)`. Change `D`, `H` or `b` and the window keeps the gusset `b` wide.

`body` extrudes the frame `w` wide; `inside` rounds the window's three corners by `r`. `wall` and `shelf` are M4 clearance holes from the slide fit class, 4.4 mm, drilled from the inside faces where a screwdriver reaches through the window. `countersink` chamfers their mouths by 2.3 mm at 45°, opening them to 9 mm for a countersunk head.

## Printing it

On its side (`+Y` up), so each layer is the whole triangle. A loaded shelf pulls the top of the wall leg away from the wall and pushes the gusset into it; on its side, those forces run along the layers rather than across them, where printed parts are weakest. All four holes now lie across the build direction, so they are teardrops, and the chamfers follow the teardrops. It is 68,457 mm³, 39 g of PETG and about 1 h 42 min.

A pair of these in PETG holds a pine shelf with books; for heavier loads use the `L` config, which thickens the legs to 8 mm, and print with five walls.

> **Exercise.** Add a lip at the shelf leg's tip that stops the shelf sliding forward: two more points in `outer`, and check that the lip's top is not an overhang on its side.

## Where next

[S-08 Wall hook](lab:preset/S-08) uses the same chamfered teardrops. [H-12 Curtain-rod bracket](lab:preset/H-12) carries a rod on a wall plate.
