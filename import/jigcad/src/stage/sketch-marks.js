// sketch-marks.js: a sketch's constraints as marks on the sheet, laid out once per draw in screen space and kept for
// picking and emphasis. Geometric constraints are small boxed glyphs in Plex Mono (`H`, `V`, `=1`, `fix`) set
// beside their entity; glyphs on the same entity or point stand in a row instead of on top of each other.
// Dimensions are drafting dimension lines whose value shows the expression it came from (`80 mm · w`); linear
// dimensions take lanes outward from the part, the shortest nearest, so no two share a line. Coincident points are
// small filled dots. A constraint's tone says its state: ink and muted when it holds, st-warn when it is redundant,
// st-rec when it conflicts; the selected (or hovered) one is redrawn heavier in st-rec, the selection hue, with its
// entities, its points and a short label (`horizontal l1`, `distanceX 12 mm = edge`).
import { TAU, fmtMM, fmtNum } from './math.js';
import { K, text, textWidth } from './theme.js';
import { ticks } from './furniture.js';

export const GLYPH = { horizontal: 'H', vertical: 'V', parallel: '//', perpendicular: '⊥', tangent: 'T', equal: '=', fix: 'fix', fixed: 'fix', symmetric: 'sym', midpoint: 'mid', concentric: 'con', collinear: 'col', on: 'on', pointOnLine: 'on', pointOnCurve: 'on' };
export const DIMS = new Set(['distance', 'length', 'radius', 'diameter', 'angle', 'dim', 'hdistance', 'vdistance', 'distanceX', 'distanceY', 'h', 'v', 'coord', 'offsetLine', 'offsetCirc']);
// internal kinds of mirror, pattern and offset copies: listed in the inspector, no mark of their own on the sheet
const UNMARKED = new Set(['mapPoint', 'scalarRel', 'mirrorAngle', 'perpEnd', 'symMid']);
const GH = 12, GAP = 6, LANE = 16;
const SLIDES = [[0, 0], [0, 1], [0, -1], [0, 2], [0, -2], [1, 0], [1, 1], [1, -1], [2, 0]];   // (outward, along) steps

// ---- refs (dotted entity ids such as `outline.bottom` resolve by the longest id)
const index = new WeakMap();
const entMap = sk => { let m = index.get(sk); if (!m) index.set(sk, m = new Map((sk.entities || []).map(e => [e.id, e]))); return m; };
export function resolveRef(sk, ref) {
  if (typeof ref !== 'string') return null;
  const m = entMap(sk);
  if (m.has(ref)) return { e: m.get(ref), sub: null };
  const h = ref.indexOf('#');
  if (h > 0 && m.has(ref.slice(0, h))) return { e: m.get(ref.slice(0, h)), sub: ref.slice(h) };
  const i = ref.lastIndexOf('.');
  if (i > 0 && m.has(ref.slice(0, i))) return { e: m.get(ref.slice(0, i)), sub: ref.slice(i + 1) };
  return null;
}
const ang = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
export const onCircle = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
export function arcAngles(e) {
  const a0 = typeof e.a0 === 'number' ? e.a0 : typeof e.start === 'number' ? e.start : Array.isArray(e.start) ? ang(e.c, e.start) : 0;
  let a1 = typeof e.a1 === 'number' ? e.a1 : typeof e.end === 'number' ? e.end : Array.isArray(e.end) ? ang(e.c, e.end) : TAU;
  while (a1 <= a0 + 1e-9) a1 += TAU;
  return [a0, a1];
}
export function entityPoints(e) {             // a polyline through the entity (2D)
  switch (e.kind) {
    case 'point': return e.p ? [e.p] : [];
    case 'line': return e.a && e.b ? [e.a, e.b] : [];
    case 'circle': { const out = []; for (let k = 0; k <= 72; k++) out.push(onCircle(e.c, e.r, TAU * k / 72)); return out; }
    case 'arc': { const [a0, a1] = arcAngles(e), n = Math.max(4, Math.ceil((a1 - a0) / TAU * 72)), out = []; for (let k = 0; k <= n; k++) out.push(onCircle(e.c, e.r, a0 + (a1 - a0) * k / n)); return out; }
    default: return Array.isArray(e.pts) ? e.pts : [];
  }
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function refPoint(sk, ref) {
  if (Array.isArray(ref)) return ref;
  if (ref === 'origin') return [0, 0];
  const r = resolveRef(sk, ref); if (!r) return null;
  const { e, sub } = r;
  if (e.kind === 'point') return e.p;
  if (e.kind === 'line') return sub === 'start' ? e.a : sub === 'end' ? e.b : sub === 'mid' || !sub ? mid(e.a, e.b) : null;
  if (e.kind === 'circle' || e.kind === 'arc') {
    if (sub === 'center' || sub === 'centre' || !sub) return e.c;
    if (e.kind === 'arc' && (sub === 'start' || sub === 'end' || sub === 'mid')) { const [a0, a1] = arcAngles(e); return onCircle(e.c, e.r, sub === 'start' ? a0 : sub === 'end' ? a1 : (a0 + a1) / 2); }
  }
  if ((sub === 'center' || !sub) && e.c) return e.c;
  if (Array.isArray(e.ctrl) || Array.isArray(e.pts)) {
    const pts = e.ctrl || e.pts; if (!pts.length) return null;
    if (sub === 'start') return pts[0]; if (sub === 'end') return pts[pts.length - 1];
    const m = /^p(\d+)$/.exec(sub || ''); if (m) return pts[+m[1]] || null;
  }
  return null;
}
export const refEntity = (sk, ref) => (resolveRef(sk, ref) || {}).e || null;
const isWhole = (sk, ref) => { const r = resolveRef(sk, ref); return !!r && !r.sub; };

// ---- words: a dimension's value with its expression, and the short label of a selected constraint or entity
const LITERAL = /^[-+]?[\d.]+\s*(mm|cm|m|in|inch|deg|°)?$/;
const exprPart = c => (c.expr && !LITERAL.test(String(c.expr).trim()) ? String(c.expr) : null);
export function valueText(c, v = c.value) {
  if (v == null) return '';
  const s = c.unit === 'deg' || c.kind === 'angle' ? `${fmtNum(v, 1)}°` : fmtMM(v);
  return (c.kind === 'diameter' ? 'Ø' : c.kind === 'radius' ? 'R' : '') + s;
}
export function dimText(c, v = c.value) {
  const s = valueText(c, v), x = exprPart(c);
  if (c.driven) return `(${s})`;
  return x ? `${s} · ${x}` : s;
}
export const kindText = c => (c.kind === 'coord' && c.axis ? `coord ${c.axis}` : c.kind);
export function shortLabel(c) {
  const x = exprPart(c), st = c.status && c.status !== 'ok' ? ` · ${c.status}` : '';
  if (c.value != null) return `${kindText(c)} ${valueText(c).replace(/^[ØR]/, '')}${x ? ` = ${x}` : ''}${c.driven ? ' (driven)' : ''}${st}`;
  return `${kindText(c)} ${(c.refs || []).map(r => (Array.isArray(r) ? `(${r.map(v => fmtNum(v)).join(', ')})` : r)).join(', ')}${st}`;
}
export function entityLabel(e) {
  const dof = e.dofFree && e.dofFree.length ? ` · ${e.dofFree.length} DOF` : '';
  if (e.kind === 'line' && e.a && e.b) return `line ${e.id} · ${fmtMM(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]))}${dof}`;
  if (e.kind === 'circle') return `circle ${e.id} · Ø${fmtMM(2 * e.r)}${dof}`;
  if (e.kind === 'arc') return `arc ${e.id} · R${fmtMM(e.r)}${dof}`;
  return `${e.shape || e.kind} ${e.id}${dof}`;
}

// ---- tones
export function toneOf(C, c, fallback) {
  if (c.status === 'conflict') return C.red;
  if (c.status === 'redundant') return C.warn;
  if (c.driven) return C.muted;
  return fallback;
}

// ---- layout: every mark's screen geometry, computed once per draw
// layoutMarks(ctx, sk, P, cam, cen) → { marks: Map(id → { c, glyphs, dim, dot, refs }), glyphs, dims, dots, paths }
export function layoutMarks(ctx, sk, P, cam, cen) {
  const cons = sk.constraints || [], marks = new Map(), boxes = [], dims = [], glyphs = [], dots = [];
  const cs = P(cen);
  const away = q => { const d = [q[0] - cs[0], q[1] - cs[1]], L = Math.hypot(d[0], d[1]); return L > 1 ? [d[0] / L, d[1] / L] : [0.7071, 0.7071]; };
  const markOf = c => { let m = marks.get(c.id); if (!m) marks.set(c.id, m = { c, glyphs: [], dim: null, dot: null }); return m; };

  // entities as screen polylines (picking) and their glyph anchors; their points (the drag handles) keep marks off
  const paths = [];
  for (const e of sk.entities || []) { const pts = entityPoints(e).map(P); if (pts.length) paths.push({ id: e.id, e, pts }); }
  for (const e of sk.entities || []) {
    const pts = e.kind === 'point' ? [e.p] : e.kind === 'line' ? [e.a, e.b] : e.kind === 'circle' ? [e.c] : e.kind === 'arc' ? [e.c, refPoint(sk, e.id + '.start'), refPoint(sk, e.id + '.end')] : [];
    for (const p of pts) if (p) { const q = P(p); boxes.push([q[0] - 3.5, q[1] - 3.5, q[0] + 3.5, q[1] + 3.5]); }
  }
  const lineAnchor = e => {
    const a = P(e.a), b = P(e.b), d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]) || 1;
    let t = [d[0] / L, d[1] / L]; if (t[0] < -1e-9 || (Math.abs(t[0]) < 1e-9 && t[1] < 0)) t = [-t[0], -t[1]];
    const m = mid(a, b), w = away(m);
    // inside the outline, toward the sketch's middle: the outside belongs to the dimensions
    let n = [t[1], -t[0]]; if (n[0] * w[0] + n[1] * w[1] > 0) n = [-n[0], -n[1]];
    return { key: `e:${e.id}`, p: m, n, t };
  };
  const rimAnchor = (e, am) => { const p = P(onCircle(e.c, e.r, am)), c = P(e.c), d = [p[0] - c[0], p[1] - c[1]], L = Math.hypot(d[0], d[1]) || 1; return { key: `e:${e.id}`, p, n: [d[0] / L, d[1] / L], t: [1, 0] }; };
  const pointAnchor = q => ({ key: `p:${Math.round(q[0] / 3)},${Math.round(q[1] / 3)}`, p: q, n: away(q), t: [1, 0] });
  const anchorOf = ref => {
    const r = resolveRef(sk, ref);
    if (r && !r.sub && r.e.kind === 'line') return lineAnchor(r.e);
    if (r && !r.sub && (r.e.kind === 'circle' || r.e.kind === 'arc')) {
      const [a0, a1] = r.e.kind === 'arc' ? arcAngles(r.e) : [0, TAU];
      return rimAnchor(r.e, r.e.kind === 'arc' ? (a0 + a1) / 2 : Math.PI * 0.75);
    }
    const p = refPoint(sk, ref); return p ? pointAnchor(P(p)) : null;
  };
  const touchAnchor = refs => {
    const ends = r => { const e = refEntity(sk, r); if (!e) return []; if (e.kind === 'line') return [e.a, e.b]; if (e.kind === 'arc') return [refPoint(sk, e.id + '.start'), refPoint(sk, e.id + '.end')]; return entityPoints(e); };
    const A = ends(refs[0]), B = ends(refs[1]);
    let best = null, bd = Infinity;
    for (const a of A) for (const b of B) if (a && b) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < bd) { bd = d; best = mid(a, b); } }
    return best ? pointAnchor(P(best)) : null;
  };

  // dimensions first: they take their lanes, and glyphs keep clear of their values
  const dimCs = cons.filter(c => !UNMARKED.has(c.kind) && c.kind !== 'coincident' && (DIMS.has(c.kind) || (c.value != null && !GLYPH[c.kind])));
  const flats = [];
  const placed = dimCs.map(c => ({ c, g: dimGeometry(sk, c, cen) })).filter(x => x.g);
  // radial and angular values first, then linear dimensions from the shortest out
  const order = [...placed.filter(x => x.g.form !== 'linear'), ...placed.filter(x => x.g.form === 'linear').sort((x, y) => x.g.len - y.g.len)];
  for (const { c, g } of order) {
    const m = markOf(c);
    const label = dimText(c, g.value);
    if (g.form === 'linear') {
      const d = laneDim(g, P, cam, dims, boxes, label, ctx);
      if (!d) { flats.push({ c, p: P(mid(g.a, g.b)), label: flatLabel(c, g, label) }); continue; }
      m.dim = { form: 'linear', c, ...d };
    } else if (g.form === 'radial') {
      const cc = P(g.c), edge = P(onCircle(g.c, g.r, Math.PI / 3)), dv = [edge[0] - cc[0], edge[1] - cc[1]], L = Math.hypot(dv[0], dv[1]) || 1, u = [dv[0] / L, dv[1] / L];
      const from = g.dia ? [cc[0] - u[0] * L, cc[1] - u[1] * L] : cc, out = [edge[0] + u[0] * 14, edge[1] + u[1] * 14];
      const tw = textWidth(ctx, label, K.dim), lx = out[0] + 13;
      m.dim = { form: 'radial', c, from, edge, out, dia: g.dia, label, at: [lx, out[1]], align: 'left', box: [lx - 3, out[1] - 6.5, lx + tw + 3, out[1] + 6.5], segs: [[from, out], [out, [out[0] + 10, out[1]]]], n: [0, 1] };
    } else if (g.form === 'angle') {
      const q = P(g.X), dir = e => { const a = P(e.a), b = P(e.b), far = Math.hypot(a[0] - q[0], a[1] - q[1]) > Math.hypot(b[0] - q[0], b[1] - q[1]) ? a : b; return Math.atan2(far[1] - q[1], far[0] - q[0]); };
      const t0 = dir(g.e0); let dt = dir(g.e1) - t0; while (dt > Math.PI) dt -= TAU; while (dt < -Math.PI) dt += TAU;
      const R = 26, tm = t0 + dt / 2, at = [q[0] + Math.cos(tm) * (R + 12), q[1] + Math.sin(tm) * (R + 12)];
      const lab = c.driven ? `(${fmtNum((g.value ?? Math.abs(dt)) * (c.unit === 'deg' ? 1 : 180 / Math.PI), 1)}°)` : c.unit === 'deg' ? label : `${fmtNum(Math.abs(dt) * 180 / Math.PI, 1)}°`;
      const tw = textWidth(ctx, lab, K.dim);
      const arc = []; for (let k = 0; k <= 12; k++) { const a = t0 + dt * k / 12; arc.push([q[0] + Math.cos(a) * R, q[1] + Math.sin(a) * R]); }
      m.dim = { form: 'angle', c, q, R, t0, dt, label: lab, at, align: 'center', box: [at[0] - tw / 2 - 3, at[1] - 6.5, at[0] + tw / 2 + 3, at[1] + 6.5], segs: arc.slice(1).map((p, i) => [arc[i], p]), n: [Math.cos(tm), Math.sin(tm)] };
    }
    if (m.dim) { dims.push(m.dim); boxes.push(m.dim.box); }
  }

  // glyph requests: { c, text, anchor }
  const eqNo = groupNumbers(sk, 'equal'), parNo = groupNumbers(sk, 'parallel');
  const reqs = [];
  for (const c of cons) {
    const refs = c.refs || [];
    if (UNMARKED.has(c.kind) || marks.get(c.id)?.dim) continue;
    if (c.kind === 'coincident') {
      const p = refPoint(sk, refs[0]); if (!p) continue;
      const d = { c, ids: [c.id], p: P(p) }; dots.push(d); markOf(c).dot = d; continue;
    }
    if (dimCs.includes(c)) continue;             // a dimension with no geometry to draw (flat ones are below)
    const g = GLYPH[c.kind] || c.kind.slice(0, 3);
    let anchors;
    if (c.kind === 'tangent') anchors = [touchAnchor(refs)];
    else if (c.kind === 'symmetric' && refs.length >= 2) {
      const a = refPoint(sk, refs[0]), b = refPoint(sk, refs[1]), ax = refs[2] != null ? resolveRef(sk, refs[2]) : null;
      anchors = [ax && (ax.sub || ax.e.kind === 'point') ? anchorOf(refs[2]) : a && b ? pointAnchor(P(mid(a, b))) : null];
    } else if ((c.kind === 'horizontal' || c.kind === 'vertical') && refs.length === 2) {
      const a = refPoint(sk, refs[0]), b = refPoint(sk, refs[1]); anchors = [a && b ? pointAnchor(P(mid(a, b))) : null];
    } else if (['equal', 'parallel', 'perpendicular', 'collinear'].includes(c.kind)) anchors = refs.slice(0, 2).map(anchorOf);
    else if (c.kind === 'midpoint' || c.kind === 'on') { const pt = refs.find(r => { const x = resolveRef(sk, r); return x && (x.sub || x.e.kind === 'point'); }) ?? refs[0]; anchors = [anchorOf(pt)]; }
    else anchors = [anchorOf(refs[0])];
    const label = c.kind === 'equal' ? `=${eqNo.get(c.id) ?? ''}` : c.kind === 'parallel' && parNo.size > 1 ? `//${parNo.get(c.id) ?? ''}` : g;
    for (const a of anchors) if (a) reqs.push({ c, text: label, anchor: a, share: c.kind === 'equal' || c.kind === 'parallel' });
  }
  for (const f of flats) reqs.push({ c: f.c, text: f.label, anchor: pointAnchor(f.p), flat: true });

  // group by anchor; one glyph per (anchor, text) when it stands for a group (an equality chain shows once per entity)
  const groups = new Map();
  for (const r of reqs) {
    let G = groups.get(r.anchor.key); if (!G) groups.set(r.anchor.key, G = { anchor: r.anchor, items: [] });
    const same = r.share && G.items.find(it => it.text === r.text);
    if (same) { same.cs.push(r.c); continue; }
    G.items.push({ text: r.text, cs: [r.c], flat: !!r.flat });
  }
  for (const G of groups.values()) {
    const { p, n, t } = G.anchor;
    const items = G.items.map(it => ({ ...it, w: textWidth(ctx, it.text, it.flat ? K.dim : K.labelSm) + 7, h: GH }));
    const ext = it => Math.abs(t[0]) * it.w + Math.abs(t[1]) * it.h;
    const row = items.reduce((s, it) => s + ext(it), 0) + 2 * (items.length - 1);
    const en = Math.max(...items.map(it => (Math.abs(n[0]) * it.w + Math.abs(n[1]) * it.h) / 2));
    // beside the anchor; when that is taken, slide along the entity (so the row stays with it), then step outward
    let placedBoxes = null, first = null;
    for (const [kn, kt] of SLIDES) {
      const off = GAP + en + kn * (2 * en + 2), along = kt * (row + 4);
      const c0 = [p[0] + n[0] * off + t[0] * along, p[1] + n[1] * off + t[1] * along];
      let s = -row / 2;
      placedBoxes = items.map(it => { const e = ext(it), x = c0[0] + t[0] * (s + e / 2), y = c0[1] + t[1] * (s + e / 2); s += e + 2; return { x, y }; });
      if (!first) first = placedBoxes;
      const hit = items.some((it, i) => { const bx = boxAt(placedBoxes[i], it); return boxes.some(b => overlap(b, bx)) || dims.some(d => [...(d.segs || []), ...(d.ext || [])].some(sg => segHitsBox(sg[0], sg[1], bx))); });
      if (!hit) break;
      placedBoxes = null;
    }
    placedBoxes = placedBoxes || first;
    items.forEach((it, i) => {
      const gph = { text: it.text, x: placedBoxes[i].x, y: placedBoxes[i].y, w: it.w, h: it.h, cs: it.cs, ids: it.cs.map(c => c.id), flat: it.flat };
      glyphs.push(gph); boxes.push(boxAt(gph, it));
      for (const c of it.cs) markOf(c).glyphs.push(gph);
    });
  }
  for (const c of cons) markOf(c);
  return { marks, glyphs, dims, dots, paths, cs, boxes };
}
// does the segment a–b cross the box (grown by m)? (Liang–Barsky)
export function segHitsBox(a, b, box, m = 1) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1], p = [-dx, dx, -dy, dy], q = [a[0] - (box[0] - m), box[2] + m - a[0], a[1] - (box[1] - m), box[3] + m - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
const boxAt = (q, it) => [q.x - it.w / 2, q.y - it.h / 2, q.x + it.w / 2, q.y + it.h / 2];
const overlap = (a, b, m = 1) => a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m;
// equal and parallel chains share a number: =1 on every circle of one size
function groupNumbers(sk, kind) {
  const parent = new Map(), find = a => { if (!parent.has(a)) parent.set(a, a); while (parent.get(a) !== a) a = parent.get(a); return a; };
  const cs = (sk.constraints || []).filter(c => c.kind === kind && (c.refs || []).length >= 2);
  for (const c of cs) { const a = find(c.refs[0]), b = find(c.refs[1]); if (a !== b) parent.set(a, b); }
  const no = new Map(), out = new Map();
  for (const c of cs) { const r = find(c.refs[0]); if (!no.has(r)) no.set(r, no.size + 1); out.set(c.id, no.get(r)); }
  return out;
}
// a dimension too short to draw is a flat label in a box: `dy 0 mm`, `x 0 mm`
const coordAxis = c => (c.axis === 'y' || (!c.axis && /^y\(|\.y\(/.test(c.id)) ? 1 : 0);
const flatLabel = (c, g, label) => `${c.kind === 'coord' ? (coordAxis(c) ? 'y ' : 'x ') : g.hv === 'h' ? 'dx ' : g.hv === 'v' ? 'dy ' : ''}${label}`;

// what a dimension measures, in sketch coordinates: linear (a, b along dir), radial or angle
function dimGeometry(sk, c, cen) {
  const refs = c.refs || [], kind = c.kind;
  const e0 = refEntity(sk, refs[0]), e1 = refs[1] != null ? refEntity(sk, refs[1]) : null;
  const whole0 = isWhole(sk, refs[0]), whole1 = refs[1] != null && isWhole(sk, refs[1]);
  if ((kind === 'radius' || kind === 'diameter' || (refs.length === 1 && whole0 && e0 && (e0.kind === 'circle' || e0.kind === 'arc'))) && e0 && e0.c && whole0) {
    const dia = kind === 'diameter' || (kind !== 'radius' && e0.kind === 'circle');
    return { form: 'radial', c: e0.c, r: e0.r, dia, value: c.value ?? (dia ? 2 * e0.r : e0.r) };
  }
  if (kind === 'angle' && e0 && e1 && e0.kind === 'line' && e1.kind === 'line') return { form: 'angle', e0, e1, X: intersect(e0, e1) || e0.a, value: c.value };
  if (kind === 'coord') {
    // a coordinate is measured from the other axis: x from the y axis, y from the x axis
    const p = refPoint(sk, refs[0]); if (!p) return null;
    const k = coordAxis(c);
    return { form: 'linear', a: k ? [p[0], 0] : [0, p[1]], b: p, hv: k ? 'v' : 'h', len: Math.abs(p[k]), value: c.value, sk, cen };
  }
  let a, b;
  if (refs.length === 1 && e0 && e0.kind === 'line' && whole0) { a = e0.a; b = e0.b; }
  else if (e0 && e1 && whole0 && whole1 && e0.kind === 'line' && e1.kind === 'line') {
    const far = p => Math.hypot(p[0] - cen[0], p[1] - cen[1]);
    a = far(e0.a) >= far(e0.b) ? e0.a : e0.b; b = foot(a, e1);
  } else if (e1 && whole1 && e1.kind === 'line' && !(whole0 && e0 && e0.kind === 'line')) { a = refPoint(sk, refs[0]); b = a && foot(a, e1); }
  else if (e0 && whole0 && e0.kind === 'line' && refs[1] != null) { b = refPoint(sk, refs[1]); a = b && foot(b, e0); }
  else { a = refPoint(sk, refs[0]); b = refs[1] != null ? refPoint(sk, refs[1]) : null; }
  if (!a || !b) return null;
  const hv = kind === 'hdistance' || kind === 'distanceX' || kind === 'h' ? 'h' : kind === 'vdistance' || kind === 'distanceY' || kind === 'v' ? 'v' : null;
  const dir = hv === 'h' ? [1, 0] : hv === 'v' ? [0, 1] : null;
  const len = dir ? Math.abs((b[0] - a[0]) * dir[0] + (b[1] - a[1]) * dir[1]) : Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { form: 'linear', a, b, hv, len, value: c.value ?? len, sk, cen };
}
// a linear dimension in the first free lane outward from the part: 18 px beyond the reach of the geometry it spans,
// then 16 px further out for every dimension already on that line
function laneDim(g, P, cam, dims, boxes, label, ctx) {
  const { a, b, hv } = g, sk = g.sk;
  let dir = hv === 'h' ? [1, 0] : hv === 'v' ? [0, 1] : [b[0] - a[0], b[1] - a[1]];
  const dl = Math.hypot(dir[0], dir[1]); if (dl < 1e-9) return null; dir = [dir[0] / dl, dir[1] / dl];
  if (g.len * cam.s < 4) return null;          // too short to draw: a flat label instead
  let nrm = [-dir[1], dir[0]];
  const cen = g.cen || [0, 0], m = mid(a, b);
  if ((m[0] - cen[0]) * nrm[0] + (m[1] - cen[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
  const dot = p => p[0] * nrm[0] + p[1] * nrm[1], along = p => p[0] * dir[0] + p[1] * dir[1];
  const t0 = Math.min(along(a), along(b)) + 1e-6, t1 = Math.max(along(a), along(b)) - 1e-6;
  let reach = Math.max(dot(a), dot(b));
  if (sk) for (const e of sk.entities || []) if (!e.construction) for (const p of entityPoints(e)) { const t = along(p); if (t > t0 && t < t1) reach = Math.max(reach, dot(p)); }
  const tw = textWidth(ctx, label, K.dim);
  let level = reach + 18 / cam.s, out = null;
  for (let tries = 0; tries < 8; tries++) {
    const qa = [a[0] + nrm[0] * (level - dot(a)), a[1] + nrm[1] * (level - dot(a))], qb = [b[0] + nrm[0] * (level - dot(b)), b[1] + nrm[1] * (level - dot(b))];
    const sa = P(qa), sb = P(qb), pa = P(a), pb = P(b), n = screenNormal(sa, sb, pa, sa);
    const lane = dims.some(d => d.form === 'linear' && sameLane(d, sa, sb));
    // the value: on the line when it fits along it; beside a steep line, outward; past the end of a short one
    const u = [sb[0] - sa[0], sb[1] - sa[1]], len = Math.hypot(u[0], u[1]) || 1, m = mid(sa, sb);
    const cands = [];
    if (Math.abs(u[1]) / len > 0.7) cands.push({ at: [m[0] + n[0] * 5, m[1]], align: n[0] >= 0 ? 'left' : 'right' });
    else if (tw + 12 < len || Math.abs(u[0]) / len < 0.95) cands.push({ at: m, align: 'center' });
    else {
      const [lo, hi] = sa[0] <= sb[0] ? [sa, sb] : [sb, sa];
      cands.push({ at: [hi[0] + 7, hi[1]], align: 'left' }, { at: [lo[0] - 7, lo[1]], align: 'right' });
    }
    let pick = null;
    for (const cnd of cands) { const box = labelBox(cnd.at, tw, cnd.align); if (!boxes.some(bx => overlap(bx, box))) { pick = { ...cnd, box }; break; } }
    const fallback = { ...cands[0], box: labelBox(cands[0].at, tw, cands[0].align) };
    out = { pa, pb, qa: sa, qb: sb, label, ...(pick || fallback), segs: [[sa, sb]], ext: [[pa, sa], [pb, sb]], n };
    if (!lane && pick) break;
    level += LANE / cam.s;
  }
  return out;
}
const labelBox = (at, tw, align, h = 13) => { const x0 = align === 'left' ? at[0] : align === 'right' ? at[0] - tw : at[0] - tw / 2; return [x0 - 3, at[1] - h / 2, x0 + tw + 3, at[1] + h / 2]; };
const screenNormal = (sa, sb, pa, qa) => { const d = [qa[0] - pa[0], qa[1] - pa[1]], L = Math.hypot(d[0], d[1]); if (L > 0.5) return [d[0] / L, d[1] / L]; const u = [sb[0] - sa[0], sb[1] - sa[1]], M = Math.hypot(u[0], u[1]) || 1; return [-u[1] / M, u[0] / M]; };
// two dimension lines on one lane: parallel, within 10 px of each other and overlapping along their length
function sameLane(d, sa, sb) {
  const u = [d.qb[0] - d.qa[0], d.qb[1] - d.qa[1]], L = Math.hypot(u[0], u[1]) || 1, t = [u[0] / L, u[1] / L];
  const v = [sb[0] - sa[0], sb[1] - sa[1]], M = Math.hypot(v[0], v[1]) || 1;
  if (Math.abs(t[0] * v[1] / M - t[1] * v[0] / M) > 0.05) return false;
  const off = Math.abs((sa[0] - d.qa[0]) * -t[1] + (sa[1] - d.qa[1]) * t[0]); if (off > 10) return false;
  const s0 = 0, s1 = L, r0 = (sa[0] - d.qa[0]) * t[0] + (sa[1] - d.qa[1]) * t[1], r1 = (sb[0] - d.qa[0]) * t[0] + (sb[1] - d.qa[1]) * t[1];
  return Math.min(r0, r1) < s1 - 2 && Math.max(r0, r1) > s0 + 2;
}
function foot(p, e) {
  const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], L2 = d[0] * d[0] + d[1] * d[1] || 1;
  const t = ((p[0] - e.a[0]) * d[0] + (p[1] - e.a[1]) * d[1]) / L2;
  return [e.a[0] + d[0] * t, e.a[1] + d[1] * t];
}
function intersect(l, m) {
  const d1 = [l.b[0] - l.a[0], l.b[1] - l.a[1]], d2 = [m.b[0] - m.a[0], m.b[1] - m.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((m.a[0] - l.a[0]) * d2[1] - (m.a[1] - l.a[1]) * d2[0]) / den;
  return [l.a[0] + d1[0] * t, l.a[1] + d1[1] * t];
}

// ---- drawing marks
export function drawGlyph(ctx, C, g, col, emph) {
  const x0 = Math.round(g.x - g.w / 2), y0 = Math.round(g.y - g.h / 2);
  ctx.fillStyle = C.stage; ctx.fillRect(x0, y0, Math.round(g.w), g.h);
  ctx.strokeStyle = col; ctx.lineWidth = emph ? 1.4 : 0.75; ctx.setLineDash([]);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.round(g.w) - 1, g.h - 1);
  text(ctx, C, g.text, g.x, g.y + 0.5, { size: g.flat ? K.dim : K.labelSm, col, align: 'center' });
}
export function drawDim(ctx, C, d, col, emph) {
  ctx.save(); ctx.strokeStyle = col; ctx.setLineDash([]); ctx.lineCap = 'butt';
  const wl = emph ? 1.6 : K.overlay, we = emph ? 1 : K.dimExt;
  if (d.form === 'linear') {
    ctx.lineWidth = we; ctx.beginPath();
    for (const [p, q] of [[d.pa, d.qa], [d.pb, d.qb]]) {
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.5) continue;
      const over = Math.min(K.dimOvershoot * L, 6) / L;
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0] + (q[0] - p[0]) * over, q[1] + (q[1] - p[1]) * over);
    }
    ctx.stroke();
    ctx.lineWidth = wl; ctx.beginPath(); ctx.moveTo(d.qa[0], d.qa[1]); ctx.lineTo(d.qb[0], d.qb[1]); ctx.stroke();
    ticks(ctx, [d.qa, d.qb]); if (emph) { ctx.lineWidth = 1.8; ticks(ctx, [d.qa, d.qb]); }
  } else if (d.form === 'radial') {
    ctx.lineWidth = wl; ctx.beginPath(); ctx.moveTo(d.from[0], d.from[1]); ctx.lineTo(d.out[0], d.out[1]); ctx.lineTo(d.out[0] + 10, d.out[1]); ctx.stroke();
    ticks(ctx, d.dia ? [d.edge, d.from] : [d.edge]);
  } else if (d.form === 'angle') {
    ctx.lineWidth = wl; ctx.beginPath(); ctx.arc(d.q[0], d.q[1], d.R, d.t0, d.t0 + d.dt, d.dt < 0); ctx.stroke();
  }
  text(ctx, C, d.label, d.at[0], d.at[1], { size: K.dim, col, align: d.align, bg: C.stage });
  ctx.restore();
}
export function drawDot(ctx, d, col, r = 2.2) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(d.p[0], d.p[1], r, 0, TAU); ctx.fill(); }

// every mark at its tone; a glyph that stands for several constraints takes the worst of their states
export function drawMarks(ctx, C, L) {
  for (const d of L.dims) drawDim(ctx, C, d, toneOf(C, d.c, C.ink), false);
  for (const g of L.glyphs) {
    const worst = g.cs.find(c => c.status === 'conflict') || g.cs.find(c => c.status === 'redundant') || g.cs[0];
    // what the geometry implies by itself recedes, so the constraints and dimensions someone wrote read first
    const implied = worst.status === 'ok' && g.cs.every(c => c.src === 'implicit');
    if (implied) ctx.globalAlpha = 0.55;
    drawGlyph(ctx, C, g, toneOf(C, worst, g.flat ? C.ink : C.muted), false);
    ctx.globalAlpha = 1;
  }
}

// ---- emphasis: the selected or hovered constraint or entity in the selection hue, with a short label
// target: { constraint } | { entity }; hover draws lighter (the pointer is still deciding)
export function drawEmphasis(ctx, C, sk, P, L, target, o = {}) {
  if (!L || !target) return;
  const col = C.red, lw = o.hover ? 1.6 : 2.2;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
  if (o.hover) ctx.globalAlpha = 0.72;
  const strokeEnt = e => { const pts = entityPoints(e).map(P); if (pts.length < 2) return; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); };
  const dotAt = (p, r = 3) => { const q = P(p); ctx.fillStyle = C.stage; ctx.beginPath(); ctx.arc(q[0], q[1], r + 1.5, 0, TAU); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill(); };
  if (target.constraint != null) {
    const m = L.marks.get(target.constraint); if (!m) { ctx.restore(); return; }
    const c = m.c;
    for (const r of c.refs || []) {
      const x = resolveRef(sk, r);
      if (x && !x.sub && x.e.kind !== 'point') strokeEnt(x.e);
      else { const p = refPoint(sk, r); if (p) dotAt(p); }
    }
    if (m.dim) drawDim(ctx, C, m.dim, col, true);
    for (const g of m.glyphs) drawGlyph(ctx, C, g, col, true);
    if (m.dot) drawDot(ctx, m.dot, col, 3.2);
    const label = shortLabel(c), tw = textWidth(ctx, label, K.labelSm);
    let cands = [];
    if (m.dim) {
      const b = m.dim.box, n = m.dim.n || [0, 1], cy = (b[1] + b[3]) / 2, cx = (b[0] + b[2]) / 2;
      cands = [
        { at: [cx + n[0] * ((b[2] - b[0]) / 2 + 8), cy + n[1] * 14], align: Math.abs(n[0]) > 0.7 ? (n[0] > 0 ? 'left' : 'right') : 'center' },
        { at: [b[2] + 8, cy], align: 'left' }, { at: [b[0] - 8, cy], align: 'right' },
        { at: [cx, b[1] - 9], align: 'center' }, { at: [cx, b[3] + 9], align: 'center' },
        { at: [cx - n[0] * ((b[2] - b[0]) / 2 + 8), cy - n[1] * 14], align: Math.abs(n[0]) > 0.7 ? (n[0] > 0 ? 'right' : 'left') : 'center' },
        { at: [b[0], b[1] - 9], align: 'left' }, { at: [b[2], b[1] - 9], align: 'right' }, { at: [b[0], b[3] + 9], align: 'left' }, { at: [b[2], b[3] + 9], align: 'right' },
      ];
    } else if (m.glyphs.length) {
      const xs = m.glyphs.map(g => [g.x - g.w / 2, g.x + g.w / 2]), g = m.glyphs[m.glyphs.length - 1];
      const x0 = Math.min(...xs.map(v => v[0])), x1 = Math.max(...xs.map(v => v[1]));
      cands = [{ at: [x1 + 6, g.y], align: 'left' }, { at: [x0 - 6, g.y], align: 'right' }, { at: [g.x, g.y - 14], align: 'center' }, { at: [g.x, g.y + 14], align: 'center' },
        { at: [x1 + 6, g.y - 14], align: 'left' }, { at: [x1 + 6, g.y + 14], align: 'left' }, { at: [x0 - 6, g.y - 14], align: 'right' }, { at: [x0 - 6, g.y + 14], align: 'right' }];
    } else {
      const p = (c.refs || []).map(r => refPoint(sk, r)).find(Boolean);
      if (p) { const q = P(p); cands = [{ at: [q[0] + 9, q[1] - 11], align: 'left' }, { at: [q[0] - 9, q[1] - 11], align: 'right' }, { at: [q[0] + 9, q[1] + 11], align: 'left' }, { at: [q[0] - 9, q[1] + 11], align: 'right' }]; }
    }
    if (cands.length) freeLabel(ctx, C, L, label, tw, cands, col);
  } else if (target.entity != null) {
    const e = (sk.entities || []).find(x => x.id === target.entity); if (!e) { ctx.restore(); return; }
    if (e.kind === 'point') dotAt(e.p, 3.5);
    else { strokeEnt(e); if (e.kind === 'line') { dotAt(e.a, 2.6); dotAt(e.b, 2.6); } if (e.c && (e.kind === 'circle' || e.kind === 'arc')) dotAt(e.c, 2.4); }
    const pts = entityPoints(e); if (!pts.length) { ctx.restore(); return; }
    const p = e.kind === 'line' ? mid(e.a, e.b) : e.kind === 'circle' || e.kind === 'arc' ? onCircle(e.c, e.r, Math.PI / 4) : pts[Math.floor(pts.length / 2)];
    const q = P(p), cs = L.cs || q, d = [q[0] - cs[0], q[1] - cs[1]], len = Math.hypot(d[0], d[1]) || 1, u = [d[0] / len, d[1] / len];
    const label = entityLabel(e), tw = textWidth(ctx, label, K.labelSm), r = e.kind === 'circle' || e.kind === 'arc' ? Math.abs(P(e.c)[0] - P(onCircle(e.c, e.r, 0))[0]) : 0, cq = e.c ? P(e.c) : q;
    let cands;
    if (e.kind === 'line') {
      // beside the line, outside then inside, from its middle toward its ends
      const a = P(e.a), b = P(e.b), dv = [b[0] - a[0], b[1] - a[1]], len2 = Math.hypot(dv[0], dv[1]) || 1;
      let n = [dv[1] / len2, -dv[0] / len2]; if (n[0] * u[0] + n[1] * u[1] < 0) n = [-n[0], -n[1]];
      const steep = Math.abs(dv[1]) > Math.abs(dv[0]);
      cands = [];
      for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const side of [1, -1]) {
        const m = [a[0] + dv[0] * f, a[1] + dv[1] * f], nn = [n[0] * side, n[1] * side];
        cands.push(steep ? { at: [m[0] + nn[0] * 8, m[1]], align: nn[0] >= 0 ? 'left' : 'right' } : { at: [m[0], m[1] + nn[1] * 11], align: 'center' });
      }
    } else {
      // around the curve or point, starting outward from the sketch's middle
      const rr = Math.max(r, 3) + 10;
      cands = [{ at: [q[0] + u[0] * 12 + (u[0] >= 0 ? 4 : -4), q[1] + u[1] * 12], align: u[0] < 0 ? 'right' : 'left' }];
      for (let k = 0; k < 8; k++) { const t = -Math.PI / 4 + k * Math.PI / 4, cx = Math.cos(t), cy = Math.sin(t); cands.push({ at: [cq[0] + cx * rr, cq[1] + cy * rr], align: cx > 0.3 ? 'left' : cx < -0.3 ? 'right' : 'center' }); }
    }
    freeLabel(ctx, C, L, label, tw, cands, col);
  }
  ctx.restore();
}
// a selection's label at the first candidate place that is on the sheet and clear of every other mark's value,
// dimension line and entity (then one that only crosses entities, then the first)
function freeLabel(ctx, C, L, s, tw, cands, col) {
  const k = ctx.getTransform ? ctx.getTransform().a || 1 : 1, W = ctx.canvas ? ctx.canvas.width / k : Infinity, H = ctx.canvas ? ctx.canvas.height / k : Infinity;
  const lines = L.dims.flatMap(d => [...(d.segs || []), ...(d.ext || [])]);
  const edges = L.paths.flatMap(p => p.pts.slice(1).map((q, i) => [p.pts[i], q]));
  const score = cd => {
    const b = labelBox(cd.at, tw, cd.align, 12);
    if (b[0] < 2 || b[1] < 2 || b[2] > W - 2 || b[3] > H - 2) return 3;
    if (L.boxes.some(x => overlap(x, b)) || lines.some(sg => segHitsBox(sg[0], sg[1], b))) return 2;
    return edges.some(sg => segHitsBox(sg[0], sg[1], b, 0)) ? 1 : 0;
  };
  let best = cands[0], bs = Infinity;
  for (const cd of cands) { const sc = score(cd); if (sc < bs) { bs = sc; best = cd; } if (!sc) break; }
  text(ctx, C, s, best.at[0], best.at[1], { size: K.labelSm, col, align: best.align, bg: C.stage });
}

// ---- picking: glyphs and dimension values first, then dimension lines, coincident dots, then entities
export function hitMark(L, x, y) {
  if (!L) return null;
  const inside = (b, m = 2) => x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m;
  for (let i = L.glyphs.length - 1; i >= 0; i--) { const g = L.glyphs[i]; if (inside([g.x - g.w / 2, g.y - g.h / 2, g.x + g.w / 2, g.y + g.h / 2])) return { constraint: g.ids[0] }; }
  for (const d of L.dims) if (inside(d.box)) return { constraint: d.c.id };
  for (const d of L.dims) for (const s of d.segs || []) if (segDist(s[0], s[1], x, y) < 4) return { constraint: d.c.id };
  for (const d of L.dots) if (Math.hypot(d.p[0] - x, d.p[1] - y) < 4) return { constraint: d.ids[0] };
  let best = null, bd = 5;
  for (const p of L.paths) {
    if (p.pts.length === 1) { const d = Math.hypot(p.pts[0][0] - x, p.pts[0][1] - y); if (d < bd) { bd = d; best = p.id; } continue; }
    for (let i = 1; i < p.pts.length; i++) { const d = segDist(p.pts[i - 1], p.pts[i], x, y); if (d < bd) { bd = d; best = p.id; } }
  }
  return best != null ? { entity: best } : null;
}
function segDist(a, b, x, y) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
}
