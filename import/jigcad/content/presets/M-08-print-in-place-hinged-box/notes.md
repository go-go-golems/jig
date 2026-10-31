# Print-in-place hinged box

A 60 × 40 mm box whose base and lid print side by side, already joined by a five-knuckle pin hinge, with no assembly afterwards: snap the first layer free and the lid swings over to close. The idea it teaches: a print-in-place mechanism is an assembly checked in the pose it prints in. The script builds the two halves as parts, joins them with a revolute joint and asks `.printInPlace()` for every gap between them.

> **Try it.** [Swing the lid to 120°](lab:param/hinge=120), then [almost close it](lab:param/hinge=170). [Open the trace](lab:show/trace) and find the `gap` decision: 0.400 mm between base and lid as printed. [Select a knuckle of the base](lab:select/hinge/knuckle1).

## The hinge

`j.lib.hinge.pin({ knuckles: 5, length: mm(50), d: mm(3), clearance: 'printInPlace', wall: mm(1.6) })` makes the knuckles along a frame on the hinge axis. The base takes it with `leaf: 'a'`: knuckles 1, 3 and 5 and a Ø3 mm pin through all five. The lid takes `leaf: 'b'`: knuckles 2 and 4, bored to 3 + 2 × 0.4 = 3.8 mm. The knuckles are 7 mm across and 9.68 mm long, with 0.4 mm between them. The clearance is the `printInPlace` fit class, so a profile calibrated with [C-04](lab:preset/C-04) changes it everywhere.

The axis sits at rim height, between the trays. Folding 180° about it brings rim onto rim; an axis on the bed would fold the halves back to back.

## The webs

A horizontal knuckle's underside is an overhang. Under every knuckle a web stands on the bed and rises to 2.5 mm below the axis, where the knuckle's surface turns steeper than 45° (R · cos 45° = 2.47 mm), so nothing overhangs and the webs stay clear of the pin and the bores. Each web runs from its own half's back wall to R past the axis. The back walls stand R + c = 3.9 mm from the axis, clear of the other half's knuckles by the same 0.4 mm.

## The assembly

The base is grounded and the lid hangs on a revolute joint between two ports on the hinge axis, limited to 0°–180°. The port's z points along −X so that a positive angle swings the lid up and over. `.printInPlace(['base', 'lid'], { clearance: mm(c), pose: { hinge: deg(0) } })` measures the smallest gap in the print pose: 0.400 mm. The engine has no swept-volume check yet, so the swing was checked by compiling the joint at 60°, 120° and 170°: 0.400 mm each time. The check runs in the pose on the stage, so at 180° it reports an error: closed, the rims touch, as they should.

## Printing it

A print job takes an assembly's parts and packs them apart, which would separate the halves, so the job builds both halves as one part with two bodies, using `leaf: 'both'`. Set `printJob` to `true` to compile it: flat, about 25 g of PLA and 68 min, no supports. Free the hinge by flexing it gently a few times before you close the lid.

## Where next

- [M-05 Living-hinge box](lab:preset/M-05): the same box with a hinge that bends.
- [C-04 Print-in-place clearance](lab:preset/C-04): measure the gap your printer needs.
