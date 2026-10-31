// sheet.js: renderSheet, a ProgramData drawn on a drafting sheet in a named view. The layers go down in the stage's
// fixed order: paper; the floor (grid and bed, or the ground line of an elevation); hatched sun shadows; the parts'
// paper (the depth buffer's covered pixels); tone on faces (overhang, selection); hidden lines; B-rep edges at the
// ring stroke; silhouettes at the silhouette stroke; overlays; the sketch; the sheet furniture.
import { V, boxOk, boxCorners, boxSize, emptyBox, growBox, fmtNum, fmtVolume, applyM, applyDir } from './math.js';
import { VIEWS, SUN, normView, viewCam, proj, makeCam } from './camera.js';
import { readColors, K, hatchPattern, rgba32, text, toneOf } from './theme.js';
import { sceneOf, sceneFacts, sketchToWorld, sameBody } from './scene.js';
import { buffers, projectInstance, rasterInstance, paperImage, hatchImage, coverTriangles } from './raster.js';
import { lineWork } from './lines.js';
import { drawGrid, drawGroundLine, drawBed, dimensionTo, arrow, label, scaleBar, titleBlock, gridSteps } from './furniture.js';
import { drawSketch, sketchCam, sketchStatus } from './sketch.js';

// the overlay switches: key, label, about (the Show menu reads them); on by default where `on`
export const OVERLAYS = [
  { key: 'shadows', label: 'Shadows', about: 'hatched sun shadows on the floor', on: true },
  { key: 'grid', label: 'Grid', about: 'the floor grid', on: true },
  { key: 'names', label: 'Names', about: 'face and edge names under the pointer', on: true },
  { key: 'dims', label: 'Dims', about: 'overall dimensions of the bounding box', on: true },
  { key: 'hidden', label: 'Hidden', about: 'hidden edges, dashed', on: false },
  { key: 'overhang', label: 'Overhang', about: 'faces that print over air, hatched', on: false },
  { key: 'bed', label: 'Bed', about: 'the printer bed and the parts on its plates', on: true },
  { key: 'normals', label: 'Normals', about: 'face normals as arrows', on: false },
  { key: 'dof', label: 'DOF', about: 'free degrees of freedom in a sketch', on: true },
];
export const DEFAULT_OVERLAYS = OVERLAYS.filter(o => o.on).map(o => o.key);
const KIND = { part: 'PART', sketch: 'SKETCH', assembly: 'ASSEMBLY', print: 'PRINT', design: 'DESIGN', region: 'REGION' };

const offscreen = new WeakMap();
function off(canvas, w, h) {
  let o = offscreen.get(canvas);
  if (!o || o.c.width !== w || o.c.height !== h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: false });
    o = { c, x, img: x.createImageData(w, h) }; o.u32 = new Uint32Array(o.img.data.buffer);
    offscreen.set(canvas, o);
  }
  return o;
}

// the sketch a sheet shows, if any: the view's (by id), or the program's first when the program is a sketch
export function activeSketch(program, view, overrides) {
  const list = program && program.sketches || [];
  let id = view.sketch;
  if (!id && program && program.kind === 'sketch' && list.length) id = list[0].id;
  if (!id) return null;
  return (overrides && overrides.get && overrides.get(id)) || list.find(s => s.id === id) || null;
}

// draw(canvas, program, view, options) → the state the interactive stage keeps for picking (renderSheet returns
// only { width, height, ms })
export function draw(canvas, program, viewIn, o = {}) {
  const t0 = performance.now();
  const thumb = !!o.thumbnail;
  let view = normView(viewIn);
  // a thumbnail (the Presets shelf): no title block, scale bar or dims, a tight fit, a light grid, lighter lines
  const on = new Set(thumb ? [...(o.overlays || ['grid'])].filter(k => k === 'grid' || k === 'shadows') : o.overlays ? [...o.overlays] : DEFAULT_OVERLAYS);
  const has = k => on.has(k);
  const dpr = o.dpr || Math.min(2, globalThis.devicePixelRatio || 1);
  let W = o.width, H = o.height;
  if (!W || !H) { const r = canvas.getBoundingClientRect(); W = W || r.width || (thumb ? 200 : canvas.width / dpr || 300); H = H || r.height || (thumb ? 140 : canvas.height / dpr || 150); }
  if (thumb && program && program.kind === 'sketch' && !(program.bodies || []).length) view = normView({ ...view, name: 'sketch' });
  const LW = thumb ? THUMB_LINES : SHEET_LINES;
  const bw = Math.max(1, Math.round(W * dpr)), bh = Math.max(1, Math.round(H * dpr));
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  const k = bw / W;
  const C = o.colors || readColors(o.colorsFrom || canvas, o.theme);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = C.stage; ctx.fillRect(0, 0, W, H);

  const sk = activeSketch(program, view, o.sketches);
  // a thumbnail of a print job shows its first plate's items where the plate puts them, without the bed
  const scene = thumb ? sceneOf(program, { bed: !!(program && program.print), bedBox: false, plates: 1 }) : sceneOf(program, { bed: has('bed') });
  const sketchView = !!(sk && view.name === 'sketch');
  const cam = sketchView ? sketchCam(sk, view, W, H) : thumb ? tightCam(view, scene, W, H) : viewCam(view.name === 'sketch' ? { ...view, name: 'axo' } : view, scene.fitBox, W, H);
  const faint = sketchView && scene.instances.length ? 0.4 : 1;
  const state = { width: W, height: H, k, cam, scene, C, view, sketch: sk, sketchView, overlays: on, buf: null, lw: null };

  // ---- floor
  if (sketchView) { if (has('grid')) drawPlaneGrid(ctx, C, cam, sk); }
  else if (thumb) {
    if (cam.planar) { if (has('grid')) drawGrid(ctx, { ...C, major: C.grid }, cam, { ...gridSteps(cam, 36), z: scene.floorZ }); }
    else if (scene.instances.length) drawGroundLine(ctx, C, cam, scene.floorZ, { band: 6, width: 1 });
  } else if (cam.planar) {
    if (has('grid')) {
      if (scene.bed) for (const pl of scene.bed.plates) drawGrid(ctx, C, cam, { ...gridSteps(cam), rect: [scene.bed.x0 + pl.ox, scene.bed.y0, scene.bed.x1 + pl.ox, scene.bed.y1] });
      else drawGrid(ctx, C, cam, { z: scene.floorZ, extent: gridExtent(scene) });
    }
    if (scene.bed) {
      const band = Math.min(10, Math.max(3, (scene.bed.x1 - scene.bed.x0) * 0.025));
      for (const pl of scene.bed.plates) drawBed(ctx, C, cam, [scene.bed.x0 + pl.ox, scene.bed.y0, scene.bed.x1 + pl.ox, scene.bed.y1], band);
    }
  } else if (scene.instances.length || !sk) drawGroundLine(ctx, C, cam, scene.floorZ);

  // ---- depth buffer
  const buf = state.buf = buffers(canvas, bw, bh);
  for (const inst of scene.instances) rasterInstance(buf, inst, projectInstance(inst, cam, k));
  const tRaster = performance.now();

  // ---- shadows: the mesh pushed along the sun to the floor, one path, filled once with the hatch
  if (!sketchView && cam.planar && has('shadows') && scene.instances.length) drawShadows(ctx, C, scene, cam, canvas, k);
  const tShadow = performance.now();

  // ---- line work; the outer silhouettes are stroked at the silhouette stroke before the paper goes down, so the
  // paper covers their inner half and leaves one outline outside it (drawing-bodies.md: stroke, then fill)
  const tPaper0 = performance.now();
  const lw = state.lw = scene.instances.length ? lineWork(scene, cam, buf, k, { minEdgePx: LW.minEdgePx, minSilPx: LW.minSilPx }) : null;
  const tWork = performance.now();
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (lw) { ctx.globalAlpha = faint; ctx.strokeStyle = C.ink; ctx.lineWidth = LW.sil; ctx.stroke(lw.silOuter); ctx.globalAlpha = 1; }

  // ---- the parts' paper, then tone on faces through masks
  let overhang = null;
  if (scene.instances.length) {
    const O = off(canvas, bw, bh), tones = [];
    const sel = o.selection && o.selection.face != null ? faceSet(scene, [o.selection]) : null;
    if (sel && sel.any) tones.push({ set: sel.set, col: rgba32(C.red), width: K.hatch * 1.4 });
    if (has('overhang') && program.print && program.print.overhang) {
      overhang = program.print.overhang.flatMap(oh => (oh.faces || []).map(f => ({ body: oh.body, face: f })));
      const s = faceSet(scene, overhang); if (s.any) tones.push({ set: s.set, col: rgba32(C.warn), width: K.hatch * 1.4 });
    }
    const rect = paperImage(buf, O.u32, rgba32(C.stage), tones, k, K.hatchTile);
    if (rect) {
      O.x.putImageData(O.img, 0, 0, rect.x, rect.y, rect.w, rect.h);
      ctx.drawImage(O.c, rect.x, rect.y, rect.w, rect.h, rect.x / k, rect.y / k, rect.w / k, rect.h / k);
    }
  }
  const tPaper = performance.now();

  // ---- hidden lines, B-rep edges at the ring stroke, inner silhouettes at half the silhouette stroke (the outline
  // the paper leaves), then the overhang's outline and the selection
  if (lw) {
    if (has('hidden')) { ctx.globalAlpha = 0.75 * faint; ctx.strokeStyle = C.muted; ctx.lineWidth = K.ring * 1.2; ctx.setLineDash(K.dashHidden); ctx.stroke(lw.hid); ctx.stroke(lw.silHid); ctx.setLineDash([]); }
    ctx.globalAlpha = LW.ringAlpha * faint; ctx.strokeStyle = C.ink; ctx.lineWidth = LW.ring; ctx.stroke(lw.vis);
    // tangent edges (where a fillet meets its neighbours) fainter still: they mark a change of surface, not a corner
    ctx.globalAlpha = LW.tangentAlpha * faint; ctx.stroke(lw.tan);
    // silhouettes over a shallow step (engraving, lettering, a small pocket's rim): a little over an edge's weight
    ctx.globalAlpha = LW.softAlpha * faint; ctx.lineWidth = LW.soft; ctx.stroke(lw.silSoft);
    // inner silhouettes, and the outer ones again, at the half the paper leaves visible: this also hides the pixel
    // steps of the paper's raster edge under the outline
    ctx.globalAlpha = faint; ctx.lineWidth = LW.sil / 2; ctx.stroke(lw.sil); ctx.stroke(lw.silOuter);
    ctx.globalAlpha = 1;
    if (overhang) strokeFaces(ctx, state, overhang, C.warn, 1.2, true);
    if (o.selection && !o.selection.sketch) strokeSelection(ctx, C, state, o.selection);
  }
  ctx.restore();
  const tLines = performance.now();

  // ---- overlays
  if (!sketchView && !thumb) {
    if (has('normals')) drawNormals(ctx, C, state);
    if (has('dims') && scene.instances.length) drawBoxDims(ctx, C, state);
    // plate labels when there is more than one plate: outside each bed's front-left corner
    if (scene.bed && scene.bed.plates.length > 1 && cam.planar) for (const pl of scene.bed.plates) {
      const band = Math.min(10, Math.max(3, (scene.bed.x1 - scene.bed.x0) * 0.025));
      const p = proj(cam, [scene.bed.x0 + pl.ox - band, scene.bed.y0 - band, 0]);
      label(ctx, C, `PLATE ${pl.index}`, p, { dx: -6, dy: 8, align: 'right', size: K.labelSm, tone: 'muted' });
    }
  }
  if (sk) state.sketchLayout = drawSketch(ctx, C, cam, sk, thumb ? (() => false) : has, { dragging: o.dragging, hoverRef: o.hoverRef, selected: thumb ? null : o.selection });
  if (o.hover && has('names')) drawHover(ctx, C, state, o.hover);

  // ---- furniture
  ctx.globalAlpha = 1;
  if (thumb) { state.ms = performance.now() - t0; return state; }
  if (sk) { const st = sketchStatus(sk); text(ctx, C, `SKETCH ${sk.id} · ${st.text}`, K.inset, K.inset + 6, { size: K.label, col: toneOf(C, st.tone) }); }
  state.scaleBar = scaleBar(ctx, C, cam);
  if (o.titleBlock !== false) state.title = titleBlock(ctx, C, cam, titleRows(program, scene, view, cam, sk), o.sheet || 'J-01');
  state.ms = performance.now() - t0;
  state.timing = { raster: tRaster - t0, shadow: tShadow - tRaster, linework: tWork - tPaper0, paper: tPaper - tWork, stroke: tLines - tPaper, lines: tLines - tRaster, total: state.ms };
  return state;
}

export function renderSheet(canvas, program, view, options = {}) {
  const s = draw(canvas, program, view, options);
  return { width: s.width, height: s.height, ms: s.ms };
}

// line weights: the sheet's tokens, and a thumbnail's (about 200 × 140 px: a lighter outline, edges under 3 px and
// silhouette scraps under 2.5 px left out)
const SHEET_LINES = { sil: K.silhouette, ring: K.ring, ringAlpha: K.ringAlpha, tangentAlpha: K.ringAlpha * 0.45, soft: 0.8, softAlpha: 0.85, minEdgePx: 0, minSilPx: 5 };
const THUMB_LINES = { sil: 1.5, ring: 0.5, ringAlpha: 0.75, tangentAlpha: 0.25, soft: 0.6, softAlpha: 0.8, minEdgePx: 3, minSilPx: 2.5 };

// a thumbnail's camera: the named view (plus any orbit), scaled so the parts' projected vertices fill the sheet with
// a few pixels to spare (a little more under an elevation, for its ground line), centred on them
export function tightCam(view, scene, W, H) {
  const vw = VIEWS[view.name] || VIEWS.axo;
  const pitch = Math.max(-0.05, Math.min(Math.PI / 2, vw.pitch + (view.pitch || 0))), yaw = vw.yaw + (view.yaw || 0);
  const c0 = makeCam(yaw, pitch, 1, [0, 0, 0], W, H), r = c0.r, u = c0.u;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const inst of scene.instances) {
    const P = inst.P, n = P.length / 3, step = Math.max(1, Math.floor(n / 40000));
    for (let i = 0; i < n; i += step) {
      const x = P[3 * i] * r[0] + P[3 * i + 1] * r[1] + P[3 * i + 2] * r[2], y = P[3 * i] * u[0] + P[3 * i + 1] * u[1] + P[3 * i + 2] * u[2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!(x1 >= x0)) { const cam = viewCam(view, scene.box, W, H); return cam; }
  const pad = Math.max(6, Math.min(W, H) * 0.07), padB = c0.planar ? pad : pad + 6;
  const s = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (H - pad - padB) / Math.max(1e-6, y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - (padB - pad) / 2 / s;
  const cam = makeCam(yaw, pitch, s, [r[0] * cx + u[0] * cy, r[1] * cx + u[1] * cy, r[2] * cx + u[2] * cy], W, H);
  cam.base = s; cam.thumb = true;
  return cam;
}

// ---- parts
function gridExtent(scene) { const b = scene.box; return boxOk(b) ? Math.max(...boxSize(b)) * 4 + 50 : 500; }

function drawShadows(ctx, C, scene, cam, canvas, k) {
  const z0 = scene.floorZ, sx = SUN[0] / -SUN[2], sy = SUN[1] / -SUN[2], lx = -SUN[0], ly = -SUN[1], lz = -SUN[2];
  const T = cam.T, r = cam.r, u = cam.u, s = cam.s * k, X0 = cam.W / 2 * k, Y0 = cam.Y0 * k;
  const O = off(canvas, canvas.width, canvas.height), w = canvas.width, h = canvas.height;
  if (!O.cover || O.cover.length !== w * h) { O.cover = new Uint8Array(w * h); O.coverRect = null; }
  else if (O.coverRect) { const c = O.coverRect; for (let y = c.y0; y <= c.y1; y++) O.cover.fill(0, y * w + c.x0, y * w + c.x1 + 1); }
  const rect = { x0: w, y0: h, x1: -1, y1: -1 };
  for (const inst of scene.instances) {
    const P = inst.P, N = inst.N, I = inst.body.mesh.indices, n = P.length / 3;
    const Q = inst._Q && inst._Q.length === n * 2 ? inst._Q : (inst._Q = new Float32Array(n * 2));
    for (let i = 0; i < n; i++) {
      const hh = Math.max(0, P[3 * i + 2] - z0), x = P[3 * i] + sx * hh - T[0], y = P[3 * i + 1] + sy * hh - T[1], z = z0 - T[2];
      Q[2 * i] = X0 + (x * r[0] + y * r[1] + z * r[2]) * s; Q[2 * i + 1] = Y0 - (x * u[0] + y * u[1] + z * u[2]) * s;
    }
    // the lit side only: every shadow point is covered by exactly the triangles facing the sun
    coverTriangles(O.cover, w, h, Q, I, t => N[3 * t] * lx + N[3 * t + 1] * ly + N[3 * t + 2] * lz > 1e-4, rect);
  }
  O.coverRect = rect.x1 >= rect.x0 ? rect : null;
  if (rect.x1 < rect.x0) return;
  const m = hatchImage(O.cover, w, O.u32, rect, rgba32(C.shadow), k, K.hatch, K.hatchTile);
  O.x.putImageData(O.img, 0, 0, m.x, m.y, m.w, m.h);
  ctx.drawImage(O.c, m.x, m.y, m.w, m.h, m.x / k, m.y / k, m.w / k, m.h / k);
}

// global face ids of [{ body, face }] across every instance of each body
function faceSet(scene, refs) {
  const set = new Uint8Array(scene.faceCount + 1); let any = false;
  for (const ref of refs) for (const inst of scene.instances) {
    if (!sameBody(inst, ref.body)) continue;
    if (ref.face == null) continue;
    set[inst.base + ref.face] = 1; any = true;
  }
  return { set, any };
}

// the outline of some faces in one hue: visible runs solid, hidden runs dashed (an overhang faces down, out of sight)
function strokeFaces(ctx, state, refs, col, width, hidden) {
  const { scene, lw } = state;
  const want = (inst, e) => refs.some(r => sameBody(inst, r.body) && e.faces && e.faces.includes(r.face));
  const path = (runs) => { const p = new Path2D(); for (const r of runs || []) { p.moveTo(r[0], r[1]); for (let j = 2; j < r.length; j += 2) p.lineTo(r[j], r[j + 1]); } return p; };
  ctx.save(); ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  scene.instances.forEach((inst, ii) => (inst.body.edges || []).forEach((e, ei) => {
    if (!want(inst, e)) return;
    ctx.lineWidth = width; ctx.setLineDash([]); ctx.stroke(path(lw.runs[ii] && lw.runs[ii][ei]));
    if (hidden) { ctx.lineWidth = width * 0.8; ctx.setLineDash(K.dashHidden); ctx.stroke(path(lw.hidRuns[ii] && lw.hidRuns[ii][ei])); }
  }));
  ctx.restore();
}

// the selected face's visible edges and the selected edge, in the selection hue
function strokeSelection(ctx, C, state, sel) {
  const { scene, lw } = state;
  ctx.save(); ctx.strokeStyle = C.red; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  scene.instances.forEach((inst, ii) => {
    if (!sameBody(inst, sel.body)) return;
    (inst.body.edges || []).forEach((e, ei) => {
      const runs = lw.runs[ii] && lw.runs[ii][ei]; if (!runs || !runs.length) return;
      const isEdge = sel.edge === ei, onFace = sel.face != null && e.faces && e.faces.includes(sel.face);
      if (!isEdge && !onFace) return;
      ctx.lineWidth = isEdge ? K.silhouette * 1.1 : 1.2;
      ctx.beginPath(); for (const r of runs) { ctx.moveTo(r[0], r[1]); for (let j = 2; j < r.length; j += 2) ctx.lineTo(r[j], r[j + 1]); } ctx.stroke();
    });
  });
  ctx.restore();
}

// hover: the face's (or edge's) persistent name beside the pointer in st-green (names of places), its edges at 1 px
export function drawHover(ctx, C, state, hv) {
  const { scene, lw } = state;
  if (!lw || !hv) return;
  ctx.save(); ctx.strokeStyle = C.green; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  scene.instances.forEach((inst, ii) => {
    if (!sameBody(inst, hv.body)) return;
    (inst.body.edges || []).forEach((e, ei) => {
      const runs = lw.runs[ii] && lw.runs[ii][ei]; if (!runs || !runs.length) return;
      const isEdge = hv.edge === ei, onFace = hv.edge == null && hv.face != null && e.faces && e.faces.includes(hv.face);
      if (!isEdge && !onFace) return;
      ctx.lineWidth = isEdge ? 2 : 1;
      ctx.beginPath(); for (const r of runs) { ctx.moveTo(r[0], r[1]); for (let j = 2; j < r.length; j += 2) ctx.lineTo(r[j], r[j + 1]); } ctx.stroke();
    });
  });
  if (hv.name && hv.at) label(ctx, C, hv.name, hv.at, { dx: 12, dy: -12, size: K.labelSm, tone: 'green', bg: true });
  ctx.restore();
}

// the Normals overlay: an arrow along each visible face's normal from its centre, a tenth of the part's size long
function drawNormals(ctx, C, state) {
  const { scene, cam, buf, k } = state, b = scene.box, L = boxOk(b) ? V.len(V.sub(b[1], b[0])) * 0.1 : 5;
  for (const inst of scene.instances) for (const [fi, f] of (inst.body.faces || []).entries()) {
    if (!f.center || !f.normal) continue;
    const c = applyM(inst.M, f.center), n = V.norm(applyDir(inst.M, f.normal));
    if (V.dot(n, cam.c) < -0.05) continue;
    const p = proj(cam, c), px = Math.floor(p[0] * k), py = Math.floor(p[1] * k);
    if (px >= 0 && py >= 0 && px < buf.w && py < buf.h) { const id = buf.id[py * buf.w + px]; if (id >= 0 && id !== inst.base + fi && V.dot(V.sub(c, cam.T), cam.c) < buf.depth[py * buf.w + px] - 2 / cam.s) continue; }
    arrow(ctx, p, proj(cam, V.add(c, V.mul(n, L))), C.violet);
  }
}

// the Dims overlay: the bounding box's three extents as dimension lines in st-blue, each on the outermost edge of
// the box along it, 22 px out; an extent seen end-on is skipped. On a bed with several items the dimensions are the
// first plate's items' overall box: per-body dimensions ran across the neighbouring parts (round 2, on real plates).
function drawBoxDims(ctx, C, state) {
  const { scene } = state;
  let insts = scene.instances;
  if (scene.bed && insts.length > 1) { const first = insts[0].plate; insts = insts.filter(i => i.plate === first); }
  const b = emptyBox();
  for (const inst of insts) { growBox(b, inst.box[0]); growBox(b, inst.box[1]); }
  if (boxOk(b)) boxDims(ctx, C, state, b);
}
function boxDims(ctx, C, state, b) {
  const { cam } = state;
  const corners = boxCorners(b), S = corners.map(p => proj(cam, p)), size = boxSize(b);
  for (let axis = 0; axis < 3; axis++) {
    const bit = 1 << axis;
    const d0 = [S[bit][0] - S[0][0], S[bit][1] - S[0][1]], L = Math.hypot(d0[0], d0[1]);
    if (L < 24 || size[axis] < 1e-6) continue;
    const dx = d0[0] / L, dy = d0[1] / L;
    let n = [-dy, dx];
    // dimension below a lying extent, to the right of a standing one
    if (Math.abs(dx) >= Math.abs(dy) ? n[1] < 0 : n[0] < 0) n = [-n[0], -n[1]];
    let best = -1, bv = -Infinity;
    for (let i = 0; i < 8; i++) if (!(i & bit)) { const v = (S[i][0] + S[i | bit][0]) / 2 * n[0] + (S[i][1] + S[i | bit][1]) / 2 * n[1]; if (v > bv + 1e-6) { bv = v; best = i; } }
    const reach = Math.max(...S.map(p => p[0] * n[0] + p[1] * n[1]));
    const pa = S[best], pb = S[best | bit], off = reach - (pa[0] * n[0] + pa[1] * n[1]) + 22;
    const off2 = reach - (pb[0] * n[0] + pb[1] * n[1]) + 22;
    const qa = [pa[0] + n[0] * off, pa[1] + n[1] * off], qb = [pb[0] + n[0] * off2, pb[1] + n[1] * off2];
    dimensionToBox(ctx, C, pa, pb, qa, qb, fmtNum(size[axis]) + ' mm');
  }
}
const dimensionToBox = (ctx, C, pa, pb, qa, qb, s) => dimensionTo(ctx, C, pa, pb, qa, qb, s, C.blue);

// a grid in the sketch's plane
function drawPlaneGrid(ctx, C, cam, sk) {
  const w = sketchToWorld(sk), { minor, major } = gridSteps(cam);
  const pl = sk.plane || {}, o = pl.origin || [0, 0, 0], x = pl.x || [1, 0, 0], y = pl.y || [0, 1, 0];
  const d = V.sub(cam.T, o), cx = V.dot(d, x), cy = V.dot(d, y), hw = cam.W / 2 / cam.s + minor, hh = cam.H / 2 / cam.s + minor;
  ctx.lineWidth = K.grid;
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? C.major : C.grid; ctx.beginPath();
    const isMajor = v => Math.abs(v / major - Math.round(v / major)) < 1e-6;
    for (let u = Math.ceil((cx - hw) / minor) * minor; u <= cx + hw; u += minor) { if (isMajor(u) !== !!pass) continue; const a = proj(cam, w([u, cy - hh])), b = proj(cam, w([u, cy + hh])); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let v = Math.ceil((cy - hh) / minor) * minor; v <= cy + hh; v += minor) { if (isMajor(v) !== !!pass) continue; const a = proj(cam, w([cx - hw, v])), b = proj(cam, w([cx + hw, v])); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
  // the sketch's axes through its origin, faint
  ctx.strokeStyle = C.major; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
  ctx.beginPath(); let a = proj(cam, w([cx - hw, 0])), b = proj(cam, w([cx + hw, 0])); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  a = proj(cam, w([0, cy - hh])); b = proj(cam, w([0, cy + hh])); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
}

// ---- title block rows
function titleRows(program, scene, view, cam, sk) {
  const p = program || {}, kind = KIND[p.kind] || 'PART', rows = [];
  const f = sceneFacts(scene);
  const size = f.size && scene.instances.length ? (() => { const b = emptyBox(); for (const i of scene.instances) { growBox(b, i.box[0]); growBox(b, i.box[1]); } return boxSize(b); })() : null;
  const sizeText = size ? `${size.map(v => fmtNum(v)).join(' × ')} mm` + (f.volume ? ` · ${fmtVolume(f.volume)}` : '') : '–';
  const vname = cam.sketch ? `Sketch ${cam.sketch}` : (VIEWS[view.name] || VIEWS.axo).name + ((view.yaw || view.pitch) ? ' · orbit' : '');
  const zoom = view.scale ? ` · ${fmtNum(cam.s, 2)} px/mm` : view.zoom && Math.abs(view.zoom - 1) > 1e-3 ? ` · ×${fmtNum(view.zoom, 2)}` : '';
  if (sk && (p.kind === 'sketch' || cam.sketch)) {
    rows.push(['SKETCH', `${sk.id}${p.name && p.name !== sk.id ? ' · ' + p.name : ''}`]);
    rows.push(['STATUS', sketchStatus(sk).text]);
    rows.push(['ENTITIES', `${(sk.entities || []).length} entities · ${(sk.constraints || []).length} constraints`]);
  } else if (p.kind === 'print' && p.print) {
    const pr = p.print, bed = pr.printer && pr.printer.bed;
    rows.push(['PRINT', p.name || '–']);
    rows.push(['PRINTER', `${pr.printer && pr.printer.name || 'printer'}${bed ? ' · ' + bed.map(v => fmtNum(v)).join(' × ') + ' mm' : ''}`]);
    const items = (pr.plates || []).reduce((s, pl) => s + (pl.items || []).length, 0);
    rows.push(['PLATES', `${(pr.plates || []).length} plate${(pr.plates || []).length === 1 ? '' : 's'} · ${items} part${items === 1 ? '' : 's'}`]);
    rows.push(['VOLUME', f.volume ? fmtVolume(f.volume) : '–']);
  } else {
    rows.push([kind, p.name || '–']);
    rows.push(['SIZE', sizeText]);
    rows.push(['FACES', `${f.faces} faces · ${f.edges} edges${f.bodies > 1 ? ` · ${f.bodies} bodies` : ''}`]);
  }
  rows.push(['VIEW', vname + zoom]);
  return rows;
}
