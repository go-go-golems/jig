# Spice-jar drawer insert

An insert for a kitchen drawer that holds spice jars lying down, lids up and facing you, each row a little higher than the one in front so every lid can be read from above. One module holds two rows of two jars; a front and a back module make a 388 mm staircase of four rows, and pairs of modules side by side fill the drawer's width. The idea it teaches is a sheet part: an open zigzag thickened by an offset, printed on its side.

> **Try it.** [Look at the profile](lab:view/stage?view=front). Then [select the first slope](lab:select/sheet/side[sheet.top.2]) and open [the params](lab:show/params): each module lists its own copy. To size both for tall jars, set `jar` to 110 mm in the code and press [Run](lab:run); the back module follows, because its `x0` and `lift` are written from `p` and `rise`.

## How it is built

`top` is an open polyline written by a loop: up the front wall to `h0`, then for each row a slope falling `d` back to its riser, up the riser by `rise`, and after the last row a stop `stop` tall. `p = jar * cos(a)` is a row's depth and `d = p * tan(a)` its fall, so a row is exactly one jar long at any tilt. `.offset('under', ['top'], '-t')` adds a parallel copy 1.8 mm underneath with end caps: the sketch's one profile is now a closed sheet, `t` thick. A second sketch adds a leg under the foot of each slope, so the sheet stands on the drawer's floor.

`x0` and `lift` move a module back and up. The `back` config sets them to two rows' depth and two rises, so the back module continues the staircase behind the front one. The print job adds the same part twice, `insert` and `insert.config('back')`.

## Printing it

On its side (`+Y` up), both modules on one plate: every layer is the whole zigzag, so the 15° slopes, the risers and the legs all print as walls, with no overhang and no support. The pair is 116,107 mm³, 144 g of PLA and about 6 h 32 min. Most of that is the 100 mm width; `W` of 50 mm holds one jar per row in half the time.

> **Exercise.** Measure your drawer. Work out how many pairs fit its width, and whether a third module (`x0` of `4 * p`, `lift` of `4 * rise`) fits its depth and its height.

## Where next

[D-03 Desk tray](lab:preset/D-03) divides a drawer into compartments. [H-03 Toothbrush holder](lab:preset/H-03) grows walls from lines with a rib.
