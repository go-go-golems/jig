# Drawing bodies

Every body on the stage is a **loft**: a list of elliptical sections (stations) swept along it, drawn in a few hairlines. The rider, the deck, the trucks, the wheels and D-02's cones are all lofts. Flat faces (a funbox, a kicker) are polygons.

## Stations

A station is an ellipse in space, `c + a cos θ A + b sin θ B`:

| field | meaning |
|---|---|
| `c` | centre, a world point in metres |
| `A`, `B` | unit axes of the section's plane, perpendicular |
| `a`, `b` | radii along `A` and `B`, metres |
| `ring` | 1 to draw this section as a visible ring |

List stations from one end of the body to the other. Use more of them where the outline bends: the deck has 18, dense at the nose and tail (`sectionsOfDeck`, board.js:131-137); D-02's cone has a two-station base plate and seven stations up its body.

## How a loft is drawn

```js
// app/draft.js:308-322
drawLoft(ctx, S, o, ghost) {
  const cam = this.cam, C = this.C, { path, E } = this.loftPath(S);
  ctx.lineJoin = 'round';
  if (ghost) { /* 0.8 px outline in the ghost tone, faint paper wash: see motion */ return; }
  const tone = toneOf(C, o.tone, C.ink);
  ctx.strokeStyle = tone; ctx.lineWidth = 2; ctx.stroke(path); ctx.fillStyle = o.fill === 'soft' ? C.soft : C.stage; ctx.fill(path);
  ctx.lineWidth = 0.55; ctx.globalAlpha = 0.7;
  S.forEach((s, i) => { if (s.ring) visibleArc(ctx, cam, s, E[i]); });
  if (o.meridian) meridian(ctx, cam, S, [0, 1]);
  ctx.globalAlpha = 1;
}
```

1. **Silhouette.** Each section is projected to 20 points. Each pair of neighbouring sections gives one convex hull on the sheet (Andrew's monotone chain, `hull2`). The union of the hulls is the outline. Pairs, not the whole stack, so a bent body stays bent.
2. **Stroke, then fill.** The union is stroked at `stroke-silhouette` (2 px) and filled with paper (`st-bg`, or `st-soft` with `fill: 'soft'`). The fill covers the inner half of the stroke and every seam between hulls, leaving one 1 px outline that hides what is behind it.
3. **Rings.** A station with `ring: 1` draws the half of its ellipse whose outward normal faces the viewer, at `stroke-ring` (0.55 px) and `opacity-ring` (0.7). Rings are where girth reads: a waist, a band.
4. **Meridian.** With `meridian: true`, a line joins the end of every station's `B` axis along the body, drawn only where it faces the viewer: the torso's spine, a cone's seam.

## The options

`g.loft(stations, o)`:

| option | use |
|---|---|
| `name` | the part's name; numbered per frame for the depth order (`wheel#3`) |
| `tone` | a palette name (`'amber'`) or a CSS colour for the outline; default `st-ink` |
| `fill` | `'soft'` for `st-soft` instead of paper |
| `meridian` | draw the meridian |
| `bias` | metres added to the depth key; a judgment, used sparingly (head +0.06, deck +0.02, wheels −0.015) |
| `plane` | `{ n, p0, tol, lean }`: a flat part that orders what stands on it (the deck) |
| `under` | the name of the flat part this one sits under (`'deck'` for trucks, hangers, wheels) |
| `chain` | a limb name; with chain outlines on, a chain is stroked and filled as one outline |
| `ghost` | a number from 0 to 1: draw as an onion-skin outline at that strength |
| `noShadow` | cast no shadow |
| `after` | `d => …`, draws decals once the loft is painted |

`g.poly(points, { fill, tone, width, stroke, name, bias })` draws a flat polygon, depth-sorted with the lofts. `fill: 'stage'` (default) is paper, `'hatch'` is paper and then the hatch, `'soft'` is `st-soft`, `'none'` leaves it open; `stroke: false` drops the 1 px edge.

## The figure

The rider is 19 lofts on a 22-joint skeleton (figure.js:7-15, 75-101). Each station is fixed to a joint: an offset in the joint's frame, the joint's `x` axis as `A` and its `z` axis (or `y`, for the feet and toes) as `B`. Pose the skeleton and the stations follow:

```js
// src/lib/skate/figure.js:134-137
for (const part of PARTS) {
  const st = part.st.map(([j, o, a, b, ring]) => { const W = F.W[j]; return { c: toW(F, j, o), A: Q.rot(W, [1, 0, 0]), B: Q.rot(W, part.ax === 'xy' ? [0, 1, 0] : [0, 0, 1]), a, b, ring: ring || 0 }; });
  g.loft(st, { bias: part.bias, meridian: part.meridian, name: part.key, chain: part.chain, after: part.key === 'head' ? d => drawFace(d, F, s) : null });
}
```

Parts belong to six chains: `legL`, `legR`, `armL`, `armR`, `head` and `torso` (figure.js:78). Upper arms, forearms, thighs and shins end in capped stations (three shrinking sections), so their ends are round. The figure is a view: it reads the simulation and never pushes on it. Its pose is closed-form each frame: posture springs, forward kinematics, two-bone IK onto the feet, forward kinematics again.

## The board

`drawBoard(g, pose, dims, { ghost, roll })` (board.js:138-168) lofts the deck from its 18 sections (rings where the kicks start and over the trucks), then per truck a baseplate, a hanger and two wheels, and four bolts as 0.9 px dots that hide when the grip faces away. The deck carries its `plane` so riders stand in front of it; trucks, hangers and wheels are `under: 'deck'`. With `ghost` set, only the deck is drawn.

## Decals

Features on a surface (the face) are drawn in its tangent plane with one canvas transform, exact under an orthographic camera: in a loft's `after`, `d.decal({ p, q }, local, normal, size, mirror, ctx2d => …)` maps a unit square at `local` in the frame `{ p, q }` onto the sheet, and returns false when the normal faces away. Draw inside it with ordinary 2D calls and `d.color('ink')`. The face uses 0.17 to 0.42 unit strokes in that square (figure.js:186-199).

## A new prop, start to finish

```js
// content/presets/D-02/lab/cones.js:17-25: a cone is a two-station base and a seven-station body
$.view('cones', v => v.layer('figure').draw((g, ctx) => {
  for (const at of spots) {
    const st = coneStations(at);
    g.loft(st.slice(0, 2), { name: 'cone base', bias: -0.02 });
    g.loft(st.slice(2), { name: 'cone', meridian: true, tone: 'amber' });
  }
}));
```

It gets a hatched shadow, a place in the depth order and both themes with no further work.
