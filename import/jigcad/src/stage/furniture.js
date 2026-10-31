// furniture.js: the floor (grid, ground line, the bed as the lot's boundary), the marks every overlay uses (lines,
// arrows, dimension lines, labels) and the sheet furniture (scale bar, title block), after the Form Skate stage's
// draft.js, in millimetres.
import { proj, unprojectFloor } from './camera.js';
import { K, text, hatchPattern, toneOf, DISPLAY, MONO } from './theme.js';
import { V, nice, niceFloor, TAU } from './math.js';

// ---- floor
// grid spacing: the 1-2-5 step nearest 80 px on the sheet (the stage's 0.5 m at zoom 1); a major line every 5
// minors (every 2 when the minor step starts with 5)
export function gridSteps(cam, px = 80) {
  const minor = nice(px / cam.s), lead = Math.round(minor / 10 ** Math.floor(Math.log10(minor) + 1e-9));
  return { minor, major: minor * (lead === 5 ? 2 : 5) };
}
export function drawGrid(ctx, C, cam, o = {}) {
  const { minor, major } = o.minor ? o : gridSteps(cam), z = o.z || 0;
  let x0, x1, y0, y1;
  if (o.rect) [x0, y0, x1, y1] = o.rect;
  else {
    const pts = [[0, 0], [cam.W, 0], [0, cam.H], [cam.W, cam.H]].map(([x, y]) => unprojectFloor(cam, x, y, z)).filter(Boolean);
    if (pts.length < 4) return;
    const ext = o.extent || Infinity, T = cam.T;
    x0 = Math.max(T[0] - ext, Math.min(...pts.map(p => p[0]))); x1 = Math.min(T[0] + ext, Math.max(...pts.map(p => p[0])));
    y0 = Math.max(T[1] - ext, Math.min(...pts.map(p => p[1]))); y1 = Math.min(T[1] + ext, Math.max(...pts.map(p => p[1])));
  }
  if ((x1 - x0) / minor > 600 || (y1 - y0) / minor > 600) return;
  ctx.lineWidth = K.grid;
  const isMajor = v => Math.abs(v / major - Math.round(v / major)) < 1e-6;
  for (const pass of [0, 1]) {          // minors first, so majors cross over them
    ctx.strokeStyle = pass ? C.major : C.grid; ctx.beginPath();
    for (let x = Math.ceil(x0 / minor - 1e-9) * minor; x <= x1 + 1e-9; x += minor) {
      if (isMajor(x) !== !!pass) continue;
      const p = proj(cam, [x, y0, z]), q = proj(cam, [x, y1, z]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    for (let y = Math.ceil(y0 / minor - 1e-9) * minor; y <= y1 + 1e-9; y += minor) {
      if (isMajor(y) !== !!pass) continue;
      const p = proj(cam, [x0, y, z]), q = proj(cam, [x1, y, z]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
  }
}
// the ground of an elevation is a section cut: a 1.4 px ink line over an 18 px band of 0.6 px muted lines 7 px apart
export function drawGroundLine(ctx, C, cam, z, o = {}) {
  const y = proj(cam, [cam.T[0], cam.T[1], z])[1], band = o.band || K.groundBand;
  if (y > cam.H + 2 || y < -band) return y;
  ctx.save(); ctx.beginPath(); ctx.rect(0, y, cam.W, Math.min(band, cam.H - y)); ctx.clip();
  ctx.strokeStyle = C.muted; ctx.lineWidth = K.hatch; ctx.beginPath();
  for (let x = -20; x < cam.W + 20; x += K.groundPitch) { ctx.moveTo(x, y + band); ctx.lineTo(x + band, y); }
  ctx.stroke(); ctx.restore();
  ctx.strokeStyle = C.ink; ctx.lineWidth = o.width || K.ground; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cam.W, y); ctx.stroke();
  return y;
}
// the bed as the lot's boundary: a hatched band between an outer and an inner rectangle, even-odd, 1 px both sides
export function drawBed(ctx, C, cam, rect, band) {
  const [x0, y0, x1, y1] = rect;
  const P = (a, b, c, d) => { const p = new Path2D(); [[a, b], [c, b], [c, d], [a, d]].forEach(([x, y], i) => { const q = proj(cam, [x, y, 0]); i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]); }); p.closePath(); return p; };
  const po = P(x0 - band, y0 - band, x1 + band, y1 + band), pi = P(x0, y0, x1, y1);
  const both = new Path2D(); both.addPath(po); both.addPath(pi);
  ctx.save();
  ctx.fillStyle = C.stage; ctx.fill(both, 'evenodd');
  ctx.fillStyle = hatchPattern(ctx, C.shadow) || C.major; ctx.fill(both, 'evenodd');
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.stroke(po); ctx.stroke(pi);
  ctx.restore();
}

// ---- marks
export function line(ctx, a, b, col, w = K.overlay, dash) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
}
// an arrow from a to b on the sheet: head min(7 px, half the length), 0.45 as wide
export function arrow(ctx, a, b, col, w = K.overlay) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) return;
  line(ctx, a, b, col, w);
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, h = Math.min(7, L * 0.5);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(b[0], b[1]);
  ctx.lineTo(b[0] - ux * h - uy * h * 0.45, b[1] - uy * h + ux * h * 0.45);
  ctx.lineTo(b[0] - ux * h + uy * h * 0.45, b[1] - uy * h - ux * h * 0.45); ctx.closePath(); ctx.fill();
}
// a dimension line: extension lines from the measured points pa, pb to the dimension line's ends qa, qb at 0.7 px,
// overshooting 12%; the line at 1 px; 1.4 px 45° ticks 8 px across; the value at 8.5 px on a paper patch
export function dimensionTo(ctx, C, pa, pb, qa, qb, label, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.setLineDash([]);
  ctx.lineWidth = K.dimExt; ctx.beginPath();
  for (const [p, q] of [[pa, qa], [pb, qb]]) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.5) continue;
    const over = Math.min(K.dimOvershoot * L, 6) / L;
    ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0] + (q[0] - p[0]) * over, q[1] + (q[1] - p[1]) * over);
  }
  ctx.stroke();
  ctx.lineWidth = K.overlay; ctx.beginPath(); ctx.moveTo(qa[0], qa[1]); ctx.lineTo(qb[0], qb[1]); ctx.stroke();
  ticks(ctx, [qa, qb]);
  text(ctx, C, label, (qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2, { size: K.dim, col, align: 'center', bg: C.stage });
  ctx.restore();
}
// the same, offset `off` px along the unit sheet normal n
export const dimension = (ctx, C, pa, pb, n, off, label, col) =>
  dimensionTo(ctx, C, pa, pb, [pa[0] + n[0] * off, pa[1] + n[1] * off], [pb[0] + n[0] * off, pb[1] + n[1] * off], label, col);
export function ticks(ctx, qs) {
  const h = K.dimTickPx / 2;
  ctx.lineWidth = K.dimTick; ctx.beginPath();
  for (const q of qs) { ctx.moveTo(q[0] - h, q[1] + h); ctx.lineTo(q[0] + h, q[1] - h); }
  ctx.stroke();
}
export function dot(ctx, C, p, r, col, hollow) {
  ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU);
  if (hollow) { ctx.fillStyle = C.stage; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
  else { ctx.fillStyle = col; ctx.fill(); }
}
export const label = (ctx, C, s, p, o = {}) => text(ctx, C, s, p[0] + (o.dx || 0), p[1] + (o.dy || 0), { size: o.size || K.label, col: toneOf(C, o.tone), align: o.align, bg: o.bg ? C.stage : null, w: o.weight });

// ---- furniture
// the scale bar, always, bottom left: the longest 1-2-5 length in mm within a fifth of the sheet's width (and at
// least 40 px); quarters, the first and third filled 2 px high; `0` and the length at 9 px
export function scaleBar(ctx, C, cam) {
  const [ix, iy] = K.scaleInset, x = ix, y = cam.H - iy;
  let L = niceFloor(cam.W * 0.2 / cam.s);
  while (L * cam.s < 40) L = nice(L * 2.2);
  const m = L * cam.s, lab = L >= 1000 ? `${L / 1000} m` : L < 1 ? `${+(L * 1000).toFixed(0)} µm` : `${L} mm`;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + m, y); ctx.stroke();
  for (let k = 0; k <= 4; k++) { const X = x + m * k / 4; ctx.beginPath(); ctx.moveTo(X, y - (k % 4 === 0 ? 5 : 3)); ctx.lineTo(X, y); ctx.stroke(); }
  ctx.fillStyle = C.ink; ctx.fillRect(x, y - 2, m / 4, 2); ctx.fillRect(x + m / 2, y - 2, m / 4, 2);
  text(ctx, C, '0', x, y - 11, { size: K.key, align: 'center' });
  text(ctx, C, lab, x + m, y - 11, { size: K.key, align: 'center' });
  return { mm: L, px: m };
}
// the title block, bottom right on a sheet at least 640 × 460: a 250 px box 10 px from the edges, a 17 px header with
// JIG and SHEET <id>, then 15 px rows of key (9 px, muted) and value (9.5 px, cut with an ellipsis to fit)
export function titleBlock(ctx, C, cam, rows, sheet = 'J-01') {
  if (cam.W < K.titleMin[0] || cam.H < K.titleMin[1]) return null;
  const w = K.titleW, h = 17 + rows.length * K.titleRow, x = cam.W - w - 10, y = cam.H - h - 10;
  ctx.fillStyle = C.stage; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  text(ctx, C, 'JIG', x + 8, y + 9, { size: 9.5, w: 700, mono: false });
  text(ctx, C, 'SHEET ' + sheet, x + w - 8, y + 9, { size: K.key, align: 'right', col: C.muted });
  ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y + 17.5); ctx.lineTo(x + w, y + 17.5); ctx.stroke();
  rows.forEach(([k, v], i) => {
    text(ctx, C, k, x + 8, y + 25 + i * K.titleRow, { size: K.key, col: C.muted });
    let s = String(v); ctx.font = `500 9.5px ${MONO}`;
    const room = w - 84 - 8;
    if (ctx.measureText(s).width > room) { while (s.length > 1 && ctx.measureText(s + '…').width > room) s = s.slice(0, -1); s += '…'; }
    text(ctx, C, s, x + 84, y + 25 + i * K.titleRow, { size: 9.5 });
  });
  return { x, y, w, h };
}
export { DISPLAY, V };
