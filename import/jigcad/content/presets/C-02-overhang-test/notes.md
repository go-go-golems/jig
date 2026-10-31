# Overhang test

Six ledges in a row, each rising 8 mm while it leans out over air, with undersides at 20°, 30°, 40°, 50°, 60° and 70° from vertical. Print it without supports and the ledge where the underside first turns rough or droops is your printer's overhang limit. The idea it teaches: an overhang is an angle, and one expression, `h * tan(θ)`, turns that angle into geometry.

> **Try it.** [Look at it from the front](lab:view/stage?view=front): the six undersides fan out from one point. [Select the 50° underside](lab:select/fin50/side[f50.edge.3]), the first one past the 45° rule. Then [make the ledges rise 12 mm](lab:param/h=12) and watch the 70° ledge reach 33 mm.

## How it is built

`angles` is a plain list at the top of the script. For each angle a sketch on its own XZ plane draws one closed polyline: a post `t` = 4 mm thick, an underside from (`t`, `base`) to (`t + h * tan(θ)`, `base + h`), and a flat top `cap` = 1.2 mm thick. Each profile is extruded `w` = 8 mm, and the fins stand `pitch` = 11 mm apart on a 2 mm shelf. With `h` = 8 mm the ledges reach 2.9, 4.6, 6.7, 9.5, 13.9 and 22.0 mm.

The XZ plane's normal is −Y, so each sketch sits at the fin's far side (`-(i * pitch + w)`) and the extrude comes back towards the shelf. The first and last angles, `20` and `70`, are engraved on the shelf; the others step by 10° between them.

## Reading the result

The job reports `print.overhang` as info: 414.7 mm² past 45° with +Z up, which is the 50°, 60° and 70° undersides. That is the point of the test, so the orientation is fixed with `.orient('+Z')` and supports should be off in your slicer.

Most printers with good part cooling print 50° cleanly, 60° with a rough underside and 70° with visible droop. If 40° is already rough, look at cooling before you blame the geometry. The 45° that `j.rules.fdm` and the orientation search use comes from the printer profile (`maxOverhang`); a printer that passes 55° can be given that.

## Printing it

Upright, about 6 g of PLA and 20 min (the estimate counts tree supports under the three steep ledges; print without them). Keep the fan at full speed from the second layer.

## Where next

- [C-03 Bridging test](lab:preset/C-03): the 90° case, a span held at both ends.
- [C-05 Hole sizes](lab:preset/C-05): why horizontal holes become teardrops.
