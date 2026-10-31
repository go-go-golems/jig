// sketch.js: a SketchData drawn in its plane. Entities are ink lines (construction dashed and muted), profiles
// lightly hatched, free degrees of freedom in st-blue (the hue of paths), and a status line. Constraints are marks
// laid out by sketch-marks.js: boxed glyphs, dimension lines with their expressions, coincident points as filled
// dots; the selected constraint or entity is drawn again in the selection hue. drawSketch returns the layout, which
// the interactive stage keeps for picking marks and for drawing the hovered one on its pointer layer.
import { V, clamp } from './math.js';
import { basisCam, proj, ZOOM_MIN, ZOOM_MAX } from './camera.js';
import { K, text, hatchPattern } from './theme.js';
import { sketchToWorld, sketch2DPoints } from './scene.js';
import { layoutMarks, drawMarks, drawDot, drawEmphasis, hitMark, resolveRef, refPoint, refEntity, entityPoints, arcAngles, onCircle } from './sketch-marks.js';

export { refPoint, refEntity, resolveRef, entityPoints, arcAngles, hitMark };
export { shortLabel, entityLabel, dimText } from './sketch-marks.js';
const ZERO = [0, 0];

// the points a drag can grab: { ref, p, e }
export function handles(sk) {
  const out = [];
  for (const e of sk.entities || []) {
    if (e.kind === 'point' && e.p) out.push({ ref: e.id, p: e.p, e });
    if (e.kind === 'line') { out.push({ ref: e.id + '.start', p: e.a, e }); out.push({ ref: e.id + '.end', p: e.b, e }); }
    if (e.kind === 'circle' || e.kind === 'arc') {
      out.push({ ref: e.id + '.center', p: e.c, e });
      if (e.kind === 'arc') { out.push({ ref: e.id + '.start', p: refPoint(sk, e.id + '.start'), e }); out.push({ ref: e.id + '.end', p: refPoint(sk, e.id + '.end'), e }); }
    }
  }
  return out.filter(h => h.p);
}

// the sketch's own camera: looking along its normal, its x to the right and its y up, fitted to its entities
export function sketchCam(sk, view, W, H) {
  const pl = sk.plane || {}, x = pl.x || [1, 0, 0], y = pl.y || [0, 1, 0], n = pl.normal || V.cross(x, y);
  let fit = view.sketchFit;
  if (!fit) {
    const pts = sketch2DPoints(sk);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    if (!isFinite(x0)) { x0 = y0 = -10; x1 = y1 = 10; }
    const w = Math.max(10, x1 - x0), h = Math.max(10, y1 - y0);
    fit = { base: Math.min(W * 0.62 / w, H * 0.62 / h), c: [(x0 + x1) / 2, (y0 + y1) / 2] };
  }
  const s = view.scale || fit.base * clamp(view.zoom || 1, ZOOM_MIN, ZOOM_MAX), pan = view.pan || [0, 0];
  const T = sketchToWorld(sk)([fit.c[0] + pan[0], fit.c[1] + pan[1]]);
  const cam = basisCam(n, x, y, s, T, W, H);
  cam.base = fit.base; cam.fit = fit; cam.sketch = sk.id;
  return cam;
}

export function sketchStatus(sk) {
  const conflict = (sk.conflicts && sk.conflicts.length) || (sk.constraints || []).some(c => c.status === 'conflict') || sk.status === 'over';
  if (conflict) {
    const ids = (sk.conflicts && sk.conflicts[0]) || (sk.constraints || []).filter(c => c.status === 'conflict').map(c => c.id);
    return { text: `over-constrained · conflict: ${ids.join(' · ') || 'no solution'}`, tone: 'red' };
  }
  const dof = sk.dof ?? 0;
  if (sk.status === 'fully' || dof === 0) return { text: 'fully constrained · 0 DOF', tone: 'ink' };
  return { text: `under-constrained · ${dof} DOF`, tone: 'blue' };
}

// a sketch selection on this sheet: { constraint } or { entity } of this sketch
export const pickOf = (sk, sel) => (sk && sel && sel.sketch === sk.id && (sel.constraint != null || sel.entity != null) ? sel : null);

// drawSketch(ctx, C, cam, sk, on, o) → the marks' layout (for picking and the hover layer). on(name) says whether
// an overlay is on; o.dragging: the ref being dragged; o.hoverRef: the handle under the pointer; o.selected: a
// { sketch, constraint | entity } selection, drawn emphasised
export function drawSketch(ctx, C, cam, sk, on, o = {}) {
  const w = sketchToWorld(sk), P = p => proj(cam, w(p));
  const pl = sk.plane || {}, n = pl.normal || V.cross(pl.x || [1, 0, 0], pl.y || [0, 1, 0]);
  const edgeOn = Math.abs(V.dot(n, cam.c)) < 0.08;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const pathOf = pts => { const p = new Path2D(); pts.forEach((q, i) => { const s = P(q); i ? p.lineTo(s[0], s[1]) : p.moveTo(s[0], s[1]); }); return p; };

  // profiles: lightly hatched, even-odd over their loops
  if (!edgeOn) for (const pr of sk.profiles || []) {
    const path = new Path2D();
    for (const loop of pr.loops || []) if (loop.length > 2) { path.addPath(pathOf(loop)); path.closePath(); }
    ctx.globalAlpha = 0.55; ctx.fillStyle = hatchPattern(ctx, C.shadow); ctx.fill(path, 'evenodd'); ctx.globalAlpha = 1;
  }
  // entities: ink; free ones blue with the DOF overlay; those a conflict names in st-rec
  const conflictRefs = new Set();
  for (const c of sk.constraints || []) if (c.status === 'conflict') for (const r of c.refs || []) { const x = resolveRef(sk, r); if (x) conflictRefs.add(x.e.id); }
  for (const e of sk.entities || []) {
    if (e.kind === 'point') continue;
    const pts = entityPoints(e); if (pts.length < 2) continue;
    const free = on('dof') && e.dofFree && e.dofFree.length;
    ctx.strokeStyle = conflictRefs.has(e.id) ? C.red : free ? C.blue : e.construction ? C.muted : C.ink;
    ctx.lineWidth = e.construction ? K.ring * 1.4 : free ? 1.2 : 1;
    ctx.setLineDash(e.construction ? K.dashConstruction : []);
    ctx.stroke(pathOf(pts));
  }
  ctx.setLineDash([]);
  const L = layoutMarks(ctx, sk, P, cam, centreOf(sk));
  L.P = P; L.sketch = sk;
  // seen edge-on, a sketch is its lines; glyphs and points would pile up
  if (edgeOn) { L.glyphs = []; L.dims = []; L.dots = []; ctx.restore(); return L; }
  drawMarks(ctx, C, L);

  // points: coincident points as small filled dots; other ends small squares, paper inside; free ones filled blue
  const freeP = new Set();
  if (on('dof')) for (const e of sk.entities || []) if (e.dofFree && e.dofFree.length) {
    for (const d of e.dofFree) { const ref = String(d).split('.')[0]; if (ref === 'a' || ref === 'start') freeP.add(e.id + '.start'); else if (ref === 'b' || ref === 'end') freeP.add(e.id + '.end'); else if (ref === 'c' || ref === 'center') freeP.add(e.id + '.center'); else if (ref === 'p' || ref === 'x' || ref === 'y') freeP.add(e.id); }
  }
  const joined = new Set();
  for (const d of L.dots) for (const r of d.c.refs || []) if (typeof r === 'string') joined.add(r);
  for (const h of handles(sk)) {
    const q = P(h.p), free = freeP.has(h.ref), drag = o.dragging === h.ref, hov = o.hoverRef === h.ref;
    if (joined.has(h.ref) && !free && !drag && !hov) continue;          // the coincidence dot marks it
    const r = drag || hov ? 3 : 2;
    ctx.fillStyle = free || drag ? C.blue : C.stage; ctx.fillRect(q[0] - r, q[1] - r, 2 * r, 2 * r);
    ctx.strokeStyle = free || drag ? C.blue : C.ink; ctx.lineWidth = 1; ctx.strokeRect(Math.round(q[0] - r) + 0.5, Math.round(q[1] - r) + 0.5, 2 * r, 2 * r);
  }
  for (const d of L.dots) drawDot(ctx, d, d.c.status === 'conflict' ? C.red : d.c.status === 'redundant' ? C.warn : C.ink);
  // free DOF labels beside their entities
  if (on('dof')) for (const e of sk.entities || []) if (e.dofFree && e.dofFree.length) {
    const pts = entityPoints(e); if (!pts.length) continue;
    const at = e.kind === 'circle' || e.kind === 'arc' ? onCircle(e.c, e.r, -Math.PI / 4) : pts[Math.floor(pts.length / 2)] || pts[0];
    const q = e.kind === 'line' ? P([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]) : P(at);
    text(ctx, C, `${e.id} · ${e.dofFree.length} DOF`, q[0] + 7, q[1] + 9, { size: K.labelSm, col: C.blue, bg: C.stage });
  }
  // the selection, over everything else
  const sel = pickOf(sk, o.selected);
  if (sel) drawEmphasis(ctx, C, sk, P, L, sel);
  ctx.restore();
  return L;
}

// the hovered constraint or entity, on the stage's pointer layer (lighter than the selection)
export function drawSketchHover(ctx, C, L, target) {
  if (!L || !L.sketch || !pickOf(L.sketch, target)) return;
  drawEmphasis(ctx, C, L.sketch, L.P, L, target, { hover: true });
}

function centreOf(sk) {
  const pts = sketch2DPoints(sk); if (!pts.length) return ZERO;
  let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length];
}
