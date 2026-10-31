# DIN-rail clip

A clip that hangs a circuit board, a relay module or a small box on a 35 mm top-hat DIN rail, the rail in every control cabinet and many workshop panels. A fixed hook takes the rail's top edge; a springy arm with a catch snaps over the bottom edge, and two M3 heat-set inserts in the front face carry whatever you mount. The idea it teaches is designing a snap fit by its strain, kept as a param you can watch.

> **Try it.** [Look at the section from the side](lab:view/stage?view=side), then [thin the arm to 1.2 mm](lab:param/ta=1.2) or [make the body shallower](lab:param/tp=10) and [open the params](lab:show/params) to see `strain` rise. [Select the catch's lead-in](lab:select/body/side[section.p.11]).

## The rail

EN 60715 TS35 × 7.5 rail is a top hat: its two flanges, 1 mm thick, stand 7.5 mm off the panel, and its outer edges are 35 mm apart. The section is drawn with the flanges' front face at y = 0 and the rail's centre at z = 0, so the edges are at z = ±`edge`. Each hook reaches `k` = 1.5 mm behind a flange with `g` = 0.3 mm of clearance.

## The springy arm

To clip on, hook the top edge and swing the bottom in: the flange's edge rides down the catch's 45° lead-in and bends the arm until the catch springs up behind it. The arm is a cantilever, `ta` thick and `L_arm` long from its root to the catch, which has to bend by `k + g`. Its peak strain is the beam formula, written as a param:

```js
strain: '1.5 * ta * (k + g) / pow(L_arm, 2)',   // 1.5 × 1.6 × 1.8 / 14.8² = 0.020
```

PETG takes about 0.04 before it yields, so 0.020 leaves a factor of two. The slit `s` over the arm runs back to within `root` = 2 mm of the front, which is what makes the arm long; a shallower body shortens it and the strain climbs with the square. To take the clip off, lever the catch down with a small screwdriver from below.

## Printing it

On its side, `.orient('+X')`: the section lies on the bed, so the arm bends within its layers; printed standing, it would bend across them and snap at the root on the first use. The two insert holes, `j.hole.insert('M3x5.7')` at 4.0 mm, are horizontal in this orientation and become teardrops; press the inserts in from the front. 16.0 cm³, about 10 g of PETG and 35 min.

## Where next

- [X-05 Project box](lab:preset/X-05): a box to hang on it.
- [W-01 Pegboard hook](lab:preset/W-01): another part printed on its side.
