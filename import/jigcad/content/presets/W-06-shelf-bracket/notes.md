# Shelf bracket

An L-bracket for a light shelf: a 100 mm leg screwed to the wall, a 120 mm arm screwed up into the shelf, a gusset between them and four M4 countersunk holes. The idea it teaches is orientation for strength. A shelf load bends the bracket round its inside corner; printed on its side, that bending runs along the layers, where printed plastic is about twice as strong as across them.

> **Try it.** [Look at it from the front](lab:view/stage?view=front), then [make the arm 150 mm](lab:param/arm=150) and watch the gusset and the shelf holes follow. [Select the gusset's slope](lab:select/gusset/side[gusset.g.2]) and [thicken the bracket to 8 mm](lab:param/t=8).

## How it is built

`side` is the L on the XZ plane, the wall at x = 0 and the shelf's underside at z = 0; `body` extrudes it 25 mm. `corner` rounds the inside corner by 6 mm, where the bending stress is highest. `gusset` is a triangle reaching 60 % of the way along the leg and the arm, extruded 6 mm from the same plane, so it is flush with the face at y = 0 rather than centred.

`wall` and `shelf` are `j.hole.countersink('M4', { fit: 'free' })` at 3D points on the inside of the leg and the underside of the arm, placed beyond the gusset's ends so a screwdriver reaches them. The spec takes the ISO 10642 head (8.96 mm) and the free gap: a 4.6 mm bore under a 9.56 mm, 90° countersink, so the heads of wood screws sit flush.

## Printed on its side

`.orient('-Y')` lays the face at y = 0 on the bed. Both extrudes run along −Y, the XZ plane's normal, so the gusset is on the bed too; a gusset in the middle of the width would float over nothing. The four holes are now horizontal and become teardrops, which the kernel records as decisions. 43.2 cm³, about 27 g of PETG and 74 min.

A rough check of the arm, as a beam: 100 N (10 kg of shelf) at 100 mm from the wall bends the arm where the gusset ends, 74.4 mm out, by 100 N × 25.6 mm = 2560 N·mm. The arm's section there is 25 × 6 mm, with a section modulus of 25 × 6² / 6 = 150 mm³, so the stress is about 17 MPa: well under the 45 MPa or so of PETG along its layers, and too close to its strength across them to print the bracket standing up.

## Where next

- [W-07 Corner bracket for 2020 extrusion](lab:preset/W-07): a bracket with keys and counterbores.
- [W-01 Pegboard hook](lab:preset/W-01): a smaller part printed on its side.
