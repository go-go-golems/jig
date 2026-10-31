# Knob for a D-shaft

A 30 mm fluted knob for a 6 mm D-shaft, the shaft with one flat found on potentiometers, rotary encoders and small gear motors. It pushes on with a snug fit and an M3 grub screw locks it on the flat. The idea it teaches is printing for accuracy: upside down, the D-bore is vertical and comes out round and on size, while the grub-screw hole lies horizontal and the kernel turns it into a teardrop.

> **Try it.** [Look from above](lab:view/stage?view=plan) to see the pointer end on a ridge, then [give it 24 flutes](lab:param/flutes=24). [Select the flat of the bore](lab:select/bore/side[d.flat]) and [fit a shaft with a 4 mm flat](lab:param/flat=4).

## How it is built

`grip` is a sketch of the rim and one flute circle, patterned 18 times round Z. The arrangement has many regions; `grip.profile([0, 0])` keeps the one that contains the centre, so the outer halves of the flutes are left out and `body` extrudes a scalloped disc. The first flute sits half a step round from +X so that the pointer, a groove along +X, ends on a ridge rather than in a flute.

`d` is the bore's outline: an arc of radius `shaft / 2 + gap` drawn the long way round from one end of the flat to the other, closed by the line `flat`. Two derived params place the flat:

```js
flat_at: 'flat - shaft / 2 + gap',                          // 1.6 mm from the axis
chord: 'sqrt(pow(shaft / 2 + gap, 2) - pow(flat_at, 2))',   // half the flat: 2.66 mm
```

`bore` cuts it 12 mm deep. `gap` is 0.1 mm a side, the snug fit class: the bore is Ø6.2 mm and 4.7 mm across the flat, a push fit on a 6 mm shaft with a 4.5 mm flat.

## The grub screw

`grub` drills from a point on a plane 1 mm outside the rim, in along −Y onto the flat: `j.hole.tapped('M3', { depth: 'R + 1 mm' })` is a 2.9 mm self-tapping hole, so an M3 grub screw cuts its own thread. The print job orients the knob with `-Z` up; the hole is then horizontal, and the kernel records a teardrop decision and makes it a 45° teardrop pointing up the print.

## Printing it

Upside down, the flat top on the bed: 10.0 cm³, about 6 g of PLA and 20 min. The check reports 15.6 mm² of overhang: the floor of the pointer groove, which is printed as a 1.2 mm bridge over the first layers.

## Where next

- [W-05 Hose adapter](lab:preset/W-05): a revolved part with barbs.
- [X-06 Raspberry Pi Pico case](lab:preset/X-06): holes and fits on a board.
