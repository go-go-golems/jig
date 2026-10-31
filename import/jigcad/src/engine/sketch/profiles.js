// profiles.js · planar arrangement of solved sketch curves → closed loops → even–odd profiles (README §4.3b, ex. 05).
// Curves are split at every intersection (T-junctions included), dangling edges are pruned, faces are traced
// with a half-edge walk, components are nested inside the smallest containing face, and a face is material
// when its nesting depth is odd. Loops come out both as display polylines and as exact segments with `src`.
import { sub, add, scale, dot, cross, len, dist, norm, perp, polar, angleOf, wrap2Pi, TAU, sampleArc, polyArea, pointInPoly } from './geom2d.js';

// curves: [{ kind: 'line', a, b, src, group } | { kind: 'arc', c, r, a0, a1, src } | { kind: 'circle', c, r, src }
//          | { kind: 'poly', pts, closed, src, exact }]   (poly = sampled spline/ellipse/import outline)
export function buildProfiles(curves, { tol = null } = {}) {
  const scaleRef = Math.max(1, ...curves.flatMap(cv => boundsPts(cv).flat().map(Math.abs)));
  const EPS = tol ?? 1e-7 * scaleRef;
  // 1. primitives
  const prims = [];
  for (const cv of curves) {
    if (cv.kind === 'line') { if (dist(cv.a, cv.b) > EPS) prims.push({ t: 'seg', a: cv.a, b: cv.b, src: cv.src, group: cv.group }); }
    else if (cv.kind === 'arc') prims.push({ t: 'arc', c: cv.c, r: cv.r, a0: cv.a0, sw: sweep(cv.a0, cv.a1), src: cv.src, group: cv.group });
    else if (cv.kind === 'circle') prims.push({ t: 'arc', c: cv.c, r: cv.r, a0: 0, sw: TAU, full: true, src: cv.src, group: cv.group });
    else if (cv.kind === 'poly') {
      const P = cv.pts, n = P.length, smooth = cv.lines ? null : { src: cv.src, exact: cv.exact ?? null, id: prims.length };
      const segs = cv.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = P[i], b = P[(i + 1) % n];
        if (dist(a, b) > EPS) prims.push({ t: 'seg', a, b, src: cv.src, group: cv.group, smooth });
      }
    }
  }
  // 2. split parameters
  const cuts = prims.map(p => (p.t === 'seg' ? [0, 1] : p.full ? [] : [0, p.sw]));
  const bbs = prims.map(primBox);
  for (let i = 0; i < prims.length; i++) for (let j = i + 1; j < prims.length; j++) {
    if (!boxHit(bbs[i], bbs[j], EPS)) continue;
    if (prims[i].smooth && prims[i].smooth === prims[j].smooth && (j - i === 1 || prims[i].smooth.closedFirst === i && prims[j].smooth.closedLast === j)) continue;
    for (const [si, sj] of intersectPrims(prims[i], prims[j], EPS)) { cuts[i].push(si); cuts[j].push(sj); }
  }
  // 3. vertices (merged within EPS)
  const verts = [], grid = new Map();
  const cell = EPS * 4;
  const vid = p => {
    const gx = Math.round(p[0] / cell), gy = Math.round(p[1] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const k of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (dist(verts[k], p) <= EPS * 2) return k;
    }
    const k = verts.length; verts.push(p);
    const key = `${gx},${gy}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k);
    return k;
  };
  // 4. edges
  let edges = [];
  // snap near-equal cut parameters (tangent contacts give double roots); primitive ends win
  const snapCuts = (list, tolP, ends) => {
    const sorted = list.slice().sort((a, b) => a - b), out = [];
    for (const t of sorted) {
      const last = out[out.length - 1];
      if (last != null && t - last <= tolP) { if (ends.some(e => Math.abs(e - t) < 1e-15)) out[out.length - 1] = t; continue; }
      out.push(t);
    }
    return out;
  };
  prims.forEach((p, i) => {
    const ts = p.t === 'seg' ? snapCuts(cuts[i], EPS / Math.max(dist(p.a, p.b), 1e-300), [0, 1])
      : snapCuts(cuts[i].map(t => (p.full ? wrap2Pi(t) : t)), EPS / Math.max(p.r, 1e-300), p.full ? [] : [0, p.sw]);
    if (p.full && ts.length > 1 && ts[0] + TAU - ts[ts.length - 1] <= EPS / p.r) ts.pop();
    if (p.t === 'seg') {
      const clean = ts.filter(t => t >= -1e-12 && t <= 1 + 1e-12);
      for (let k = 0; k + 1 < clean.length; k++) {
        const A = lerpP(p.a, p.b, clean[k]), B = lerpP(p.a, p.b, clean[k + 1]);
        const u = vid(A), v = vid(B);
        if (u !== v) edges.push({ u, v, kind: 'seg', a: verts[u], b: verts[v], src: p.src, group: p.group, smooth: p.smooth });
      }
    } else {
      let s = ts.filter(t => t >= -1e-12 && t <= p.sw + 1e-12);
      if (p.full) {
        if (!s.length) { edges.push({ u: -1, v: -1, kind: 'circle', c: p.c, r: p.r, src: p.src, group: p.group }); return; }
        s = [...s, s[0] + TAU];
      }
      for (let k = 0; k + 1 < s.length; k++) {
        if (s[k + 1] - s[k] < 1e-12) continue;
        const A = polar(p.c, p.r, p.a0 + s[k]), B = polar(p.c, p.r, p.a0 + s[k + 1]);
        const u = vid(A), v = vid(B);
        if (u === v && s[k + 1] - s[k] < TAU - 1e-9) continue;
        edges.push({ u, v, kind: 'arc', c: p.c, r: p.r, from: p.a0 + s[k], sw: s[k + 1] - s[k], src: p.src, group: p.group });
      }
    }
  });
  // dedupe coincident edges (overlaps)
  const seen = new Set();
  edges = edges.filter(e => {
    if (e.u < 0) return true;
    const m = edgeMid(e), key = `${Math.min(e.u, e.v)},${Math.max(e.u, e.v)},${Math.round(m[0] / cell)},${Math.round(m[1] / cell)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  // 5. prune dangling edges
  const isolated = edges.filter(e => e.u < 0);
  let graph = edges.filter(e => e.u >= 0);
  for (let changed = true; changed;) {
    changed = false;
    const deg = new Map();
    for (const e of graph) { deg.set(e.u, (deg.get(e.u) ?? 0) + 1); deg.set(e.v, (deg.get(e.v) ?? 0) + 1); }
    const keep = graph.filter(e => deg.get(e.u) > 1 && deg.get(e.v) > 1);
    if (keep.length !== graph.length) { graph = keep; changed = true; }
  }
  // 6. half-edges, sorted around each vertex by tangent angle then curvature
  const H = [];
  graph.forEach((e, i) => {
    H.push({ e: i, fwd: true, from: e.u, to: e.v });
    H.push({ e: i, fwd: false, from: e.v, to: e.u });
  });
  H.forEach((h, i) => { h.twin = i ^ 1; const t = tangentAt(graph[h.e], h.fwd); h.ang = Math.atan2(t.d[1], t.d[0]); h.kappa = t.k; });
  const around = new Map();
  H.forEach((h, i) => { if (!around.has(h.from)) around.set(h.from, []); around.get(h.from).push(i); });
  for (const list of around.values()) list.sort((a, b) => {
    const da = H[a].ang - H[b].ang;
    if (Math.abs(da) > 1e-9) return da;
    return H[a].kappa - H[b].kappa;
  });
  const posAt = new Map();
  for (const list of around.values()) list.forEach((h, k) => posAt.set(h, k));
  const next = i => {
    const t = H[i].twin, list = around.get(H[t].from), k = posAt.get(t);
    return list[(k - 1 + list.length) % list.length];
  };
  // 7. cycles
  const used = new Uint8Array(H.length), cycles = [];
  for (let i = 0; i < H.length; i++) {
    if (used[i]) continue;
    const cyc = [];
    let j = i, guard = 0;
    while (!used[j] && guard++ < H.length + 2) { used[j] = 1; cyc.push(j); j = next(j); }
    if (j !== i) continue;   // malformed walk (should not happen)
    const segs = cyc.map(k => pieceOf(graph[H[k].e], H[k].fwd));
    cycles.push(makeLoop(segs, cyc.map(k => H[k].from)));
  }
  for (const e of isolated) {
    const ccw = { kind: 'arc', c: e.c, r: e.r, from: 0, sw: TAU, src: e.src, group: e.group, full: true };
    cycles.push(makeLoop([ccw], []));
    cycles.push(makeLoop([{ ...ccw, from: TAU, sw: -TAU }], []));
  }
  // 8. components (by shared vertices; isolated circles are their own)
  const comp = new Map();
  let nComp = 0;
  const parentV = new Map();
  const findV = a => { while (parentV.get(a) !== a) a = parentV.get(a); return a; };
  for (const e of graph) { for (const v of [e.u, e.v]) if (!parentV.has(v)) parentV.set(v, v); const a = findV(e.u), b = findV(e.v); if (a !== b) parentV.set(a, b); }
  for (const c of cycles) {
    const key = c.verts.length ? `v${findV(c.verts[0])}` : `c${c.segs[0].src}:${c.segs[0].c}`;
    if (!comp.has(key)) comp.set(key, nComp++);
    c.comp = comp.get(key);
  }
  const faces = cycles.filter(c => c.area > EPS * EPS * 10);
  const outers = new Map();
  for (const c of cycles) if (c.area < -EPS * EPS * 10) { const o = outers.get(c.comp); if (!o || c.area < o.area) outers.set(c.comp, c); }
  // 9. nesting: each component's outer boundary sits in the smallest face of another component containing it
  const parentFace = new Map();
  for (const [k, o] of outers) {
    // components never cross, so o's outer loop is wholly inside a face or wholly outside: let its sampled points
    // vote, since a single point near an arc can fall outside that arc's sampled (inscribed) polygon
    const inside = f => { if (!o.poly.length) return false; let n = 0; for (const q of o.poly) if (pointInPoly(q, f.poly)) n++; return 2 * n > o.poly.length; };
    let best = null;
    for (const f of faces) if (f.comp !== k && inside(f) && (!best || f.area < best.area)) best = f;
    parentFace.set(k, best);
  }
  const depthMemo = new Map();
  const depth = f => {
    if (!f) return 0;
    if (depthMemo.has(f)) return depthMemo.get(f);
    depthMemo.set(f, 1);
    const d = 1 + depth(parentFace.get(f.comp) ?? null);
    depthMemo.set(f, d);
    return d;
  };
  const profiles = [];
  for (const f of faces) {
    const d = depth(f);
    if (d % 2 === 0) continue;
    const holes = [...outers.entries()].filter(([k]) => parentFace.get(k) === f).map(([, o]) => o);
    const area = f.area - holes.reduce((s, h) => s + Math.abs(h.area), 0);
    profiles.push(makeProfile(f, holes, area, d));
  }
  profiles.sort((a, b) => b.area - a.area);
  return { profiles, faces: faces.length, components: nComp, vertices: verts.length, edges: graph.length, pruned: edges.length - graph.length - isolated.length };
}

function makeProfile(f, holes, area, depth) {
  const loops = [f, ...holes];
  const name = L => [...new Set(L.segs.map(s => s.group ?? s.src))].join('+');
  const id = holes.length ? `${name(f)}∖{${holes.map(name).join(', ')}}` : name(f);
  const p = {
    id, area, depth, outer: 0,
    loops: loops.map(L => L.poly),
    segments: loops.map(L => L.exact),
    srcs: [...new Set(loops.flatMap(L => L.segs.map(s => s.src)))],
    contains(pt) { return pointInPoly(pt, f.poly) && !holes.some(h => pointInPoly(pt, h.poly)); },
  };
  return p;
}

function makeLoop(segs, verts) {
  const poly = [];
  let area = 0;
  for (const s of segs) {
    const pts = piecePoints(s);
    for (let k = 0; k < pts.length - 1; k++) poly.push(pts[k]);
    area += pieceArea(s);
  }
  const exact = exactSegments(segs);
  if (exact.length === 1 && exact[0].kind === 'ellipse') area = Math.sign(area) * Math.PI * exact[0].rx * exact[0].ry;
  return { segs, verts, poly, area, exact };
}
// exact segments for the kernel: merge sampled smooth pieces into splines; full circles stay circles
function exactSegments(segs) {
  const out = [];
  for (const s of segs) {
    if (s.kind === 'seg' && s.smooth) {
      const last = out[out.length - 1];
      if (last && last.kind === 'spline' && last._smooth === s.smooth) { last.pts.push(s.b); continue; }
      out.push({ kind: 'spline', pts: [s.a, s.b], src: s.src, _smooth: s.smooth, degree: 3, fit: 'interp', closed: false });
    } else if (s.kind === 'seg') out.push({ kind: 'line', a: s.a, b: s.b, src: s.src });
    else if (s.full) out.push({ kind: 'circle', c: s.c, r: s.r, src: s.src, ccw: s.sw > 0 });
    else {
      const a0 = s.from, a1 = s.from + s.sw;
      out.push({ kind: 'arc', c: s.c, r: s.r, a0, a1, ccw: s.sw > 0, a: polar(s.c, s.r, a0), b: polar(s.c, s.r, a1), src: s.src });
    }
  }
  // a run that wraps around the loop start is one spline
  if (out.length > 1 && out[0].kind === 'spline' && out[out.length - 1].kind === 'spline' && out[0]._smooth === out[out.length - 1]._smooth) {
    const last = out.pop();
    out[0].pts = [...last.pts.slice(0, -1), ...out[0].pts];
  }
  // a whole closed smooth curve with an exact form (ellipse / closed spline) is emitted exactly
  if (out.length === 1 && out[0].kind === 'spline' && out[0]._smooth.exact) {
    const ex = out[0]._smooth.exact;
    out[0] = { ...ex, src: out[0].src };
  }
  for (const o of out) delete o._smooth;
  return out;
}

// ── pieces ────────────────────────────────────────────────────────────────────
function pieceOf(e, fwd) {
  if (e.kind === 'seg') return fwd ? { kind: 'seg', a: e.a, b: e.b, src: e.src, group: e.group, smooth: e.smooth } : { kind: 'seg', a: e.b, b: e.a, src: e.src, group: e.group, smooth: e.smooth };
  const full = Math.abs(e.sw) >= TAU - 1e-9;
  return fwd ? { kind: 'arc', c: e.c, r: e.r, from: e.from, sw: e.sw, src: e.src, group: e.group, full } : { kind: 'arc', c: e.c, r: e.r, from: e.from + e.sw, sw: -e.sw, src: e.src, group: e.group, full };
}
function piecePoints(s) {
  if (s.kind === 'seg') return [s.a, s.b];
  return sampleArc(s.c, s.r, s.from, s.sw);
}
function pieceArea(s) {
  if (s.kind === 'seg') return (s.a[0] * s.b[1] - s.b[0] * s.a[1]) / 2;
  const F = th => s.r * s.c[0] * Math.sin(th) - s.r * s.c[1] * Math.cos(th) + s.r * s.r * th;
  return (F(s.from + s.sw) - F(s.from)) / 2;
}
function pieceMid(s) { return s.kind === 'seg' ? lerpP(s.a, s.b, 0.5) : polar(s.c, s.r, s.from + s.sw / 2); }
function pieceTangent(s) {
  if (s.kind === 'seg') return norm(sub(s.b, s.a));
  const th = s.from + s.sw / 2, d = s.sw > 0 ? 1 : -1;
  return [-Math.sin(th) * d, Math.cos(th) * d];
}
function tangentAt(e, fwd) {
  if (e.kind === 'seg') return { d: fwd ? sub(e.b, e.a) : sub(e.a, e.b), k: 0 };
  const th = fwd ? e.from : e.from + e.sw, s = fwd ? 1 : -1;
  return { d: [-Math.sin(th) * s, Math.cos(th) * s], k: s / e.r };
}
function edgeMid(e) { return e.kind === 'seg' ? lerpP(e.a, e.b, 0.5) : polar(e.c, e.r, e.from + e.sw / 2); }
const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const sweep = (a0, a1) => { const s = wrap2Pi(a1 - a0); return s < 1e-12 ? TAU : s; };

function boundsPts(cv) {
  if (cv.kind === 'line') return [cv.a, cv.b];
  if (cv.kind === 'arc' || cv.kind === 'circle') return [[cv.c[0] - cv.r, cv.c[1] - cv.r], [cv.c[0] + cv.r, cv.c[1] + cv.r]];
  return cv.pts ?? [];
}
function primBox(p) {
  if (p.t === 'seg') return [Math.min(p.a[0], p.b[0]), Math.min(p.a[1], p.b[1]), Math.max(p.a[0], p.b[0]), Math.max(p.a[1], p.b[1])];
  return [p.c[0] - p.r, p.c[1] - p.r, p.c[0] + p.r, p.c[1] + p.r];
}
const boxHit = (a, b, e) => a[0] <= b[2] + e && b[0] <= a[2] + e && a[1] <= b[3] + e && b[1] <= a[3] + e;

// intersections → [[param on p, param on q]]; segments use t ∈ [0, 1], arcs the angle offset s ∈ [0, sw]
function intersectPrims(p, q, EPS) {
  if (p.t === 'seg' && q.t === 'seg') return segSeg(p, q, EPS);
  if (p.t === 'seg' && q.t === 'arc') return segArc(p, q, EPS);
  if (p.t === 'arc' && q.t === 'seg') return segArc(q, p, EPS).map(([a, b]) => [b, a]);
  return arcArc(p, q, EPS);
}
function segSeg(p, q, EPS) {
  const d1 = sub(p.b, p.a), d2 = sub(q.b, q.a), den = cross(d1, d2), L1 = len(d1), L2 = len(d2);
  if (Math.abs(den) <= 1e-12 * L1 * L2) {
    // parallel: overlapping collinear pieces split at each other's endpoints
    if (Math.abs(cross(d1, sub(q.a, p.a))) / L1 > EPS) return [];
    const out = [];
    const tp = x => dot(sub(x, p.a), d1) / (L1 * L1), tq = x => dot(sub(x, q.a), d2) / (L2 * L2);
    for (const x of [q.a, q.b]) { const t = tp(x); if (t > -EPS / L1 && t < 1 + EPS / L1) out.push([t, tq(x)]); }
    for (const x of [p.a, p.b]) { const t = tq(x); if (t > -EPS / L2 && t < 1 + EPS / L2) out.push([tp(x), t]); }
    return out;
  }
  const t = cross(sub(q.a, p.a), d2) / den, u = cross(sub(q.a, p.a), d1) / den;
  const et = EPS / L1, eu = EPS / L2;
  if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return [];
  return [[clamp01(t), clamp01(u)]];
}
function segArc(p, q, EPS) {
  const d = sub(p.b, p.a), f = sub(p.a, q.c), A = dot(d, d), B = 2 * dot(f, d), Cc = dot(f, f) - q.r * q.r;
  let disc = B * B - 4 * A * Cc;
  const L = Math.sqrt(A);
  // tangency within EPS counts as touching
  const tMid = -B / (2 * A), closest = len(add(f, scale(d, tMid)));
  if (disc < 0) { if (Math.abs(closest - q.r) <= EPS) disc = 0; else return []; }
  const s = Math.sqrt(disc), ts = disc === 0 ? [tMid] : [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  const out = [];
  for (const t of ts) {
    if (t < -EPS / L || t > 1 + EPS / L) continue;
    const P = add(p.a, scale(d, t)), sa = arcParam(q, P, EPS);
    if (sa != null) out.push([clamp01(t), sa]);
  }
  return out;
}
function arcArc(p, q, EPS) {
  const dd = dist(p.c, q.c);
  if (dd < EPS && Math.abs(p.r - q.r) < EPS) {
    // same circle: split at each other's endpoints
    const out = [];
    if (!q.full) for (const s of [0, q.sw]) { const P = polar(q.c, q.r, q.a0 + s), sp = arcParam(p, P, EPS); if (sp != null) out.push([sp, s]); }
    if (!p.full) for (const s of [0, p.sw]) { const P = polar(p.c, p.r, p.a0 + s), sq = arcParam(q, P, EPS); if (sq != null) out.push([s, sq]); }
    return out;
  }
  if (dd < 1e-12 || dd > p.r + q.r + EPS || dd < Math.abs(p.r - q.r) - EPS) return [];
  const a = (p.r * p.r - q.r * q.r + dd * dd) / (2 * dd), h2 = p.r * p.r - a * a;
  const u = norm(sub(q.c, p.c)), m = add(p.c, scale(u, a));
  const pts = h2 <= EPS * EPS ? [m] : [add(m, scale(perp(u), Math.sqrt(h2))), sub(m, scale(perp(u), Math.sqrt(h2)))];
  const out = [];
  for (const P of pts) { const sp = arcParam(p, P, EPS), sq = arcParam(q, P, EPS); if (sp != null && sq != null) out.push([sp, sq]); }
  return out;
}
function arcParam(q, P, EPS) {
  let s = wrap2Pi(angleOf(q.c, P) - q.a0);
  if (q.full) return s;
  const tolA = EPS / Math.max(q.r, 1e-12);
  if (s > q.sw + tolA) { if (s > TAU - tolA) s = 0; else return null; }
  return Math.min(s, q.sw);
}
const clamp01 = t => Math.max(0, Math.min(1, t));
export { polyArea };
