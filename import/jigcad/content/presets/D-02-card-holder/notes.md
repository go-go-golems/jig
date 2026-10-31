# Business-card holder

A desk stand for about fifty business cards: a floor, a 12 mm front lip with a thumb notch, and a back that leans 15°. The whole body is one side profile extruded to width, so the idea it teaches is the profile: every corner of it is an expression of the params, and the shape follows when one of them changes.

> **Try it.** [Look at the profile from the front](lab:view/stage?view=front), then [lean the back to 25°](lab:param/lean=25) and [select the inside of the back](lab:select/body/side[side.p.4]). [Make it for US cards](lab:param/card_w=88.9) and the width follows.

## How it is built

`side` is a closed polyline on the XZ plane. Its points are written as expressions: the outer foot of the back is at `2 * t + stack`, the top of the back at `2 * t + stack + back_h * tan(lean)`, so the back keeps its thickness `t` at any lean. `body` extrudes the profile symmetrically to `w = card_w - 20 mm`: narrower than a card, so a card sticks out 10 mm at each side and is easy to pick up.

`notch` is a circle of radius 12 mm sketched on a plane 1 mm in front of the lip and cut back by `t + 2 mm`: deep enough to clear the lip, short enough to leave the back alone.

## Printing it

Upright with the floor on the bed: 16.0 cm³, about 16 g of PLA and 52 min. The back leans 15°, inside the 45° limit. The check reports 51 mm² of overhang: that is the 0.5 mm chamfer on the bed edges, which faces down at exactly 45°. No slicer supports a 0.5 mm chamfer at the bed, and the chamfer is there to hide elephant's foot.

## Changing it

`card_w` is the long edge of the card (85 mm EU, 88.9 mm US, 85.6 mm for ISO ID-1 cards), `stack` the depth between the lip and the back (22 mm holds about 50 cards of 0.35 mm), `lean` and `back_h` the back. Keep `back_h` near three quarters of the card height so cards do not tip over the top.

## Where next

- [D-01 Pen cup](lab:preset/D-01): a shell with patterned windows.
- [D-03 Desk tray](lab:preset/D-03): a shelled tray with compartments from a config.
