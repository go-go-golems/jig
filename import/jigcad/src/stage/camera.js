// camera.js: the stage's orthographic camera, translated to CAD axes (millimetres, +Z up).
//
// The Form Skate stage projects with two dot products: x = W/2 + s (p − T)·r, y = Y0 − s (p − T)·u, where c points
// from the scene toward the viewer, r is the sheet's right and always horizontal, and u = c × r. Its world has +y up
// and the rider facing +z; here the world has +Z up and the front elevation looks along +Y, so the stage's (x, y, z)
// is our (X, Z, −Y). The yaw and pitch tokens keep their values: front looks from −Y, side (yaw −90°) from −X, plan
// from +Z, and the axonometric view (38°, 27°) from the front right, above.
import { V, DEG, clamp, boxCorners, boxCentre, boxOk } from './math.js';

export const VIEWS = {
  axo: { name: 'Axonometric', short: 'Axo', yaw: 38 * DEG, pitch: 27 * DEG },
  front: { name: 'Front elevation', short: 'Front', yaw: 0, pitch: 0 },
  side: { name: 'Side elevation', short: 'Side', yaw: -90 * DEG, pitch: 0 },
  plan: { name: 'Plan', short: 'Plan', yaw: 0, pitch: 90 * DEG },
};
export const VIEW_KEYS = ['axo', 'front', 'side', 'plan'];

// the light travels along SUN (token `sun`, the stage's (−0.5, −1, −0.38) in our axes): 57.9° high, from the
// viewer's right shoulder in the axonometric view, so shadows fall away and a little to the left
export const SUN = V.norm([-0.5, 0.38, -1]);

export const ZOOM_MIN = 0.25, ZOOM_MAX = 5;

export function makeCam(yaw, pitch, s, T, W, H) {
  const cp = Math.cos(pitch);
  const c = [cp * Math.sin(yaw), -cp * Math.cos(yaw), Math.sin(pitch)];
  const r = [Math.cos(yaw), Math.sin(yaw), 0];
  const u = V.cross(c, r);
  return { c, r, u, s, T, W, H, yaw, pitch, Y0: H / 2, planar: pitch > 0.05 };
}
// a camera from an explicit basis (the sketch view: c = the plane's normal, r = its x, u = its y)
export function basisCam(c, r, u, s, T, W, H) {
  const pitch = Math.asin(clamp(c[2], -1, 1));
  return { c, r, u, s, T, W, H, yaw: Math.atan2(c[0], -c[1]), pitch, Y0: H / 2, planar: false, basis: true };
}
export const proj = (cam, p) => {
  const dx = p[0] - cam.T[0], dy = p[1] - cam.T[1], dz = p[2] - cam.T[2];
  return [cam.W / 2 + (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) * cam.s, cam.Y0 - (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) * cam.s];
};
export const depth = (cam, p) => V.dot(V.sub(p, cam.T), cam.c);

// the world point on the sheet point (x, y) at view depth 0, and the ray direction (−c)
export const unproject = (cam, x, y) => V.add(cam.T, V.add(V.mul(cam.r, (x - cam.W / 2) / cam.s), V.mul(cam.u, (cam.Y0 - y) / cam.s)));
// the floor point (z = h) under a sheet point, or null when the camera looks at the floor edge-on
export function unprojectFloor(cam, x, y, h = 0) {
  if (Math.abs(cam.c[2]) < 0.05) return null;
  const p = unproject(cam, x, y), t = (h - p[2]) / cam.c[2];
  return V.add(p, V.mul(cam.c, t));
}
// the point of a plane { origin, normal } under a sheet point
export function unprojectPlane(cam, x, y, origin, n) {
  const p = unproject(cam, x, y), dn = V.dot(cam.c, n);
  if (Math.abs(dn) < 1e-6) return null;
  const t = -V.dot(V.sub(p, origin), n) / dn;
  return V.add(p, V.mul(cam.c, t));
}

// pixels per millimetre at zoom 1, the same in all four named views so the scale bar holds in each: the scene's box
// fills `fill` (62%) of the sheet in the axonometric view, the view a part opens in, as long as it fits `hard` (90%)
// of the sheet in every other view. (Round 2: the smallest 62% fit of the four made a long flat part, which fills the
// plan, small in the axonometric view; a tall one stays limited by its height in both.)
export function fitScale(box, W, H, fill = 0.62, hard = 0.9) {
  if (!boxOk(box)) return 4;
  const corners = boxCorners(box);
  let s = Infinity;
  for (const k of Object.keys(VIEWS)) {
    const cam = makeCam(VIEWS[k].yaw, VIEWS[k].pitch, 1, [0, 0, 0], 0, 0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of corners) {
      const x = V.dot(p, cam.r), y = V.dot(p, cam.u);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const f = k === 'axo' ? fill : hard;
    s = Math.min(s, (W * f) / Math.max(1e-6, x1 - x0), (H * f) / Math.max(1e-6, y1 - y0));
  }
  return isFinite(s) && s > 0 ? s : 4;
}

// a view state: { name, yaw, pitch (orbit offsets, rad), zoom, pan: [right, up] mm, scale (px/mm, overrides zoom),
// target (world point at the sheet's centre) }
export const defaultView = () => ({ name: 'axo', yaw: 0, pitch: 0, zoom: 1, pan: [0, 0], scale: null, target: null, sketch: null });
export function normView(v) {
  if (typeof v === 'string') v = { name: v };
  const d = defaultView();
  return { ...d, ...(v || {}), pan: (v && v.pan) || d.pan };
}

// the camera for a view state over a scene box
export function viewCam(view, box, W, H) {
  const vw = VIEWS[view.name] || VIEWS.axo;
  const base = fitScale(box, W, H);
  const s = view.scale || base * clamp(view.zoom || 1, ZOOM_MIN, ZOOM_MAX);
  const pitch = clamp(vw.pitch + (view.pitch || 0), -0.05, Math.PI / 2);
  const T0 = view.target || (boxOk(box) ? boxCentre(box) : [0, 0, 0]);
  let cam = makeCam(vw.yaw + (view.yaw || 0), pitch, s, T0, W, H);
  const pan = view.pan || [0, 0];
  if (pan[0] || pan[1]) cam = makeCam(cam.yaw, cam.pitch, s, V.add(T0, V.add(V.mul(cam.r, pan[0]), V.mul(cam.u, pan[1]))), W, H);
  cam.base = base;
  return cam;
}

// the named view whose direction is nearest the camera's
export function nearestView(cam) {
  let best = 'axo', bd = -Infinity;
  for (const k of VIEW_KEYS) {
    const c = makeCam(VIEWS[k].yaw, VIEWS[k].pitch, 1, [0, 0, 0], 0, 0).c, d = V.dot(c, cam.c);
    if (d > bd) { bd = d; best = k; }
  }
  return best;
}
