// A plain drafting sheet for when src/stage is not built: orthographic, ink edges on paper, hidden lines removed with
// a small software depth buffer, the selected face washed in `sel`, picking by face. It reads the host's view
// ({ name, yaw, pitch, scale, target, overlays }) the way the stage does, so either can stand in for the other.
import { themeColors } from './common.jsx';
import { NAMED_VIEWS } from '../host/host.js';

// CAD is Z-up; the sheet camera is y-up (Form Skate Stage, projection-and-views): s = (x, z, −y).
const toS = (x, y, z) => [x, z, -y];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function camera(view, W, H, box) {
  const base = NAMED_VIEWS[view.name] || NAMED_VIEWS.axo;
  const yaw = base.yaw + (view.yaw || 0), pitch = Math.max(-0.05, Math.min(Math.PI / 2, base.pitch + (view.pitch || 0)));
  const cp = Math.cos(pitch);
  const c = [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = crossV(c, r);
  const [lo, hi] = box;
  let T = view.target ? toS(...view.target) : toS((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  let ex = 1e-9, ey = 1e-9;
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const d = toS(x, y, z).map((v, k) => v - T[k]);
    ex = Math.max(ex, Math.abs(dot(d, r))); ey = Math.max(ey, Math.abs(dot(d, u)));
  }
  const s = view.scale || Math.min((W * 0.36) / ex, (H * 0.34) / ey) * (view.zoom || 1);
  const pan = view.pan || [0, 0];
  if (pan[0] || pan[1]) T = [0, 1, 2].map(k => T[k] + r[k] * pan[0] + u[k] * pan[1]);
  const P = p => { const d = [p[0] - T[0], p[1] - T[1], p[2] - T[2]]; return [W / 2 + s * dot(d, r), H / 2 - s * dot(d, u), dot(d, c)]; };
  return { c, r, u, s, T, P, yaw, pitch, extent: Math.max(...hi.map((v, k) => v - lo[k])) };
}

function worldBox(program) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of program?.bodies || []) {
    const bb = b.bbox || [[-10, -10, 0], [10, 10, 10]];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], bb[0][k]); hi[k] = Math.max(hi[k], bb[1][k]); }
  }
  return lo[0] === Infinity ? [[-20, -20, 0], [20, 20, 20]] : [lo, hi];
}
const xf = (t, x, y, z) => (t && t.length === 16 ? [t[0] * x + t[4] * y + t[8] * z + t[12], t[1] * x + t[5] * y + t[9] * z + t[13], t[2] * x + t[6] * y + t[10] * z + t[14]] : [x, y, z]);

/** Draw `program` on `canvas` (CSS size × devicePixelRatio). Returns { pick(x, y) } in CSS pixels. */
export function drawSheet(canvas, program, view, { selection = null, figure = false } = {}) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const W = Math.max(40, canvas.clientWidth || 640), H = Math.max(40, canvas.clientHeight || 300);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  const col = themeColors(canvas);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = col.stage || col.bg;
  g.fillRect(0, 0, W, H);
  const overlays = view?.overlays instanceof Set ? view.overlays : new Set(view?.overlays || []);
  const box = worldBox(program);
  const cam = camera(view || {}, W, H, box);
  const bw = Math.ceil(W), bh = Math.ceil(H);
  const zb = new Float32Array(bw * bh).fill(-Infinity), ib = new Int32Array(bw * bh);

  // depth buffer of every triangle, with the face id per pixel
  const bodies = program?.bodies || [];
  bodies.forEach((b, bi) => {
    const { positions: p, indices: ix, triFace } = b.mesh || {};
    if (!p || !ix) return;
    const V = [];
    for (let i = 0; i < p.length; i += 3) V.push(cam.P(toS(...xf(b.transform, p[i], p[i + 1], p[i + 2]))));
    for (let t = 0; t < ix.length; t += 3) {
      const a = V[ix[t]], bb = V[ix[t + 1]], cc = V[ix[t + 2]];
      const id = (bi << 16) + (triFace ? triFace[t / 3] : 0) + 1;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], bb[0], cc[0]))), x1 = Math.min(bw - 1, Math.ceil(Math.max(a[0], bb[0], cc[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], bb[1], cc[1]))), y1 = Math.min(bh - 1, Math.ceil(Math.max(a[1], bb[1], cc[1])));
      const area = (bb[0] - a[0]) * (cc[1] - a[1]) - (bb[1] - a[1]) * (cc[0] - a[0]);
      if (Math.abs(area) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bb[0] - px) * (cc[1] - py) - (bb[1] - py) * (cc[0] - px)) / area;
        const w1 = ((cc[0] - px) * (a[1] - py) - (cc[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const z = w0 * a[2] + w1 * bb[2] + w2 * cc[2], k = y * bw + x;
        if (z > zb[k]) { zb[k] = z; ib[k] = id; }
      }
    }
  });
  const eps = Math.max(cam.extent * 0.006, 0.02);
  // a point is visible when nothing in its 3 × 3 pixel neighbourhood is nearer than it by more than eps
  const visible = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let lo = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = xi + dx, Y = yi + dy;
      lo = X < 0 || Y < 0 || X >= bw || Y >= bh ? -Infinity : Math.min(lo, zb[Y * bw + X]);
      if (lo === -Infinity) return true;
    }
    return z >= lo - eps;
  };
  const segment = (A, B, style, hiddenStyle) => {
    const n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 1.5));
    let run = null, runVis = null;
    const flush = () => {
      if (!run || run.length < 2) return;
      const st = runVis ? style : hiddenStyle;
      if (st) { g.strokeStyle = st.color; g.lineWidth = st.width; g.setLineDash(st.dash || []); g.beginPath(); g.moveTo(run[0][0], run[0][1]); for (const q of run) g.lineTo(q[0], q[1]); g.stroke(); }
    };
    for (let i = 0; i <= n; i++) {
      const t = i / n, q = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      const v = visible(q[0], q[1], q[2]);
      if (run && v !== runVis) { run.push(q); flush(); run = [q]; runVis = v; } else if (!run) { run = [q]; runVis = v; } else run.push(q);
    }
    flush();
    g.setLineDash([]);
  };

  // the bed grid, hidden where the part covers it
  if (overlays.has('grid') && !figure) {
    const [lo, hi] = box, pad = Math.max(20, cam.extent * 0.6);
    const step = cam.extent > 300 ? 50 : 10;
    const gx0 = Math.floor((lo[0] - pad) / step) * step, gx1 = Math.ceil((hi[0] + pad) / step) * step;
    const gy0 = Math.floor((lo[1] - pad) / step) * step, gy1 = Math.ceil((hi[1] + pad) / step) * step;
    const z = Math.min(0, lo[2]);
    for (let x = gx0; x <= gx1; x += step) segment(cam.P(toS(x, gy0, z)), cam.P(toS(x, gy1, z)), { color: x % (step * 5) === 0 ? col.hair : col.rule, width: 1 }, null);
    for (let y = gy0; y <= gy1; y += step) segment(cam.P(toS(gx0, y, z)), cam.P(toS(gx1, y, z)), { color: y % (step * 5) === 0 ? col.hair : col.rule, width: 1 }, null);
  }

  // the selected face, washed
  const selId = selection && selection.face != null ? ((selection.body || 0) << 16) + selection.face + 1 : 0;
  if (selId) {
    const off = document.createElement('canvas');
    off.width = bw; off.height = bh;
    const og = off.getContext('2d');
    const img = og.createImageData(bw, bh);
    const rgb = parseColor(col.accent);
    for (let k = 0; k < ib.length; k++) if (ib[k] === selId) { img.data[k * 4] = rgb[0]; img.data[k * 4 + 1] = rgb[1]; img.data[k * 4 + 2] = rgb[2]; img.data[k * 4 + 3] = 40; }
    og.putImageData(img, 0, 0);
    g.drawImage(off, 0, 0, bw, bh);
  }

  // edges: visible in ink, hidden dashed when the Hidden overlay is on, the selected face's edges in accent
  const ink = { color: col.ink, width: figure ? 1 : 1.2 }, hidden = overlays.has('hidden') ? { color: col.ink2, width: 0.8, dash: [3, 3] } : null;
  bodies.forEach((b, bi) => {
    for (const e of b.edges || []) {
      const pts = e.points;
      if (!pts) continue;
      const onSel = selection && selection.body === bi && e.faces?.includes(selection.face);
      for (let i = 0; i + 5 < pts.length; i += 3) {
        segment(cam.P(toS(...xf(b.transform, pts[i], pts[i + 1], pts[i + 2]))), cam.P(toS(...xf(b.transform, pts[i + 3], pts[i + 4], pts[i + 5]))),
          onSel ? { color: col.accent, width: 1.6 } : ink, hidden);
      }
    }
  });

  // labels: face names, axes, the scale bar and overall size
  const mono = size => `500 ${size}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
  if (overlays.has('names') && selection?.face != null) {
    g.font = mono(8); g.fillStyle = col.accent; g.textAlign = 'center';
    bodies.forEach((b, bi) => (b.faces || []).forEach(f => {
      if (!f.center || bi !== (selection.body || 0) || f.index !== selection.face) return;
      const q = cam.P(toS(...xf(b.transform, ...f.center)));
      if (visible(q[0], q[1], q[2])) g.fillText(f.name, q[0], q[1]);
    }));
  }
  if (!figure || overlays.has('scale')) {
    const target = 90 / cam.s, nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(v => v >= target * 0.6) || 1000;
    const len = nice * cam.s, x0 = 14, y0 = H - 16;
    g.strokeStyle = col.ink; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + len, y0); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0 + 2); g.moveTo(x0 + len, y0 - 4); g.lineTo(x0 + len, y0 + 2); g.stroke();
    g.font = mono(9.5); g.fillStyle = col.ink; g.textAlign = 'left';
    g.fillText('0', x0, y0 - 6); g.textAlign = 'right'; g.fillText(`${nice} mm`, x0 + len, y0 - 6);
  }
  if (overlays.has('dims') && bodies.length) {
    const [lo, hi] = box;
    g.font = mono(9.5); g.fillStyle = col.ink2; g.textAlign = 'right';
    g.fillText(`${+(hi[0] - lo[0]).toFixed(2)} × ${+(hi[1] - lo[1]).toFixed(2)} × ${+(hi[2] - lo[2]).toFixed(2)} mm`, W - 14, H - 10);
  }

  return {
    pick(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      if (xi < 0 || yi < 0 || xi >= bw || yi >= bh) return null;
      const id = ib[yi * bw + xi];
      if (!id) return null;
      const body = (id - 1) >> 16, face = (id - 1) & 0xffff;
      const f = bodies[body]?.faces?.find(f => f.index === face) || bodies[body]?.faces?.[face];
      return { body, face, name: f?.name ?? `face#${face}` };
    },
    camera: cam,
  };
}

function parseColor(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c?.trim() || '');
  if (m) return [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16));
  const r = /rgba?\(([^)]+)\)/.exec(c || '');
  return r ? r[1].split(',').slice(0, 3).map(Number) : [226, 0, 26];
}

/** Fallback for the stage's renderSheet(canvas, program, view, options). */
export function renderSheetFallback(canvas, program, view, options = {}) {
  return drawSheet(canvas, program, view, { ...options, figure: true });
}

/** Fallback for the stage's createStage(element, host): the sheet, orbit, pan, zoom, click to select. */
export function createFallbackStage(el, host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'sheetcanvas';
  canvas.setAttribute('aria-label', 'Drafting sheet: drag to orbit, click a face to select');
  el.appendChild(canvas);
  let sheet = null, raf = 0, drag = null;
  const program = () => (host.program?.ok !== false ? host.program : host.lastGood);
  const draw = () => { raf = 0; sheet = drawSheet(canvas, program(), host.view, { selection: host.selection }); };
  const later = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const offs = ['program', 'view', 'selection'].map(e => host.on(e, later));
  offs.push(host.on('theme', () => setTimeout(later, 30)));
  const ro = new ResizeObserver(later);
  ro.observe(el);
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button !== 0, yaw: host.view.yaw || 0, pitch: host.view.pitch || 0, p0: host.view.pan || [0, 0] };
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (drag.pan && sheet) host.setView({ pan: [drag.p0[0] - dx / sheet.camera.s, drag.p0[1] + dy / sheet.camera.s] });
    else host.setView({ yaw: drag.yaw - dx * 0.008, pitch: Math.max(-1, Math.min(1.6, drag.pitch + dy * 0.006)) });
  });
  canvas.addEventListener('pointerup', e => {
    if (drag && !drag.moved && sheet) {
      const r = canvas.getBoundingClientRect();
      host.select(sheet.pick(e.clientX - r.left, e.clientY - r.top));
    }
    drag = null;
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    host.setView({ zoom: Math.max(0.25, Math.min(5, (host.view.zoom || 1) * Math.exp(-e.deltaY * 0.0015))) });
  }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', e => { if (e.key === 'Escape') host.select(null); });
  later();
  return { fallback: true, dispose() { offs.forEach(f => f()); ro.disconnect(); cancelAnimationFrame(raf); canvas.remove(); }, redraw: later };
}
