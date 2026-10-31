# Vise soft jaws

A pair of pads for a 100 mm bench vise: each covers the face of a steel jaw, hooks over its top with an 8 mm lip, and holds on with two 10 × 3 mm magnets. A horizontal and a vertical V-groove in the face grip round stock and tube. The idea it teaches is choosing the print orientation from the shape: printed face down, the lip is a plain wall and the grooves need no support, and `qty: 2` puts both pads on one plate.

> **Try it.** [Fit a 150 mm vise](lab:param/W=150), then [deepen the grooves to 4 mm](lab:param/vee=4) for larger tube. [Select a magnet pocket](lab:select/magnets/bore[1]) and [look from the side](lab:view/stage?view=side) to see the groove in front of it.

## How it is built

`section` is the L-shaped section on the YZ plane, with the steel jaw's face at y = 0 and its top at z = 0: a 7 mm face plate `H` deep in front of the jaw and a lip over it. `body` extrudes it symmetrically to the jaw width `W`.

`across` and `upright` are triangles: 90° Vs `vee` deep, drawn 0.5 mm proud of the face so the cut leaves no skin. `across` lies on YZ and is cut along X through the whole pad; `upright` lies on XY and is cut along Z, through the lip as well, so a bar can stand up in it.

`magnets` drills two pockets into the back of the plate from y = 0, 35 mm either side of the centre. Their size is a fit: `j.fit.hole('mag_d', 'snug')` is 10 mm + 2 × 0.1 mm + 0.1 mm hole compensation = 10.3 mm, and 3.2 mm deep, so a drop of glue fits under the magnet. The plate is 7 mm thick so that 0.8 mm of plastic is left between a pocket and the groove in front of it.

## Printing it

`.add('soft-jaw', pad, { qty: 2, orient: '+Y' })` puts two pads on the plate, face down. The lip stands up as a 4 mm wall, the grooves open onto the bed with 45° sides, and the magnet pockets face up and are vertical, so they print round. 21.8 cm³ a pad; about 30 g of PETG and 78 min for the pair. PETG does not mark soft metal; for a grip on finished work, print the pads in TPU.

## Where next

- [W-03 Drill guide](lab:preset/W-03): a block that holds a drill square.
- [W-01 Pegboard hook](lab:preset/W-01): orientation for strength.
