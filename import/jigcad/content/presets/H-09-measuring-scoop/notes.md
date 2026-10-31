# Measuring scoop

A 30 ml scoop for coffee, protein powder or washing powder, with its size engraved on the handle. The bowl is a hemisphere under a short cylinder, and its radius is not drawn: it is solved from the capacity. The idea it teaches is designing to a number you can check: compile the inside of the bowl as a solid, and the volume metric reads 30,000 mm³, 30.0 ml.

> **Try it.** [Look down on it](lab:view/stage?view=plan). Then [make the bowl deeper and narrower](lab:param/k=1) and watch `r` shrink in [the params](lab:show/params) while the capacity stays the same, or [select the bowl](lab:select/cavity/side[inside.bottom]).

## How it is built

The capacity is `ML`, a constant at the top, because the label is written from it too. The inside is a hemisphere of radius `r` with a cylinder `c = k * r` on top, so its volume is π r² c + ⅔ π r³ = π r³ (k + ⅔), and

`r = pow(ml * 1000 / (pi * (k + 2 / 3)), 1 / 3) * 1 mm`,

20.15 mm for 30 ml. `inside` is the half-section of that space: a polyline up the side and across the rim, and an arc `bottom` about (0, `floor + r`). `bowl` is a cylinder `r + wall` across, `handle` a 16 mm slot along X on the bed, and `cavity` revolves `inside` with `op: 'cut'`. `label` engraves `${ML} ml` 0.6 mm into the handle's top face, `hang` drills a 6 mm hole at its end, and `foot` chamfers the bowl's bed edge.

## Checking the volume

Set `SHOW` to `'capacity'` and press [Run](lab:run). The script then returns a part with one feature, `water`: the same `inside` sketch revolved on its own. Its volume metric is the scoop's capacity, levelled at the rim: 30,000 mm³. Change `ML` to 15 for a tablespoon or 60 for a quarter cup, check it the same way, and set `SHOW` back to `'scoop'`.

## Printing it

Upright, with the handle on the bed: the bowl opens upward, so its inside needs no support. It is 25,596 mm³, 20 g of PETG and about 59 min. The inside's layer lines hold a little powder; a level scoop is accurate to about a millilitre.

> **Exercise.** Make a set of three scoops, 15, 30 and 60 ml, in one print job: turn the part into a function of `ml` and add one part per size.

## Where next

[H-06 Egg cup](lab:preset/H-06) solves a bowl from two points. [A-06 Extrude and revolve](lab:preset/A-06) checks revolve volumes against Pappus.
