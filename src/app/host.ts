// host.js — the workbench engine: presets and their files, the build (files → scene → compiled → GPU), params,
// the clock, the live world (handles the agent and the inspector mutate), picking, screenshots.
import { build, formatDiag, API, explain, irText, irGraph, paramStore, test, fragments } from '../engine/candela';
import { Viewport } from '../engine/viewport';
import { compOf, matches, allIds } from '../engine/scene';
import { vec3 as V, inv34, xfPoint, xfDir, compile } from '../engine/compile';
import { fmtLoc, CandelaError, didYouMean } from '../engine/diag';
import { parseQuantity, isQ, fmtNum } from '../engine/units';
import { isParam } from '../engine/params';
import { rayMesh } from '../engine/mesh';
import { assets, parseHDR, fromRGBA8 } from '../engine/hdri';
import { RenderQueue } from '../engine/output';
import { stepBehaviors } from '../engine/session';
import type { Preset, Doc } from '../content/catalog';

const NS = 'candela.v1.';
export const store = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { if (v === undefined) localStorage.removeItem(NS + k); else localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

export class Host {
  // set by the UI: the viewport's canvas, whether the user is dragging the camera, the workbench capture
  canvas: HTMLCanvasElement | null;
  interacting: boolean;
  captureWorkbench: (maxW?: number) => Promise<HTMLCanvasElement>;
  builtins: Preset[];
  docs: Doc[];
  reference: string;
  mine: Preset[];
  listeners: Set<any>;
  version: number;
  toasts: any;
  preset: Preset;
  /** the project's files: path → source (edits included) */
  files: Record<string, string>;
  notes: string;
  result: any;
  diags: any;
  logs: any;
  buildInfo: any;
  compileError: any;
  vp: Viewport | null;
  running: any;
  time: any;
  speed: number;
  selection: any;
  focusReq: any;
  view: any;
  freeCam: any;
  history: any;
  assetVersion: number;
  queue: RenderQueue;
  _timeBefore: any;
  rendering: boolean;
  saveFiles: any;
  anim: any;
  state: any;
  _bErr: boolean;
  _saveT: ReturnType<typeof setTimeout>;
  _seq: any;
  building: boolean;
  behaviors: any;
  compiling: boolean;
  _vpReady: any;
  _pt: ReturnType<typeof setTimeout>;
  _raf: number;
  _panelT: ReturnType<typeof setTimeout>;
  constructor({ presets, docs, reference }) {
    this.builtins = presets; this.docs = docs; this.reference = reference;
    this.mine = store.get('mine', []);
    this.listeners = new Set(); this.version = 0; this.toasts = [];
    this.preset = null!; this.files = {}; this.notes = '';   // preset: set by loadPreset() before first use
    this.result = null; this.diags = []; this.logs = []; this.buildInfo = null; this.compileError = null;
    this.vp = null; this.running = true; this.time = 0; this.speed = 1; this.selection = null; this.focusReq = null;
    this.view = { aov: 'beauty', tonemap: null, falseColor: null, denoise: null, evComp: 0, engine: store.get('engineMode', 'scene'), backend: store.get('backend', 'auto'), quality: 1 };
    this.freeCam = null; this.history = []; this.assetVersion = 0;
    paramStore.onChange(p => this.onParam(p));
    // the render queue: stills and sequences at a fixed size, saved through the page's downloads
    this.queue = new RenderQueue(() => ({ vp: this.vp, seek: (t, dt) => this.seek(t, dt), onDone: j => (j.opts.autosave !== false ? this.saveFiles(j.files) : null), onFinish: () => this.afterRender() }), () => { const r = !!this.queue.running; if (r && !this.rendering) this._timeBefore = this.time; this.rendering = r; this.notify(); });
    // the UI installs a saver (the page's downloads); headless, files stay on the job
    this.saveFiles = async () => false;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { this.version++; for (const fn of this.listeners) { try { fn(this.version); } catch (e) { console.error(e); } } }
  toast(msg, bad = false) { const t = { id: Math.random(), msg, bad }; this.toasts.push(t); this.notify(); setTimeout(() => { this.toasts = this.toasts.filter(x => x !== t); this.notify(); }, bad ? 5200 : 2600); }
  focus(req) { this.focusReq = Object.assign({ n: (this.focusReq ? this.focusReq.n : 0) + 1 }, req); this.notify(); }

  // ---------- presets ----------
  allPresets() { return this.builtins.concat(this.mine); }
  presetById(id) { return this.allPresets().find(p => p.id === id) || null; }
  loadPreset(id, o: Record<string, any> = {}) {
    const p = this.presetById(id) || this.builtins[0];
    this.preset = p; store.set('preset', p.id);
    const ed = o.discard ? null : store.get('edits:' + p.id, null);
    this.files = Object.assign({}, p.files, ed && ed.files || {});
    this.notes = ed && ed.notes != null ? ed.notes : (p.notes || '');
    paramStore.reset(); this.selection = null; this.freeCam = null; this.time = p.time || 0; this.anim = new Map(); this.state = {}; this._bErr = false;
    // some presets open on a still frame (it converges; motion blur still shows the motion): Pause runs the clock
    this.running = !p.paused;
    this.view.evComp = 0;
    if (p.focus) for (const v of ([] as any[]).concat(p.focus)) this.focus({ view: v });
    this.build({ fresh: true });
    this.notify();
    return p;
  }
  isDirty(path?: string) { const orig = this.preset.files; return path ? orig[path] !== this.files[path] : Object.keys(this.files).some(k => orig[k] !== this.files[k]) || Object.keys(orig).some(k => !(k in this.files)); }
  notesDirty() { return (this.preset.notes || '') !== this.notes; }
  saveEdits() { const orig = this.preset.files, files: Record<string, any> = {}; for (const [k, v] of Object.entries(this.files)) if (orig[k] !== v) files[k] = v; const notes = this.notesDirty() ? this.notes : null; store.set('edits:' + this.preset.id, Object.keys(files).length || notes != null ? { files, notes } : undefined); }
  saveEditsSoon() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.saveEdits(), 400); }
  setFile(path, src) { this.files[path] = src; this.saveEditsSoon(); this.notify(); }
  setNotes(md) { this.notes = md; this.saveEditsSoon(); this.notify(); }
  newFile(path, src = '') { if (this.files[path] != null) return false; this.files[path] = src; this.saveEditsSoon(); this.notify(); return true; }
  deleteFile(path) { if (path === 'scene.js') return false; delete this.files[path]; this.saveEditsSoon(); this.notify(); return true; }
  revertFile(path) { const orig = this.preset.files; if (orig[path] != null) this.files[path] = orig[path]; else delete this.files[path]; this.saveEdits(); this.notify(); }
  revertAll() { store.set('edits:' + this.preset.id, undefined); this.loadPreset(this.preset.id, { discard: true }); this.toast('Back to the preset as published'); }
  saveAsMine(title) {
    const n = this.mine.length + 1, id = 'U-' + String(n).padStart(2, '0');
    const p = { id, title: title || (this.preset.title + ' (mine)'), group: 'Mine', about: 'Saved from ' + this.preset.id, tries: this.preset.tries || [], files: Object.assign({}, this.files), notes: this.notes };
    this.mine.push(p); store.set('mine', this.mine); this.loadPreset(id); this.toast(`Saved as ${id}`); return p;
  }
  deleteMine(id) { this.mine = this.mine.filter(p => p.id !== id); store.set('mine', this.mine); store.set('edits:' + id, undefined); if (this.preset.id === id) this.loadPreset(this.builtins[0].id); this.notify(); }
  exportProject() { return { format: 'candela-project', version: 1, preset: this.preset.id, title: this.preset.title, files: this.files, notes: this.notes, params: Object.fromEntries(paramStore.values) }; }
  importProject(obj) { if (!obj || obj.format !== 'candela-project' || !obj.files) throw new Error('not a Candela project file'); const n = this.mine.length + 1, id = 'U-' + String(n).padStart(2, '0'); const p = { id, title: (obj.title || 'Imported') + ' (imported)', group: 'Mine', about: 'Imported', files: obj.files, notes: obj.notes || '' }; this.mine.push(p); store.set('mine', this.mine); this.loadPreset(id); return p; }

  // ---------- build ----------
  async build(o: Record<string, any> = {}) {
    const seq = this._seq = (this._seq || 0) + 1;
    this.building = true; this.notify();
    const files = Object.assign({}, this.files);
    if (this.view.engine !== 'scene') files.__engineOverride = this.view.engine;
    const r = await build(this.files, { scope: { world: this.world(), host: undefined } });
    if (seq !== this._seq) return r;   // a newer build started
    this.result = r; this.diags = r.diags; this.logs = r.logs;
    this.buildInfo = { ok: r.ok, ms: r.ms, at: Date.now(), message: r.error ? r.error.message : null };
    this.compileError = null;
    if (r.ok) {
      let compiled = r.compiled;
      if (this.view.engine !== 'scene') {
        const E = API.engine[this.view.engine]; if (E) { compiled = compile(r.scene, E(), {}); r.compiled = compiled; }
      }
      compiled.animation = r.animation || null;
      this.behaviors = compiled.behaviors;
      if (this.vp) await this.loadIntoViewport(compiled, seq);
    }
    this.building = false; this.notify();
    return r;
  }
  async loadIntoViewport(compiled, seq?) {
    try {
      this.compiling = true; this.notify();
      await this.vp!.load(compiled, { time: this.time });
      if (this.freeCam) this.vp!.setView(this.freeCam);
      this.applyView();
      this.compileError = null;
    } catch (e) {
      this.compileError = { message: e.message, errors: e.shaderErrors || [], source: e.source || '' };
      this.diags = this.diags.concat([{ severity: 'error', code: 'E700', message: 'shader compile failed: ' + e.message, loc: null }]);
      console.error(e);
    } finally { this.compiling = false; this.notify(); }
  }
  attachCanvas(canvas) {
    if (this.vp && this.vp.canvas === canvas) return this.vp;
    this.vp = new Viewport(canvas);
    this._vpReady = this.vp.init(this.view.backend).then(() => { this.notify(); if (this.result && this.result.ok) return this.loadIntoViewport(this.result.compiled); }).catch(e => { this.compileError = { message: e.message }; this.toast(e.message, true); this.notify(); });
    return this.vp;
  }
  applyView() { const vp = this.vp; if (!vp) return; vp.aov = this.view.aov; vp.tonemapOverride = this.view.tonemap; vp.falseColorOverride = this.view.falseColor; vp.denoiseOverride = this.view.denoise; vp.evComp = this.view.evComp; }
  setView(k, v) { this.view[k] = v; if (k === 'engine') { store.set('engineMode', v); this.build({}); } else if (k === 'backend') { store.set('backend', v); this.toast('The backend changes on reload'); } this.applyView(); if (this.vp) this.vp.show && this.vp.compiled && this.vp.show(); this.notify(); }

  // ---------- params ----------
  onParam(p) {
    if (!this.result || !this.result.ok) return;
    if (p && p.isStatic) { clearTimeout(this._pt); this._pt = setTimeout(() => this.build({}), 30); return; }
    if (this.vp && this.vp.compiled) { this.vp.repack(this.time); }
    this.notify();
  }
  params() { return paramStore.order.map(id => paramStore.defs.get(id)).filter(Boolean); }

  // ---------- the clock ----------
  start() {
    let last = 0;
    const loop = now => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      this.tick(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._panelT = setInterval(() => { if (this.vp && this.vp.compiled) this.notify(); }, 250);
  }
  tick(dt) {
    const vp = this.vp; if (!vp || !vp.compiled || this.compiling || this.rendering) return;
    const c = vp.compiled;
    const animated = c.moving.time || (this.behaviors && this.behaviors.length) || vp.animated;
    if (animated && this.running) {
      this.time += dt * this.speed;
      const moved = this.behaviors && this.behaviors.length ? this.runBehaviors(dt) : false;
      if (c.moving.time || moved || vp.animated) { vp.overrides = this.anim; vp.repack(this.time); }
    }
    if (this.interacting) vp.dynScale = 0.5; else if (vp.dynScale !== 1) { vp.dynScale = 1; vp.reset(); }
    if (document.hidden) return;
    vp.frame({ time: this.time });
  }
  // behaviours run on the host every frame; they move objects through transform overrides (a repack, never a recompile)
  runBehaviors(dt) {
    this.anim = this.anim || new Map(); this.state = this.state || {};
    return stepBehaviors(this.behaviors, { anim: this.anim, state: this.state }, {
      t: this.time, dt, world: this.world(),
      onError: m => { if (!this._bErr) { this._bErr = true; this.toast(m, true); } },
    });
  }
  setRunning(on) { this.running = on; this.notify(); }
  // move the scene to time t (renders, the timeline): behaviours step by dt, poses and fields of time follow
  seek(t, dt = 0) {
    const vp = this.vp; if (!vp || !vp.compiled) return;
    if (dt === 0 && t < this.time - 1e-9) { this.anim = new Map(); this.state = {}; }
    this.time = t;
    if (this.behaviors && this.behaviors.length) this.runBehaviors(dt);
    vp.overrides = this.anim; vp.repack(t);
    this.notify();
  }
  // poses from an animation engine outside the workbench: { id: pose } (16-number column-major matrix,
  // { position, quaternion | rotation, scale }), or a function of time returning that; null clears
  setPoses(p) { if (!this.vp) throw new Error('the viewport is not running'); this.vp.setPoses(p); this.notify(); return this.vp.packed ? { ok: true, moving: this.vp.packed.moving } : { ok: true }; }

  // ---------- assets: images dropped on the workbench (HDRIs) ----------
  async addAssetFile(file) {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'image';
    let img: any;
    if (/\.hdr$|\.pic$/i.test(file.name)) img = parseHDR(new Uint8Array(await file.arrayBuffer()));
    else {
      const bmp = await createImageBitmap(file); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0); img = fromRGBA8(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    }
    img.name = name; assets.set(name, img); this.assetVersion++;
    this.toast(`Asset '${name}' (${img.width}×${img.height}) — use it with light.env.hdri('${name}')`);
    if (this.result && !this.result.ok) this.build({}); else this.notify();
    return { name, width: img.width, height: img.height };
  }
  assetList() { return assets.list(); }

  // ---------- renders ----------
  // after the queue empties: the clock and the scene go back to where they were
  afterRender() { if (this.queue.running || this.queue.jobs.some(j => j.status === 'queued')) return; this.rendering = false; if (this._timeBefore != null) { const t = this._timeBefore; this._timeBefore = null; this.seek(t, 0); } this.notify(); }
  render(opts) {
    if (!this.vp || !this.vp.compiled) throw new Error('nothing is loaded to render');
    const base = opts.name || (this.preset ? this.preset.id : 'candela');
    return this.queue.add(Object.assign({ name: base }, opts));
  }

  // ---------- camera ----------
  sceneCamera() { if (this.vp && this.vp.cam && !this.freeCam) return { at: this.vp.cam.at.slice(), target: this.vp.cam.target.slice() }; const c = this.result && this.result.compiled && this.result.compiled.cameraComp; const p = c ? c.props : null; const val = v => typeof v === 'number' ? v : isQ(v) ? v.v : isParam(v) ? v.value : v; return p ? { at: p.at.map(val), target: p.target.map(val) } : { at: [0, 1.2, 5], target: [0, 0.5, 0] }; }
  orbit(dx, dy, mode) {
    const base = this.freeCam || this.sceneCamera();
    const at = base.at.slice(), tgt = base.target.slice();
    if (mode === 'pan') {
      const f = V.norm(V.sub(tgt, at)), r = V.norm(V.cross(f, [0, 1, 0])), up = V.cross(r, f), d = V.len(V.sub(tgt, at)) * 0.0015;
      const off = V.add(V.mul(r, -dx * d), V.mul(up, dy * d));
      this.freeCam = { at: V.add(at, off), target: V.add(tgt, off) };
    } else if (mode === 'zoom') {
      const v = V.sub(at, tgt); const k = Math.exp(dy * 0.0015);
      this.freeCam = { at: V.add(tgt, V.mul(v, k)), target: tgt };
    } else {
      const v = V.sub(at, tgt), r = V.len(v);
      let az = Math.atan2(v[0], v[2]), el = Math.asin(Math.max(-1, Math.min(1, v[1] / r)));
      az -= dx * 0.006; el = Math.max(-1.45, Math.min(1.45, el + dy * 0.006));
      this.freeCam = { at: [tgt[0] + r * Math.cos(el) * Math.sin(az), tgt[1] + r * Math.sin(el), tgt[2] + r * Math.cos(el) * Math.cos(az)], target: tgt };
    }
    if (this.vp) this.vp.setView(this.freeCam);
  }
  resetCamera() { this.freeCam = null; if (this.vp) this.vp.setView(null); this.notify(); }

  // ---------- picking: CPU rays against the packed objects ----------
  pick(nx, ny) {
    const vp = this.vp; if (!vp || !vp.packed || !vp.cam) return null;
    const cam = vp.cam, ndc = [nx * 2 - 1, 1 - ny * 2];
    const d = V.norm(V.add(cam.U4.slice(0, 3), V.add(V.mul(cam.U2.slice(0, 3), ndc[0]), V.mul(cam.U3.slice(0, 3), ndc[1]))));
    const o = cam.U1.slice(0, 3), O = vp.packed.O, n = vp.packed.nObjs;
    let best = 1e30, bi = -1;
    let face = -1;
    for (let k = 0; k < n; k++) {
      const b = k * 24, ty = O[b], M = Array.from(O.subarray(b + 4, b + 16)), pr = O.subarray(b + 16, b + 20);
      if ((O[b + 3] | 0) & 1) continue;
      const lo = xfPoint(M, o), ld = xfDir(M, d);
      if (ty === 13) {
        const def = vp.compiled.objects[O[b + 21] | 0].def, h = def ? rayMesh(def, lo, ld, best) : null;
        if (h && h.t > 1e-4 && h.t < best) { best = h.t; bi = O[b + 21] | 0; face = h.face; }
        continue;
      }
      const t = hitLocal(ty, lo, ld, pr, O[b + 23]);
      if (t > 1e-4 && t < best) { best = t; bi = O[b + 21] | 0; face = -1; }
    }
    if (bi < 0) return null;
    const ob = vp.compiled.objects[bi];
    const out = { index: bi, id: ob.id, kind: ob.comp.kind, t: best, point: V.add(o, V.mul(d, best)), material: vp.compiled.materials[ob.mat] && vp.compiled.materials[ob.mat].label };
    if (ob.def) {
      const f = ob.def.faces[face] || null, mi = ob.faceMats && face >= 0 && ob.faceMats[face] >= 0 ? ob.faceMats[face] : ob.mat;
      Object.assign(out, { definition: ob.def.name, instance: bi, face: f ? f.id : null, faceIndex: face, faceMeta: f ? f.meta : null, partMeta: ob.def.meta, material: vp.compiled.materials[mi] && vp.compiled.materials[mi].label });
    }
    return out;
  }
  select(sel) { this.selection = sel; this.notify(); }

  // ---------- the live world: handles that read the scene and write patches ----------
  world() {
    const host = this;
    const sceneOf = () => host.result && host.result.scene;
    const handle = (sel) => new Proxy({}, {
      get(_, k) {
        if (typeof k === 'symbol' || k === 'then' || k === 'toJSON') return k === 'toJSON' ? () => ({ handle: sel }) : undefined;
        const sc = sceneOf(); if (!sc) throw new CandelaError('E170', 'no scene is built');
        const c = findComp(compOf(sc), sel); if (!c) throw new CandelaError('E141', `no node matches '${sel}'`, { suggest: didYouMean(sel.replace(/^#/, ''), allIds(compOf(sc))) });
        if (k === 'kind') return c.kind; if (k === 'props') return describeProps(c);
        if (k === 'material') return matHandle(sel, c);
        if (k === 'position') return posHandle(sel, c);
        const v = c.props[k];
        if (v === undefined && !(k in c.props)) throw new CandelaError('E104', `'${k}' is not an attribute of ${c.kind}`, { suggest: didYouMean(k, Object.keys(c.props).concat(['position', 'material'])) });
        return showVal(v);
      },
      set(_, k: any, v) { host.patch(sel, b => { if (k === 'position') return b.at(...([] as any[]).concat(v)); if (typeof b[k] !== 'function') throw new CandelaError('E104', `cannot set '${k}' on ${sel}`); return b[k](parseQuantity(v)); }, `${sel}.${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`); return true; },
    });
    const matHandle = (sel, c) => new Proxy({}, { get(_, k: any) { if (typeof k === 'symbol') return undefined; const m = c.props.material; return m ? showVal(m.props[k]) : undefined; }, set(_, k: any, v) { host.patch(sel, b => b.material(b.props.material ? wrapComp(c.props.material)[k](parseQuantity(v)) : API.material.pbr()[k](v)), `${sel}.material.${k} = ${v}`); return true; } } as ProxyHandler<any>);
    const posHandle = (sel, c) => { const p = (c.props.at || [0, 0, 0]).map(x => +showVal(x) || 0); return new Proxy(p, { set(t, k: any, v) { const q = t.slice(); q[{ x: 0, y: 1, z: 2 }[k] ?? +k] = +v; host.patch(sel, b => b.at(...q), `${sel}.position.${k} = ${v}`); return true; }, get(t, k) { if (k === 'x') return t[0]; if (k === 'y') return t[1]; if (k === 'z') return t[2]; return t[k]; } }); };
    return {
      $: handle, $$: sel => { const sc = sceneOf(); return sc ? collect(compOf(sc), sel).map(c => handle(c.props.id ? '#' + c.props.id : sel)) : ([] as any[]); },
      ids: () => { const sc = sceneOf(); return sc ? allIds(compOf(sc)) : ([] as any[]); },
      get time() { return host.time; },
    };
  }
  // a patch edits the built scene functionally, recompiles (shaders are cached) and reports what it cost
  async patch(sel, fn, label) {
    const r = this.result; if (!r || !r.scene) throw new CandelaError('E170', 'no scene is built');
    const before = r.compiled.shared;
    const sc = r.scene.edit(sel, fn);

    const compiled = compile(sc, r.engine || API.engine[this.view.engine === 'scene' ? 'realtime' : this.view.engine](), {});
    compiled.animation = r.animation || null;
    r.scene = sc; r.compiled = compiled;
    const cost = compiled.shared === before ? 'value' : 'structure';
    this.history.push({ label, cost, at: Date.now() }); if (this.history.length > 60) this.history.shift();
    if (this.vp) await this.loadIntoViewport(compiled);
    this.notify();
    return { ok: true, cost };
  }

  // ---------- screenshots ----------
  async screenshotViewport(maxW = 1200) {
    if (!this.vp || !this.vp.backend) throw new Error('the viewport is not running');
    const c = await this.vp.snapshotCanvas();
    return downscale(c, maxW);
  }
  // ---------- links from notes, docs and the agent ----------
  link(href) {
    let u: any; try { u = new URL(href.replace(/^lab:/, 'lab://x/')); } catch (e) { return false; }
    const what = u.pathname.replace(/^\//, ''), q = Object.fromEntries(u.searchParams.entries());
    switch (what) {
      case 'open': return this.focus({ view: 'code', file: q.file || 'scene.js', line: +q.line || 1, find: q.find });
      case 'preset': this.loadPreset(q.id); return true;
      case 'doc': this.focus({ view: 'docs', doc: q.id, anchor: q.at }); return true;
      case 'param': { const h = paramStore.defs.get(q.id); if (h && q.value != null) h.set(q.value); this.focus({ view: 'params', id: q.id }); return true; }
      case 'view': this.setView('aov', q.aov || 'beauty'); this.focus({ view: 'viewport' }); return true;
      case 'engine': this.setView('engine', q.name || 'scene'); return true;
      case 'show': case 'tile': this.focus({ view: q.view || q.name }); return true;
      case 'ask': this.focus({ view: 'agent', ask: q.q || '' }); return true;
      case 'select': this.select(q.id); this.focus({ view: 'scene' }); return true;
      case 'build': this.build({}); return true;
      default: this.toast('unknown lab link ' + href, true); return false;
    }
  }
  explain() { return this.result && this.result.scene ? explain(this.result.scene, this.result.compiled, this.vp) : ''; }
  irText() { return this.result && this.result.scene ? irText(this.result.scene, this.result.compiled) : ''; }
  irGraph() { return this.result && this.result.scene ? irGraph(this.result.scene) : { nodes: ([] as any[]), edges: ([] as any[]) }; }
}

function downscale(c, maxW) { if (c.width <= maxW) return c; const k = maxW / c.width; const d = document.createElement('canvas'); d.width = Math.round(c.width * k); d.height = Math.round(c.height * k); d.getContext('2d')!.drawImage(c, 0, 0, d.width, d.height); return d; }
function findComp(sc, sel) { let hit: any = null; const v = c => { if (hit) return; if (matches(c, sel)) { hit = c; return; } (c.props.nodes || []).forEach(v); (c.props.children || []).forEach(v); }; sc.props.nodes.forEach(v); if (!hit && sc.props.camera && matches(sc.props.camera, sel)) hit = sc.props.camera; return hit; }
function collect(sc, sel) { const out: any[] = []; const v = c => { if (matches(c, sel)) out.push(c); (c.props.nodes || []).forEach(v); (c.props.children || []).forEach(v); }; sc.props.nodes.forEach(v); return out; }
const wrapComp = c => ({ [Symbol.for('candela.comp')]: c });
function showVal(v) { if (v == null) return v; if (typeof v === 'number') return +v.toFixed(6); if (isQ(v)) return v.toString(); if (isParam(v)) return v.value; if (Array.isArray(v)) return v.map(showVal); if (v.kind) return `[${v.kind}]`; if (v.op) return `[field ${v.op}]`; return v; }
function describeProps(c) { const o: Record<string, any> = {}; for (const [k, v] of Object.entries(c.props)) { if (['nodes', 'children', 'behaviors'].includes(k)) continue; o[k] = showVal(v); } return o; }
// CPU intersection in object space (picking only)
function hitLocal(ty, o, d, pr, bound) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (ty === 0) { const a = dot(d, d), b = dot(o, d), c = dot(o, o) - pr[0] * pr[0], disc = b * b - a * c; if (disc < 0) return -1; const s = Math.sqrt(disc); let t = (-b - s) / a; if (t < 1e-4) t = (-b + s) / a; return t; }
  if (ty === 1 || ty === 2 || ty === 3) { if (Math.abs(d[1]) < 1e-12) return -1; const t = -o[1] / d[1], p = [o[0] + d[0] * t, 0, o[2] + d[2] * t]; if (ty === 1 && pr[0] > 0 && (Math.abs(p[0]) > pr[0] / 2 || Math.abs(p[2]) > pr[0] / 2)) return -1; if (ty === 2 && (Math.abs(p[0]) > pr[0] || Math.abs(p[2]) > pr[1])) return -1; if (ty === 3 && p[0] * p[0] + p[2] * p[2] > pr[0] * pr[0]) return -1; return t; }
  const half = ty === 4 || ty === 8 ? [pr[0], pr[1], pr[2]] : ty === 5 ? [pr[0], pr[1], pr[0]] : [bound || 1, bound || 1, bound || 1];
  let tn = -1e30, tf = 1e30; for (let i = 0; i < 3; i++) { const inv = 1 / (Math.abs(d[i]) < 1e-12 ? 1e-12 : d[i]); let a = (-half[i] - o[i]) * inv, b = (half[i] - o[i]) * inv; if (a > b) [a, b] = [b, a]; tn = Math.max(tn, a); tf = Math.min(tf, b); }
  if (tn > tf || tf < 1e-4) return -1; return tn > 1e-4 ? tn : tf;
}
export { fmtNum, formatDiag, fmtLoc, API, test, fragments };
