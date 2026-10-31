# Cabinet knob

A knob for a kitchen cupboard or a chest of drawers, 32 mm across and 26 mm off the door, fixed with the M4 bolt that comes with most cabinet hardware. It is a revolve: a six-point half-section turned about Z. The idea it teaches is choosing the print direction from the shape: upside down, every surface of this knob leans inward or stands upright, so it needs no support at all.

> **Try it.** [Look at it from the front](lab:view/stage?view=front) and turn it upside down in your head. Then [make it a small drawer knob](lab:param/d=25), [give it 16 grooves](lab:param/flutes=16), or [select the insert hole](lab:select/insert/bore[1]).

## How it is built

`section` is the knob's profile on the XZ plane, x the radius and z the height: the base on the door, the neck narrowing to `neck_d`, the underside of the head rising at 45° to `d`, the rim and the flat top. `head` is written so the underside stays at 45°: `neck + (d - neck_d) / 2`. `body` revolves it a full turn about `j.axis.Z`; a revolve has no end caps, so the top and the base are picked by the profile segment that made them, `sideFace('p.5')` and `sideFace('p.1')`.

`grip` is twelve 90° V-grooves round the rim. One triangle is patterned in the sketch with `j.pattern.circular`, so a single cut makes all twelve. The sketch sits below the head and the cut rises to 2.5 mm under the top, so each groove runs out through the 45° underside and stops short of the crown.

`insert` is `j.hole.insert('M4')`: a Ø5.6 × 9.1 mm hole for an M4 × 8.1 brass heat-set insert, drilled up from the centre of the base. Press the insert in with a soldering iron at about 220 °C; the cabinet's bolt then threads into brass, not plastic.

## Printing it

The job fixes `-Z` up: the flat top is the first layer and the base is the last. The crown chamfer is 1.5 mm across and 1 mm down, steeper than 45° on purpose, because it is now the bed edge; the grooves' ends face up; the insert hole opens upward, so it has no ceiling to bridge. It is 12,603 mm³, 6.5 g of PLA and about 25 min.

> **Exercise.** Switch to `.config('L')` for a 40 mm wardrobe knob and check in the header that it still prints with no support.

## Where next

[H-06 Egg cup](lab:preset/H-06) is another turned profile, hollowed with a shell. [S-08 Wall hook](lab:preset/S-08) puts screws across the build direction.
