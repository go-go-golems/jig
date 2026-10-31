# Gridfinity bin

A Gridfinity bin two cells wide, one deep and three units tall (83.5 × 41.5 × 25.4 mm), with a foot under each cell, a 6 × 2 mm magnet pocket at each corner of every foot and a stacking lip on top. The size comes from a table of bins. The idea it teaches is one profile used twice: the feet are a loft added under the bin, and the inside is a loft removed from it, with the lip's socket at its top.

> **Try it.** [Open the params](lab:show/params) and switch the configuration to `2x2x6`, then [make it three cells across](lab:param/gx=3). [Select the long side](lab:select/body/side[outline.r.bottom]) and [look at it from the front](lab:view/stage?view=front) to see the feet and the lip.

## The table

`bins.csv` lists three bins by their grid size: `1x1x3`, `2x1x3` and `2x2x6`. `j.table` turns the rows into configurations, and with none chosen the middle row is active. Every other size is an expression of `gx`, `gy` and `u`:

```js
W: 'gx * pitch - 0.5 mm',    // 83.5 mm: 0.25 mm clear of the grid all round
H: 'u * 7 mm',               // 21 mm to the top of the wall
top: 'H + lip',              // 25.4 mm with the 4.4 mm stacking lip
```

## The feet

A Gridfinity foot is, from the bed up, 0.8 mm at 45°, 1.8 mm straight and 2.15 mm at 45°: 35.6 mm across at the bottom and 41.5 mm at 4.75 mm. `foot` lofts four rounded squares through those steps with `ruled: true`; each square's radius is 3.75 mm less its inset, so the corners are cones at the same 45°. `feet` repeats the loft on the `gx` × `gy` grid, and `body` extrudes the bin's outline from the top of the feet to `top`, joining them.

## The inside and the lip

`inside` is one ruled loft through six squares, removed from the body. From the floor it rises straight at `wall` (1.2 mm) from the outside, then steps in under the lip at a little more than 45°, then follows the baseplate socket of D-09 upwards: 0.7 mm at 45°, 1.8 mm straight and 2.15 mm at 45°, ending at the outside of the bin in a sharp edge. A bin stacked on top drops its feet into that profile as it would into a baseplate.

## Magnets

`magnet-points` draws four circles, 13 mm from the first cell's centre each way, and a grid pattern of them; `.hole()` drills at every circle centre, Ø6.5 × 2.4 mm from below. The sketch uses circles rather than points: the hole feature skips points made by a pattern, but drills the centres of every circle.

## Printing it

Upright, feet on the bed: 23.8 cm³, about 26 g of PLA and 74 min. The check reports 318.5 mm² of overhang as information: the ceilings of the eight magnet pockets (6.5 mm bridges), the 0.5 mm strip of the bin's underside between the two feet, and the 45° corner cones, which sit exactly at the limit. None of them needs support.

## Where next

- [D-09 Gridfinity baseplate](lab:preset/D-09): the plate these bins stand in.
- [D-06 Memory-card holder](lab:preset/D-06): another layout driven by a table.
