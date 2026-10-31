// Text outlines from real fonts (opentype.js + vendored OFL TTFs): glyph contours as exact segments
// (lines and Bézier curves) nested into regions (outer loop + counters), or as polylines for sketches.
// Size is the cap height in mm (so 'size: 8 mm' gives 8 mm tall capitals), as printed labels are specified.
import * as opentype from '../../vendor/opentype/src/opentype.mjs';
import { SANS, MONO } from './fonts-data.js';

const FONTS = { sans: SANS, mono: MONO };
const parsed = new Map();
function b64(s) {
  if (typeof atob === 'function') { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return new Uint8Array(Buffer.from(s, 'base64'));
}
export function fontNamed(name = 'sans') {
  const key = /mono|plex/i.test(String(name)) ? 'mono' : 'sans';
  if (!parsed.has(key)) { const u = b64(FONTS[key].data); parsed.set(key, opentype.parse(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength))); }
  return { key, font: parsed.get(key), file: FONTS[key].name };
}

// → { contours: [[seg…]], bbox: [[x0,y0],[x1,y1]], font } with segs { kind: 'line', a, b } | { kind: 'bezier', pts }
export function textContours(str, { size = 5, font = 'sans', align = 'center', valign = 'middle', at = [0, 0], spacing = 0 } = {}) {
  const { font: f, file } = fontNamed(font);
  const capH = f.tables.os2?.sCapHeight || f.unitsPerEm * 0.7;
  const fontSize = size * f.unitsPerEm / capH;
  const path = f.getPath(String(str), 0, 0, fontSize, { kerning: true, letterSpacing: spacing / fontSize });
  const contours = [];
  let cur = null, start = null, pen = null;
  const P = (x, y) => [x, -y];
  const close = () => {
    if (cur && pen && start && Math.hypot(pen[0] - start[0], pen[1] - start[1]) > 1e-9) cur.push({ kind: 'line', a: pen, b: start });
    if (cur && cur.length) contours.push(cur);
    cur = null;
  };
  for (const c of path.commands) {
    if (c.type === 'M') { close(); cur = []; start = pen = P(c.x, c.y); }
    else if (c.type === 'L') { const b = P(c.x, c.y); if (Math.hypot(b[0] - pen[0], b[1] - pen[1]) > 1e-9) cur.push({ kind: 'line', a: pen, b }); pen = b; }
    else if (c.type === 'Q') { const b = P(c.x, c.y); cur.push({ kind: 'bezier', pts: [pen, P(c.x1, c.y1), b] }); pen = b; }
    else if (c.type === 'C') { const b = P(c.x, c.y); cur.push({ kind: 'bezier', pts: [pen, P(c.x1, c.y1), P(c.x2, c.y2), b] }); pen = b; }
    else if (c.type === 'Z') { close(); }
  }
  close();
  // bbox and alignment
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of contours) for (const s of k) for (const p of s.kind === 'line' ? [s.a, s.b] : s.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  if (!contours.length) return { contours: [], bbox: null, font: file };
  const dx = at[0] - (align === 'left' ? x0 : align === 'right' ? x1 : (x0 + x1) / 2);
  const dy = at[1] - (valign === 'baseline' ? 0 : valign === 'bottom' ? y0 : valign === 'top' ? y1 : (y0 + y1) / 2);
  const mv = p => [p[0] + dx, p[1] + dy];
  const moved = contours.map(k => k.map(s => s.kind === 'line' ? { kind: 'line', a: mv(s.a), b: mv(s.b) } : { kind: 'bezier', pts: s.pts.map(mv) }));
  return { contours: moved, bbox: [[x0 + dx, y0 + dy], [x1 + dx, y1 + dy]], font: file, fontSize };
}

export function bezierPoint(pts, t) {
  let q = pts.map(p => p.slice());
  while (q.length > 1) q = q.slice(1).map((p, i) => [q[i][0] + (p[0] - q[i][0]) * t, q[i][1] + (p[1] - q[i][1]) * t]);
  return q[0];
}
export const contourPolygon = (k, n = 8) => k.flatMap(s => s.kind === 'line' ? [s.a] : Array.from({ length: n }, (_, i) => bezierPoint(s.pts, i / n)));
const area = l => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const inside = (p, l) => { let c = false; for (let i = 0, j = l.length - 1; i < l.length; j = i++) if (((l[i][1] > p[1]) !== (l[j][1] > p[1])) && (p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0])) c = !c; return c; };

// Nest contours (even–odd): [{ loops: [outer, …holes] }] with segments tagged src `${id}.${char}` per glyph region
export function nestContours(contours, id = 'text') {
  const polys = contours.map(k => contourPolygon(k));
  const info = contours.map((k, i) => ({ k, poly: polys[i], a: Math.abs(area(polys[i])) })).filter(x => x.a > 1e-9);
  for (const x of info) {
    const probe = x.poly[0];
    x.parents = info.filter(o => o !== x && o.a > x.a && inside(probe, o.poly));
    x.depth = x.parents.length;
  }
  const outers = info.filter(x => x.depth % 2 === 0);
  return outers.map((o, n) => {
    const holes = info.filter(h => h.depth === o.depth + 1 && h.parents.includes(o));
    const tag = s => ({ ...s, src: `${id}.${n + 1}` });
    return { loops: [o.k.map(tag), ...holes.map(h => h.k.map(tag))] };
  });
}
// Polylines (closed point loops) for core's sketch.text import
export function textPolylines(str, opts = {}) {
  const { contours } = textContours(str, opts);
  return contours.map(k => contourPolygon(k, 6));
}
