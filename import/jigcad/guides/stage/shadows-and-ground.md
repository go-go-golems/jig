# Shadows and ground

Height is the one thing an orthographic sheet hides. The plan projects it away, the axonometric view confuses it with distance, and the elevations show it but lose depth. The stage puts it back with two conventions: a hatched sun shadow when the camera looks down, and a cut ground line when it does not.

## The sun

```js
// app/draft.js:138
export const SUN = V.norm([-0.5, -1, -0.38]);
```

`SUN` is the direction the light travels (token `sun`). The sun stands 57.9° high in the `+x`, `+z` quarter of the sky, behind the viewer's right shoulder in the default axonometric view, so shadows fall away from the viewer and a little to the left. A point at height `h` above the ground casts its shadow 0.628 h away.

## Drawing shadows

A shadow is a second, oblique projection: each point is pushed along `SUN` down to the ground (the terrain's height there, `heightAt(x, z)`, or 0), then projected with the camera.

```js
// app/draft.js:239-244 (shadowOf) and 183-187 (in flush)
const sp = p => { const gy = hAt ? hAt(p[0], p[2]) : 0, k = Math.max(0, p[1] - gy) / -SUN[1]; return proj(cam, [p[0] + SUN[0] * k, gy, p[2] + SUN[2] * k]); };
if (planar && this.on('shadows')) {
  const path = new Path2D(); let any = false;
  for (const m of M) if (m.k === 'loft' && m.layer !== 'ghost' && !m.o.ghost && !m.o.noShadow) { this.shadowOf(path, m.S); any = true; }
  if (any) { ctx.fillStyle = hatchPattern(ctx, C, this._hatch) || C.major; ctx.fill(path); }
}
```

- Every solid loft adds its hulls to **one path**, filled **once** with the hatch. Overlapping shadows are therefore one tone: a point on the ground is lit or not.
- Shadows are drawn after the floor and before everything that casts them.
- Only lofts cast shadows. Polygons (props), ghosts and lofts marked `noShadow` do not.
- Shadows appear only when the camera looks down by more than 0.05 rad (2.9°, `planar`). In the elevations they would collapse onto the ground line.
- The Shadows overlay switches them; it is on by default.

## The hatch

```js
// app/draft.js:78-84
const s = 6, c = document.createElement('canvas'); c.width = c.height = s * 2; const x = c.getContext('2d'); x.scale(2, 2);
x.strokeStyle = C.shadow; x.lineWidth = 0.6; x.beginPath(); x.moveTo(-1, s + 1); x.lineTo(s + 1, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(s - 1, s + 1); x.lineTo(s + 1, s - 1); x.stroke();
const p = ctx.createPattern(c, 'repeat'); if (p && p.setTransform) p.setTransform(new DOMMatrix().scale(0.5));
```

The tile is `hatch-tile` (6 px) square: one line corner to corner rising to the right at 45°, overshooting a pixel at each end, plus the two corner strokes that join it to its neighbours. Repeated, it gives `stroke-hatch` (0.6 px) lines 6 px apart along a row and 4.2 px apart across them, in `st-shadow`. It is drawn at twice the size and scaled by half, so it stays sharp on dense screens, and cached per canvas and colour. The hatch keeps the drawing to lines: the floor grid shows between the hatch lines, and a dark sheet gets light hatching from the same token.

## The floor

- **Grid** (`g.grid({ minor, major, extent })`, draft.js:223-230): lines at `stroke-grid` (0.6 px), `st-grid` every `minor` metres and `st-major` every `major`. The flat ground uses 0.5 m and 2 m (terrain.js:8). Only the part the camera sees is drawn. The Grid overlay switches it, and it is drawn only when the camera looks down.
- **Ground line** (draft.js:210-215): in an elevation the ground is a section cut. A `stroke-ground` (1.4 px) `st-ink` line at the ground's height, over a `hatch-ground-band` (18 px) band of 0.6 px `st-muted` lines `hatch-ground-pitch` (7 px) apart. It replaces shadows in exactly the views that cannot have them.
- **Boundary** (`g.boundary({ size, band })`, draft.js:231-238): the lot's edge, a hatched band `boundary-band` (0.35 m on the flat ground) between an outer and an inner square, filled with the even-odd rule and outlined at 1 px on both sides.

## Poché on props

Props are polygons. Faces you ride (a funbox's top, a kicker's ramp) are paper (`fill: 'stage'`); faces that are slopes, sides or backs are hatched (`fill: 'hatch'`: paper first, so they hide what is behind them, then the pattern):

```js
// src/lib/skate/terrain.js:27-30
$.view('drawing', v => v.layer('figure').draw(g => {
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; g.poly([top[i], top[j], foot[j], foot[i]], { fill: 'hatch', name: 'slope' }); }
  g.poly(top, { fill: 'stage', name: 'top', bias: 0.01 });
}));
```

In plan this reads at once: the top is a surface, the slopes are tone. Give every new obstacle the same split.
