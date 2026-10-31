# Bag clip

A clip that closes an open bag of crisps, coffee or frozen peas: fold the top of the bag over the hexagonal rod, then slide the sleeve along it. The film leaves through the slot on top, and the rod cannot follow because the slot is narrower than the rod. It is two parts printed together on one plate, and the idea it teaches is a fit: the bore is sized from a clearance class, not drawn.

> **Try it.** [Look at the end of it](lab:view/stage?view=side) to see the rod in the bore. Then [select the bore](lab:select/bore/bore[1]) and [leave more room for a thick bag](lab:param/sleeve.bag=0.5). For a cereal bag, set `L` in `P` to 160 mm and press [Run](lab:run): both parts read it.

## How it is built

Both parts read the same params, `P`, so a change to `rod` or `L` changes both. `rod` is a hexagon on the YZ plane, `rod` (10 mm) across its corners, extruded `L + grip`: 8 mm stands out of the sleeve as a handle. The sleeve is a square section with 45° corners, extruded `L`, then bored and slotted.

The bore is `j.hole.simple(j.fit.hole('rod + 2 * bag', 'slide'))`: the nominal size is the rod plus two layers of film, and the `slide` class adds the clearance on each side, so the modelled bore is about 11.1 mm. The slot, `rod * 0.6` wide (6 mm), runs along the top. The rod is 8.7 mm across its flats, so it stays in the sleeve however it turns.

Both parts are modelled on the bore's axis, as they sit in use; the print job lays them side by side on the plate.

## Printing it

Orientation is automatic: the rod lies on a flat, the sleeve on its bottom. The bore runs across the build direction, so the kernel makes it a 45° teardrop (a `teardrop` decision in the [trace](lab:show/trace)), and the slot cuts the teardrop's tip away. The outside corners are 45° chamfers for the same reason: a round corner on the bed would overhang. Both parts together are 21,383 mm³, about 20 g of PETG and 54 min. PETG flexes where PLA cracks, and it does not mind the freezer.

> **Exercise.** A bag of frozen peas is thicker film: set `bag` to 0.4 mm and check that the bore is still smaller than `H − 2 · 2 mm`, so the sleeve wall stays at least 2 mm.

## Where next

[S-04 Plant label](lab:preset/S-04) joins three extrudes into one part. [S-07 Furniture leg pads](lab:preset/S-07) prints four copies of one part on a plate.
