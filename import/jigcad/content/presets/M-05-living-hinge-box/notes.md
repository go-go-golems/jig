# Living-hinge box

A one-piece clamshell for small parts, 50 × 35 mm and 24 mm deep when closed. Two trays print side by side, joined along their back rims by a 0.4 mm strip of polypropylene that folds through 180°. A lip on the lid slips into the base and holds it shut. The idea it teaches: where a hinge sits decides how a part folds. A strip on the bed would fold the trays back to back; a strip at rim height folds them rim to rim.

> **Try it.** [Select the underside of the hinge](lab:select/hinge/start), the strip the printer bridges across the 1 mm gap. [Look at it from the side](lab:view/stage?view=side) and imagine the lid turning about the hinge's top edge. Then [loosen the lip to 0.4 mm](lab:param/slip=0.4) if your PP grips too hard.

## How it is built

`tray` is a small function that adds one rounded 50 × 35 × 12 mm block and cuts its pocket; the script calls it twice, `base` at y > 0 and `lid` at y < 0, 1 mm apart. The hinge is `j.lib.hinge.living({ length, thickness: mm(0.4), gap: mm(1), material: 'PP' })`, placed with `j.tx.move(0, 0, h - t)` so that its top is flush with both rims. It is 38 mm long, the straight part of the back walls, and overlaps each rim by 2 mm, the walls' thickness; with it the two trays become one body.

The lid's walls are thicker than the base's by the lip and its clearance, so the lip (`lw(3)` thick, 2 mm high) stands on the lid's rim and still fits inside the base with `slip` = 0.25 mm all round. The lip stops 6 mm short of the hinge side so that nothing near the fold has to swing past the base's back wall. A tab on the lid's front edge is for your thumb.

## Why PP, and why bridged

A living hinge bends a thin strip far past what most plastics take: the lib warns (`print.layerStrength`) if the material's allowable strain is under 5 %, which rules out PLA and PETG. PP takes 10 % and lasts thousands of folds. The strip prints as a bridge across the gap, so its lines run across the fold: the direction a hinge bends without splitting between lines. The job reports its 38.0 mm² underside as overhang info; that is the bridge.

Fold it once while it is still warm from the bed, fully, to set the hinge.

## Printing it

Flat, open sides up: about 12.5 g of PP and 48 min. PP does not stick to most beds: print on PP tape or a PP sheet, with a brim, and keep the fan low.

## Where next

- [M-08 Print-in-place hinged box](lab:preset/M-08): the same box with a pin hinge, in any material.
- [M-04 Snap-fit battery cover](lab:preset/M-04): another joint that bends to work.
