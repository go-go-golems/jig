# Drawer divider set

Egg-crate dividers for a 200 × 150 mm drawer: one long divider across the width and two short ones front to back, which slot into each other to make six compartments. They are laid out flat as one part with a body per divider, so the whole set is one plate. The idea it teaches is the half-lap joint, and copying a finished body with a pattern.

> **Try it.** [Look at the plate from above](lab:view/stage?view=plan), then [make four compartments across](lab:param/nx=4) and see a third short divider and a third slot appear. [Fit a 240 mm drawer](lab:param/W=240). [Select the side of a slot](lab:select/long-slots/side[long-slots.s.left]).

## The half-lap joint

Where two dividers cross, each gives up half its height. The long divider is slotted from the top and the short ones from the bottom, each slot `h / 2 + gap` deep and `t + 2 · gap` wide: 20.2 mm by 2.65 mm for 40 mm dividers 2.25 mm thick. Together the two slots are 0.4 mm deeper than the divider is tall, so the tops sit flush with a little play. `gap` is 0.2 mm a side, the slide fit class: the dividers go together by hand and do not rattle.

## How it is built

Every divider lies in the XY plane, its length along X and its height along Y. `long` extrudes the long plate `t` thick, `long-round` rounds its two top corners by 4 mm, and `long-slots` cuts a rectangle and a linear pattern of it, `nx − 1` slots at a step of `W / nx`, so the compartments are equal. `short` and `short-slots` do the same for a short divider, which starts at `y0` on the plate. The fillets come before the slots so that the corner selector, edges along Z above mid-height, cannot catch the mouth of a slot.

`lead-in` chamfers the mouth of every slot by 0.6 mm: the convex edges along Z of `long-slots` and `short-slots`. Then `longs` and `shorts` pattern the finished bodies, not the features: `j.feat('long').body()` copies the plate with its slots, rounds and lead-ins, `ny − 1` long and `nx − 1` short dividers in all.

## Printing it

Flat on the bed, one plate: three bodies, 43.9 cm³, about 48 g of PLA and 120 min. A divider 2.25 mm thick is five line widths, stiff enough at 40 mm tall. Measure the drawer inside and set `W` and `D` to it; `clear` already takes 1 mm off each end.

## Where next

- [D-03 Desk tray](lab:preset/D-03): compartments cut from a solid block instead.
- [D-09 Gridfinity baseplate](lab:preset/D-09): a grid that bins drop into.
