# Headphone hanger

A clamp that grips a desk edge with a J-hook beneath it for a pair of headphones. It is one side profile extruded 30 mm wide, tightened from below by an M6 bolt that threads through a captive nut. The idea it teaches is orientation for strength: the part prints lying on its side, so the layers follow the hook round its bend instead of stacking across it.

> **Try it.** [Look at the profile from the front](lab:view/stage?view=front), then [fit it to a 38 mm worktop](lab:param/desk=38) and [widen the hook for a thick headband](lab:param/reach=55). [Select the floor of the hook](lab:select/body/side[side.p.3]).

## How it is built

`side` is a closed polyline on the XZ plane with the desk top at z = 0: a top jaw, a spine, a bottom jaw 12 mm deep and, below it, the hook. Every corner is an expression, and two params are derived so the hook follows the desk:

```js
throat: 'desk + travel',              // 25 + 8 = 33 mm between the jaws
saddle: '-throat - bj - drop',        // the floor of the hook, 55 mm below the desk top
```

`body` extrudes the profile 30 mm (`b`). `hook` is a selector kept in a variable: the edges along Y, left of the spine and below the top of the lip. Its concave edges get a 6 mm fillet (`saddle`), where the headband rests, and its convex edges 3 mm (`tips`), less than half the 7 mm lip so both fillets fit.

## The bolt

`bolt` is `j.hole.nutTrap('M6', { from: 'top', depth: 'bj' })` drilled up from the underside of the bottom jaw: a hex pocket 10.4 mm across the flats (10 mm plus the slide gap on each side) and 5.6 mm deep, then a 6.4 mm bore. `depth: 'bj'` stops it at the throat; with the default `through` it would also pierce the top jaw. Press an M6 nut into the pocket and turn an M6 × 25 bolt up against the underside of the desk; 8 mm of `travel` takes up the play.

## Printing it

`.orient('+Y')` lays the profile on the bed. The 69 mm height becomes the part's length on the plate, the 30 mm width its print height, and the hook bends within the layers, where PETG is strongest. The kernel sees that the bolt is now horizontal and makes it a 45° teardrop pointing up. The one overhang the check reports, 33.6 mm², is the flat top of the nut pocket: a 6 mm bridge, which prints without support. About 28 g of PETG and 79 min.

## Where next

- [S-01 Cable clip](lab:preset/S-01): a push-on clip from one profile, no bolt.
- [W-09 Cordless drill holder](lab:preset/W-09): a wall mount carrying a heavier load.
