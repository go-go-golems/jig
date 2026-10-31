# Cable clip for a desk edge

A clip that pushes onto the edge of a desk and holds a cable or two in a channel underneath it, so the charger lead stops sliding off the back. It is one sketch and one extrude: the side view is drawn as a closed outline of eighteen points, and the extrude gives it its width. The idea it teaches is that a profile written in parameters is a whole family of parts.

> **Try it.** [Look at it from the front](lab:view/stage?view=front) to see the outline as drawn. Then [fit it to a 25 mm desk](lab:param/desk=25), [widen the channel to 12 mm](lab:param/cable=12), and [select the face that sits against the desk edge](lab:select/body/side[side.outline.14]).

## How it is built

The sketch `side` lies on the XZ plane, so x runs into the desk and z points up. The desk fills x ≥ 0 between z = 0 and z = `desk`; the spine sits behind it at x = −`t`. Every corner of `outline` is an expression of the params, for example `['cable + t', '-2 * t - cable']` for the outside corner of the hook, so changing `desk` moves the top jaw and nothing else. With no constraints and no dimensions the sketch is explicit: the coordinates are fixed, the DOF is 0.

`body` extrudes the outline by `w`, 12 mm. Each face is named after the segment it came from: `body/side[side.outline.13]` is the top of the bottom jaw, `body/side[side.outline.15]` the underside of the top jaw.

## The grip

A clip that fits the desk exactly falls off; one that is too tight cracks. The jaw tips carry two small bumps that pinch the board by `grip`, 0.6 mm each side, so the jaws flex a little and hold. The sloped faces in front of the bumps are lead-ins: they spread the jaws as you push the clip on. PETG is the material because it bends further than PLA before it breaks.

## Printing it

The print job lays the clip on its side (`-Y` up, chosen automatically): the outline is the first layer, so there are no overhangs and the layers run along the jaws, which is the strong direction for a part that flexes. It is 2,885 mm³, 3.7 g of PETG and about 12 min.

> **Exercise.** Make a double clip: change `cable` to 14 mm and `w` to 20 mm, then check in the header that the print time stays under 30 min.

## Where next

[S-02 Door wedge](lab:preset/S-02) is another single extrude, with a toothed underside. [H-08 Cable comb](lab:preset/H-08) keeps a whole bundle in order.
