# Egg cup

An egg cup for a medium hen's egg, 45 mm tall, printed four to a plate for the breakfast table. It is one half-section turned about Z: a foot, a stem, a cone flaring out to the rim, and a spherical bowl that holds the bottom half of the egg. The idea it teaches is solving a little geometry in an expression: the bowl's centre is computed so the bowl always meets the rim where it should.

> **Try it.** [Look at the section from the front](lab:view/stage?view=front). Then [size it for a large egg](lab:param/egg=46), [slim the stem](lab:param/stem_d=18), or [select the bowl](lab:select/body/side[section.bowl]).

## How it is built

`section` is an open polyline `o` up the axis, out along the foot, in to the stem, out to the rim and in to `rin`, closed by an arc, `bowl`, from the bottom of the bowl back to the rim. The arc's centre is on the axis at `zc`. For the circle to pass through both (0, `H - depth`) and (`rin`, `H`), its centre must satisfy `rin² + (H - zc)² = (H - depth - zc)²`, which gives

`zc = H - (depth * depth - rin * rin) / (2 * depth)`,

about 1.4 mm below the rim for a 43 mm egg. `rin` is `egg / 2 - 1.5 mm`, so the egg rests on the rim just below its widest point, and `depth` is half the egg. Change `egg` and the bowl, the rim and the centre all follow.

`body` revolves the section a full turn. `rim` rounds both edges of the rim by 1.5 mm; the edge between the bowl and the rim becomes a smooth blend. `foot` chamfers the bed edge, 0.4 mm in and 0.7 mm up, steeper than 45°.

## Printing it

Upright, four to a plate. The cup flares out 22° from vertical and the bowl opens upward, so nothing needs support. Each cup is 31,904 mm³; the four take 77 g of PLA and about 3 h 26 min. The smooth outside is the stem's cone: print it with a slow outer wall for the best finish.

> **Exercise.** Make the outside of the cup follow the bowl: replace the cone from the stem to the rim with an arc about (0, `zc`) of radius `rin + 3 mm` and check that the overhang note stays clear.

## Where next

[S-09 Cabinet knob](lab:preset/S-09) is a turned profile printed upside down. [H-09 Measuring scoop](lab:preset/H-09) sizes its bowl from a volume instead.
