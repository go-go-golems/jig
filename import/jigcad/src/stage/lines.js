// lines.js: the line work of a sheet. Each B-rep edge polyline, and each chain of silhouette mesh edges (where the
// two triangles of a mesh edge face opposite ways in this view), is sampled every 1.5 device px and tested against
// the depth buffer: a sample is visible when it is no deeper than the buffer (with a small bias), or when a pixel
// around it shows one of its own faces at about its depth. Runs of visible and hidden samples become paths.
// Edges where two faces meet tangentially (a fillet and its neighbours) go to their own path, `tan`, drawn fainter.
// o.minEdgePx leaves out B-rep edges whose projection is smaller than that (thumbnails); o.minSilPx leaves out inner
// silhouette runs shorter than that (the scraps a coarse mesh leaves on a surface seen almost edge-on).
// Round 2, on real OpenCascade output: a silhouette's weight follows the depth step behind it (paper: the outline;
// a step of SHALLOW_PX or more on the sheet: an inner silhouette; less: `silSoft`, at about an edge's weight, so
// engraved text, embossed lettering and small pockets do not turn into blots at sheet scale and gain weight as one
// zooms in); tangent edges shorter than TAN_MIN_PX are left out (the seams between the Bézier faces of a glyph's
// wall, a fillet's end on a small feature); silhouette chains are smoothed where they turn by less than SMOOTH_DEG
// (two corner-cutting passes), so the outline of a fillet, a sphere or a torus shows no mesh facets, while corners
// stay corners.
import { isSeam, facePairDots, pairKey } from './scene.js';
import * as RS from '../engine/rs/index.js';

const STEP = 1.5;           // device px between samples
const TANGENT = Math.cos(8 * Math.PI / 180);    // faces meeting within 8° of each other meet at a tangent edge
export const SHALLOW_PX = 8;                    // CSS px: a smaller depth step behind a silhouette draws it soft
export const TAN_MIN_PX = 4;                    // CSS px: shorter tangent edges are left out
export const SMOOTH_DEG = 40;                   // silhouette vertices turning less than this are rounded off
const SMOOTH_COS = Math.cos(SMOOTH_DEG * Math.PI / 180);

export function lineWork(scene, cam, buf, k, o = {}) {
  const W = buf.w, H = buf.h, D = buf.depth, ID = buf.id;
  const bias = 1.0 / cam.s, near = 10 / cam.s;     // mm: one CSS px of depth; ten for a face's own pixels
  const s = cam.s * k, X0 = cam.W / 2 * k, Y0 = cam.Y0 * k, T = cam.T, r = cam.r, u = cam.u, c = cam.c;

  function visible(x, y, z, fa, fb) {
    const px = Math.floor(x), py = Math.floor(y);
    if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) return true;
    const o0 = py * W + px;
    if (z >= D[o0] - bias) return true;
    for (let dy = -W; dy <= W; dy += W) for (let dx = -1; dx <= 1; dx++) {
      const q = o0 + dy + dx, id = ID[q];
      if ((id === fa || id === fb) && z >= D[q] - near) return true;
    }
    return false;
  }

  // a silhouette sample is visible when the pixel just outside it (1.5 px away from its front-facing triangle) is
  // paper or deeper: whatever hides a silhouette hides that pixel too, and the surface's own steep depth near its
  // contour never counts against it
  // 0 hidden, 2 against paper (the outline), 1 over a deep step, 3 over a shallow one (under SHALLOW_PX on the sheet)
  const shallow = SHALLOW_PX / cam.s;           // mm of depth
  function visibleSil(x, y, z, nx, ny) {
    const px = Math.floor(x), py = Math.floor(y);
    if (px < 2 || py < 2 || px >= W - 2 || py >= H - 2) return 2;
    const qx = Math.floor(x + nx * 1.5), qy = Math.floor(y + ny * 1.5), dq = D[qy * W + qx];
    if (z >= D[py * W + px] - bias || z >= dq - bias) return dq === -Infinity ? 2 : z - dq < shallow && z - dq > -bias ? 3 : 1;
    return 0;
  }

  // sample a polyline (device xyz triples, flat) with per-segment faces, despeckle, and emit runs to the paths
  const xs = [], ys = [], zs = [], st = [], vx = [];
  // With a Rust frame the samples are tested in jig-compute: classify() queues the polyline and flush() runs the
  // whole queue in one call, invoking the callbacks in the same order the JS path would.
  let queue = buf.rust ? [] : null;
  function flush(sil) {
    if (!queue || !queue.length) return;
    const items = queue; queue = [];
    const res = RS.stageClassify(buf, items, { bias, near, shallow, k, step: STEP }, sil);
    if (!res) { const q = items; queue = null; for (const it of q) classify(it.pts, it.fa, it.fb, it.onRun, it.on); queue = buf.rust && RS.enabled() ? [] : null; return; }
    items.forEach((it, p) => { for (const [stt, run] of res[p]) it.onRun(stt, run); });
  }
  function classify(pts, faceA, faceB, onRun, outN) {
    if (queue) { queue.push({ pts, fa: faceA, fb: faceB, onRun, on: outN }); return; }
    xs.length = ys.length = zs.length = st.length = vx.length = 0;
    const n = pts.length / 3;
    for (let i = 0; i + 1 < n; i++) {
      const ax = pts[3 * i], ay = pts[3 * i + 1], az = pts[3 * i + 2], bx = pts[3 * i + 3], by = pts[3 * i + 4], bz = pts[3 * i + 5];
      const L = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(L / STEP));
      const fa = typeof faceA === 'number' ? faceA : faceA[i], fb = typeof faceB === 'number' ? faceB : faceB[i];
      for (let j = i === 0 ? 0 : 1; j <= m; j++) {
        const t = j / m, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
        xs.push(x); ys.push(y); zs.push(z); vx.push(j === 0 || j === m);
        st.push(outN ? visibleSil(x, y, z, outN[2 * i], outN[2 * i + 1]) : visible(x, y, z, fa, fb) ? 1 : 0);
      }
    }
    const N = st.length;
    if (N < 2) return;
    for (let i = 1; i + 1 < N; i++) if (st[i - 1] === st[i + 1] && st[i] !== st[i - 1]) st[i] = st[i - 1];
    // a run under 3 px between two others (or at an end) is where an edge meets an outline: it takes its neighbour's state
    const minRun = 3 * k / STEP;
    for (let pass = 0; pass < 2; pass++) {
      let a = 0;
      for (let i = 1; i <= N; i++) {
        if (i < N && st[i] === st[a]) continue;
        if (i - a < minRun && (a > 0 || i < N)) { const v = a > 0 ? st[a - 1] : st[i]; for (let j = a; j < i; j++) st[j] = v; }
        a = i;
      }
    }
    let start = 0;
    for (let i = 1; i <= N; i++) {
      if (i < N && st[i] === st[start]) continue;
      // run [start, i − 1], extended to the midpoints of the transitions
      const run = [];
      if (start > 0) run.push((xs[start - 1] + xs[start]) / 2 / k, (ys[start - 1] + ys[start]) / 2 / k);
      else run.push(xs[0] / k, ys[0] / k);
      for (let j = start; j < i; j++) if (vx[j] && j > 0 && j < N - 1) run.push(xs[j] / k, ys[j] / k);
      if (i < N) run.push((xs[i - 1] + xs[i]) / 2 / k, (ys[i - 1] + ys[i]) / 2 / k);
      else run.push(xs[N - 1] / k, ys[N - 1] / k);
      if (run.length >= 4) onRun(st[start], run);
      start = i;
    }
  }
  const toPath = (path, run) => { path.moveTo(run[0], run[1]); for (let j = 2; j < run.length; j += 2) path.lineTo(run[j], run[j + 1]); };

  const vis = new Path2D(), tan = new Path2D(), hid = new Path2D(), sil = new Path2D(), silOuter = new Path2D(), silHid = new Path2D(), silSoft = new Path2D();
  const minEdge = (o.minEdgePx || 0) * k, minSil = (o.minSilPx || 0) * k, minTan = Math.max(minEdge, TAN_MIN_PX * k);
  const runLen = run => { let L = 0; for (let j = 2; j < run.length; j += 2) L += Math.hypot(run[j] - run[j - 2], run[j + 1] - run[j - 1]); return L * k; };
  const runs = [], hidRuns = [];       // per instance, per edge: visible and hidden runs (CSS px), for picking and highlights
  const segs = [], who = [];           // visible B-rep segments for picking: x0 y0 x1 y1 / instance, edge
  const proj3 = (p, i, out, j) => {
    const dx = p[i] - T[0], dy = p[i + 1] - T[1], dz = p[i + 2] - T[2];
    out[j] = X0 + (dx * r[0] + dy * r[1] + dz * r[2]) * s; out[j + 1] = Y0 - (dx * u[0] + dy * u[1] + dz * u[2]) * s; out[j + 2] = dx * c[0] + dy * c[1] + dz * c[2];
  };

  // B-rep edges
  scene.instances.forEach((inst, ii) => {
    const edges = inst.body.edges || [], R = runs[ii] = new Array(edges.length), RH = hidRuns[ii] = new Array(edges.length);
    const dots = facePairDots(inst.body.mesh);
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei], wp = inst.E[ei];
      if (!wp || wp.length < 6 || isSeam(e)) continue;
      const f = e.faces || [], fa = inst.base + (f[0] ?? -1e9), fb = inst.base + (f[1] ?? f[0] ?? -1e9);
      const pts = new Float32Array(wp.length);
      for (let i = 0; i < wp.length; i += 3) proj3(wp, i, pts, i);
      const d = f.length === 2 && f[0] !== f[1] ? dots.get(pairKey(f[0], f[1])) : undefined;
      const tangent = d !== undefined && d > TANGENT;
      if (minEdge || tangent) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (Math.max(x1 - x0, y1 - y0) < (tangent ? minTan : minEdge)) continue;
      }
      const path = tangent ? tan : vis;
      const mine = R[ei] = [], hidden = RH[ei] = [];
      classify(pts, fa, fb, (on, run) => {
        if (on) {
          toPath(path, run); mine.push(run);
          for (let j = 0; j + 3 < run.length; j += 2) { segs.push(run[j], run[j + 1], run[j + 2], run[j + 3]); who.push(ii, ei); }
        } else { toPath(hid, run); hidden.push(run); }
      });
    }
  });

  flush(false);

  // silhouettes: mesh edges between a front-facing and a not-front-facing triangle, chained through welded vertices
  let silCount = 0;
  scene.instances.forEach((inst) => {
    const tp = inst.topo, N = inst.N, ne = tp.ea.length, TF = inst.body.mesh.triFace, S = inst._S;
    const front = t => N[3 * t] * c[0] + N[3 * t + 1] * c[1] + N[3 * t + 2] * c[2] > 1e-7;
    const list = [];
    for (let e = 0; e < ne; e++) {
      const t0 = tp.t0[e], t1 = tp.t1[e];
      if (t1 < 0 || front(t0) !== front(t1)) list.push(e);
    }
    silCount += list.length;
    if (!list.length) return;
    // chain: welded vertex → silhouette edges
    const adj = new Map(), used = new Uint8Array(list.length);
    const addAdj = (w, li) => { const a = adj.get(w); if (a) a.push(li); else adj.set(w, [li]); };
    list.forEach((e, li) => { addAdj(tp.weld[tp.ea[e]], li); addAdj(tp.weld[tp.eb[e]], li); });
    const faceOf = t => t < 0 ? -1e9 : inst.base + (TF ? TF[t] : 0);
    const I = inst.body.mesh.indices;
    // the sheet direction away from the front-facing triangle of edge e, going from vertex a to b
    const outward = (e, a, b) => {
      const t = tp.t1[e] >= 0 && !front(tp.t0[e]) ? tp.t1[e] : tp.t0[e];
      let o = I[3 * t]; for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; if (tp.weld[v] !== tp.weld[a] && tp.weld[v] !== tp.weld[b]) o = v; }
      const dx = S[3 * b] - S[3 * a], dy = S[3 * b + 1] - S[3 * a + 1], L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L;
      if ((S[3 * o] - S[3 * a]) * nx + (S[3 * o + 1] - S[3 * a + 1]) * ny > 0) { nx = -nx; ny = -ny; }
      return [nx, ny];
    };
    const walk = (li0, wStart) => {
      const verts = [], fa = [], fb = [], on = [];
      let li = li0, w = wStart;
      const e0 = list[li0];
      verts.push(tp.weld[tp.ea[e0]] === w ? tp.ea[e0] : tp.eb[e0]);
      while (li >= 0 && !used[li]) {
        used[li] = 1;
        const e = list[li], a = tp.ea[e], b = tp.eb[e], other = tp.weld[a] === w ? b : a;
        const from = verts[verts.length - 1];
        verts.push(other); fa.push(faceOf(tp.t0[e])); fb.push(faceOf(tp.t1[e])); on.push(...outward(e, from, other));
        w = tp.weld[other];
        const nb = adj.get(w); li = -1;
        if (nb && nb.length === 2) for (const x of nb) if (!used[x]) li = x;
      }
      return { verts, fa, fb, on: Float32Array.from(on) };
    };
    const chains = [];
    for (const [w, a] of adj) if (a.length !== 2) for (const li of a) if (!used[li]) chains.push(walk(li, w));
    for (let li = 0; li < list.length; li++) if (!used[li]) chains.push(walk(li, tp.weld[tp.ea[list[li]]]));
    for (const ch of chains) {
      let pts = new Float32Array(ch.verts.length * 3);
      ch.verts.forEach((v, j) => { pts[3 * j] = S[3 * v]; pts[3 * j + 1] = S[3 * v + 1]; pts[3 * j + 2] = S[3 * v + 2]; });
      let on = ch.on, fa = ch.fa, fb = ch.fb;
      if (ch.verts.length > 2) { const sm = smoothChain(pts, on); pts = sm.pts; on = sm.on; fa = fb = -1e9; }   // faces are not read for silhouettes
      classify(pts, fa, fb, (st, run) => {
        if (minSil && st !== 2 && runLen(run) < minSil) return;
        toPath(st === 2 ? silOuter : st === 1 ? sil : st === 3 ? silSoft : silHid, run);
      }, on);
    }
  });
  flush(true);
  return { vis, tan, hid, sil, silOuter, silHid, silSoft, runs, hidRuns, segs: Float32Array.from(segs), who: Int32Array.from(who), silCount };
}

// two corner-cutting (Chaikin) passes over a silhouette polyline (device x, y, depth triples), cutting only vertices
// that turn by less than SMOOTH_DEG, so mesh facets round off and real corners stay; `on` is each segment's outward
// sheet direction (x, y pairs), carried to the new segments (a cut corner takes the mean of its two)
export function smoothChain(pts, on, passes = 2) {
  let P = Array.from(pts), N = Array.from(on);
  for (let pass = 0; pass < passes; pass++) {
    const n = P.length / 3;
    if (n < 3) break;
    const Q = [P[0], P[1], P[2]], M = [];
    let cut = false;
    for (let i = 0; i + 1 < n; i++) {
      const ax = P[3 * i], ay = P[3 * i + 1], bx = P[3 * i + 3], by = P[3 * i + 4];
      const smoothA = i > 0 && turnCos(P, i) > SMOOTH_COS, smoothB = i + 2 < n && turnCos(P, i + 1) > SMOOTH_COS;
      const nx = N[2 * i], ny = N[2 * i + 1];
      // the segment's own part: from a quarter in (if its start is cut) to a quarter short (if its end is cut)
      if (smoothA) { Q.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.75 * P[3 * i + 2] + 0.25 * P[3 * i + 5]); M.push((nx + N[2 * i - 2]) / 2, (ny + N[2 * i - 1]) / 2); cut = true; }
      if (smoothB) { Q.push(0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by, 0.25 * P[3 * i + 2] + 0.75 * P[3 * i + 5]); M.push(nx, ny); }
      else { Q.push(bx, by, P[3 * i + 5]); M.push(nx, ny); }
    }
    if (!cut) break;
    P = Q; N = M;
  }
  return { pts: Float32Array.from(P), on: Float32Array.from(N) };
}
// the cosine of the turn at vertex i of a flat xyz polyline (1: straight on); a zero-length segment counts as straight
function turnCos(P, i) {
  const ux = P[3 * i] - P[3 * i - 3], uy = P[3 * i + 1] - P[3 * i - 2], vx = P[3 * i + 3] - P[3 * i], vy = P[3 * i + 4] - P[3 * i + 1];
  const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return l > 1e-12 ? (ux * vx + uy * vy) / l : 1;
}

// the nearest visible B-rep edge to a sheet point within `tol` px: { inst, edge, d } or null
export function pickEdge(lw, x, y, tol = 5) {
  const S = lw.segs; let best = null, bd = tol * tol;
  for (let i = 0, k = 0; i < S.length; i += 4, k += 2) {
    const ax = S[i], ay = S[i + 1], bx = S[i + 2], by = S[i + 3], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ey = ay + dy * t - y, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; best = { inst: lw.who[k], edge: lw.who[k + 1], d: Math.sqrt(d) }; }
  }
  return best;
}
