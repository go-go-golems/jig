# Fidget spinner

A three-lobed spinner for four 608 skateboard bearings, one in the hub to spin on and three in the lobes as weights, with two finger caps that press into the hub bearing. The idea it teaches: a press fit is a fit class, not a number you guess. Every pocket is `j.fit.hole('D', 'press')`, so a calibrated printer profile resizes all four at once.

> **Try it.** [Select the hub pocket](lab:select/pockets/bore[hub]) and read its size: Ø22.2 mm for a Ø22 mm bearing. [Move the lobes out to 32 mm](lab:param/R=32) for more spin time, then [make the arms wider](lab:param/arm=20) and see the rounding follow.

## How it is built

The 608 (ISO 15) is 22 mm outside, 8 mm bore and 7 mm wide, so the body is 7 mm thick and the bearings sit flush. The outline is solids, not one sketch: a hub disc, one lobe disc and one arm bar, then `.pattern(j.feat('lobe'), j.pattern.circular(j.axis.Z, { count: 3 }))` and the same for the arm. Overlapping circles in one sketch would make the overlaps holes, because a sketch's profiles alternate in and out where curves cross.

`waist` rounds the twelve inside corners where arms meet discs, selected as `j.sel.edges('|Z').where(e => e.concave)`. The arm's straight sides are only 4 mm long between the discs, so the largest rounding that fits is about 4.1 mm; ask for more and the compile says so (`fillet.tooLarge`) with the number.

The pockets are one hole feature at four sketch points, `hub`, `l1`, `l2` and `l3`, 120° apart on radius `R`. The default profile makes a press hole 22 mm + 2 × 0.05 mm + 0.1 mm compensation = 22.2 mm. A 0.6 mm chamfer on every top and bottom edge gives the bearings a lead-in and takes off the first layer's elephant's foot.

## The caps

Each cap is a Ø20 mm pad, a Ø10.5 mm spacer 0.8 mm high that bears on the bearing's inner race only, and a Ø7.9 mm stub that presses 3 mm into the 8 mm bore. Two caps from opposite sides leave 1 mm between their stubs. The stub size is written as a number, 8 mm − 2 × 0.05 mm: `j.fit.pin` gives a diameter, and a sketch circle takes a radius.

## Printing it

All flat, no supports: about 10 g of PETG and 27 min for the body and both caps. PETG takes a press fit that is pushed in and pulled out again better than PLA does. Press the bearings in with a vice or a flat block, not with your thumbs, and press the caps in from both sides.

## Where next

- [C-01 Fit coupon](lab:preset/C-01): calibrate the press class before you print the body.
- [M-07 Spur gear pair](lab:preset/M-07): the next thing that turns.
