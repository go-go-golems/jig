// render/host.js: the Render view's controller (JIG-016 §6.5). It owns Candela on the page: it loads dist/candela.js
// on first use, asks jig's worker for the CAD package of the open program (export('candela')), builds the look file
// (the project's look.js, or a default one) with the bridge (src/render/jig-candela.js) through Candela's own build,
// drives a Candela Viewport on a canvas, maps clicks back to jig's names, and edits look.js when a material is
// chosen for a face. No Preact here: views/render.jsx draws it and listens to its events.
//
//   const rh = renderHostOf(host);  rh.attach(canvas);  rh.on('change', …);  rh.pick(nx, ny) → { component, face, … }
//   rh.applyMeta('rod#body/side[s.big]', { material: 'brass' })   → a line in look.js, then a rebuild
import LIB from '../generated/candela-lib.json';

export const LOOK_FILE = 'look.js';
// project files the look may import (baked poses, shared materials): sent to Candela's build under their own names,
// e.g. import poses from './shutter-poses.look.js'. jig's compile never runs them (only script.js runs).
export const isLookFile = (path) => path === LOOK_FILE || /\.look\.js$/.test(path);
export const LOOK_MARK = '// materials: the Render view adds lines here';

/** the look a project starts with: everything from metadata (autoFinish), a studio light, a floor under the model,
 *  and an assembly's first study as the timeline */
export function defaultLook({ view = 'axo', study = null } = {}) {
  const motion = study ? `\n// the timeline: the study '${study}' in 4 s (asm.studies() lists them); add .motionBlur({ angle: 180, fps: 24 }) to the camera for blur\nexport const animation = asm.animate(${JSON.stringify(study)}, { duration: 4 });\n` : '';
  return `// look.js: how the model is rendered (materials, light, camera) as a Candela scene (JIG-016).
// The Render view edits the chain under the marker: a material chosen for a face adds a .meta() line there.
import { scene, shape, light, camera, hdri, material, finish } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig-program';

const asm = jigScene(program, { autoFinish: true })
  ${LOOK_MARK}
  ;
const v = asm.view('${view}'), floor = asm.bounds() ? asm.bounds()[0][1] : 0;
export default scene()
  .add(asm)
  .add(shape.plane().at(0, floor, 0).material(material.pbr().baseColor(0.18).roughness(0.8)).id('floor'))
  .add(light.env.hdri(hdri.studio(), { rotate: 30 }))
  .camera(camera.thinLens().at(v.at).lookAt(v.target).focal(v.focal).fstop(8));
${motion}`;
}

/** a .meta() line for look.js: the address and the patch as code */
export function metaLine(address, patch) {
  const body = Object.entries(patch).map(([k, v]) => `${/^[a-z]\w*$/i.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ');
  return `  .meta(${JSON.stringify(address)}, { ${body} })`;
}

/** look.js with one more line at the end of the marked chain; null when the marker or its chain's end is gone */
export function addToLook(text, line) {
  const lines = text.split('\n'), at = lines.findIndex((l) => l.trim() === LOOK_MARK);
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && lines[end].trim() !== ';') end++;
  if (end >= lines.length) return null;
  lines.splice(end, 0, line);
  return lines.join('\n');
}

// the materials offered for a face: patches of the face's metadata, so Candela's finish keeps the axis jig found
// (a turned face stays turned about its axis when it becomes brass)
export const LIBRARY = [
  { group: 'Steel', items: [
    ['Steel, machined', { material: 'steel', finish: null }], ['Steel, ground', { material: 'steel', finish: null, process: 'ground' }],
    ['Steel, polished', { material: 'steel', finish: null, process: 'polished' }], ['Black oxide', { material: 'steel', finish: 'black-oxide' }],
    ['Zinc plated', { material: 'steel', finish: 'zinc' }], ['Stainless, brushed', { material: 'stainless', finish: null, process: 'brushed' }],
    ['Chrome', { finish: 'chrome' }],
  ] },
  { group: 'Aluminium', items: [
    ['Aluminium, machined', { material: 'aluminium', finish: null }], ['Anodized black', { material: 'aluminium', finish: 'anodized-black' }],
    ['Anodized blue', { material: 'aluminium', finish: 'anodized', color: '#2b4c7e' }], ['Anodized clear', { material: 'aluminium', finish: 'anodized-clear' }],
  ] },
  { group: 'Copper alloys', items: [['Brass', { material: 'brass', finish: null }], ['Bronze', { material: 'bronze', finish: null }], ['Copper', { material: 'copper', finish: null }]] },
  { group: 'Coats', items: [['Paint, red', { finish: 'paint', color: '#c8102e' }], ['Powder coat, black', { finish: 'powder-coat', color: '#2a2a2a' }]] },
  { group: 'Plastics', items: [['PLA, white', { material: 'pla', finish: null, process: null, color: '#f2f0eb' }], ['ABS, black', { material: 'abs', finish: null, process: null, color: '#1d1d1f' }], ['Rubber', { finish: 'rubber' }], ['Glass', { finish: 'glass' }]] },
];

let candela = null;
/** dist/candela.js, loaded once, beside app.js */
export const loadCandela = () => (candela ??= import(/* not bundled: dist/candela.js */ new URL('./candela.js', import.meta.url).href));

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
const xfPoint = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11]];
const xfDir = (M, d) => [M[0] * d[0] + M[1] * d[1] + M[2] * d[2], M[4] * d[0] + M[5] * d[1] + M[6] * d[2], M[8] * d[0] + M[9] * d[1] + M[10] * d[2]];

/** a pick in the compiled scene → jig's names: { component, body, face, meta, point } (meshes only) */
export function faceAt(compiled, pkg, hit) {
  const ob = compiled?.objects?.[hit?.object];
  if (!ob?.def) return null;
  const body = pkg?.bodies?.find((b) => b.id === ob.def.name), f = ob.def.faces[hit.face];
  if (!body || !f) return null;
  return { component: body.component, body: body.id, face: f.id, meta: f.meta, address: `${body.component}#${f.id}` };
}

export class RenderHost {
  constructor(host) {
    this.host = host;
    this.ls = new Set();
    this.status = 'idle';            // idle | loading | building | ready | error
    this.message = null;
    this.diags = [];
    this.pkg = null; this.result = null; this.vp = null; this.canvas = null;
    this.freeCam = null; this.picked = null; this.backend = null;
    this._seq = 0; this._pkgKey = null; this._lookKey = null; this._raf = 0;
    this.time = 0; this.playing = false; this.rendering = false; this.progress = null;
  }
  on(fn) { this.ls.add(fn); return () => this.ls.delete(fn); }
  emit() { for (const f of this.ls) try { f(this); } catch (e) { console.error(e); } }

  /** the look file's text: the project's look.js, else the default for the stage's current view */
  /** what a rebuild depends on besides the package: the look and the files it may import */
  lookKey(look = this.look()) { return look + JSON.stringify([...this.host.files].filter(([k]) => k !== LOOK_FILE && isLookFile(k))); }
  look() {
    const view = ['axo', 'front', 'side', 'plan'].includes(this.host.view?.name) ? this.host.view.name : 'axo';
    return this.host.files.get(LOOK_FILE) ?? defaultLook({ view, study: Object.keys(this.pkg?.studies ?? {})[0] ?? null });
  }

  /** start again, e.g. after a lost device: a fresh canvas and backend ('auto' | 'webgpu' | 'webgl2') */
  async restart(prefer = this.prefer) {
    const canvas = this.vp?.canvas ?? this.canvas;
    this.detach();
    const fresh = canvas.cloneNode();
    canvas.replaceWith(fresh);
    this.pkg = null; this._pkgKey = null; this._lookKey = null;
    return this.attach(fresh, { prefer });
  }

  async attach(canvas, { prefer } = {}) {
    this.canvas = canvas;
    let stored = null;
    try { stored = localStorage.getItem('jig.render.backend'); } catch { /* no storage */ }
    this.prefer = prefer ?? stored ?? 'auto';
    this.status = 'loading'; this.emit();
    try {
      const C = await loadCandela();
      this.C = C;
      this.vp = new C.Viewport(canvas);
      await this.vp.init(this.prefer);
      this.backend = this.vp.backendName;   // the viewport may swap the canvas for WebGL2: listen on its parent
      this.vp.target = 1024;          // stop accumulating at 1024 samples per pixel
      this.offs = [this.host.on('program', () => this.refresh()), this.host.on('files', () => this.refresh())];
      this.loop();
      await this.refresh(true);
    } catch (e) {
      this.status = 'error'; this.message = `Candela did not start: ${e.message}`; console.error(e); this.emit();
    }
  }
  detach() {
    cancelAnimationFrame(this._raf); this._raf = 0;
    for (const off of this.offs ?? []) off();
    this.offs = null; this.vp = null; this.canvas = null;
  }
  loop() {
    const step = (now) => {
      this._raf = requestAnimationFrame(step);
      if (!this.vp?.compiled || !this.vp.packed || this.loading || this.rendering || document.hidden) return;   // not while shaders compile or a job renders
      if (this.vp.backend?.lost && this.status !== 'error') {
        // a GPU device can be lost (a driver reset, a dispatch past the watchdog on a software adapter)
        this.status = 'error'; this.message = `The GPU device was lost after ${this.vp.spp | 0} samples (${this.backend}); restart the view, or try WebGL2.`; this.emit(); return;
      }
      if (this.playing) {
        const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0;
        this._last = now;
        this.setTime(this.time + dt, true);
      }
      if (this.vp.frame()) this._spp !== this.vp.spp && ((this._spp = this.vp.spp), this.emit());
    };
    this._raf = requestAnimationFrame(step);
  }

  /** after a compile or an edit: a new package when the model changed, a rebuild when the look changed */
  async refresh(force = false) {
    if (!this.vp) return;
    const prog = this.host.program?.ok !== false ? this.host.program : this.host.lastGood;
    if (!prog) { this.status = 'idle'; this.message = 'Nothing compiled yet.'; this.emit(); return; }
    const seq = ++this._seq;
    const model = JSON.stringify([...this.host.files].filter(([k]) => !isLookFile(k))) + JSON.stringify(this.host.overrides ?? {}) + prog.hash;
    if (!force && model === this._pkgKey && this.lookKey() === this._lookKey) return;
    this.status = 'building'; this.emit();
    try {
      if (model !== this._pkgKey || !this.pkg) {
        // an edit not compiled yet: the compile's 'program' event comes back here with the new model
        if (this.host.dirty || this.host.compiling) { if (seq === this._seq) { this.status = this.pkg ? 'ready' : 'building'; this.emit(); } return; }
        const e = await this.host.export('candela', { quality: 'render' });
        if (seq !== this._seq) return;
        this.pkg = JSON.parse(e.data); this._pkgKey = model;
      }
      await this.build(seq, this.look());   // after the package: the default look's timeline names its first study
    } catch (e) {
      if (seq !== this._seq) return;
      this.status = 'error'; this.message = e.message; this.emit();
    }
  }
  async build(seq = ++this._seq, look = this.look()) {
    const files = { 'jig-candela.js': LIB['jig-candela.js'], 'jig-program.js': 'export const program = __jigPackage;', 'scene.js': look };
    for (const [k, v] of this.host.files) if (k !== LOOK_FILE && isLookFile(k)) files[k] = v;
    const r = await this.C.build(files, { scope: { __jigPackage: this.pkg } });
    if (seq !== this._seq) return;
    this.result = r; this._lookKey = this.lookKey(look);
    this.diags = [...(this.pkg.diagnostics ?? []).map((d) => ({ severity: d.level, code: d.kind, message: d.message, line: d.line })), ...(r.diags ?? [])];
    if (!r.ok) { this.status = 'error'; this.message = r.error?.message ?? 'the look did not build'; this.emit(); return; }
    this.loading = true; this.status = 'compiling'; this.emit();
    const t0 = performance.now();
    const anim = r.compiled.animation;
    if (!anim) { this.playing = false; this.time = 0; this._timeFor = null; }
    else if (anim.study && this._timeFor !== anim.study) {
      // a study's timeline opens where the stage stands: the drive's current value as a time
      this._timeFor = anim.study;
      const t = this.timeOfDrive(anim);
      if (t != null) this.time = t;
    }
    try { await this.vp.load(r.compiled, { time: this.time }); }
    catch (e) { this.status = 'error'; this.message = `shader compile failed: ${e.message}`; this.emit(); return; }
    finally { this.loading = false; }
    this.loadMs = performance.now() - t0;
    if (seq !== this._seq) return;
    if (this.freeCam) this.vp.setView(this.freeCam);
    this.status = 'ready'; this.message = null; this.emit();
  }

  // ---------- the timeline: the look's export const animation (asm.animate) ----------
  duration() { const a = this.result?.compiled?.animation; return a ? (a.duration > 0 ? a.duration : 4) : 0; }
  /** the time at which an asm.animate() timeline shows the assembly's current drive value (null if unknown) */
  timeOfDrive(anim) {
    const s = this.pkg?.studies?.[anim.study], prog = this.host.program?.ok !== false ? this.host.program : this.host.lastGood;
    const j = s && prog?.assembly?.joints?.find((x) => x.id === s.drive);
    const x = s?.x, from = s?.from ?? x?.[0], to = s?.to ?? x?.[x.length - 1];
    if (!j || !Number.isFinite(j.value) || !(anim.duration > 0) || !Number.isFinite(from) || !Number.isFinite(to) || to === from) return null;
    return Math.min(anim.duration, Math.max(0, ((j.value - from) / (to - from)) * anim.duration));
  }
  setTime(t, quiet = false) {
    const d = this.duration();
    this.time = d ? ((t % d) + d) % d : 0;
    if (this.vp?.compiled && this.vp.packed) this.vp.repack(this.time);
    if (!quiet) this.emit();
  }
  play(on = !this.playing) { this.playing = !!on && this.duration() > 0; this._last = 0; this.emit(); }

  // ---------- render jobs: a still or a sequence at a fixed size and sample count (Candela's runRender) ----------
  async renderJob(o) {
    if (!this.vp?.compiled || this.rendering) return null;
    this.rendering = true; this.playing = false; this.progress = 0; this.progressNote = ''; this.ctrl = new AbortController(); this.emit();
    try {
      const opts = { name: (this.host.preset?.id || this.host.program?.name || 'jig').replace(/[^\w.-]+/g, '-'), seed: 1, ...o };
      if (opts.kind !== 'sequence' && opts.time == null && this.duration()) opts.time = this.time;
      return await this.C.runRender(opts, { vp: this.vp, signal: this.ctrl.signal, seek: async (t) => this.vp.repack(t),
        onProgress: (p, note) => { this.progress = p; this.progressNote = note || ''; this.emit(); } });
    } finally {
      this.rendering = false; this.progress = null; this.ctrl = null;
      if (this.vp?.compiled) this.vp.repack(this.time);
      this.emit();
    }
  }
  cancelJob() { this.ctrl?.abort(); }

  // ---------- camera: orbit, pan and zoom about the target, Y up ----------
  camera() {
    if (this.freeCam) return this.freeCam;
    const c = this.vp?.cam;
    return c?.at && c?.target ? { at: c.at.slice(), target: c.target.slice() } : null;
  }
  orbit(dx, dy, mode = 'orbit') {
    const base = this.camera(); if (!base) return;
    const at = base.at.slice(), tgt = base.target.slice();
    if (mode === 'pan') {
      const f = V.norm(V.sub(tgt, at)), r = V.norm(V.cross(f, [0, 1, 0])), up = V.cross(r, f), d = V.len(V.sub(tgt, at)) * 0.0015;
      const off = V.add(V.mul(r, -dx * d), V.mul(up, dy * d));
      this.freeCam = { at: V.add(at, off), target: V.add(tgt, off) };
    } else if (mode === 'zoom') {
      this.freeCam = { at: V.add(tgt, V.mul(V.sub(at, tgt), Math.exp(dy * 0.0015))), target: tgt };
    } else {
      const v = V.sub(at, tgt), r = V.len(v);
      let az = Math.atan2(v[0], v[2]), el = Math.asin(Math.max(-1, Math.min(1, v[1] / r)));
      az -= dx * 0.006; el = Math.max(-1.45, Math.min(1.45, el + dy * 0.006));
      this.freeCam = { at: [tgt[0] + r * Math.cos(el) * Math.sin(az), tgt[1] + r * Math.sin(el), tgt[2] + r * Math.cos(el) * Math.cos(az)], target: tgt };
    }
    this.vp?.setView(this.freeCam); this.emit();
  }
  resetCamera() { this.freeCam = null; this.vp?.setView(null); this.emit(); }

  // ---------- picking: a CPU ray against the packed meshes ----------
  pick(nx, ny) {
    const vp = this.vp, C = this.C;
    if (!vp?.packed || !vp.cam || !C?.rayMesh) return null;
    const cam = vp.cam, ndc = [nx * 2 - 1, 1 - ny * 2];
    const d = V.norm(V.add(cam.U4.slice(0, 3), V.add(V.mul(cam.U2.slice(0, 3), ndc[0]), V.mul(cam.U3.slice(0, 3), ndc[1]))));
    const o = cam.U1.slice(0, 3), O = vp.packed.O, n = vp.packed.nObjs;
    let best = Infinity, hit = null;
    for (let k = 0; k < n; k++) {
      const b = k * 24;
      if (O[b] !== 13 || ((O[b + 3] | 0) & 1)) continue;          // meshes only, visible ones
      const M = Array.from(O.subarray(b + 4, b + 16)), oi = O[b + 21] | 0, def = vp.compiled.objects[oi]?.def;
      const h = def ? C.rayMesh(def, xfPoint(M, o), xfDir(M, d), best) : null;
      if (h && h.t > 1e-6 && h.t < best) { best = h.t; hit = { object: oi, face: h.face }; }
    }
    const at = hit ? faceAt(vp.compiled, this.pkg, hit) : null;
    this.picked = at ? { ...at, point: V.add(o, V.mul(d, best)) } : null;
    this.emit();
    return this.picked;
  }

  /** choose a material for faces: one .meta() line at the end of look.js's chain (look.js is created if absent) */
  applyMeta(address, patch) {
    const had = this.host.files.has(LOOK_FILE), text = this.look(), line = metaLine(address, patch);
    const next = addToLook(text, line);
    if (next == null) throw new Error(`look.js has no '${LOOK_MARK}' line with a chain ending in ';' under it; add this line to the chain yourself: ${line.trim()}`);
    if (had) this.host.setFile(LOOK_FILE, next); else this.host.addFile(LOOK_FILE, next);
    return line;
  }
}

const HOSTS = new WeakMap();
/** one RenderHost per workbench host */
export const renderHostOf = (host) => {
  let r = HOSTS.get(host);
  if (!r) { HOSTS.set(host, (r = new RenderHost(host))); globalThis.jigRender = r; }   // for the console and the UI tests
  return r;
};
