# Phone stand

A desk stand that holds a phone at 65° for reading or a video call, with a notch under the seat so it can charge while it stands. It is a side profile of ten corners extruded to 70 mm, a cut for the cable and three rounding features. The idea it teaches is trigonometry in params: the leaning back is written with `sin(angle)` and `cos(angle)`, so one number tilts the whole profile.

> **Try it.** [Look at the profile](lab:view/stage?view=front). Then [stand the phone up straighter](lab:param/angle=75), [make room for a thick case](lab:param/phone=16), and [select the face the phone leans on](lab:select/body/side[side.p.6]).

## How it is built

`side` is drawn on the XZ plane, x towards you and z up: the base, the lip, the seat and the leaning back. `x0`, the point where the phone's back rests on the seat, is `L - lip_t - phone`. From there the back's front face runs `S` along the angle, to `top_x = x0 - S * cos(angle)` and `top_z = b + S * sin(angle)`; its top is `t` across, perpendicular to it; and `foot_x` is where its back face comes down to the base. Each is an expression of the params, so the profile cannot come apart when `angle` changes.

`cable` cuts a 13 mm notch through the seat, the lip and the base, centred on the width, so a USB-C plug goes straight down into the phone and the cable leaves under the front. `root` is a 10 mm fillet behind the back, where it meets the base: that corner carries the phone's weight. `round` softens the other outside corners, and `foot` chamfers the bed edges.

## Configs

`phone` is the default; `tablet` makes the back 120 mm, the base 120 by 140 mm and the seat 15 mm, enough for a 10 or 11 inch tablet in a case. The phone leans its centre of mass well inside the base in both, so the stand does not tip back.

## Printing it

Upright on its base. The back leans 25° from vertical, inside the 45° limit, and the cable notch is a straight cut with nothing over it, so it prints without support. Layer lines run across the back, which is fine for a phone's 200 g. It is 65,517 mm³, 42 g of PLA and about 2 h 8 min.

> **Exercise.** Set `angle` to 40° in the code and press [Run](lab:run). The back now leans 50° from vertical, and the header reports an overhang of about 2,800 mm² that would need support. Find the lowest angle that prints clean.

## Where next

[S-01 Cable clip](lab:preset/S-01) is a profile without any trigonometry. [H-10 Napkin holder](lab:preset/H-10) is another stand, built from two walls.
