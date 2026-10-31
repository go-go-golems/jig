# Fit coupon

A strip of ten holes for a Ø6 mm pin, with radial gaps from 0.05 mm to 0.50 mm in 0.05 mm steps, ten loose pins printed beside it, and a proof block. You print it once per printer and material, measure it, type the numbers into `measured.json`, and `j.fit.calibrate` turns them into the fit profile every other preset sizes its holes from. The idea it teaches: clearances are measured, not guessed.

> **Try it.** [Look at it from above](lab:view/stage?view=plan) to see the holes grow from left to right. [Select the slide hole of the proof block](lab:select/slide/bore[1]) and read its size, then [pretend your pin measured 6.05 mm](lab:param/pin=6.05) and watch all three proof holes grow by 0.08 mm.

## How it is built

`j.fit.coupon({ kind: 'pin-hole', pin, range, steps })` makes the plate and the pins. It is modelled raw: no fit class and no hole compensation, so a hole modelled at 6.30 mm shows exactly what your printer does with 6.30 mm. The holes sit at a pitch of pin + 2 × largest gap + 4 mm = 11 mm. The script adds a 6 mm strip behind the plate and engraves the first and last gap in hundredths (`5` and `50`), 0.6 mm deep.

The pins stand 8 mm tall, higher than the 4 mm plate, so the label cut gives its extent as `{ two: [mm(0), mm(0.6)] }`: 0.6 mm down from the top face and nothing up. A plain `mm(0.6)` would cut upwards, into air.

## What to measure

1. Measure a pin across two directions with callipers and write the mean as `pin` (the example has 5.97 mm).
2. Measure each hole, with the callipers' inside jaws or with drill shanks, and write the ten sizes into `holes`, smallest gap first.
3. Push a pin into each hole by hand and write one word per hole into `outcomes`: `press` (goes in only with a clamp or a tap), `snug` (goes in by hand and holds), `slide` (moves freely, no play), `free` (drops through and rattles), or `no` (does not go in).

## From measurements to a profile

`j.fit.calibrate` fits a line through the holes, measured = a × nominal + b, and takes each class from the first hole with that outcome: the gap is (hole − pin) / 2. With the example numbers that is a = 0.996 and b = −0.145 mm, and press 0.03 mm, snug 0.08 mm, slide 0.125 mm, free 0.23 mm. The script turns the line into a hole compensation of 0.171 mm, (T − b) / a − T at the pin size, and builds the profile with `j.fit.profile('my-printer', { classes, holeComp, xyComp })`.

The print job carries that profile, so the proof block's holes come out at Ø6.20 mm (press), Ø6.39 mm (slide) and Ø6.60 mm (free). Print it with your next job: when a coupon pin presses, slides and drops as named, the profile is right.

> **Careful.** `measured.json` ships with numbers from one printer. Replace them with yours before you trust a fit.

## Printing it

Flat on the bed, no supports, about 12 g of PLA and 33 min. Print at the layer height and in the material you will use for real parts: the gaps depend on both.

## Where next

- [C-04 Print-in-place clearance](lab:preset/C-04): the gap for parts printed already assembled.
- [C-05 Hole sizes](lab:preset/C-05): more points for the hole line, vertical and horizontal.
- [D-04 Battery holder](lab:preset/D-04): pockets sized with `j.fit.hole`.
