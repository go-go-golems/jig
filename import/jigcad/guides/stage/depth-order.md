# Depth order

The stage hides surfaces with the painter's algorithm: solids are drawn back to front, each stroked and then filled with paper, so whatever comes later hides what came before. Choosing the order is the whole of hidden-surface removal in a hairline drawing. A wrong order puts a foot under the deck it stands on.

## The pipeline

1. Every solid mark (`loft` or `poly`, not on the floor or ghost layers) becomes an **item** (draft.js:88-99): `{ uid, name, k, S | pts, o, cen, key }`. `uid` numbers repeated names per frame (`wheel#3`); `key` is the depth of the centroid along `cam.c` plus `o.bias`. Larger is nearer.
2. A **strategy** from `src/lib/depth-order.js` returns the items back to front. A strategy that throws, or returns anything but a reordering of its items, is ignored for that frame and the stage sorts by key (draft.js:129-136).
3. With **chain outlines** on (the default), the parts of each limb are ordered and drawn as one unit (`unitOrder`, truth.js:115-125): all their outlines, then all their fills, so the seams at knees, elbows and waist vanish. A chain sits at the mean place of its parts and keeps last frame's place unless that moves by more than three places.

```js
// src/lib/depth-order.js:100-109
exports.strategies = {
  'centroid': (items) => byKey(items),
  'coherent': (items, cam, mem) => coherent(items, mem, 0.02),
  'deck plane': (items, cam, mem, kit) => anchored(items, cam, mem, kit, 0),
  'deck plane + coherent': (items, cam, mem, kit) => anchored(items, cam, mem, kit, 0.02),
  'deck plane + coherent + smoothed keys': (items, cam, mem, kit) => anchored(items, cam, mem, kit, 0.02, smoothKeys(items, mem)),
};
exports.current = 'deck plane';
```

## Why one key per part fails

- **A long part with a small one on it.** The deck is 81 cm long and the front foot stands near one end. Whenever the nose points slightly away from the viewer, the deck's centroid sorts in front of the foot standing on it; in the tracked side view by 12.1 cm. With one key per part the front foot was drawn under the deck in 51% of frames in the axonometric view and 76% in the tracked side view.
- **Parts that pass through each other.** At every joint two lofts overlap in space. No whole-part order is right there.
- **Near-ties flicker.** Two keys within a centimetre swap as contact noise moves the parts by millimetres.

## The deck as a plane

A flat part orders exactly anything wholly on one side of its plane (Newell, Newell and Sancha, 1972). `planeVerdict(f, q, cam)` (depth-order.js:42-55) measures a part's extent along the plane's normal from its sections' surfaces, not their centres; counts a part 75% on one side as that side; and leans edge-on cases toward the rider (`lean: 0.1`). `anchored` (depth-order.js:61-89) then moves the deck's key just behind the nearest part standing on it and its undercarriage just behind the deck.

So, when you draw:

- give a flat part that others stand on `plane: { n, p0, tol, lean }`, with `n` its up normal and `p0` a point on the standing surface (the deck uses `tol: d.thick`, `lean: 0.1`; board.js:150);
- give the parts under it `under: '<its name>'`;
- give the parts of one limb the same `chain`;
- use `bias` only where geometry cannot decide (the head is biased 6 cm forward so the face is never hidden by the neck).

## Measuring an order

The **Truth** tool (Order menu, or `overlays: ['truth']` in `sheet()`) samples every solid's surface into 3 px cells (`truth-cell`), keeps the nearest part per cell, and paints in `st-rec` at `opacity-truth` (0.5) every contested cell the order draws wrong (truth.js:8-91). It is recomputed a few times a second while playing. **Order changes** outlines in `st-rec` at `stroke-changes` (2.4 px), fading over 18 frames, every overlapping pair whose order just flipped.

On 45 s of the autopilot, the deck plane with chain outlines brought the axonometric view from 468 to 182 cm² drawn wrong per frame, and the foot under the deck from 51% to 1.9% of frames. What is left is mostly at joints.

## Writing a strategy

A strategy is `(items, cam, mem, kit) → items back to front`. `cam` gives `c`, `r`, `u`; `mem` persists between frames for this stage; `kit.overlaps(a, b)` says whether two silhouettes overlap on the sheet (a box test, then hulls of neighbouring sections) and `kit.depth(p)` gives a depth. Add it to `exports.strategies`, press Run, pick it in the Order menu, and score it on a clip in Experiments.
