# Battery holder

A desk block that keeps twelve AA cells standing upright, each in its own pocket with a lead-in at the mouth. The idea it teaches is driving a layout from data: the cell size comes from a table of standard cells, and the grid comes from a count.

> **Try it.** [Hold 20 cells](lab:param/count=20) and watch the grid grow to 5 × 4. [Open the params](lab:show/params) and switch the configuration to `AAA` or `D`. [Select a lead-in](lab:select/pockets/csink[c]) to see the countersink the hole feature made.

## The table and the count

`cells.csv` lists four IEC 60086 cells with their largest diameter and length: AAA Ø10.5 × 44.5, AA Ø14.5 × 50.5, C Ø26.2 × 50 and D Ø34.2 × 61.5 mm. The script turns it into configurations with `j.table`, and with none chosen the middle row is active, which is AA.

The grid is two expressions of `count`:

```js
nx: 'ceil(sqrt(count))',
ny: 'ceil(count / nx)',
```

12 cells give 4 × 3, 20 give 5 × 4, 7 give 3 × 3 with two spare pockets. `pitch` is the cell plus 1 mm (the fit and the hole compensation) plus a web of `lw(4)`; the outline follows from `nx`, `ny` and `pitch`.

## The pockets

`grid` holds one circle and a grid pattern of it; `.hole(grid, …)` drills at every circle centre. The spec is a countersink whose bore is `j.fit.hole('d', 'free')`: 14.5 mm + 2 × 0.3 mm free gap + 0.1 mm hole compensation = Ø15.2 mm, opened to `d + 2.6 mm` at 90° so a cell finds the pocket by itself. All twelve tools are cut in one boolean.

Pockets are `0.45 * l` deep: a cell stands steady and still shows more than half its length to grab.

## Printing it

Upright: 52.4 cm³ solid, about 43 g of PLA with 15 % infill and 115 min. Vertical pockets need no teardrops and no support.

## Where next

- [D-05 Hex-bit holder](lab:preset/D-05): pockets that are hexagons, sized by a fit class.
- [X-04 18650 holder](lab:preset/X-04): cells lying down, with contacts.
