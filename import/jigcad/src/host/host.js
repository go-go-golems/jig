// The workbench host: the open preset's files, the compiled program, the selection and the view, and every action
// the UI and the agent take on them (BUILD.md §4). Views subscribe with host.on(event, fn) and read fields directly.
//
// Extensions beyond §4 (all additive): link(href), focus(view, intent), intents, node/selectNode(id),
// setOverride(name, value), resetOverrides(), isEdited(path?), revertFile(path), revertAll(), addFile(path, text),
// deleteFile(path), loadScratch(files, meta), theme/cycleTheme(), engine { kind, version, note }, content, dirty,
// compiling, events 'focus' 'intent' 'node' 'overrides' 'engine' 'ask'.
// Round 2: check(files, options) passes options to the compile (keep: false by default, merge: false compiles the
// files alone, e.g. another preset's thumbnail); openFile/setOpenFile (the Code tab's file, event 'openfile');
// selections keep `body` as an index into program.bodies and refresh by face, edge or body name after a compile;
// preset meta is normalised (presetMeta) and host.preset.agent is { role, prompt, fragments, defaultFragments, tries };
// fragments/setFragment (the agent's brief chips, event 'fragments'); referenceDocs()/reference(): the language
// reference and the lab API, shown together in the Reference view and sent together to the agent.
// Sketches: select({ sketch, constraint: id }) and select({ sketch, entity: id }) pick one constraint or entity of a
// sketch (kept by id across compiles, cleared when the sketch, the id or the sketch view goes); hover / setHover(h)
// is the transient preview of the same shape (event 'hover'), set by the inspector's rows and the sheet's marks.
// Your presets (U-nn, the shelf's "Yours"): createPreset({ title, about, files, from, open }), renamePreset(id, title),
// deletePreset(id), isMine(id); they live in this browser and save as you edit (event 'presets'). Scratch presets
// (Z-nn) can be renamed and deleted too. renameFile(from, to) renames a file of the open preset.
import { createEngine } from './engine.js';
import { store } from './store.js';
import { content } from './content.js';
import { followLink } from './lab.js';
import labReference from '../agent/reference.md';

const D = Math.PI / 180;
export const NAMED_VIEWS = {
  axo: { yaw: 38 * D, pitch: 27 * D, title: 'Axonometric' },
  front: { yaw: 0, pitch: 0, title: 'Front elevation' },
  side: { yaw: -90 * D, pitch: 0, title: 'Side elevation' },
  plan: { yaw: 0, pitch: 90 * D, title: 'Plan' },
};
// The stage's overlay switches (src/stage/sheet.js OVERLAYS); the Stage view prefers the stage's own list once loaded.
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
const DEFAULT_OVERLAYS = OVERLAYS.filter(o => o.on).map(o => o.key);
// host.view: { name, yaw, pitch (orbit offsets from the named view, rad), zoom (1 = the part fits the sheet),
//              scale (px/mm, overrides zoom; null), pan: [right, up] mm, target (mm, null = the scene's centre), sketch, overlays }
export const squareView = () => ({ yaw: 0, pitch: 0, zoom: 1, scale: null, pan: [0, 0], target: null });
const DATA_EXT = /\.(json|csv|txt|svg|dxf|tsv)$/i;
const DEBOUNCE_MS = 140;

export class Host {
  // engine: an engine client to use instead of the worker (Node tools such as tools/agent-eval.mjs pass one built on
  // src/engine/worker.js handle(); it needs ready, request(op, args), compute and initMs).
  // renderView: a function that draws a view to a JPEG where there is no document (the agent-eval harness passes one
  // that renders in headless Chrome); in a page, renderView() draws with the stage's own draw().
  constructor({ forceMock = false, forceJsCompute = false, engine = null, renderView = null } = {}) {
    this.viewRenderer = renderView;
    this.content = content;
    this.files = new Map();
    this.published = {};
    this.preset = null;
    this.program = null;
    this.lastGood = null;
    this.selection = null;
    this.hover = null;
    this.node = null;
    this.view = { name: 'axo', ...squareView(), sketch: null, overlays: new Set(DEFAULT_OVERLAYS) };
    this.overrides = {};
    this.intents = {};
    this.openFile = null;
    this.fragments = new Set();
    this.compiling = false;
    this.dirty = false;
    this.theme = store.get('theme', 'system');
    this._ls = new Map();
    this._seq = 0;
    this._compiled = null;
    this._rekeep = false;
    this._timer = null;
    // scratch presets kept in this browser; older ones were numbered S-nn, which collides with the shelf's first prints
    this.scratch = (store.get('scratch', []) || []).filter(p => p && p.id && !content.presets.some(q => q.id === p.id));
    this.user = (store.get('user', []) || []).filter(p => p && /^U-\d+$/.test(p.id) && p.files && !content.presets.some(q => q.id === p.id));
    this.engine = engine || createEngine({
      forceMock, forceJsCompute,
      onChange: kind => {
        this.emit('engine', this.engine);
        if (kind === 'worker' && this.preset) {
          this.compile().then(() => this.toast(`Engine loaded in ${fmtS(this.engine.initMs)}: recompiled with OpenCascade${this.engine.compute?.kind === 'rust' ? ' and jig-compute (Rust)' : ''}`));
        }
      },
    });
    this.engine.ready.then(() => this.emit('engine', this.engine));
    this.applyTheme();
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme()); } catch { /* old browsers */ }
  }

  // ---------- events ----------
  on(event, fn) {
    if (!this._ls.has(event)) this._ls.set(event, new Set());
    this._ls.get(event).add(fn);
    return () => this._ls.get(event)?.delete(fn);
  }
  off(event, fn) { this._ls.get(event)?.delete(fn); }
  emit(event, data) {
    for (const fn of [...(this._ls.get(event) || [])]) {
      try { fn(data); } catch (e) { console.error(`host listener for ${event} failed:`, e); }
    }
  }

  // ---------- presets ----------
  presets() {
    const strip = ({ files, ...meta }) => ({ ...presetMeta(meta), files: Object.keys(files || {}) });
    return [...content.presets.map(strip), ...this.user.map(strip), ...this.scratch.map(strip)];
  }
  /** The files of a preset as published (for thumbnails and comparisons); null when there is no such preset. */
  presetFiles(id) {
    const src = this.findPreset(id);
    return src ? { ...(src.files || {}) } : null;
  }
  findPreset(id) {
    return content.presets.find(p => p.id === id) || this.user.find(p => p.id === id) || this.scratch.find(p => p.id === id) || null;
  }
  async loadPreset(id) {
    const src = this.findPreset(id);
    if (!src) { this.toast(`no preset ${id}`, 'bad'); return false; }
    const { files = {}, ...raw } = src;
    const meta = presetMeta(raw);
    this.preset = meta;
    this.published = { ...files };
    const saved = store.get(`files.${id}`);
    this.files = new Map(Object.entries(saved && typeof saved === 'object' ? saved : files));
    if (!this.files.has('script.js')) this.files.set('script.js', 'return j.part(\'part\')\n');
    this.overrides = {};
    this.selection = null;
    this.hover = null;
    this.node = null;
    this.program = null;
    this.lastGood = null;
    const savedFr = store.get(`fragments.${id}`);
    this.fragments = new Set(Array.isArray(savedFr) ? savedFr.filter(k => k in meta.agent.fragments) : meta.agent.defaultFragments);
    const name = NAMED_VIEWS[meta.view] ? meta.view : 'axo';
    const overlays = meta.overlays ? String(meta.overlays).split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_OVERLAYS;
    this.view = { name, ...squareView(), zoom: Number(meta.zoom) || 1, sketch: null, overlays: new Set(overlays) };
    store.set('preset', id);
    for (const e of ['preset', 'files', 'view', 'selection', 'hover', 'node', 'overrides', 'fragments']) this.emit(e, this[e]);
    await this.compile();
    return true;
  }
  loadScratch(files, meta = {}) {
    // X for scratch: S is a shelf group (S-01 is a first print), so a scratch id must never collide with one
    let n = this.scratch.length + 1, id;
    do id = `Z-${String(n++).padStart(2, '0')}`; while (this.findPreset(id));   // Z: X-nn are the Electronics presets
    const p = { id, title: meta.title || `Sketch ${this.scratch.length + 1}`, group: 'Scratch', about: meta.about || 'a sketch opened from the book or the docs', files: { 'script.js': '', ...files } };
    this.scratch = [...this.scratch, p];
    store.set('scratch', this.scratch.slice(-12));
    this.emit('presets');
    return this.loadPreset(id);
  }
  /** Yours (U-nn) and scratch (Z-nn) presets belong to this browser: they can be renamed and deleted. */
  isMine(id) { return this.user.some(p => p.id === id) || this.scratch.some(p => p.id === id); }
  /** A new preset of yours. files: { path: text }; or from: a preset id to copy (the open one with its edits);
   *  neither: a starter part. Returns the new preset's id; opens it unless open is false. Throws with a fix. */
  async createPreset({ title, about, files, from, open = true } = {}) {
    let src = null, fs;
    if (files != null) {
      if (typeof files !== 'object' || Array.isArray(files)) throw new Error('files is { path: text }');
      fs = files instanceof Map ? Object.fromEntries(files) : { ...files };
      for (const [k, v] of Object.entries(fs)) if (typeof v !== 'string') throw new Error(`files['${k}'] must be text`);
    } else if (from != null) {
      src = this.findPreset(from);
      if (!src) throw new Error(`no preset ${from} to copy`);
      const saved = store.get(`files.${from}`);
      fs = from === this.preset?.id ? Object.fromEntries(this.files) : { ...(saved && typeof saved === 'object' ? saved : src.files) };
    } else fs = { 'script.js': "return j.part('part')\n  .extrude(j.region.rect(40, 30), mm(10), { id: 'body' })\n" };
    if (!fs['script.js']) fs['script.js'] = "return j.part('part')\n";
    let n = 1, id;
    do id = `U-${String(n++).padStart(2, '0')}`; while (this.findPreset(id));
    const keep = src ? Object.fromEntries(Object.entries(src).filter(([k]) => !['id', 'title', 'group', 'order', 'files', 'about'].includes(k))) : {};
    const t = String(title || '').trim() || (src ? `${src.title} (copy)` : `Untitled ${this.user.length + 1}`);
    const p = { ...keep, id, title: t, group: 'Yours', about: about != null ? String(about) : src ? `copied from ${src.id} ${src.title}` : '', created: new Date().toISOString(), files: fs };
    this.user = [...this.user, p];
    if (!this._saveUser()) { this.user = this.user.filter(x => x !== p); throw new Error('this browser refused to store the preset (storage full or off)'); }
    this.emit('presets');
    if (open) await this.loadPreset(id);
    return id;
  }
  renamePreset(id, title) {
    const t = String(title ?? '').trim();
    if (!t) throw new Error('give the new title as text');
    const list = this.user.some(p => p.id === id) ? 'user' : this.scratch.some(p => p.id === id) ? 'scratch' : null;
    if (!list) throw new Error(this.findPreset(id) ? `${id} ships with the workbench; copy it first: createPreset({ from: '${id}', title })` : `no preset ${id}`);
    this[list] = this[list].map(p => (p.id === id ? { ...p, title: t } : p));
    list === 'user' ? this._saveUser() : store.set('scratch', this.scratch.slice(-12));
    if (this.preset?.id === id) { this.preset = { ...this.preset, title: t }; this.emit('preset', this.preset); }
    this.emit('presets');
    return t;
  }
  async deletePreset(id) {
    if (!this.isMine(id)) throw new Error(this.findPreset(id) ? `${id} ships with the workbench and cannot be deleted` : `no preset ${id}`);
    this.user = this.user.filter(p => p.id !== id);
    this.scratch = this.scratch.filter(p => p.id !== id);
    this._saveUser();
    store.set('scratch', this.scratch.slice(-12));
    store.remove(`files.${id}`);
    store.remove(`fragments.${id}`);
    this.emit('presets');
    if (this.preset?.id === id) await this.loadPreset((content.presets[0] || this.user[0] || this.scratch[0])?.id);
    return true;
  }
  _saveUser() { return store.set('user', this.user); }

  // ---------- files ----------
  setFile(path, text) {
    if (this.files.get(path) === text) return;
    this.files.set(path, text);
    this._afterEdit();
  }
  edit(path, oldText, newText) {
    const cur = this.files.get(path);
    if (cur == null) {
      if (oldText) return { ok: false, error: `no file ${path}` };
      this.setFile(path, newText);
      return { ok: true };
    }
    if (!oldText) return { ok: false, error: `oldText is empty; to replace ${path} use setFile` };
    const first = cur.indexOf(oldText);
    if (first < 0) return { ok: false, error: `text not found in ${path}` };
    if (cur.indexOf(oldText, first + 1) >= 0) return { ok: false, error: `text appears more than once in ${path}; include more context` };
    this.setFile(path, cur.slice(0, first) + newText + cur.slice(first + oldText.length));
    return { ok: true };
  }
  addFile(path, text = '') {
    if (!path || this.files.has(path)) return false;
    this.files.set(path, text);
    this._afterEdit();
    return true;
  }
  deleteFile(path) {
    if (path === 'script.js' || !this.files.has(path)) return false;
    this.files.delete(path);
    this._afterEdit();
    return true;
  }
  renameFile(from, to) {
    if (from === 'script.js' || to === 'script.js' || !this.files.has(from) || !to || this.files.has(to)) return false;
    // keep the order of the files, the new name in the old one's place
    this.files = new Map([...this.files].map(([k, v]) => (k === from ? [to, v] : [k, v])));
    if (this.openFile === from) { this.openFile = to; this.emit('openfile', to); }
    this._afterEdit();
    return true;
  }
  isEdited(path) {
    if (path) return this.files.get(path) !== this.published[path];
    if (this.files.size !== Object.keys(this.published).length) return true;
    for (const [k, v] of this.files) if (this.published[k] !== v) return true;
    return false;
  }
  revertFile(path) {
    if (path in this.published) this.files.set(path, this.published[path]); else this.files.delete(path);
    this._afterEdit();
  }
  revertAll() {
    this.files = new Map(Object.entries(this.published));
    this._afterEdit();
  }
  /** The open preset's files, tagged with its id: restoring after the agent opened or made another preset goes back
   *  to the preset the snapshot came from. A plain { path: text } object restores into the open preset. */
  snapshot() { return { snapshotOf: this.preset?.id ?? null, files: Object.fromEntries(this.files) }; }
  async restore(snapshot) {
    const tagged = snapshot && typeof snapshot === 'object' && 'snapshotOf' in snapshot && snapshot.files && typeof snapshot.files === 'object';
    const files = tagged ? snapshot.files : snapshot || {};
    if (tagged && snapshot.snapshotOf && snapshot.snapshotOf !== this.preset?.id && this.findPreset(snapshot.snapshotOf)) await this.loadPreset(snapshot.snapshotOf);
    this.files = new Map(Object.entries(files));
    this._afterEdit();
  }
  _afterEdit() {
    const id = this.preset?.id;
    const mine = id && this.user.find(p => p.id === id);
    if (mine) { mine.files = Object.fromEntries(this.files); this._saveUser(); }   // yours save as you type
    else if (id) store.set(`files.${id}`, this.isEdited() ? Object.fromEntries(this.files) : null);
    this.dirty = this._compiled !== JSON.stringify(Object.fromEntries(this.files));
    this.emit('files', this.files);
  }

  // ---------- compiling ----------
  /** Check the data files (a JSON error is reported at its line); the engine parses them itself. */
  _checkData(files) { this._dataOf(files); }
  _dataOf(files) {
    const data = {};
    for (const [path, text] of Object.entries(files)) {
      if (!DATA_EXT.test(path)) continue;
      const key = path.replace(/^.*\//, '');
      if (/\.json$/i.test(path)) {
        try { data[key] = JSON.parse(text); }
        catch (e) { throw Object.assign(new Error(`${path} is not valid JSON: ${e.message}`), { file: path, line: jsonLine(text, e) }); }
      } else if (/\.(csv|tsv)$/i.test(path)) data[key] = parseCSV(text, /\.tsv$/i.test(path) ? '\t' : ',');
      else data[key] = text;
    }
    return data;
  }
  async compile() {
    const seq = ++this._seq;
    const files = Object.fromEntries(this.files);
    const key = JSON.stringify(files);
    this.compiling = true;
    this.emit('compiling', true);
    await this.engine.ready;
    const t0 = performance.now();
    let program;
    try {
      this._checkData(files);
      const reply = await this.engine.request('compile', { files, entry: 'script.js', options: { override: this.overrideValues() } });
      program = reply.program;
      if (!program || typeof program !== 'object') throw new Error('the engine returned no program');
      program.roundTripMs = performance.now() - t0;
      if (program.ms == null) program.ms = program.summary?.rebuildMs ?? program.roundTripMs;
    } catch (err) {
      program = failedProgram(err, performance.now() - t0);
    }
    this._rekeep = false;
    if (seq !== this._seq) return program;            // a newer compile was asked for; drop this one
    this.compiling = false;
    this.program = program;
    if (program.ok !== false) this.lastGood = program;
    this._compiled = key;
    this.dirty = this._compiled !== JSON.stringify(Object.fromEntries(this.files));
    this._refreshSelection();
    this.emit('compiling', false);
    this.emit('program', program);
    this.emit('files', this.files);
    return program;
  }
  /** Compile a variant without changing host state (book figures, thumbnails, the agent's what-ifs).
   *  files: { path: text } (or a Map, or the text of script.js) laid over the open files unless options.merge is
   *  false; options go to the engine's compile ({ override, config, fit, seed, keep }), keep false by default so the
   *  worker's current Program (the one call() and export() ask about) stays the open preset's. */
  async check(files, options = {}) {
    const { merge = true, ...opts } = options || {};
    const given = typeof files === 'string' ? { 'script.js': files } : files instanceof Map ? Object.fromEntries(files) : (files || {});
    const all = merge ? { ...Object.fromEntries(this.files), ...given } : { ...given };
    const o = { keep: false, ...opts };
    const t0 = performance.now();
    try {
      this._checkData(all);
      const { program } = await this.engine.request('compile', { files: all, entry: 'script.js', options: o });
      if (o.keep !== false) this._rekeep = true;      // the worker now holds the variant: compile ours again before a call
      if (program && program.ms == null) program.ms = performance.now() - t0;
      return program;
    } catch (err) {
      if (o.keep !== false) this._rekeep = true;
      return failedProgram(err, performance.now() - t0);
    }
  }
  /** Compile now: cancel a scheduled compile and wait for one in flight, so this compile's result is the one kept. */
  async compileNow() {
    clearTimeout(this._timer); this._timer = null;
    while (this.compiling) await new Promise(r => setTimeout(r, 20));
    return this.compile();
  }
  scheduleCompile(ms = DEBOUNCE_MS) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.compile(), ms);
  }
  /** Overrides as the engine takes them: a number becomes quantity text in its param's unit ('80 mm'). */
  overrideValues() {
    const params = (this.program?.ok !== false ? this.program : this.lastGood)?.params || [];
    const out = {};
    for (const [k, v] of Object.entries(this.overrides)) {
      const unit = params.find(p => p.name === k)?.unit;
      out[k] = typeof v === 'number' && unit ? `${v} ${unit}` : v;
    }
    return out;
  }
  setOverride(name, value) {
    if (value == null) delete this.overrides[name]; else this.overrides[name] = value;
    this.overrides = { ...this.overrides };
    this.emit('overrides', this.overrides);
    this.scheduleCompile();
  }
  resetOverrides() {
    this.overrides = {};
    this.emit('overrides', this.overrides);
    this.scheduleCompile(0);
  }

  // ---------- engine calls ----------
  async _keep() {
    // a check() compiled another program in the worker: compile ours again before asking about it
    if (!this._rekeep || !this.program) return;
    this._rekeep = false;
    const files = Object.fromEntries(this.files);
    try { await this.engine.request('compile', { files, entry: 'script.js', options: { override: this.overrideValues() } }); } catch { /* the call reports */ }
  }
  async call(method, ...args) {
    await this._keep();
    const { value } = await this.engine.request('call', { method, args });
    return value;
  }
  async solveSketch(sketchId, drag) {
    await this._keep();
    const { sketch } = await this.engine.request('solveSketch', { sketchId, drag });
    return sketch;
  }
  async export(format, options = {}) {
    const base = (this.preset?.id || 'jig') + '-' + (this.program?.name || 'part');
    if (format === 'script') {
      return { data: this.files.get('script.js') ?? '', filename: `${base}.js`, mime: 'text/javascript', report: { kept: ['script.js'], approximated: [], dropped: [...this.files.keys()].filter(f => f !== 'script.js') } };
    }
    await this._keep();
    return this.engine.request('export', { format, options });
  }
  async run(code, files) {
    const { value } = await this.engine.request('run', { code, files: files ?? Object.fromEntries(this.files) });
    return value;
  }

  // ---------- selection, view, focus ----------
  select(sel) {
    if (sel && isSketchPick(sel)) {
      // one constraint or entity of a sketch: kept by id, nothing to resolve in the bodies
      sel = sel.constraint != null ? { sketch: sel.sketch, constraint: sel.constraint } : { sketch: sel.sketch, entity: sel.entity };
    } else if (sel) {
      const prog = this.program?.ok !== false ? this.program : this.lastGood;
      sel = { ...sel };
      // the body is kept as an index into program.bodies (the stage picks by id)
      if (typeof sel.body === 'string') { const i = (prog?.bodies || []).findIndex(b => b.id === sel.body); if (i >= 0) sel.body = i; }
      if (sel.name && sel.face == null && sel.edge == null) {
        const hit = findTopo(prog, sel.name);
        if (hit) sel = { ...sel, ...hit, body: sel.body ?? hit.body };
      }
    }
    this.selection = sel || null;
    this.emit('selection', this.selection);
  }
  /** Preview a sketch constraint or entity ({ sketch, constraint | entity }) without selecting it; null ends it. */
  setHover(h) {
    const next = h && isSketchPick(h) ? (h.constraint != null ? { sketch: h.sketch, constraint: h.constraint } : { sketch: h.sketch, entity: h.entity }) : null;
    if (samePick(next, this.hover)) return;
    this.hover = next;
    this.emit('hover', this.hover);
  }
  /** After a compile the selection follows its persistent name: a face, an edge or a body; lost when none has it.
   *  A sketch constraint or entity follows its id; it clears when its sketch or its id is gone. */
  _refreshSelection() {
    const s = this.selection;
    if (s && isSketchPick(s)) {
      // the sketch as this compile solved it, even when the compile failed (a conflict fails it), else the last good
      const find = id => (this.program?.sketches || []).find(x => x.id === id) || (this.lastGood?.sketches || []).find(x => x.id === id);
      const sk = find(s.sketch);
      const kept = sk && (s.constraint != null ? (sk.constraints || []).some(c => c.id === s.constraint) : (sk.entities || []).some(e => e.id === s.entity));
      if (!kept) { this.selection = null; this.emit('selection', null); }
      if (this.hover && !find(this.hover.sketch)) this.setHover(null);
      return;
    }
    if (!s?.name) return;
    const prog = this.program?.ok !== false ? this.program : this.lastGood;
    const hit = findTopo(prog, s.name, s.edge != null ? 'edge' : 'face');
    this.selection = hit ? { ...s, ...hit, lost: false } : { ...s, lost: true };
    this.emit('selection', this.selection);
  }
  /** The Code tab's open file (the agent's context names it). */
  setOpenFile(path) {
    if (this.openFile === path) return;
    this.openFile = path || null;
    this.emit('openfile', this.openFile);
  }
  /** Turn one of the preset's agent fragments on or off (kept per preset in this browser). */
  setFragment(name, on) {
    const next = new Set(this.fragments);
    if (on ?? !next.has(name)) next.add(name); else next.delete(name);
    this.fragments = next;
    if (this.preset?.id) store.set(`fragments.${this.preset.id}`, [...next]);
    this.emit('fragments', this.fragments);
  }
  selectNode(id) {
    this.node = id || null;
    this.emit('node', this.node);
  }
  /**
   * Draw the program (the last good one if the current one failed) to a JPEG without moving the person's view.
   * view: axo | front | side | plan (default: the current view, orbit and zoom included); width/height in px.
   * → { mimeType: 'image/jpeg', data: base64, width, height, view }
   */
  async renderView({ view = null, width = 640, height = 480, overlays = null, quality = 0.85 } = {}) {
    const name = view || this.view.name || 'axo';
    if (this.viewRenderer) return this.viewRenderer({ files: Object.fromEntries(this.files), overrides: { ...(this.overrides || {}) }, view: name, width, height, overlays });
    if (typeof document === 'undefined') throw new Error('look: this workbench cannot draw here');
    const prog = this.program?.ok !== false ? this.program : this.lastGood;
    if (!prog) throw new Error('look: nothing compiled yet');
    const { draw } = await import('../stage/sheet.js');
    const v = name === this.view.name ? { ...this.view } : { ...this.view, name, ...squareView() };
    if (overlays) v.overlays = new Set(overlays);
    const canvas = document.createElement('canvas');
    draw(canvas, prog, v, { width, height, dpr: 1, overlays: v.overlays, sheet: this.preset?.id || 'J-01', colorsFrom: document.documentElement });
    const url = canvas.toDataURL('image/jpeg', quality);
    return { mimeType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), width, height, view: name };
  }
  setView(patch = {}) {
    const next = { ...this.view, ...patch };
    if (patch.name && patch.name !== this.view.name && patch.yaw == null && patch.pitch == null) Object.assign(next, { yaw: 0, pitch: 0, pan: [0, 0], target: null });
    if (patch.overlays && !(patch.overlays instanceof Set)) next.overlays = new Set(patch.overlays);
    this.view = next;
    this.emit('view', this.view);
    // a sketch's constraint or entity is picked on that sketch's sheet: leaving it lets the pick go
    const s = this.selection, gone = p => p && isSketchPick(p) && (next.name !== 'sketch' || (next.sketch && next.sketch !== p.sketch));
    if (('name' in patch || 'sketch' in patch) && gone(s)) this.select(null);
    if (('name' in patch || 'sketch' in patch) && gone(this.hover)) this.setHover(null);
  }
  toggleOverlay(name, on) {
    const s = new Set(this.view.overlays);
    if (on ?? !s.has(name)) s.add(name); else s.delete(name);
    this.setView({ overlays: s });
  }
  focus(view, intent) {
    if (intent) this.intents[view] = { ...intent, seq: (this.intents[view]?.seq || 0) + 1 };
    this.emit('focus', { view, intent });
    if (intent) this.emit('intent', { view, intent: this.intents[view] });
  }
  link(href) { return followLink(this, href); }
  toast(text, level) {
    this.emit('toast', { text: String(text), bad: level === true || level === 'bad' || level === 'error' });
  }

  // ---------- the Reference ----------
  /** The Reference as two documents: the language reference (content/docs/reference.md, when it is written) and the
   *  lab API the agent's eval code uses (src/agent/reference.md); [{ id: 'language' | 'lab', md }]. */
  referenceDocs() {
    const out = [];
    const lang = content.docs.find(isReferenceDoc);
    if (lang && lang.text.trim()) out.push({ id: 'language', md: lang.text });
    const lab = String(labReference || '').trim();
    if (lab) out.push({ id: 'lab', md: out.length ? lab.replace(/^#\s+Reference\s*$/m, '# The lab API') : lab });
    return out;
  }
  /** The whole Reference as one text: what the Reference view shows and what the agent reads with its instructions. */
  reference() { return this.referenceDocs().map(d => d.md.trim()).join('\n\n---\n\n'); }

  // ---------- theme ----------
  applyTheme() {
    let t = this.theme;
    if (t !== 'light' && t !== 'dark') {
      try { t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { t = 'light'; }
    }
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = t;
  }
  cycleTheme() {
    this.theme = { system: 'light', light: 'dark', dark: 'system' }[this.theme] || 'system';
    store.set('theme', this.theme);
    this.applyTheme();
    this.emit('theme', this.theme);
  }
}

/** A selection or hover that picks one constraint or entity of a sketch. */
export const isSketchPick = s => !!(s && s.sketch && (s.constraint != null || s.entity != null));
const samePick = (a, b) => (!a && !b) || (!!a && !!b && a.sketch === b.sketch && a.constraint === b.constraint && a.entity === b.entity);

/** The shelf doc that is the language reference (content/docs/reference.md): kept off the Docs shelf. */
export const isReferenceDoc = d => d.id === 'reference' || d.key === 'reference' || /(^|-)reference$/.test(d.key);

function fmtS(ms) { return ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`; }

export function findFace(program, name) {
  if (!program?.bodies) return null;
  for (let b = 0; b < program.bodies.length; b++) {
    const faces = program.bodies[b].faces || [];
    const f = faces.find(f => f.name === name);
    if (f) return { body: b, face: f.index, name };
  }
  return null;
}

/** A face, an edge or a body by persistent name: { body (index), face, edge } or null. `prefer` 'edge' looks at
 *  edges before faces (an edge's name is never a face's, but a split face may share its stem). */
export function findTopo(program, name, prefer = 'face') {
  if (!program?.bodies || !name) return null;
  const bodies = program.bodies;
  const face = () => findFace(program, name);
  const edge = () => {
    for (let b = 0; b < bodies.length; b++) {
      const i = (bodies[b].edges || []).findIndex(e => e.name === name);
      if (i >= 0) return { body: b, face: null, edge: i, name };
    }
    return null;
  };
  const hit = prefer === 'edge' ? edge() || face() : face() || edge();
  if (hit) return { edge: null, ...hit };
  const bi = bodies.findIndex(b => b.id === name || b.name === name);
  return bi >= 0 ? { body: bi, face: null, edge: null, name } : null;
}

const listOf = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split('|') : []).map(x => String(x).trim()).filter(Boolean);
export const DIFFICULTIES = ['first print', 'easy', 'medium', 'advanced'];
/** Preset meta as the workbench reads it (meta.json, or a scratch preset): every key kept, tries as a list,
 *  agent: { role, prompt, fragments: { name: instruction }, defaultFragments: [names], tries: [requests] }. */
export function presetMeta(raw = {}) {
  const a = raw.agent && typeof raw.agent === 'object' ? raw.agent : {};
  let fr = a.fragments || {};
  if (Array.isArray(fr)) fr = Object.fromEntries(fr.map(f => (typeof f === 'string' ? [f, f] : [f.name || f.id, f.text || f.prompt || f.instruction || ''])).filter(([k]) => k));
  const fragments = Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, String(v ?? '')]));
  const defaults = (Array.isArray(a.defaultFragments) ? a.defaultFragments : listOf(String(a.defaultFragments ?? '').replace(/,/g, '|'))).filter(k => k in fragments);
  const tries = listOf(raw.tries);
  const agentTries = listOf(a.tries);
  const order = Number(raw.order);
  return {
    ...raw,
    tries,
    order: Number.isFinite(order) ? order : null,
    difficulty: raw.difficulty ? String(raw.difficulty) : null,
    agent: { role: a.role ? String(a.role) : '', prompt: a.prompt ? String(a.prompt) : '', fragments, defaultFragments: defaults, tries: agentTries.length ? agentTries : tries },
  };
}

/** A ProgramData standing for a compile that threw: it names the file, line and message. */
export function failedProgram(err, ms) {
  const line = err?.line ?? undefined, column = err?.column ?? undefined, file = err?.file || 'script.js';
  return {
    ok: false, hash: null, kind: null, name: null, ms, error: { message: err?.message || String(err), stack: err?.stack, line, column, file },
    summary: {}, metrics: {}, trace: [], decisions: [], params: [], graph: { nodes: [], edges: [] }, sketches: [], bodies: [], print: null, ir: {},
    diagnostics: [{ level: 'error', kind: err?.kind || 'script.error', at: file, file, message: err?.message || String(err), line, column }],
  };
}

function jsonLine(text, e) {
  const m = /position (\d+)/.exec(e.message);
  return m ? text.slice(0, +m[1]).split('\n').length : undefined;
}
export function parseCSV(text, sep = ',') {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  const [columns = [], ...body] = rows;
  return { columns, rows: body.map(r => r.map(v => (v !== '' && !isNaN(+v) ? +v : v))) };
}
