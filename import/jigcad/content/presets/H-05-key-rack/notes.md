# Key rack

A rack for the hall: five pegs for keys and a dog lead, on a 160 × 60 mm plate that hangs on two screws through keyhole slots, so it lifts off the wall without tools. The idea it teaches is a feature pattern with params for its count and step: the plate's length and the keyholes' positions are written from them, so a rack for three keys or eight is one number.

> **Try it.** [Look at the back](lab:view/stage?view=plan) to see the keyholes. Then [add a peg](lab:param/n=6) and watch the plate grow, [tilt the pegs up more](lab:param/tilt=25), or [select a keyhole's seat](lab:select/seats/side[slot.a2]#1).

## How it is built

`plate` is a rounded rectangle `L` by `H`, with `L = n * step + 10 mm`. `peg` is one peg, sketched from the side on a YZ plane at the first peg's x, `-(n - 1) * step / 2`: a parallelogram that leans `tilt` (15°), so a ring hung on it slides back to the plate. `pegs` repeats it with `j.pattern.linear(j.dir('+X'), { count: 'n', step: 'step' })`: the pattern replays the extrude `n − 1` more times.

`keyholes` is a region, a circle unioned with a slot: the screw head enters at the 9 mm circle, the plate drops 8 mm, and the shank rides up the 4.6 mm slot. The keyholes sit at ±`kx` = `(n - 2) * step / 2`, between the outer pairs of pegs, and above them, so they never meet a peg. `seats` cuts the same keyhole grown by 2 mm up from the bed with a −40° taper, closing to the keyhole's own size: a countersunk head sits in it and the plate lies flat on the wall.

## Printing it

Back on the bed. The pegs grow straight up and lean 15°; the seats' walls lean 40°; the plate's top edge is filleted and its bed edge chamfered. Nothing needs support. It is 65,181 mm³, 41 g of PLA and about 1 h 55 min. The pegs' layers run across them, which is fine for keys; for a heavy bag, print it in PETG.

## Fixing it

Drive two 4 mm countersunk screws into the wall `2 * kx` apart (90 mm for five pegs), leaving 2–3 mm of each head proud. Hang the rack by the circles and let it drop.

> **Exercise.** Give each peg a ball on its tip: add a 10 mm sphere at the end of the first peg with `.add(j.sphere(5), { at, id: 'ball' })`, then repeat it with a second pattern that uses the same `count` and `step`.

## Where next

[S-08 Wall hook](lab:preset/S-08) holds one heavier coat on two screws. [H-08 Cable comb](lab:preset/H-08) repeats a slot the same way.
