# Hole sizes

Seven holes of Ø2, 3, 4, 5, 6, 8 and 10 mm, drilled straight down through a 5 mm plate and the same seven drilled sideways through a 6 mm wall standing on it. Printed holes come out small, and sideways holes come out a different shape; this piece measures both on your printer. The idea it teaches: the kernel turns every hole whose axis lies flat into a teardrop, because it knows which way the part is printed.

> **Try it.** [Select the sideways 6 mm hole](lab:select/across6/bore[c]) and then [its left teardrop flank](lab:select/across6/tear.l[c]). [Open the trace](lab:show/trace) and find the seven `teardrop` decisions. Then [space the holes 18 mm apart](lab:param/pitch=18).

## How it is built

`plate` and `wall` are two extrusions from the bed: a 98 × 20 × 5 mm plate and an 18 mm wall behind it. Each size gets two hole features, `down<d>` and `across<d>`, each at one sketch point. The `down` sketches lie on the top of the plate, so their holes drill straight down. The `across` sketches lie on `j.plane.XZ` moved to the wall's front face; that plane faces −Y, and a hole drills against its sketch's normal, so they go +Y through the wall.

The holes are `j.hole.simple(mm(d))`: the size as modelled, with no fit class and no hole compensation. That is what a test needs. For real parts you pass `j.fit.hole(d, 'slide')` and the profile adds the clearance and the compensation.

## Teardrops

The job prints with +Z up (`.orient('+Z')`), so every `across` hole has its axis at right angles to the build direction. The kernel records a decision for each, "axis +Y ⟂ build direction +Z → 45° teardrop, tip toward +Z", and adds two flat flanks that meet above the hole. A round hole lying on its side would have a flat ceiling at the top, which sags; the teardrop's roof is two 45° overhangs, which print. Orient the job with `+Y` up and the roles swap: the wall's holes come out round and the plate's become teardrops.

## What to measure

Measure every hole with the shanks of drill bits (the largest that goes in) or with callipers. For the sideways holes measure the width, not the height: the height includes the tip. Most printers make Ø2 and Ø3 holes 0.2 to 0.3 mm small and large holes 0.1 to 0.2 mm small; sideways holes often come out 0.1 mm smaller again.

The vertical pairs make a row for `j.fit.calibrate` in [C-01](lab:preset/C-01), which then fits its hole line over 2 to 10 mm instead of 6 to 7 mm:

```js
{ holes: [[2, 1.75], [3, 2.78], [4, 3.8], [5, 4.82], [6, 5.85],
  [8, 7.86], [10, 9.88]] }
```

## Printing it

Upright, about 14 g of PLA and 42 min, no supports.

## Where next

- [C-01 Fit coupon](lab:preset/C-01): from hole sizes to fit classes.
- [C-02 Overhang test](lab:preset/C-02): why the teardrop's roof is 45°.
