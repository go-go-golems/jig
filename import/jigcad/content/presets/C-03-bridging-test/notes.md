# Bridging test

A 148 mm bar on seven pillars, with clear spans of 5, 10, 15, 20, 30 and 40 mm under it. The printer has to lay each span across thin air between two pillars. Look underneath after printing: the longest span that is still flat is the bridge length you can design for. The idea it teaches: the openings are cut out of one solid bar by one sketch, so the test is two extrudes and a cut, whatever the number of spans.

> **Try it.** [Look at it from the front](lab:view/stage?view=front): every opening shows. [Select the pillar face at the end of the 40 mm span](lab:select/spans/side[openings.s40.right]). Then [make the deck 0.6 mm thin](lab:param/deck=0.6), three layers, and print that too: thin decks sag first.

## How it is built

`spans` is a plain list. `base` is a 1.2 mm plate under the whole test with a 7 mm strip in front for labels, and `bar` is one block `L` long and `H + deck` = 6.2 mm high on top of it. `L` is an expression built from the list, 7 × `p` + 120 mm = 148 mm, so another span lengthens the bar by itself.

The sketch `openings` holds one rectangle per span; span k starts after k + 1 pillars and the spans before it. One `.cut` with the extent `{ two: ['H', 0] }` takes all six out of the bar, 5 mm up from the top of the base and nothing down.

## Reading the result

The job reports `print.overhang` as info: 720.2 mm² past 45°, which is exactly the six deck undersides (120 mm of span × 6 mm). A bridge is a 90° overhang held at both ends, and slicers print it differently from a ledge: straight lines across the gap, fan at full speed, often slower and cooler. The printer profile says bridges up to 10 mm need no thought; this test tells you what yours really does.

Typical results in PLA: up to 20 mm flat, 30 mm with a little sag in the first layer, 40 mm drooping 0.5 to 1 mm. Strings hanging under a span mean the bridge flow is too high or the fan too weak.

## Printing it

Upright, about 6 g of PLA and 17 min (the estimate counts supports under the spans; print without them). The base plate keeps the narrow bar on the bed.

## Where next

- [C-02 Overhang test](lab:preset/C-02): ledges held at one end only.
- [C-06 Wall thickness](lab:preset/C-06): the other side of the slicer, thin walls.
