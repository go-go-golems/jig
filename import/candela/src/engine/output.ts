// output.js — renders that leave the workbench: stills and frame sequences at a fixed size, sample count and
// seed; OpenEXR files with the passes a compositor wants (beauty, albedo, normal, depth, instance and face ids);
// store-only ZIP archives for sequences; and a queue that runs jobs one after another.
import { CandelaError } from './diag';
import { VideoWriter } from './video';

// ---------- OpenEXR: scanline, uncompressed, 32-bit float channels ----------
// channels: [{ name, data: Float32Array(width·height) }] in any order (written sorted, as the format requires)
export function writeEXR({ width, height, channels, attributes = ({} as Record<string, any>) }) {
  if (!(width > 0 && height > 0)) throw new CandelaError('E121', 'writeEXR: width and height must be positive');
  const ch = channels.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const c of ch) if (!c.data || c.data.length < width * height) throw new CandelaError('E121', `writeEXR: channel '${c.name}' has ${c.data ? c.data.length : 0} values, needs ${width * height}`);
  const enc = new TextEncoder();
  const parts: any[] = []; let size = 0;
  const push = u8 => { parts.push(u8); size += u8.length; };
  const i32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return b; };
  const f32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return b; };
  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
  const z = new Uint8Array([0]);
  const attr = (name, type, value) => { push(enc.encode(name)); push(z); push(enc.encode(type)); push(z); push(i32(value.length)); push(value); };
  push(new Uint8Array([0x76, 0x2f, 0x31, 0x01, 2, 0, 0, 0]));
  attr('channels', 'chlist', cat(...ch.map(c => cat(enc.encode(c.name), z, i32(2), new Uint8Array([0, 0, 0, 0]), i32(1), i32(1))), z));
  attr('compression', 'compression', new Uint8Array([0]));
  const box = cat(i32(0), i32(0), i32(width - 1), i32(height - 1));
  attr('dataWindow', 'box2i', box); attr('displayWindow', 'box2i', box);
  attr('lineOrder', 'lineOrder', new Uint8Array([0]));
  attr('pixelAspectRatio', 'float', f32(1));
  attr('screenWindowCenter', 'v2f', cat(f32(0), f32(0)));
  attr('screenWindowWidth', 'float', f32(1));
  for (const [k, v] of Object.entries(attributes)) if (v != null) attr(k, 'string', enc.encode(String(v)));
  push(z);
  // offsets of each scanline block, then the blocks: y, byte count, each channel's row
  const lineBytes = ch.length * width * 4, blockBytes = 8 + lineBytes, tableAt = size, dataAt = tableAt + height * 8;
  const out = new Uint8Array(dataAt + height * blockBytes);
  let k = 0; for (const p of parts) { out.set(p, k); k += p.length; }
  const dv = new DataView(out.buffer);
  for (let y = 0; y < height; y++) { const off = dataAt + y * blockBytes; dv.setUint32(tableAt + y * 8, off >>> 0, true); dv.setUint32(tableAt + y * 8 + 4, Math.floor(off / 4294967296), true); }
  const row = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const off = dataAt + y * blockBytes; dv.setInt32(off, y, true); dv.setInt32(off + 4, lineBytes, true);
    ch.forEach((c, j) => { row.set(c.data.subarray(y * width, (y + 1) * width)); out.set(new Uint8Array(row.buffer), off + 8 + j * width * 4); });
  }
  return out;
}
// a reader for the files writeEXR makes (tests, and re-loading a render as an HDRI)
export function readEXR(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 20000630) throw new CandelaError('E121', 'readEXR: not an OpenEXR file');
  let p = 8; const str = () => { let s = ''; while (u8[p]) s += String.fromCharCode(u8[p++]); p++; return s; };
  const H: Record<string, any> = {};
  for (;;) { const name = str(); if (!name) break; const type = str(), n = dv.getInt32(p, true); p += 4; H[name] = { type, at: p, n }; p += n; }
  if (u8[H.compression.at] !== 0) throw new CandelaError('E121', 'readEXR: only uncompressed files');
  const chans: any[] = []; { let q = H.channels.at; const end = q + H.channels.n - 1; while (q < end) { let s = ''; while (u8[q]) s += String.fromCharCode(u8[q++]); q++; chans.push({ name: s, type: dv.getInt32(q, true) }); q += 16; } }
  const b = H.dataWindow.at, x0 = dv.getInt32(b, true), y0 = dv.getInt32(b + 4, true), w = dv.getInt32(b + 8, true) - x0 + 1, h = dv.getInt32(b + 12, true) - y0 + 1;
  const attrs: Record<string, any> = {}; for (const [k, v] of Object.entries(H)) if (v.type === 'string') attrs[k] = new TextDecoder().decode(u8.subarray(v.at, v.at + v.n));
  const out: Record<string, any> = {}; for (const c of chans) { if (c.type !== 2) throw new CandelaError('E121', 'readEXR: only 32-bit float channels'); out[c.name] = new Float32Array(w * h); }
  for (let y = 0; y < h; y++) {
    const off = Number(dv.getBigUint64(p + y * 8, true)), yy = dv.getInt32(off, true) - y0;
    chans.forEach((c, j) => { const s = off + 8 + j * w * 4; for (let x = 0; x < w; x++) out[c.name][yy * w + x] = dv.getFloat32(s + x * 4, true); });
  }
  return { width: w, height: h, channels: out, attributes: attrs };
}

// the passes as EXR channels. Beauty is scene-linear: 'exposed' (default) multiplies by the camera's exposure,
// so a mid-grey card reads about 0.18 as in a photograph; 'absolute' keeps nits
export function passesToEXR(P, ids, o: Record<string, any> = {}) {
  const n = P.width * P.height, k = o.exposure === 'absolute' ? 1 : P.exposureScale;
  const split = (src, comps, scale = 1) => comps.map((_, j) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = src[i * comps.length + j] * scale; return a; });
  const [R, G, B] = split(P.beauty, [0, 1, 2], k), [aR, aG, aB] = split(P.albedo, [0, 1, 2]), [nX, nY, nZ] = split(P.normal, [0, 1, 2]);
  const A = new Float32Array(n).fill(1);
  const channels = [{ name: 'R', data: R }, { name: 'G', data: G }, { name: 'B', data: B }, { name: 'A', data: A }];
  if (o.albedo !== false) channels.push({ name: 'albedo.R', data: aR }, { name: 'albedo.G', data: aG }, { name: 'albedo.B', data: aB });
  if (o.normal !== false) channels.push({ name: 'N.X', data: nX }, { name: 'N.Y', data: nY }, { name: 'N.Z', data: nZ });
  if (ids) {
    const inst = new Float32Array(n), face = new Float32Array(n), Z = new Float32Array(n);
    for (let i = 0; i < n; i++) { inst[i] = ids.data[i * 4]; face[i] = ids.data[i * 4 + 1]; Z[i] = ids.data[i * 4 + 2]; }
    channels.push({ name: 'Z', data: Z }, { name: 'id.instance', data: inst }, { name: 'id.face', data: face });
    for (let i = 0; i < n; i++) if (inst[i] < 0) A[i] = 0;
  }
  return writeEXR({ width: P.width, height: P.height, channels, attributes: Object.assign({ comments: `Candela render · ${P.spp} spp · beauty ${o.exposure === 'absolute' ? 'in nits' : `× exposure (${P.exposureScale.toExponential(4)})`}`, software: 'Candela 0.4' }, o.attributes || {}) });
}

// ---------- ZIP (store only) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zipStore(files) {
  const enc = new TextEncoder(), recs: any[] = [], d = new Date();
  const dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let size = 0; for (const f of files) size += 30 + enc.encode(f.name).length + f.data.length + 46 + enc.encode(f.name).length;
  if (size + 22 > 0xffffffff) throw new CandelaError('E121', 'zip: more than 4 GB — render the sequence as separate files');
  const out = new Uint8Array(size + 22), dv = new DataView(out.buffer); let p = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    recs.push({ name, crc, size: f.data.length, at: p });
    dv.setUint32(p, 0x04034b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, 0x0800, true); dv.setUint16(p + 8, 0, true);
    dv.setUint16(p + 10, dosT, true); dv.setUint16(p + 12, dosD, true); dv.setUint32(p + 14, crc, true); dv.setUint32(p + 18, f.data.length, true); dv.setUint32(p + 22, f.data.length, true);
    dv.setUint16(p + 26, name.length, true); dv.setUint16(p + 28, 0, true); out.set(name, p + 30); out.set(f.data, p + 30 + name.length); p += 30 + name.length + f.data.length;
  }
  const cd = p;
  for (const r of recs) {
    dv.setUint32(p, 0x02014b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, 20, true); dv.setUint16(p + 8, 0x0800, true); dv.setUint16(p + 10, 0, true);
    dv.setUint16(p + 12, dosT, true); dv.setUint16(p + 14, dosD, true); dv.setUint32(p + 16, r.crc, true); dv.setUint32(p + 20, r.size, true); dv.setUint32(p + 24, r.size, true);
    dv.setUint16(p + 28, r.name.length, true); dv.setUint16(p + 30, 0, true); dv.setUint16(p + 32, 0, true); dv.setUint16(p + 34, 0, true); dv.setUint16(p + 36, 0, true); dv.setUint32(p + 38, 0, true); dv.setUint32(p + 42, r.at, true);
    out.set(r.name, p + 46); p += 46 + r.name.length;
  }
  dv.setUint32(p, 0x06054b50, true); dv.setUint16(p + 8, recs.length, true); dv.setUint16(p + 10, recs.length, true); dv.setUint32(p + 12, p - cd, true); dv.setUint32(p + 16, cd, true);
  return out;
}

// ---------- rendering jobs ----------
const sleep0 = () => new Promise(r => setTimeout(r, 0));
const aborted = () => new CandelaError('E720', 'render cancelled');
// accumulate exactly `spp` samples at the viewport's fixed size
async function accumulate(vp, spp, signal, onStep) {
  vp.reset();
  let last = performance.now();
  while (vp.spp < spp) {
    if (signal && signal.aborted) throw aborted();
    vp.frame({ force: true, exclusive: true, display: false });
    await vp.backend.idle();
    if (onStep) onStep(Math.min(1, vp.spp / spp));
    if (performance.now() - last > 120) { await sleep0(); last = performance.now(); }
  }
}
const pngBytes = async vp => new Uint8Array(await (await vp.snapshot('image/png')).arrayBuffer());
const pad = (n, k = 4) => String(n).padStart(k, '0');

// a render job: still or sequence. o: { width, height, spp, seed, format: 'png' | 'exr' | 'both' | 'mp4' | 'webm'
// (video: sequences only; quality: draft | standard | high | max, or bitrate in bits/s; keyframeInterval s), exposure,
// time (still), start, end | frames, fps (sequence), seedMode: 'per-frame' | 'fixed', name }
// ctx: { vp, seek(t, dt) → moves the scene (clock, behaviours, poses) to t, onProgress(fraction, note), signal }
export async function runRender(o, ctx) {
  const { vp, signal } = ctx; const prog = ctx.onProgress || (() => {});
  if (!vp || !vp.compiled) throw new CandelaError('E710', 'render: no scene is loaded');
  const fmt = o.format || 'png', base = (o.name || 'candela').replace(/[^\w.-]+/g, '-');
  const video = fmt === 'mp4' || fmt === 'webm';
  if (video && o.kind !== 'sequence') throw new CandelaError('E121', `render: ${fmt} is a video format — render a sequence`);
  // video wants even dimensions (4:2:0 chroma)
  const even = v => (video ? Math.max(2, v - (v % 2)) : v);
  const W = even(Math.round(o.width || 1920)), H = even(Math.round(o.height || 1080)), spp = Math.max(1, Math.round(o.spp || 256));
  if (W * H > 16e6) throw new CandelaError('E121', `render: ${W}×${H} is more than 16 megapixels`);
  const state = { size: vp.fixedSize, seed: vp.seed, lock: vp.lockEV, ev: vp.ev, view: vp.view };
  vp.exclusive = true; vp.fixedSize = [W, H];
  const out: any[] = [];
  let writer: any = null;
  try {
    const frames = o.kind === 'sequence' ? (o.frames != null ? o.frames : Math.max(1, Math.round(((o.end ?? 1) - (o.start ?? 0)) * (o.fps || 24)) + 1)) : 1;
    const fps = o.fps || 24, t0 = o.kind === 'sequence' ? (o.start ?? 0) : (o.time ?? null);
    if (video) writer = await VideoWriter.create({ container: fmt, width: W, height: H, fps, bitrate: o.bitrate, quality: o.quality, keyframeInterval: o.keyframeInterval });
    let lockedEV: any = null;
    for (let f = 0; f < frames; f++) {
      if (signal && signal.aborted) throw aborted();
      const t = o.kind === 'sequence' ? t0 + f / fps : t0;
      if (t != null && ctx.seek) await ctx.seek(t, o.kind === 'sequence' ? (f === 0 ? 0 : 1 / fps) : 0);
      vp.seed = ((o.seed ?? 1) + (o.kind === 'sequence' && o.seedMode !== 'fixed' ? f : 0)) >>> 0;
      // exposure: metered on the first frame and then held, so a sequence does not flicker
      if (lockedEV != null) { vp.lockEV = true; vp.ev = lockedEV; } else vp.lockEV = false;
      await accumulate(vp, spp, signal, x => prog((f + x * 0.95) / frames, `frame ${f + 1}/${frames}`));
      if (lockedEV == null) { if (vp.metering) await new Promise<void>(r => { const k = setInterval(() => { if (!vp.metering) { clearInterval(k); r(); } }, 10); }); lockedEV = vp.ev; vp.lockEV = true; }
      vp.show(); await vp.backend.idle();
      const stem = o.kind === 'sequence' ? `${base}.${pad(f + (o.firstFrame ?? 1))}` : base;
      if (writer) await writer.add(await vp.backend.readRGBA8());
      if (fmt === 'png' || fmt === 'both') out.push({ name: stem + '.png', data: await pngBytes(vp) });
      if (fmt === 'exr' || fmt === 'both') {
        const P = await vp.readPasses(); const ids = await vp.idPass();
        out.push({ name: stem + '.exr', data: passesToEXR(P, ids, { exposure: o.exposure, attributes: { 'candela.time': t != null ? t.toFixed(6) : null, 'candela.seed': String(vp.seed) } }) });
      }
      prog((f + 1) / frames, `frame ${f + 1}/${frames}`);
    }
    if (writer) { prog(0.99, 'encoding'); const data = await writer.finish(); writer = null; return [{ name: `${base}.${fmt}`, data }]; }
    if (o.kind === 'sequence' && o.packaging !== 'files') return [{ name: base + '.zip', data: zipStore(out) }];
    return out;
  } finally {
    if (writer) writer.close();
    vp.fixedSize = state.size; vp.seed = state.seed; vp.lockEV = state.lock; vp.exclusive = false; vp.reset();
  }
}

// one job after another; jobs: { id, kind, opts, status: queued | running | done | failed | cancelled, progress, note, files }
export class RenderQueue {
  jobs: any;
  ctxOf: any;
  onChange: any;
  n: number;
  busy: boolean;
  constructor(ctxOf, onChange) { this.jobs = []; this.ctxOf = ctxOf; this.onChange = onChange || (() => {}); this.n = 0; }
  add(opts) { const j = { id: ++this.n, kind: opts.kind || 'still', opts, status: 'queued', progress: 0, note: '', files: null, added: Date.now() }; this.jobs.push(j); this.onChange(); this.pump(); return j; }
  cancel(id) { const j = this.jobs.find(x => x.id === id); if (!j) return; if (j.status === 'queued') { j.status = 'cancelled'; this.onChange(); } else if (j.status === 'running' && j.ctrl) j.ctrl.abort(); }
  clear() { this.jobs = this.jobs.filter(j => j.status === 'queued' || j.status === 'running'); this.onChange(); }
  get running() { return this.jobs.find(j => j.status === 'running') || null; }
  async pump() {
    if (this.busy) return; this.busy = true;
    try {
      for (let j: any; (j = this.jobs.find(x => x.status === 'queued'));) {
        j.status = 'running'; j.ctrl = new AbortController(); j.started = Date.now(); this.onChange();
        let ctx: any = null;
        try {
          ctx = Object.assign({}, this.ctxOf(j), { signal: j.ctrl.signal, onProgress: (p, note) => { j.progress = p; j.note = note || ''; this.onChange(); } });
          j.files = await runRender(Object.assign({ kind: j.kind }, j.opts), ctx);
          j.status = 'done'; j.progress = 1; j.ms = Date.now() - j.started;
          if (ctx.onDone) await ctx.onDone(j);
        } catch (e) { j.status = e && e.code === 'E720' ? 'cancelled' : 'failed'; j.error = e.message; }
        finally { j.ctrl = null; if (ctx && ctx.onFinish) ctx.onFinish(j); this.onChange(); }
      }
    } finally { this.busy = false; }
  }
}
