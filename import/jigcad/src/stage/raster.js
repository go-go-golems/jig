// raster.js: the software depth buffer. Every triangle of every instance is rasterised at the canvas's device
// resolution into a depth buffer (larger is nearer, the stage's depth(cam, p)) and an id buffer (the global face id,
// −1 for paper). The id buffer is what hidden lines test against and what picking reads; its covered pixels are the
// part's paper.

import * as RS from '../engine/rs/index.js';

const scratch = new WeakMap();        // key object → { w, h, depth, id }

// With jig-compute loaded on this thread, the buffers live in wasm memory (a Rust frame: depth and id are views)
// and projection + raster run in Rust; the JS below stays as the reference and the fallback.
export function buffers(key, w, h) {
  if (RS.enabled()) { const f = RS.stageFrame(key, w, h); if (f) return f; }
  let b = scratch.get(key);
  if (!b || b.w !== w || b.h !== h) { b = { w, h, depth: new Float32Array(w * h).fill(-Infinity), id: new Int32Array(w * h).fill(-1) }; scratch.set(key, b); }
  else if (b.x1 >= b.x0) for (let y = b.y0; y <= b.y1; y++) {      // only what the last raster touched
    b.depth.fill(-Infinity, y * w + b.x0, y * w + b.x1 + 1); b.id.fill(-1, y * w + b.x0, y * w + b.x1 + 1);
  }
  b.x0 = w; b.y0 = h; b.x1 = -1; b.y1 = -1;
  return b;
}

// project an instance's world positions to device pixels (k = device px per CSS px) and depth
export function projectInstance(inst, cam, k) {
  if (RS.enabled()) return { deferred: true, inst, cam, k };   // projected inside the Rust raster (rasterInstance)
  return projectInstanceJS(inst, cam, k);
}
export function projectInstanceJS(inst, cam, k) {
  const P = inst.P, n = P.length / 3, S = inst._S && inst._S.length === n * 3 ? inst._S : (inst._S = new Float32Array(n * 3));
  const T = cam.T, r = cam.r, u = cam.u, c = cam.c, s = cam.s * k, X0 = cam.W / 2 * k, Y0 = cam.Y0 * k;
  for (let i = 0; i < n; i++) {
    const dx = P[3 * i] - T[0], dy = P[3 * i + 1] - T[1], dz = P[3 * i + 2] - T[2];
    S[3 * i] = X0 + (dx * r[0] + dy * r[1] + dz * r[2]) * s;
    S[3 * i + 1] = Y0 - (dx * u[0] + dy * u[1] + dz * u[2]) * s;
    S[3 * i + 2] = dx * c[0] + dy * c[1] + dz * c[2];
  }
  return S;
}

// rasterise one instance into the buffers. Spans per row from the three edge functions, depth by the triangle's
// plane equation, pixel centres at +0.5, a hair of overlap (1e-4 px) so neighbouring triangles leave no cracks.
export function rasterInstance(buf, inst, S) {
  if (S && S.deferred) {
    if (buf.rust) { const out = RS.stageRaster(buf, inst, S.cam, S.k); if (out) { inst._S = out; return; } }
    S = projectInstanceJS(inst, S.cam, S.k);
  }
  return rasterInstanceJS(buf, inst, S);
}
export function rasterInstanceJS(buf, inst, S) {
  const I = inst.body.mesh.indices, TF = inst.body.mesh.triFace, base = inst.base, W = buf.w, H = buf.h, D = buf.depth, ID = buf.id;
  const nt = (I.length / 3) | 0, EPS = 1e-4;
  let bx0 = buf.x0, by0 = buf.y0, bx1 = buf.x1, by1 = buf.y1;
  for (let t = 0; t < nt; t++) {
    const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
    const x0 = S[a], y0 = S[a + 1], z0 = S[a + 2], x1 = S[b], y1 = S[b + 1], z1 = S[b + 2], x2 = S[c], y2 = S[c + 1], z2 = S[c + 2];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (!(Math.abs(area) > 1e-9)) continue;
    let ymin = Math.min(y0, y1, y2), ymax = Math.max(y0, y1, y2), xmin = Math.min(x0, x1, x2), xmax = Math.max(x0, x1, x2);
    let r0 = Math.max(0, Math.ceil(ymin - 0.5 - EPS)), r1 = Math.min(H - 1, Math.floor(ymax - 0.5 + EPS));
    const c0 = Math.max(0, Math.ceil(xmin - 0.5 - EPS)), c1 = Math.min(W - 1, Math.floor(xmax - 0.5 + EPS));
    if (r0 > r1 || c0 > c1) continue;
    // depth plane z = z0 + gx (x − x0) + gy (y − y0)
    const gx = ((z1 - z0) * (y2 - y0) - (z2 - z0) * (y1 - y0)) / area, gy = ((z2 - z0) * (x1 - x0) - (z1 - z0) * (x2 - x0)) / area;
    const sg = area > 0 ? 1 : -1;
    // edge functions e(x, y) = A x + B y + C, ≥ 0 inside (after the sign fix)
    const A0 = sg * (y1 - y2), B0 = sg * (x2 - x1), C0 = sg * (x1 * y2 - x2 * y1);
    const A1 = sg * (y2 - y0), B1 = sg * (x0 - x2), C1 = sg * (x2 * y0 - x0 * y2);
    const A2 = sg * (y0 - y1), B2 = sg * (x1 - x0), C2 = sg * (x0 * y1 - x1 * y0);
    const fid = base + (TF ? TF[t] : 0);
    if (c0 < bx0) bx0 = c0; if (c1 > bx1) bx1 = c1; if (r0 < by0) by0 = r0; if (r1 > by1) by1 = r1;
    for (let y = r0; y <= r1; y++) {
      const py = y + 0.5;
      let lo = c0, hi = c1;
      // each edge bounds x on one side: A x + (B py + C) ≥ 0
      let k = B0 * py + C0;
      if (A0 > 0) { const v = Math.ceil(-k / A0 - 0.5 - EPS); if (v > lo) lo = v; }
      else if (A0 < 0) { const v = Math.floor(-k / A0 - 0.5 + EPS); if (v < hi) hi = v; }
      else if (k < -EPS) continue;
      k = B1 * py + C1;
      if (A1 > 0) { const v = Math.ceil(-k / A1 - 0.5 - EPS); if (v > lo) lo = v; }
      else if (A1 < 0) { const v = Math.floor(-k / A1 - 0.5 + EPS); if (v < hi) hi = v; }
      else if (k < -EPS) continue;
      k = B2 * py + C2;
      if (A2 > 0) { const v = Math.ceil(-k / A2 - 0.5 - EPS); if (v > lo) lo = v; }
      else if (A2 < 0) { const v = Math.floor(-k / A2 - 0.5 + EPS); if (v < hi) hi = v; }
      else if (k < -EPS) continue;
      if (lo > hi) continue;
      let z = z0 + gx * (lo + 0.5 - x0) + gy * (py - y0);
      const row = y * W;
      for (let x = lo; x <= hi; x++, z += gx) {
        const o = row + x;
        if (z > D[o]) { D[o] = z; ID[o] = fid; }
      }
    }
  }
  buf.x0 = bx0; buf.y0 = by0; buf.x1 = bx1; buf.y1 = by1;
}

// the 45° hatch as coverage, computed per device pixel: lines rising to the right, `pitch` CSS px apart along a row
// (pitch/√2 across), `width` CSS px wide, box-filtered over the pixel (k device px per CSS px)
const R2 = Math.SQRT1_2;
function hatchCov(x, y, k, width, pitch) {
  const t = ((x + y + 1) / k) % pitch, dd = Math.min(t, pitch - t) * R2, c = (width / 2 - dd) * k + 0.5;
  return c <= 0 ? 0 : c >= 1 ? 1 : c;
}
const chan = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];

// the parts' paper: every covered pixel paper, or paper hatched in a tone where its face is in one of the tones'
// sets ([{ set: Uint8Array over global face ids, col: uint32, width }]); returns the dirty rectangle
export function paperImage(buf, img32, paper, tones = [], k = 1, pitch = 6) {
  const W = buf.w, ID = buf.id;
  if (buf.x1 < buf.x0) return null;
  const P = chan(paper), T = tones.map(t => ({ set: t.set, c: chan(t.col), width: t.width }));
  for (let y = buf.y0; y <= buf.y1; y++) {
    const row = y * W;
    for (let x = buf.x0; x <= buf.x1; x++) {
      const id = ID[row + x];
      if (id < 0) { img32[row + x] = 0; continue; }
      let v = paper;
      for (const t of T) if (t.set[id]) {
        const a = hatchCov(x, y, k, t.width, pitch);
        if (a > 0) { const r = P[0] + (t.c[0] - P[0]) * a, g = P[1] + (t.c[1] - P[1]) * a, b = P[2] + (t.c[2] - P[2]) * a; v = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0; }
        break;
      }
      img32[row + x] = v;
    }
  }
  return { x: buf.x0, y: buf.y0, w: buf.x1 - buf.x0 + 1, h: buf.y1 - buf.y0 + 1 };
}
// the hatch over a coverage mask (the sun shadow), transparent elsewhere
export function hatchImage(mask, w, img32, rect, col, k = 1, width = 0.6, pitch = 6) {
  const c = chan(col), rgb = (c[2] << 16) | (c[1] << 8) | c[0];
  for (let y = rect.y0; y <= rect.y1; y++) {
    const row = y * w;
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!mask[row + x]) { img32[row + x] = 0; continue; }
      const a = hatchCov(x, y, k, width, pitch);
      img32[row + x] = a > 0 ? ((((a * 255) | 0) << 24) | rgb) >>> 0 : 0;
    }
  }
  return { x: rect.x0, y: rect.y0, w: rect.x1 - rect.x0 + 1, h: rect.y1 - rect.y0 + 1 };
}

// coverage only (the sun shadow): triangles given by 2D device points Q (x, y pairs) and indices, those for which
// keep(t) is true, into a Uint8Array mask; grows and returns the mask's rectangle
export function coverTriangles(mask, w, h, Q, I, keep, rect) {
  const EPS = 1e-4;
  for (let t = 0, nt = (I.length / 3) | 0; t < nt; t++) {
    if (!keep(t)) continue;
    const a = I[3 * t] * 2, b = I[3 * t + 1] * 2, c = I[3 * t + 2] * 2;
    const x0 = Q[a], y0 = Q[a + 1], x1 = Q[b], y1 = Q[b + 1], x2 = Q[c], y2 = Q[c + 1];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (!(Math.abs(area) > 1e-9)) continue;
    const r0 = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - 0.5 - EPS)), r1 = Math.min(h - 1, Math.floor(Math.max(y0, y1, y2) - 0.5 + EPS));
    const c0 = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - 0.5 - EPS)), c1 = Math.min(w - 1, Math.floor(Math.max(x0, x1, x2) - 0.5 + EPS));
    if (r0 > r1 || c0 > c1) continue;
    const sg = area > 0 ? 1 : -1;
    const E = [[sg * (y1 - y2), sg * (x2 - x1), sg * (x1 * y2 - x2 * y1)], [sg * (y2 - y0), sg * (x0 - x2), sg * (x2 * y0 - x0 * y2)], [sg * (y0 - y1), sg * (x1 - x0), sg * (x0 * y1 - x1 * y0)]];
    if (c0 < rect.x0) rect.x0 = c0; if (c1 > rect.x1) rect.x1 = c1; if (r0 < rect.y0) rect.y0 = r0; if (r1 > rect.y1) rect.y1 = r1;
    for (let y = r0; y <= r1; y++) {
      const py = y + 0.5; let lo = c0, hi = c1, empty = false;
      for (let k = 0; k < 3; k++) {
        const A = E[k][0], kk = E[k][1] * py + E[k][2];
        if (A > 0) { const v = Math.ceil(-kk / A - 0.5 - EPS); if (v > lo) lo = v; }
        else if (A < 0) { const v = Math.floor(-kk / A - 0.5 + EPS); if (v < hi) hi = v; }
        else if (kk < -EPS) { empty = true; break; }
      }
      if (empty || lo > hi) continue;
      mask.fill(1, y * w + lo, y * w + hi + 1);
    }
  }
  return rect;
}
