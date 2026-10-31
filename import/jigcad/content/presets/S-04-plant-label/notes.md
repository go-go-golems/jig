# Plant label stake

A label on a spike for a seed tray or a pot: a 60 × 25 mm panel to write on, a 90 mm spike that goes into the soil, and a rib down the spike so it does not fold when the soil is hard. It is three extrudes, and the idea it teaches is joining: a solid feature that touches the body is fused into it without being told.

> **Try it.** [Open the trace](lab:show/trace) and find the two `op` decisions that say `join`. Then [make the spike longer for a deep pot](lab:param/S=130) and [select the rib's top face](lab:select/rib/end).

## How it is built

`panel` extrudes a rounded rectangle `W` by `P` with 4 mm corners. `spike` is a five-point polyline: two sides `s` apart and a taper `tip` long to the point. Its top edge sits 1 mm inside the panel, so the two solids overlap rather than meet on a line; the compiler sees that the new solid touches `body1` and joins it. `rib` is sketched on the spike's top face, a strip `rib_w` wide running from the taper to the panel, and extruded `rib_h` up. The panel stays flat, so it stays easy to write on.

A sketch on a face takes its origin from the world origin projected onto the face, so the rib's coordinates are the same x and y as the spike's.

## Printing it

Flat side down with the rib on top (`+Z`, fixed in the job): the first layer is the whole outline and nothing overhangs. It is 4,733 mm³, 6 g of PETG and about 16 min. PETG is chosen because a label lives outside in sun and wet soil, where PLA softens and creeps.

Write the name with a paint pen or a pencil; the panel is sized for one line of 5 mm letters. To print the name instead, emboss it as [S-06 Keyring name tag](lab:preset/S-06) does.

> **Exercise.** Make a set of five labels on one plate: in the print job, replace `parts: [label]` with `.add('label', label, { qty: 5 })` and look at the plate count in the header.

## Where next

[S-01 Cable clip](lab:preset/S-01) is a single extrude. [S-05 Bag clip](lab:preset/S-05) puts two different parts on one plate.
