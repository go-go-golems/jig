# 18650 cell holder

A tray for two 18650 lithium-ion cells lying side by side, with a slot at each end of each bay for the sheet-metal contacts (a flat plate at one end, a spring at the other) and a hole in the floor for each contact's solder tab. The cell comes from a table, so the same script holds 14500 or 21700 cells. The idea it teaches is a pocket that holds by its shape: each bay is a cylinder cut whose axis is just below the rim, so the cell clicks in, and still nothing in the trough leans more than 17° from vertical.

> **Try it.** [Hold four cells](lab:param/n=4), then [open the params](lab:show/params) and switch the configuration to `21700`. [Select the trough of a bay](lab:select/bay/side[bay.c]) and [look from above](lab:view/stage?view=plan) to see the contact slots and tab holes.

## The table

`cells.csv` lists three common lithium-ion sizes by their largest diameter and length: 14500 Ø14.5 × 50.5 mm, 18650 Ø18.6 × 65.2 mm and 21700 Ø21.7 × 70.6 mm. These are unprotected cells; a protected 18650 is up to 69 mm long, so add 4 mm to `l` for those. With no configuration chosen, the middle row, 18650, is active.

## The bay

`bay` is a circle on the XZ plane, `d / 2 + gap` in radius (the free class's 0.3 mm), cut along Y for the bay's length `Lb = l + spring`: 70.2 mm, with 5 mm for the spring contact compressed. The cells' axis is at `zc` and the rim at `zc + 0.15 · d`, so the opening at the rim is 2 × √(9.6² − 2.79²) = 18.37 mm, 0.23 mm under the cell: a cell presses in past the rim and stays when the holder is turned over. At the rim the wall leans 17° from vertical, well inside the 45° limit.

`slots` cuts a 0.8 mm × 12 mm slot down the inside of each end wall for a 0.3 to 0.5 mm contact plate, and `tabs` opens a 4 × 1.5 mm hole through the floor below it for the solder tab. `bays` patterns the three cuts together, `n` times at the cell pitch. Wire the tabs under the holder: end to end for cells in series, side by side for cells in parallel.

## Printing it

Upright: 22.0 cm³, about 21 g of PETG and 55 min. The slots, the tab holes and the two M3 holes in the end walls are vertical, so they print to size. The check's 2.2 mm² is the corners of the 0.5 mm bed chamfer, which sit exactly at 45°. PETG keeps its shape near a warm cell better than PLA.

## Where next

- [D-04 Battery holder](lab:preset/D-04): cells standing up, from a table and a count.
- [X-05 Project box](lab:preset/X-05): a box to put the pack in.
