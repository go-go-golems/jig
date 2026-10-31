# Cordless drill holder

A wall shelf for a cordless drill: the handle drops into a 46 mm U-slot and the drill hangs by its body, with six pockets for 1/4" bits beside the slot and two gussets under the shelf. The idea it teaches is choosing the print orientation for a part with no obvious flat side: printed upside down, everything grows straight up from the top of the shelf.

> **Try it.** [Select the round end of the slot](lab:select/slot/side[slot.s.a2]), then [widen the slot to 52 mm](lab:param/grip=52) for a larger drill and [make the slot deeper](lab:param/slot_d=65); the shelf grows with it. [Look from the side](lab:view/stage?view=side) to see a gusset.

## How it is built

`side` is the L-shaped side profile on the YZ plane, the wall at y = 0 and the top of the shelf at z = 0: a 6 mm wall plate 75 mm tall and a 16 mm shelf whose depth `D` is the slot plus 26 mm. `body` extrudes it 130 mm wide.

`slot` is a sketch slot, a stadium `grip` wide, from its round end out past the front of the shelf, so only the back end is round; it is cut down through the shelf. `lead` chamfers its top edges by 3 mm, the convex edges of `slot` at z = 0, so the drill's body sits on a bevel rather than a sharp edge. `gusset` is a triangle under one end of the shelf, and `gussets` mirrors it across YZ.

`bits` is one hexagon, 6.35 mm across the flats plus 0.15 mm a flat as in [D-05](lab:preset/D-05), and a 2 × 3 grid pattern of it either side of the slot, cut 12 mm deep. `screws` puts two M4 countersunk holes in the wall plate below the shelf, where a screwdriver reaches them straight on.

## Printing it upside down

`.orient('-Z')` puts the top of the shelf on the bed. From there the shelf, the wall plate and the gussets all grow straight up, and the gussets' slopes face upwards. The slot's chamfer and the bit pockets open onto the bed; the check reports the pockets' floors, which are now 6.65 mm bridges, as 229.8 mm² of overhang, and they print without support. The screw holes are horizontal and become teardrops. 188.1 cm³ solid, about 95 g of PETG and 256 min: use four perimeters, since the shelf carries the drill on its root.

## Where next

- [W-06 Shelf bracket](lab:preset/W-06): gussets and a beam check.
- [D-07 Headphone hanger](lab:preset/D-07): a hook on a desk edge.
