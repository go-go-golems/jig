# Wall thickness

Six thin walls standing on a base, 1, 1.5, 2, 2.5, 3 and 4 line widths thick: 0.45 to 1.80 mm with the generic printer's 0.45 mm lines. Slice it before you print it. The walls that are whole numbers of lines fill solid; the ones in between show what your slicer does with the remainder: a gap, a thin infill line, or a wall it quietly drops. The idea it teaches: a wall is a number of extrusion lines, and `lw` writes it that way.

> **Try it.** [Select the face of the 1.5-line fin](lab:select/fins/side[fins.t2.left]) and read its thickness in the inspector. [Open the params](lab:show/params): the fins are not params, they are `1.5 lw` and so on, resolved with the printer's line width. Then [make the fins 25 mm tall](lab:param/h=25) for a stiffer test of single-line walls.

## How it is built

`widths` is a list in line widths. One sketch, `fins`, holds a rectangle `${w} lw` × `len` for each, at x = k × `gap`, and one extrude stands all six on the 1.6 mm `base`. The unit `lw` is symbolic: it stays `1.5lw` until the job resolves it with the printer's `lw`, 0.45 mm for `generic-fdm`, 0.42 mm for `x1c`. Change the printer and every fin follows.

The first and last widths, `1` and `4`, are engraved on the strip in front, 0.6 mm deep, cut downwards because the fins stand above the sketch plane.

## Reading the result

In the slicer's preview, look at each fin from above:

- **1 line** (0.45 mm): one perimeter, the thinnest wall that prints at all. Many slicers need "detect thin walls" on.
- **2, 3, 4 lines**: whole numbers of perimeters, solid.
- **1.5 and 2.5 lines**: the slicer has half a line left over. Arachne-style slicers vary the line width and fill it; older ones leave a gap or drop it.

After printing, squeeze each fin: anything under 2 lines (0.9 mm) bends easily, which is why `j.rules.fdm` reports shell walls thinner than 0.9 mm and the presets on this shelf use `lw(2)` or more.

## Printing it

Upright, about 5 g of PLA and 16 min, no supports.

## Where next

- [C-03 Bridging test](lab:preset/C-03): the other slicer limit, spans.
- [A-01 A box with walls](lab:preset/A-01): a shell with a wall parameter.
