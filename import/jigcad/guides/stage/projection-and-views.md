# Projection and views

The stage projects the world with two dot products. A view is an orthonormal basis: `c` points from the scene toward the viewer, `r` is the sheet's right and is always horizontal, and `u = c × r` is the sheet's up. World units are metres; `+y` is up.

## The camera

```js
// app/draft.js:16-22
export function makeCam(yaw, pitch, scale, target, W, H) {
  const cp = Math.cos(pitch), c = [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = V.cross(c, r);
  return { c, r, u, s: scale, T: target, W, H, yaw, pitch, Y0: H * (pitch > 1.2 ? 0.5 : 0.5) };
}
export const proj = (cam, p) => { const d = V.sub(p, cam.T); return [cam.W / 2 + V.dot(d, cam.r) * cam.s, cam.Y0 - V.dot(d, cam.u) * cam.s]; };
export const depth = (cam, p) => V.dot(V.sub(p, cam.T), cam.c);
```

- `s` is pixels per metre. `T` is the world point drawn at the sheet's centre, `(W/2, Y0)`; `Y0` is half the height in every view.
- `depth(cam, p)` grows toward the viewer. It is what the depth order sorts on.
- `unprojectFloor(cam, x, y, h = 0)` (draft.js:23-28) turns a sheet point back into the floor point under it. It returns `null` when the camera looks at the floor edge-on (`|c.y| < 0.05`).

Because `r` has no vertical part, a vertical world line is drawn vertical in every view except the plan. Parallel lines stay parallel, an ellipse projects to an ellipse, and a drawing in a body's tangent plane is one affine transform. A perspective camera would break all three; do not add one.

## The named views

| view | key | yaw | pitch | true lengths | token |
|---|---|---|---|---|---|
| Axonometric | `axo` | 38° | 27° | none: x, y, z drawn at 0.836, 0.891, 0.712 | `view-axo-yaw`, `view-axo-pitch` |
| Front elevation | `front` | 0° | 0° | x and y | `view-front-yaw` |
| Side elevation | `side` | −90° | 0° | z and y | `view-side-yaw` |
| Plan | `plan` | 0° | 90° | x and z | `view-plan-pitch` |

The axonometric angles are a trimetric chosen to read people and boards. The isometric angles (45°, 35.26°) put a cube's near and far corners on one point, which is why the stage does not use them. With the rider facing `+z` and the nose at `+x`, the front elevation sees the rider from the toe side and the side elevation looks along the board from behind its tail.

## Scale and centre

```js
// app/ui/stage.jsx:94-96
const base = st.view === 'plan' ? Math.min(Wh, H) / 7.5 : Math.min(Wh / 5.5, H / 3.1);
const k = base * st.zoom, pitch = Math.max(-0.05, Math.min(Math.PI / 2, view.pitch + st.orbit.dp));
let cm = makeCam(view.yaw + c.yaw.x + st.orbit.dy, pitch, k, [c.p[0], st.view === 'plan' ? 0 : 0.9 + c.gy, c.p[1]], Wh, H);
```

- At zoom 1 an elevation or the axonometric view fits 5.5 m across or 3.1 m up, whichever is smaller (`scale-elevation`); the plan fits 7.5 m across its shorter side (`scale-plan`).
- Zoom runs from `zoom-min` 0.25 to `zoom-max` 5 with the wheel (`zoom × exp(−deltaY × 0.0015)`); the toolbar slider stops at 4.
- The sheet centres `target-height` (0.9 m) above the ground under the board, so the rider sits in the middle; the plan centres on the ground.
- The pitch is clamped to [−0.05, π/2]: the camera may dip 2.9° below the horizon, never further, and never past straight down.

`FormSkateStage.baseScale(view, W, H)` returns the same base scale, and `FormSkateStage.sheet(canvas, { view, zoom })` builds the whole camera.

## Orbit, pan and square-up

- **Orbit**: drag. Yaw changes by `orbit-rate` (0.008 rad) per pixel across, pitch by 0.006 rad per pixel down, with the pitch offset kept within −1 to 1.6 rad (stage.jsx:139). A drag starts after `drag-threshold` (4 px).
- **Pan**: Shift-drag, or drag with the right or middle button. The pan is an offset of the target along the camera's own `r` and `u`, in metres, so the drawing stays put on the screen while the camera follows, tracks or orbits:

```js
// app/ui/stage.jsx:99-100 (pan) and 138 (the gesture: the drawing moves with the pointer)
if (pan.x || pan.y) cm = makeCam(cm.yaw, cm.pitch, k, V.add(cm.T, V.add(V.mul(cm.r, pan.x), V.mul(cm.u, pan.y))), Wh, H);
if (panning) host.stage.pan = { x: p0.x - dx / pxPerM, y: p0.y + dy / pxPerM };
```

- **Square up**: double-click the stage, press Square up, or pick a view. Orbit and pan go back to zero (`host.squareUp()`, host.js:234); Square up also resets the zoom to 1.

## Follow and track

The camera follows the board with critically damped springs on wall-clock time (stage.jsx:80-89): the target eases toward the board plus `follow-lead` (0.4 s) of its velocity with half-life `follow-half-life` (0.32 s; 0.6 s with Follow off), and with Track on the yaw eases toward the rider's heading with half-life `track-half-life` (0.5 s). A paused or scrubbed replay snaps the camera instead of easing it.
