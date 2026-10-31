# Curtain-rod end bracket

A pair of brackets for a curtain rod that spans a window recess: each one is screwed to a side wall of the recess, and the rod's ends click into their cups from above. The idea it teaches is two fits in one part: a free fit for the bore, so the rod turns and slides, and a mouth narrower than the rod, so it snaps in and cannot lift out.

> **Try it.** [Look down on it](lab:view/stage?view=plan): in use, the mouth faces up. Then [fit a 25 mm rod](lab:param/rod=25), [make the snap tighter](lab:param/mouth=16), or [select the bore](lab:select/bore/bore[1]).

## How it is built

The part is modelled plate-down, as it prints: +Z comes out of the wall and +Y points up. `plate` is a slot-shaped plate across X with a screw at each end, `s` from the middle; `cup` is a cylinder `rod / 2 + wall` in radius standing on it.

`bore` is a blind hole from the cup's top, `j.hole.simple(j.fit.hole('rod', 'free'), 'depth')`: the free class adds 0.3 mm a side and the hole compensation 0.1 mm, so a 20 mm rod gets a 20.7 mm bore. `mouth` cuts a slot `rod * 0.85` wide, 17 mm, through the cup's upper wall: the rod is pressed past the lips, the cup opens a little and closes behind it. `lips` rounds the mouth's four vertical edges and `rim` the top, so the rod's finish is not scratched. `screws` drills two M4 countersunk holes, sized from the slide class.

## Configs

`rod16`, `rod20` and `rod25` are the common curtain-rod sizes, each with its own wall and depth. The mouth follows `rod` as an expression, so a new rod size needs only `rod`.

## Printing it

Plate down, two to a plate. The cup stands up from the plate, the screw holes are vertical and their countersinks open upward, so nothing is bridged. Each bracket is 14,062 mm³; the pair is 22 g of PETG and about 1 h. PETG rather than PLA, because the cup flexes every time the rod goes in, and a window recess gets warm in the sun.

> **Exercise.** Make a middle support for a long rod: the same cup on a plate screwed to the ceiling. Which way up should it print, and does the mouth still face the right way?

## Where next

[S-05 Bag clip](lab:preset/S-05) uses a fit class for a sliding part. [H-11 Shelf bracket](lab:preset/H-11) carries more load on two screws.
