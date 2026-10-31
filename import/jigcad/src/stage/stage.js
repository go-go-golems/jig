// stage.js: createStage(element, host), the interactive drafting sheet of the workbench. Two canvases fill the
// element: the sheet (renderSheet's drawing, redrawn on change, coalesced to animation frames) and an overlay layer
// for what follows the pointer (hover names, a sketch point under the pointer). Gestures follow the Form Skate
// stage: drag to orbit (0.008 rad per px across, 0.006 down), Shift-, right- or middle-drag to pan, the wheel to
// zoom (0.25 to 5, about the pointer), double-click to square up; a drag starts after 4 px, so a click picks.
// In a sketch's own view a click picks a constraint (its glyph, its dimension) or an entity, and the pointer
// previews the mark under it (host.setHover); a point drags (solveSketch) once the pointer has moved 4 px.
import { draw, OVERLAYS, DEFAULT_OVERLAYS, activeSketch, drawHover } from './sheet.js';
import { normView, nearestView, unprojectPlane, VIEWS, ZOOM_MIN, ZOOM_MAX } from './camera.js';
import { onTheme, loadFonts, text, K } from './theme.js';
import { pickEdge } from './lines.js';
import { handles, hitMark, drawSketchHover, pickOf } from './sketch.js';
import { V, clamp } from './math.js';
import { sketchToWorld } from './scene.js';

const ORBIT = 0.008, PITCH = 0.006, THRESHOLD = 4;

export function createStage(element, host = {}, options = {}) {
  const doc = element.ownerDocument;
  if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
  const mk = (z) => { const c = doc.createElement('canvas'); Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block', zIndex: z }); element.appendChild(c); return c; };
  const canvas = mk(0), layer = mk(1);
  layer.style.pointerEvents = 'none';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', 'drafting sheet');
  const lctx = layer.getContext('2d');

  // a program that does not compile leaves the last good one on the sheet (the shell lays the fail banner over it);
  // with no last good one the failing program's partial bodies, if any, are drawn
  const shown = p => (p && p.ok === false && host.lastGood ? host.lastGood : p || null);
  let program = shown(host.program), selection = host.selection || null, hover = null, hoverHandle = null;
  let sketchHover = host.hover || null, hoverFromSheet = false;     // a previewed constraint or entity
  let view = normView(host.view ? { ...host.view, scale: null, target: null, overlays: undefined } : 'axo');
  const on = new Set(host.view && host.view.overlays ? [...host.view.overlays] : DEFAULT_OVERLAYS);
  const solved = new Map();          // sketch id → the last SketchData a drag returned
  let last = null, raf = 0, W = 0, H = 0, dead = false, fromHost = false, prevView = null;
  const offs = [];

  // ---- drawing
  function size() { const r = element.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height)); }
  function paint() {
    raf = 0; if (dead) return;
    if (!W || !H) size();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    last = draw(canvas, program, view, { width: W, height: H, dpr, overlays: on, selection, sketches: solved, sheet: options.sheet || (host.preset && host.preset.id) || 'J-01', colorsFrom: element, dragging: drag && drag.ref });
    // a sketch keeps the fit it was first drawn with, so solves and drags do not move the camera
    if (last.sketchView && !view.sketchFit && last.cam.fit) view = normView({ ...view, sketchFit: last.cam.fit });
    paintLayer();
  }
  function paintLayer() {
    const dpr = canvas.width / (W || 1);
    if (layer.width !== canvas.width || layer.height !== canvas.height) { layer.width = canvas.width; layer.height = canvas.height; }
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height); lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!last) return;
    if (hover && on.has('names')) drawHover(lctx, last.C, last, hover);
    if (sketchHover && last.sketchLayout && !samePick(sketchHover, selection)) drawSketchHover(lctx, last.C, last.sketchLayout, sketchHover);
    if (hoverHandle && last.sketch) {
      const C = last.C, q = hoverHandle.at;
      lctx.fillStyle = C.blue; lctx.fillRect(q[0] - 3, q[1] - 3, 6, 6);
      text(lctx, C, hoverHandle.ref, q[0] + 8, q[1] - 10, { size: K.labelSm, col: C.blue, bg: C.stage });
    }
  }
  const invalidate = () => { if (!raf && !dead) raf = requestAnimationFrame(paint); };

  // ---- view
  const pushView = () => {
    if (fromHost || !host.setView) return;
    try { host.setView({ name: view.name, yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, pan: view.pan.slice(), sketch: view.sketch, scale: last ? last.cam.s : null, target: last ? last.cam.T : null, overlays: new Set(on) }); } catch { /* the host may refuse */ }
  };
  function setView(patch = {}, quiet) {
    if (typeof patch === 'string') patch = { name: patch };
    const next = { ...view, ...patch };
    if (patch.name && patch.name !== view.name && patch.yaw === undefined && patch.pitch === undefined && patch.pan === undefined) { next.yaw = 0; next.pitch = 0; next.pan = [0, 0]; }
    if (patch.name === 'sketch' && !next.sketch) { const sk = activeSketch(program, { ...next, sketch: null }); next.sketch = sk ? sk.id : (program && program.sketches && program.sketches[0] && program.sketches[0].id) || null; }
    if (patch.name && patch.name !== 'sketch' && patch.sketch === undefined && !(program && program.kind === 'sketch')) next.sketch = null;
    if (next.name === 'sketch' && next.sketch !== view.sketch) next.sketchFit = null;
    if (patch.overlays) { on.clear(); for (const k of patch.overlays) on.add(k); delete next.overlays; }
    next.zoom = clamp(next.zoom || 1, ZOOM_MIN, ZOOM_MAX);
    if (next.name !== view.name || next.sketch !== view.sketch) { hover = null; hoverHandle = null; }
    view = normView(next);
    invalidate();
    if (!quiet) pushView();
  }
  function squareUp() {
    if (view.name === 'sketch') setView({ yaw: 0, pitch: 0, pan: [0, 0], zoom: 1, sketchFit: null, scale: null, target: null });
    else setView({ name: last ? nearestView(last.cam) : view.name, yaw: 0, pitch: 0, pan: [0, 0], zoom: 1, scale: null, target: null });
  }

  // ---- program and selection
  // a program that fails keeps the last good one on the sheet, but its sketches are still drawn as it solved them:
  // an over-constrained sketch fails the compile, and its conflict is what the sketch view has to show
  function setProgram(raw) {
    program = shown(raw); solved.clear(); hover = null; hoverHandle = null;
    if (raw && raw.ok === false && raw !== program) for (const s of raw.sketches || []) if (s && s.id) solved.set(s.id, s);
    if (program && program.kind === 'sketch' && program.sketches && program.sketches.length) {
      if (view.name !== 'sketch' || !program.sketches.some(s => s.id === view.sketch)) view = normView({ ...view, name: 'sketch', sketch: program.sketches[0].id, pan: [0, 0], sketchFit: null });
    } else if (view.sketch && !(program && (program.sketches || []).some(s => s.id === view.sketch))) view = normView({ ...view, name: view.name === 'sketch' ? (prevView && prevView.name) || 'axo' : view.name, sketch: null });
    invalidate();
  }
  const samePick = (a, b) => !!a && !!b && a.sketch === b.sketch && a.constraint === b.constraint && a.entity === b.entity;
  const isPick = s => !!(s && s.sketch && (s.constraint != null || s.entity != null));
  function setSheetHover(h) {
    if (!h && !hoverFromSheet) return;
    hoverFromSheet = !!h;
    if (host.setHover) host.setHover(h); else { sketchHover = h; paintLayer(); }
  }
  function sketchOfSelection(sel) {
    if (!sel || !program) return null;
    const list = program.sketches || [];
    if (sel.sketch && list.some(s => s.id === sel.sketch)) return sel.sketch;
    if (sel.body == null && sel.name && list.some(s => s.id === sel.name)) return sel.name;
    return null;
  }
  function setSelection(sel) {
    const was = selection;
    selection = sel || null;
    const sk = sketchOfSelection(selection);
    if (sk && (view.name !== 'sketch' || view.sketch !== sk)) { if (view.name !== 'sketch' && !isPick(selection)) prevView = { ...view }; setView({ name: 'sketch', sketch: sk, pan: [0, 0], zoom: 1 }); }
    // letting go of a constraint or an entity stays on its sketch; letting go of the sketch itself goes back
    else if (!sk && !isPick(was) && prevView && view.name === 'sketch' && !(program && program.kind === 'sketch')) { const pv = prevView; prevView = null; setView({ name: pv.name, yaw: pv.yaw, pitch: pv.pitch, pan: pv.pan, zoom: pv.zoom, sketch: null }); }
    invalidate();
  }

  // ---- picking
  function pickAt(x, y) {
    if (!last || !last.buf || !last.scene.instances.length) return null;
    const k = last.k, px = Math.floor(x * k), py = Math.floor(y * k), b = last.buf;
    if (px < 0 || py < 0 || px >= b.w || py >= b.h) return null;
    const id = b.id[py * b.w + px], ed = last.lw ? pickEdge(last.lw, x, y, 5) : null;
    if (id < 0 && !ed) return null;
    const ii = ed ? ed.inst : last.scene.faceInst[id], inst = last.scene.instances[ii], body = inst.body;
    const face = id >= 0 && last.scene.faceInst[id] === ii ? id - inst.base : null, edge = ed ? ed.edge : null;
    const name = edge != null ? body.edges[edge].name : face != null && body.faces[face] ? body.faces[face].name : body.id;
    return { body: body.id, face, edge, name, at: [x, y] };
  }
  function handleAt(x, y) {
    if (!last || !last.sketch) return null;
    const sk = last.sketch, w = sketchToWorld(sk), cam = last.cam;
    let best = null, bd = 7;
    for (const h of handles(sk)) {
      const p = w(h.p), dx = p[0] - cam.T[0], dy = p[1] - cam.T[1], dz = p[2] - cam.T[2];
      const sx = cam.W / 2 + (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) * cam.s, sy = cam.Y0 - (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) * cam.s;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = { ref: h.ref, at: [sx, sy], sketch: sk.id, entity: h.e.id }; }
    }
    return best;
  }
  function planePoint(sk, x, y) {
    const pl = sk.plane || {}, o = pl.origin || [0, 0, 0], ax = pl.x || [1, 0, 0], ay = pl.y || [0, 1, 0], n = pl.normal || V.cross(ax, ay);
    const p = unprojectPlane(last.cam, x, y, o, n); if (!p) return null;
    const d = V.sub(p, o); return [V.dot(d, ax), V.dot(d, ay)];
  }

  // ---- sketch drags: one solve in flight, the latest target sent on the next animation frame
  let drag = null;
  async function solveStep() {
    if (!drag || drag.busy || !drag.pending) return;
    const { sketch: id, ref } = drag, to = drag.pending; drag.pending = null; drag.busy = true;
    try {
      const r = host.solveSketch ? await host.solveSketch(id, { ref, to }) : null;
      const sk = r && (r.sketch || (r.entities ? r : null));
      if (sk && !dead) { solved.set(id, sk); invalidate(); }
    } catch (e) { if (host.toast) host.toast(`Sketch ${id}: ${e.message || e}`, 'error'); }
    if (!drag) return;
    drag.busy = false;
    if (drag.pending) requestAnimationFrame(solveStep);
  }

  // ---- gestures
  let down = null;
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function onDown(e) {
    if (e.button > 2) return;
    const [x, y] = local(e);
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    const h = e.button === 0 && !e.shiftKey ? handleAt(x, y) : null;
    if (h && host.solveSketch) {
      drag = { sketch: h.sketch, ref: h.ref, entity: h.entity, pending: null, busy: false, x, y, moved: false };
      hoverHandle = h; canvas.style.cursor = 'move';
      return;
    }
    const sketchPan = last && last.sketchView;
    down = { x, y, mode: e.shiftKey || e.button === 1 || e.button === 2 || sketchPan ? 'pan' : 'orbit', moved: false, yaw: view.yaw, pitch: view.pitch, pan: view.pan.slice(), s: last ? last.cam.s : 1 };
  }
  function onMove(e) {
    const [x, y] = local(e);
    if (drag) {
      const sk = last && last.sketch; if (!sk) return;
      if (!drag.moved) { if (Math.hypot(x - drag.x, y - drag.y) < THRESHOLD) return; drag.moved = true; setSheetHover(null); }
      const to = planePoint(sk, x, y); if (!to) return;
      drag.pending = to; hoverHandle = { ...hoverHandle, at: [x, y] }; paintLayer();
      if (!drag.busy) requestAnimationFrame(solveStep);
      return;
    }
    if (down) {
      const dx = x - down.x, dy = y - down.y;
      if (!down.moved && Math.hypot(dx, dy) < THRESHOLD) return;
      down.moved = true; hover = null; hoverHandle = null;
      canvas.style.cursor = down.mode === 'pan' ? 'move' : 'grabbing';
      if (down.mode === 'orbit') setView({ yaw: down.yaw + dx * ORBIT, pitch: clamp(down.pitch + dy * PITCH, -1, 1.6) }, true);
      else setView({ pan: [down.pan[0] - dx / down.s, down.pan[1] + dy / down.s] }, true);
      return;
    }
    // hover
    const h = handleAt(x, y);
    if (h && host.solveSketch) { hoverHandle = h; hover = null; setSheetHover(null); canvas.style.cursor = 'move'; paintLayer(); return; }
    hoverHandle = null;
    if (last && last.sketchView && last.sketchLayout) {
      // a sketch's marks: the one under the pointer is previewed here and in the inspector
      const m = hitMark(last.sketchLayout, x, y);
      hover = null; canvas.style.cursor = m ? 'pointer' : 'default';
      setSheetHover(m ? { sketch: last.sketch.id, ...m } : null);
      paintLayer();
      return;
    }
    const p = on.has('names') ? pickAt(x, y) : null;
    const same = p && hover && p.body === hover.body && p.face === hover.face && p.edge === hover.edge;
    hover = p; canvas.style.cursor = p ? 'pointer' : 'default';
    if (same) hover.at = p.at;
    paintLayer();
  }
  // a click in a sketch's view: a glyph or a dimension selects its constraint, a line or a circle its entity; a
  // point that was not dragged selects its coincidence when it has one, else its entity; empty paper lets go
  function clickSketch(x, y, handle) {
    const sk = last.sketch, L = last.sketchLayout;
    let m = hitMark(L, x, y);
    if (handle && !(m && m.constraint != null)) m = { entity: handle.entity };
    if (m) { const sel = { sketch: sk.id, ...m }; if (host.select) host.select(sel); else setSelection(sel); }
    else if (pickOf(sk, selection)) { if (host.select) host.select(null); else setSelection(null); }
  }
  function onUp(e) {
    if (drag) {
      const d = drag;
      if (!d.moved) { drag = null; canvas.style.cursor = 'default'; if (last && last.sketch && last.sketchLayout) clickSketch(...local(e), d); return; }
      if (d.pending && !d.busy) solveStep().then(() => { if (drag === d) drag = null; invalidate(); });
      else drag = null;
      canvas.style.cursor = 'default'; invalidate(); return;
    }
    if (!down) return;
    const d = down; down = null; canvas.style.cursor = 'default';
    if (d.moved) { pushView(); return; }
    if (e.button !== 0) return;
    if (last && last.sketchView && last.sketchLayout) { clickSketch(...local(e)); return; }
    const [x, y] = local(e), p = pickAt(x, y);
    const sel = p ? { body: p.body, face: p.face, edge: p.edge, name: p.name } : null;
    if (host.select) host.select(sel); else setSelection(sel);
  }
  let wheelT = 0;
  function onWheel(e) {
    e.preventDefault();
    const [x, y] = local(e), z0 = clamp(view.zoom || 1, ZOOM_MIN, ZOOM_MAX), z1 = clamp(z0 * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
    if (z1 === z0 || !last) return;
    // keep the point under the pointer where it is
    const s0 = last.cam.s, s1 = s0 * z1 / z0, ax = (x - last.cam.W / 2), ay = (last.cam.Y0 - y);
    setView({ zoom: z1, pan: [view.pan[0] + ax / s0 - ax / s1, view.pan[1] + ay / s0 - ay / s1] }, true);
    clearTimeout(wheelT); wheelT = setTimeout(pushView, 150);
  }
  const onLeave = () => { if (!down && !drag) { hover = null; hoverHandle = null; setSheetHover(null); paintLayer(); } };
  const onDbl = () => squareUp();
  const onCtx = e => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl); canvas.addEventListener('contextmenu', onCtx);

  // ---- host events, size, theme, fonts
  const sub = (ev, fn) => { if (host.on) { const off = host.on(ev, fn); if (typeof off === 'function') offs.push(off); } };
  sub('program', p => setProgram(p === undefined ? host.program : p));
  sub('selection', s => setSelection(s === undefined ? host.selection : s));
  sub('hover', h => { sketchHover = h === undefined ? host.hover : h; if (!sketchHover) hoverFromSheet = false; paintLayer(); });
  sub('theme', () => setTimeout(invalidate, 30));
  sub('view', v => {
    v = v || host.view; if (!v) return;
    const cur = { name: view.name, yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, sketch: view.sketch };
    const nxt = { name: v.name ?? cur.name, yaw: v.yaw ?? cur.yaw, pitch: v.pitch ?? cur.pitch, zoom: v.zoom ?? cur.zoom, sketch: v.sketch ?? cur.sketch };
    const sameOverlays = !v.overlays || (v.overlays.size === on.size && [...v.overlays].every(k => on.has(k)));
    if (JSON.stringify(cur) === JSON.stringify(nxt) && sameOverlays) return;
    fromHost = true; try { setView({ ...nxt, pan: v.pan || view.pan, overlays: v.overlays }); } finally { fromHost = false; }
  });
  offs.push(onTheme(invalidate, doc));
  const ro = new ResizeObserver(() => { size(); invalidate(); }); ro.observe(element);
  loadFonts(options.fontBase || 'fonts/').then(() => invalidate());
  size(); paint();

  const api = {
    setProgram, setView: p => setView(p), getView: () => ({ ...view, pan: view.pan.slice(), overlays: new Set(on) }),
    overlays: () => OVERLAYS.map(o => ({ key: o.key, label: o.label, about: o.about, on: on.has(o.key) })),
    setOverlay(name, value = !on.has(name)) { if (value) on.add(name); else on.delete(name); if (name === 'names' && !value) hover = null; invalidate(); pushView(); },
    squareUp, redraw: () => { if (raf) cancelAnimationFrame(raf); paint(); },
    select: setSelection,
    toPNG: () => { if (raf) { cancelAnimationFrame(raf); paint(); } return canvas.toDataURL('image/png'); },
    destroy() {
      dead = true; if (raf) cancelAnimationFrame(raf);
      for (const off of offs) try { off(); } catch { /* already gone */ }
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl); canvas.removeEventListener('contextmenu', onCtx);
      canvas.remove(); layer.remove();
      if (element.jigStage === api) delete element.jigStage;
    },
    _state: () => last,
    VIEWS,
  };
  element.jigStage = api;          // for tests and the console: the sheet's last drawing (marks, camera) by element
  return api;
}
