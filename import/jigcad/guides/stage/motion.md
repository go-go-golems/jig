# Motion

A still sheet shows several moments at once by sampling time evenly: equal times apart, so spacing shows speed. The stage keeps the past in a history, draws it under the solids, and fades it with age.

## The history and the trail window

The runtime keeps every body's pose `{ p, q }` every second step for 8 s: 480 samples, one per 1/60 s. Views read it with `ctx.history.between(t0, t1)`. The window a view should draw is `g.trailSpan()`:

```js
// app/ui/stage.jsx:32-42
export function trailSpan(host) {
  const rt = host.rt; if (!rt || !host.stage.overlays.has('trail')) return null;
  const h = rt.history.buf; if (!h.length) return null;
  const last = type => rt.events.list({ type, last: 1 })[0];
  const to = last('takeoff'); if (!to || to.t < h[0].t) return null;
  if (rt.ir.states.has('skater/phase') && rt.read('skater/phase') === 'air') return [to.t, rt.time];
  const ends = [last('land'), last('bail')].filter(e => e && e.t >= to.t).map(e => e.t);
  if (!ends.length) return null;
  const t1 = Math.min(...ends) + 0.1;
  return rt.time - t1 < 6 ? [to.t, t1] : null;
}
```

It is the last jump: from its take-off to now while in the air, then to its landing or bail plus 0.1 s, kept for 6 s. Both ends come from the stance controller's own events, which arrive in the step they happen. Key any new motion view to this window, not to the trick recognizer's event, which arrives 0.233 s after the landing.

## Onion skins

```js
// src/lib/skate/board.js:115-116
let step = 5; while (samples.length > 18 * step) step *= 2;
for (let i = 0; i < samples.length; i += step) { const p = samples[i].bodies[deck.id]; if (p) drawBoard(g, p, d, { ghost: (i + 1) / samples.length }); }
```

- A ghost every fifth sample (1/12 s), counted from the window's start, so ghosts already drawn stay put while the window grows. A flight over 1.5 s doubles the stride, so there are never more than 18.
- Ghosts are on the `ghost` layer, flushed after the shadows and before every solid: `stroke-ghost` (0.8 px) outlines in `st-ghost` at opacity `0.18 + 0.5 a`, with a paper wash at 0.3 of that. `a = (i + 1)/n` runs from near 0 for the oldest to 1, so the image has a direction.
- Ghosts are never depth-sorted: every solid covers them and they cover nothing. A ghost deck has no trucks, wheels or plane.

## Flight paths

```js
// src/lib/skate/board.js:120-123
g.polyline(centre.map(p => p.p), { tone: 'blue', width: 1.2, alpha: 0.85 });
g.polyline(centre.map(p => V.add(p.p, Q.rot(p.q, [d.length / 2, kickY(d.length / 2, d), 0]))), { tone: 'teal', width: 0.8, alpha: 0.6, dash: [3, 3] });
const every = Math.max(1, Math.round(0.05 / (samples[1].t - samples[0].t || 0.05)));
for (let i = 0; i < centre.length; i += every) g.dot(centre[i].p, 1.6, { tone: 'blue' });
```

The centre's path is solid blue with a 1.6 px tick every 50 ms; the nose's path is dashed teal. Ticks are `|v| Δt` apart, so they record speed. A path that is not a parabola shows a force besides gravity.

## Chronophotographs

D-03's view (`lab/chrono.js`) draws a Marey stick figure every 0.08 s requested (a stride of 5 samples, 0.083 s) from bodies the physics moves: a trunk 0.62 m up from the hips, a hollow 2.5 px head dot, two legs from hips to feet, all `st-violet`; the deck as a 1.6 px `st-blue` line 0.4 m either side of its centre; opacity `0.25 + 0.75 i/n`; the hips' path dashed `2 3` at 0.6. Its window is widened by 0.3 s before and 0.2 s after the trail's. Draw new chronophotographs from the history, never from the figure's posed joints, which are not stored.

## Drawing between steps

The world steps every 1/120 s; the screen draws at its own rate. The stage draws a blend of the last two steps, `alpha` of the way from the previous to the current one, alpha being how far the clock has run into the next step (host.js:201-230). Positions and velocities are interpolated linearly and orientations by slerp; the bodies are put back exactly after the frame, so nothing measured ever sees the blend. A teleport (more than 0.5 m, or `|q·q′| < 0.7`) is drawn where the body is now. The blend is skipped after a single step, a reset or a hot reload. Without it, a frame that gets one step more or fewer than the last puts the board up to one step of travel (3.3 cm at 4 m/s) off the smoothly gliding camera, which reads as blur at speed.

```js
// app/ui/stage.jsx:124
const off = host.onFrame(dt => host.replay ? draw(dt) : host.withRenderState(() => draw(dt)));
```

Any live view of the simulation should draw inside `withRenderState`. A replay draws recorded frames as they are.

## Gestures

| gesture | does |
|---|---|
| drag | orbit: yaw 0.008 rad and pitch 0.006 rad per pixel |
| Shift-drag, right-drag, middle-drag | pan, in metres along the sheet's right and up |
| wheel | zoom, 0.25 to 5 |
| double-click | square up: orbit and pan back to zero |
| click, then keys | ride: ↑ push · ←→ carve · Space pop · J/L flick · I/K scoop · U wrap |
| in replay | Space play/pause · ← → step (Shift: 10) · Esc back to live |

A drag starts after 4 px, so a click still focuses the stage. The context menu is suppressed over the stage so right-drag can pan.

## The trick toast

When the recognizer scores a trick, a toast shows its name and measurements for 2.6 s in the stage's top-right corner (see TrickToast). It fades in over the first 8% of that time and out over the last 18%.
