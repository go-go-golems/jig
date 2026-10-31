# Corner bracket for aluminium extrusion

An inside corner bracket that joins two lengths of 2020 aluminium extrusion at 90°, with a key under each leg that drops into the T-slot and an M5 screw through each leg into a T-nut. The profile comes from a table, so the same script makes brackets for 3030 and 4040. The idea it teaches is a key sized from the slot by a fit class, and drawn so that it prints on its side without support.

> **Try it.** [Open the params](lab:show/params) and switch the configuration to `4040`: the bracket, its keys and its screws all scale. [Select the sloped side of a key](lab:select/key-a/side[key-a.k.2]), then [loosen the keys to 0.3 mm a side](lab:param/gap=0.3).

## The table

`profiles.csv` gives each extrusion its size, slot width and screw: 2020 has 6.2 mm slots and takes M5, 3030 and 4040 (B-type) have 8.2 mm slots and take M6 and M8. `j.table` turns the rows into configurations and `.config('2020')` picks one. The bracket's own sizes are ratios of `size`: legs of `1.4 * size` (28 mm), a thickness of `0.25 * size` (5 mm), a web of `0.2 * size`.

## The keys

A key is `slot − 2 · gap` wide, 5.8 mm for a 6.2 mm slot with the slide class's 0.2 mm a side, and 1.5 mm tall, so the bracket sits square on the extrusion and cannot turn about its screw. `key-a` and `key-b` are drawn as cross-sections, on YZ and on XY, and extruded along their legs, stopping 1 mm short of the corner so they clear each other and the corner of the extrusion. The side of each key that faces the bed in print slopes at 45°, which makes the key 4.3 mm wide at its tip: it still registers on its straight side.

## Printing it

`.orient('-Y')`: the face at y = 0 lies on the bed, with the web. The L, the web and the keys all grow straight up from it, and the screw holes, `j.fit.hole('screw_d', 'free')` at 5.7 mm (5 mm, 0.3 mm a side and 0.1 mm of hole compensation), become teardrops. 6.2 cm³, about 5 g of PETG and 20 min. Printed this way the corner bends within the layers; a bracket printed standing on a leg breaks along a layer line at the corner.

## Where next

- [W-06 Shelf bracket](lab:preset/W-06): the same orientation for a bigger load.
- [W-08 Spacer and standoff set](lab:preset/W-08): more parts from one table.
