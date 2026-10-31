# Spacer and standoff set

Fifteen pieces on one plate: round spacers for M2.5, M3 and M4 screws in the lengths a project box or a PCB usually needs, and three hexagonal M3 standoffs that take a heat-set insert at each end. Every piece comes from `spacers.json`. The idea it teaches is a part built from a table: the script walks the rows, makes one body per length, and drills each row with a single hole feature.

> **Try it.** [Spread the pieces out](lab:param/spacing=10), then [select the M3 × 10 mm spacer](lab:select/M3-10/side[M3-10.o]) and [one of its row's bores](lab:select/bore-M3/bore[c1]). [Open the graph](lab:show/graph) to see one hole feature per row.

## The table

```json
{ "name": "M3", "kind": "spacer", "d": 3, "od": 6, "lengths": [3, 5, 8, 10, 15] }
```

A row names the screw, its diameter `d`, the outside size `od` and the lengths to make. A `spacer` is round; a `standoff` is a hexagon `od` across the flats, so a spanner holds it while the screw goes in. Add a length to a row, or a row for M5, and the plate grows.

## How it is built

For each row the script draws every piece as its own sketch, a circle or a hexagon at `k * (od + spacing)` along X and at the row's Y, and extrudes it to its length: `M3-10` is the M3 spacer 10 mm long. Each is a separate body, because none of them touch. The row also gets a sketch `at-<row>` with a small circle at each piece's centre, and one hole feature drills every centre:

- spacers: `j.hole.simple(j.fit.hole(mm(row.d), 'slide'))`, the screw plus 0.2 mm a side plus 0.1 mm of hole compensation: 3.0 mm for M2.5, 3.5 mm for M3 and 4.5 mm for M4.
- standoffs: `j.hole.insert('M3x4', { depth: 'through' })`, the insert's 4.0 mm hole right through, so an M3 × 4 mm insert goes into each end and no ceiling has to be bridged.

## Printing it

Upright, each piece on its end, so every bore is vertical and round: 3.5 cm³, about 4 g of PETG and 17 min for the plate. Small pieces cool quickly; print them all at once rather than one at a time, so each layer has time to set. Press the inserts in with a soldering iron at about 220 °C.

## Where next

- [W-03 Drill guide](lab:preset/W-03): bores from a table in one block.
- [X-05 Project box](lab:preset/X-05): where spacers and inserts are used.
