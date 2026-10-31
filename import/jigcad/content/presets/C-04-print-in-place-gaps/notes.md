# Print-in-place clearance

Ten rotors printed inside a plate, each already trapped in its own hole, with gaps from 0.15 mm to 0.60 mm in 0.05 mm steps. After printing, try to turn each one with a screwdriver: the smallest gap that turns freely is the clearance your printer needs for hinges, chains and anything else printed assembled. The idea it teaches: a gap that has to survive printing is a different number from a gap that has to fit.

> **Try it.** [Look at it from above](lab:view/stage?view=plan): the bottom row starts at `15` (0.15 mm), the top row at `40`. [Select the waist of the fourth rotor](lab:select/rotor4/side[r4.half.3]), the 0.30 mm one. Then [make the plate 8 mm thick](lab:param/T=8) and see every rotor grow with it.

## How it is built

Every hole is the same hourglass: a Ø8 mm waist with a 45° cone 1.5 mm high at each face, so Ø11 mm at the top and at the bed. Two hole features drill all ten: `top` is a countersink from a sketch of points on the top face, `bottom` the same countersink from a sketch on `j.plane.XY.flip()`, the bed looking up. Flipping a plane keeps x and turns y round, so the points underneath are written at −y.

Each rotor is its own `revolve` of one polyline: the hole's outline moved inwards by its gap `g`, measured square to every face. On the straight waist that is `g`; on the 45° cones it is `g · √2` sideways. A rotor is wider than the waist at both ends, so it cannot fall out, and a 6 mm knob with a 1.2 mm slot stands 3 mm proud to turn it by.

The rotor axes are placed with numbers (`pitch = 15`), not params: in this engine a revolve axis through points written as expressions comes out tilted.

## Reading the result

Turn each rotor a full turn. Write one word per rotor, smallest gap first: `fused` (does not move), `stiff` (breaks free and then turns with effort), `free` (turns with a finger). The first `free` is your print-in-place clearance. Add the row to the calibration list in [C-01](lab:preset/C-01):

```js
{ coupon: coupon.meta.sets.coupon,   // this part's: kind, range, steps
  outcomes: ['fused', 'fused', 'stiff', 'free', 'free', 'free',
    'free', 'free', 'free', 'free'] }
```

`j.fit.calibrate` then sets `printInPlace` to the gap of the first `free`, here 0.30 mm, and `j.lib.hinge.pin` and `printInPlace` assemblies use it.

## Printing it

Flat, about 14 g of PLA and 38 min. The job reports 326.4 mm² of overhang as info: the 45° cones sit exactly on the limit, and the estimate finds 39 mm³ of support, which you can leave off. Do not use a brim, and check that the first layer is not squashed: elephant's foot fuses the bottom of a rotor before anything else does.

## Where next

- [C-01 Fit coupon](lab:preset/C-01): the classes for parts that are assembled after printing.
- [M-08 Print-in-place hinged box](lab:preset/M-08): a pin hinge that uses this clearance.
