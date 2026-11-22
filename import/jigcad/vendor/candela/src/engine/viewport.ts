// viewport.js — drives a backend: compiles a scene's shaders, packs and uploads its data, accumulates samples,
// meters the exposure, and answers screenshots and light-meter readings.
import { posesAt, makePackEnv, frameUniforms } from './session';
import { GPURenderer, GLRenderer, type Backend } from './render';
import { displaySource, postSettings, displayUniforms, meterExposure, passesFromBuffers } from './display';
import { U_BASE, vec3 as V } from './compile';
import { Gen, genFunction, lift, E, node, withTracer, nodeOf, constNode, parseColor } from './fx';
import { CandelaError } from './diag';


export class Viewport {
  canvas: HTMLCanvasElement & { __gpuUsed?: boolean };
  backend: Backend | null | any;
  // set by the host (view settings) and the render queue (fixed-size, locked-exposure output renders)
  /** transform overrides for animation/behaviours, by node id */
  overrides: any;
  motionOverride: any;
  fixedSize: [number, number] | null | undefined;
  focusPoint: any;
  lockEV: boolean | undefined;
  aov: string | undefined;
  tonemapOverride: string | null | undefined;
  falseColorOverride: boolean | null | undefined;
  denoiseOverride: boolean | null | undefined;
  spp: number;
  frameN: number;
  ev: number;
  evComp: number;
  target: number;
  lastMs: number;
  compiled: any;
  listeners: Set<any>;
  status: string;
  metering: boolean;
  view: any;
  scale: number;
  dynScale: number;
  paused: boolean;
  notes: any;
  engine: any;
  post: any;
  userPasses: any;
  compileMs: number;
  time: number;
  packed: any;
  poseError: any;
  externalPoses: any;
  seed: number;
  metered: number;
  cam: any;
  lastMeter: any;
  exclusive: boolean;
  constructor(canvas) { this.canvas = canvas; this.backend = null; this.spp = 0; this.frameN = 0; this.ev = 12; this.evComp = 0; this.target = 0; this.lastMs = 0; this.compiled = null; this.listeners = new Set(); this.status = 'idle'; this.metering = false; this.view = null; this.scale = 1; this.dynScale = 1; this.paused = false; }
  async init(prefer = 'auto') {
    if (this.backend) return this.backend;
    let b: any = null; this.notes = [];
    if (prefer !== 'webgl2') { try { b = await GPURenderer.create(this.canvas); } catch (e) { this.notes.push('WebGPU: ' + e.message); b = null; } if (!b && prefer === 'webgpu') this.notes.push('WebGPU is not available in this browser; using WebGL2'); }
    if (!b) {
      // a canvas that was given to WebGPU cannot become WebGL2: swap in a fresh one
      if (this.canvas.__gpuUsed) { const c2 = this.canvas.cloneNode() as HTMLCanvasElement; this.canvas.replaceWith(c2); this.canvas = c2; }
      b = GLRenderer.create(this.canvas);
    } else this.canvas.__gpuUsed = true;
    if (!b) throw new CandelaError('E710', 'this browser has neither WebGPU nor WebGL2 with float render targets');
    this.backend = b; return b;
  }
  get backendName() { return this.backend ? this.backend.name : '—'; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) try { f(this); } catch (e) { console.error(e); } }

  // ---- scene ----
  // loads run one after another: compile awaits, and two overlapping loads could otherwise commit one scene's
  // pipeline with the other scene's buffers (PR #1 review); the last call wins
  private loadChain: Promise<unknown> = Promise.resolve();
  load(compiled, opts: Record<string, any> = {}) {
    const run = () => this.loadNow(compiled, opts);
    const p = this.loadChain.then(run, run);
    this.loadChain = p.catch(() => undefined);
    return p;
  }
  private async loadNow(compiled, opts: Record<string, any> = {}) {
    const t0 = performance.now();
    this.compiled = compiled; this.engine = compiled.engine;
    const eng = compiled.engine;
    // post passes: tone map, denoise, bloom, false colour, vignette, grain, and user passes compiled from their kernels
    const ps = postSettings(eng);
    this.post = ps.post; this.userPasses = ps.userPasses;
    const disp = displaySource(this.userPasses);
    await this.backend.compile(compiled, disp);
    this.compileMs = performance.now() - t0;
    this.reset(); this.repack(opts.time || 0);
    this.emit();
    return this;
  }
  repack(time = 0, overrides = null) {
    if (!this.compiled) return;
    this.time = time;
    const mb = this.motionOverride !== undefined ? this.motionOverride : this.compiled.motionBlur;
    const env = makePackEnv(t => this.posesFor(t), { time, overrides: overrides || this.overrides || null, seed: this.seed || 0, motion: mb });
    this.packed = this.compiled.pack(env);
    this.backend.upload(this.packed);
    this.reset();
  }
  // poses (id → world matrix) at time t: the scene's `export const animation`, then poses pushed from outside
  // (setPoses: a map, or a function of time), which win
  posesFor(t) { return posesAt(this.compiled && this.compiled.animation, this.externalPoses, t, m => { this.poseError = m; }); }
  get animated() { return !!(this.compiled && (this.compiled.animation || typeof this.externalPoses === 'function')); }
  setPoses(p) { this.externalPoses = p || null; if (this.compiled) this.repack(this.time || 0); }
  setSeed(n) { this.seed = n >>> 0; this.reset(); }
  reset() { this.spp = 0; this.frameN++; this.metered = 0; }
  setView(v) { this.view = v; this.reset(); }

  // ---- per frame ----
  frame(o: Record<string, any> = {}) {
    const b = this.backend; if (!b || !this.compiled || b.lost) return false;
    if (this.exclusive && !o.exclusive) return false;
    if (!o.force && b.busy && b.busy()) return false;
    let w: any, h: any;
    if (this.fixedSize) [w, h] = this.fixedSize;
    else {
      const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : { width: 640, height: 400 };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const s = (this.engine.scale || 1) * this.dynScale * (o.scale || 1);
      w = Math.max(16, Math.round(rect.width * dpr * s)); h = Math.max(16, Math.round(rect.height * dpr * s));
    }
    if (b.w !== w || b.h !== h) { b.resize(w, h); this.reset(); }
    const tgt = this.target || (this.engine.spp || 0);
    if (tgt && this.spp >= tgt && !o.force) { if (o.redisplay) this.show(); return false; }
    const t0 = performance.now();
    const U = this.packed.U;
    // the frame's time: given, or the time the scene was last packed at (renders, seeks) — shading fields of time,
    // a moving camera and the packed poses all agree
    const tNow = o.time != null ? o.time : (this.time || 0);
    const { cam, sppF } = frameUniforms(U, this.compiled, { width: w, height: h, spp: this.spp, time: tNow, view: this.view, focusPoint: this.focusPoint, seed: this.seed || 0 });
    this.cam = cam;
    b.setUniforms(U);
    b.trace();
    this.spp += sppF;
    if (o.display !== false) this.show();   // offline renders accumulate without the display pass and show once
    this.lastMs = performance.now() - t0;
    // exposure: meter a few times while the image forms
    if (!this.metering && !this.lockEV && (cam.mode === 'auto') && (this.metered < 3 && (this.spp === 2 || this.spp === 8 || this.spp === 32))) this.meter();
    return true;
  }
  exposureEV() {
    const cam = this.cam || ({} as Record<string, any>);
    const ev = cam.ev != null && cam.mode !== 'auto' ? cam.ev : this.ev;
    return ev - (this.evComp || 0);
  }
  show() {
    const b = this.backend, w = b.w, h = b.h, cam = this.cam || ({} as Record<string, any>);
    const view = { beauty: 0, albedo: 1, normal: 2, depth: 3 }[this.aov || 'beauty'] || 0;
    const { D, denoise } = displayUniforms({ width: w, height: h, spp: this.spp, ev: this.exposureEV(), post: this.post, userPasses: this.userPasses, view, frameN: this.frameN, fov: cam.fov,
      tonemap: this.tonemapOverride, falseColor: this.falseColorOverride, denoise: this.denoiseOverride });
    b.display(D, denoise);
  }
  async meter() {
    this.metering = true;
    try {
      const f = await this.backend.readAccum(); const w = this.backend.w, h = this.backend.h;
      const m = meterExposure(f, w, h);
      if (m) { this.ev = m.ev; this.metered++; this.lastMeter = m; }
      this.emit();
    } catch (e) { /* readback can fail when the context is lost */ }
    finally { this.metering = false; }
  }
  async readLuminanceAt(px, py) {
    const f = await this.backend.readAccum(); const w = this.backend.w, h = this.backend.h;
    const x = Math.max(0, Math.min(w - 1, Math.round(px * w))), y = Math.max(0, Math.min(h - 1, Math.round(py * h)));
    let s = 0, k = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = Math.max(0, Math.min(w - 1, x + dx)), yy = Math.max(0, Math.min(h - 1, y + dy)); const i = (yy * w + xx) * 4, c = f[i + 3] || 1; s += (0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2]) / c; k++; }
    return s / k;
  }
  // ---- output: passes for compositing ----
  // object, face and depth of the first hit, one pinhole sample per pixel through the pixel centre region:
  // { width, height, data: Float32Array (instance, face, distance, 1) per pixel; -1 / 1e4 where nothing is hit }
  async idPass() {
    const b = this.backend; if (!b || !this.compiled) throw new CandelaError('E710', 'idPass: nothing is loaded');
    await b.idle(); this.exclusive = true;
    const U = this.packed.U, save = U.slice();
    try {
      const w = b.w, h = b.h;
      if (!this.cam) this.frame({ force: true, exclusive: true });
      U.set([w, h, 0, 1], 0); U[7] = 0; U[87] = 20;
      b.saveAccum(); b.setUniforms(U); b.trace();
      const data = await b.readBuf('accum');
      b.restoreAccum();
      return { width: w, height: h, data };
    } finally { U.set(save); b.setUniforms(U); this.exclusive = false; }
  }
  // the accumulated beauty (scene-linear, nits), albedo and normal, averaged over the samples so far
  async readPasses() {
    const b = this.backend; await b.idle();
    const w = b.w, h = b.h;
    // both backends return rows top-down
    const c = await b.readBuf('accum'), a = await b.readBuf('aovA'), nn = await b.readBuf('aovN');
    return { width: w, height: h, ...passesFromBuffers(c, a, nn, w, h), spp: this.spp, exposureScale: 1 / (1.2 * Math.pow(2, this.exposureEV())) };
  }
  async snapshot(type = 'image/png') {
    await this.backend.idle();
    const img = await this.backend.readRGBA8();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(img, 0, 0);
    return await new Promise(res => c.toBlob(b => res(b), type, 0.92));
  }
  async snapshotCanvas() { await this.backend.idle(); const img = await this.backend.readRGBA8(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(img, 0, 0); return c; }
}

