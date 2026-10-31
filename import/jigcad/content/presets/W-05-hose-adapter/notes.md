# Hose adapter

A reducer that joins a 1/2" hose to a 3/8" one: three barbs on each end and a collar between them to push against. It is a single revolve of a half-section, and the half-section is a polyline whose points a loop in the script writes. The idea it teaches is shaping for the print: every face that looks down is at least 50° from the bed, so the adapter prints upright with no support.

> **Try it.** [Look at the section from the front](lab:view/stage?view=front), then [fit a 5/8" hose at the bottom](lab:param/d_a=15.9) and [a 1/4" one at the top](lab:param/d_b=6.35). [Select the collar](lab:select/body/side[section.p.8]).

## How it is built

The half-section lies on the XZ plane, x the radius and z the axis, and `body` revolves it a full turn about Z. The script writes its points with two loops, one per end, so `BARBS` sets how many barbs each end gets. Every point is an expression of the params: the barbs' tips are 0.6 mm under the hose's inside radius so a hose starts on easily, their crests 0.9 mm over it so the hose is stretched and grips.

## Shaped for the print

The adapter stands on the 1/2" end. Down there the barbs point down: each is a ramp that widens going up and then a flat back, and a flat back that faces up needs nothing under it. The upper barbs point up, so their backs face down; they are drawn as steep slopes rather than flat steps, using `steep`:

```js
steep: 1.2,   // every face that looks down rises 1.2 for 1 across: 50° from the bed
```

The underside of the collar and the step inside the bore where it narrows from 8.3 mm to 5.1 mm use the same slope. A steep back holds a hose a little less well than a square one; a hose clip over the barbs makes up for it.

## Printing it

Upright: 4.5 cm³, about 5 g of PETG and 28 min. The foot is a ring of only 50 mm², under the 100 mm² that the fdm rules ask of a first layer, so the job asks for a 5 mm brim with `.brim({ width: mm(5) })` and replaces the rule with `j.rule.firstLayer({ minArea: 40 })`. The brim is recorded for the slicer; the rule set says why the check is satisfied. PETG is the better choice for water: it is tougher than PLA and does not soften in the sun.

## Where next

- [W-04 Knob for a D-shaft](lab:preset/W-04): printing for accuracy.
- [A-06 Extrude and revolve](lab:preset/A-06): the volume of a revolve.
