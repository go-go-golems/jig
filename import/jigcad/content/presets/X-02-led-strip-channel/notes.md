# LED strip channel

A 200 mm channel for a 10 mm LED strip, with a diffuser that slides into two grooves near the top and turns the row of dots into an even line. The channel is one section extruded to length; the diffuser is a flat strip sized from the grooves, a second body of the same part lying beside it. The idea it teaches is two pieces that follow from one set of params, so a change to the strip, the grooves or the fit reaches both.

> **Try it.** [Look along the channel](lab:view/stage?view=side) to see the section, then [fit an 8 mm strip](lab:param/strip=8) and [make it taller](lab:param/H=15) for more diffusion. [Select the roof of a groove](lab:select/body/side[section.p.5]).

## The section

`section` is a closed polyline on a YZ plane at the channel's start: a floor of `layer(8)` (1.6 mm), 2 mm walls and, near the top, a groove cut 0.9 mm into each wall. The groove's floor is flat; its roof rises 1.2 for each 1 it goes in, about 50° from the bed, so with the channel printed on its back nothing in the section looks down at less than 45°. A 1.2 mm lip above each groove keeps the diffuser in.

## The diffuser

```js
dg: 'dt + 2 * gap',             // groove height: 1.2 + 2 × 0.2 = 1.6 mm
dw: 'wi + 2 * gd - 2 * gap',    // diffuser width: 10.6 + 1.8 − 0.4 = 12.0 mm
```

The diffuser is `dt` = 1.2 mm thick (six layers), `dw` = 12.0 mm wide and 1 mm shorter than the channel. `gap` is the slide class, 0.2 mm all round, so it slides in from one end and stays put. It is drawn flat on the bed 5 mm beside the channel, as it prints.

## Printing it

Both bodies on one plate, 14.2 cm³ in all, about 18 g of PETG and 48 min. Print the diffuser in natural (uncoloured) PETG or PLA: at 1.2 mm it lets the light through and spreads it. `screws` puts two M3 countersunk holes through the floor 20 mm from each end, heads flush so the strip's adhesive lies flat over them.

## Where next

- [X-01 Cable strain relief](lab:preset/X-01): where the strip's lead leaves the channel.
- [X-05 Project box](lab:preset/X-05): a box for the controller.
