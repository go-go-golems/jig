# Hex-bit holder

A stepped block that holds thirty 1/4" screwdriver bits in three rows of ten, each row 8 mm higher than the one in front so every bit can be read and pulled. The idea it teaches is sizing a pocket from a standard and a gap: the hexagon is 6.35 mm across the flats (ISO 1173 E6.3) plus 0.15 mm on each flat, and the spacing follows from that.

> **Try it.** [Make the rows twelve wide](lab:param/per_row=12) and watch the block grow, then [loosen the pockets to 0.25 mm a flat](lab:param/gap=0.25). [Select the middle step](lab:select/body/side[side.p.5]) and [look at the steps from the side](lab:view/stage?view=side).

## How it is built

`side` is the stepped side profile on the YZ plane: three treads 14 mm deep (`row`) rising by `rise`. `body` extrudes it symmetrically along X to `w`, which is the row of pockets plus 3 mm at each end.

Each row is its own sketch on its own tread height: one hexagon `hex` at the left end of the row and a linear pattern of it, `per_row` long. A loop in the script cuts the three rows (`row1`, `row2`, `row3`) down by `depth`; the extent is negative because each sketch plane faces up and the cut goes down.

## The pocket and the spacing

The hexagon is drawn by its apothem, `af / 2 + gap`, so the pocket measures 6.65 mm across the flats. A 0.15 mm gap sits between the snug (0.10 mm) and slide (0.20 mm) fit classes: bits stay put when the block is tipped and still pull out with two fingers. The corners point along the row, so the pitch is the width across the corners plus the web:

```js
pitch: 'af / cos(30 deg) + 2 * gap + web',   // 7.33 + 0.30 + 2.25 = 9.88 mm
```

`web` is `lw(5)`, five line widths of plastic at the narrowest point between two pockets.

## Printing it

Upright, as it sits on the bench: 81.3 cm³ solid, about 47 g of PETG with 15 % infill and 124 min. The pockets are vertical, so they need no teardrops and print true; the 12 mm depth holds half of a 25 mm insert bit. `foot` chamfers the four bed edges by 0.5 mm against elephant's foot. PETG is a little springy, which helps the bits seat in a pocket that is printed slightly undersize.

## Where next

- [D-04 Battery holder](lab:preset/D-04): round pockets on a grid set by a count.
- [D-06 Memory-card holder](lab:preset/D-06): slots sized from a table of card formats.
