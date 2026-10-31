# Hinge repair plate

A plate that repairs a cupboard door whose concealed-hinge screws have torn out of the chipboard. The hinge's 35 mm cup passes through the plate into the door's old bore, the hinge's own screws bite into the plate, and four countersunk screws hold the plate in sound wood further out. The idea it teaches is placing holes by a standard: the hinge-screw spacing and offset come from a table of the common boring patterns.

> **Try it.** [Open the params](lab:show/params) and switch the configuration to `45/9.5` for a Blum hinge, then back to `48/6`. [Set a 3 mm boring distance](lab:param/C=3) and [select the cup hole](lab:select/cup/bore[1]); it moves towards the door's edge.

## The boring patterns

A concealed hinge sits in a 35 mm cup bored into the door, with two screws on a line beside it. Makers use a few patterns, written as spacing / offset: the screws are `a` apart and `b` further from the door's edge than the cup's centre.

| pattern | a | b | used by |
|---|--:|--:|---|
| 45/9.5 | 45 mm | 9.5 mm | Blum |
| 48/6 | 48 mm | 6 mm | Hettich, Salice |
| 52/5.5 | 52 mm | 5.5 mm | others |

`hinges.csv` holds the three rows and `j.table` makes them configurations; with none chosen the middle one, 48/6, is active. The cup's centre is `e = cup / 2 + C` from the door's edge, where `C` is the boring distance, the gap between the edge and the cup, usually 3 to 6 mm.

## How it is built

The plan is drawn with the door's edge along X at y = 0. `body` is a 96 × 51.5 mm plate, 4 mm thick, whose depth `D` follows from `e` and `b`. `cup` is `j.hole.simple(j.fit.hole('cup', 'free'))`: 35 mm plus 0.3 mm a side plus 0.1 mm of hole compensation, 35.7 mm, so the cup goes through without binding. `hinge-screws` are 2.5 mm pilots for the hinge's own 3.5 mm chipboard screws, and `fixing` puts four M4 countersunk holes near the corners, two of them along the edge beyond the cup. `ease` chamfers the top edge of the outline by 1 mm; the selector subtracts the holes' edges so only the outline is chamfered.

## Fitting and printing

Flat, the door side on the bed: every hole is vertical and round and the countersinks open upwards. 15.0 cm³, about 12 g of PETG and 30 min. The plate raises the hinge by its 4 mm thickness; turn the hinge's depth screw to bring the door back into line, and use hinge screws 4 mm longer than the old ones so they reach through the plate into the wood.

## Where next

- [W-06 Shelf bracket](lab:preset/W-06): countersunk screws in a load-bearing part.
- [W-03 Drill guide](lab:preset/W-03): drill the new fixing holes square.
