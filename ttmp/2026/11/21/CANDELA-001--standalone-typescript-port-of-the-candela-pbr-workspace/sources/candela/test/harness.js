import { build, formatDiag } from '../src/candela.js';
import { Viewport } from '../src/viewport.js';
window.runTest = async (src, prefer, frames = 8) => {
  const files = typeof src === 'string' ? { 'scene.js': src } : src;
  const out = { diags: [], logs: [] };
  try {
    const r = await build(files);
    out.diags = r.diags.map(formatDiag); out.logs = r.logs; out.ok = r.ok;
    if (!r.ok) return out;
    const cv = document.getElementById('cv');
    const vp = window.vp = new Viewport(cv);
    await vp.init(prefer);
    out.backend = vp.backendName;
    await vp.load(r.compiled);
    for (let i = 0; i < frames; i++) { vp.frame({ force: true }); await vp.backend.idle(); }
    await new Promise(r => setTimeout(r, 50));
    const blob = await vp.snapshot();
    out.png = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    out.spp = vp.spp; out.ev = vp.ev; out.ms = vp.lastMs; out.compileMs = vp.compileMs;
  } catch (e) { out.error = e.message; out.stack = String(e.stack).split('\n').slice(0, 6).join('\n'); if (e.shaderErrors) out.shaderErrors = e.shaderErrors.slice(0, 5); if (e.source) out.srcLines = e.source.split('\n'); }
  return out;
};

// output: a still (PNG + EXR passes) and a short sequence through runRender; returns sizes and EXR statistics
import { runRender, readEXR } from '../src/output.js';
window.runOutput = async (src, prefer) => {
  const files = typeof src === 'string' ? { 'scene.js': src } : src;
  const out = {};
  try {
    const r = await build(files); if (!r.ok) return { error: r.diags.map(formatDiag).join('\n') };
    const vp = window.vp = new Viewport(document.getElementById('cv'));
    await vp.init(prefer); await vp.load(r.compiled);
    for (let i = 0; i < 4; i++) { vp.frame({ force: true }); await vp.backend.idle(); }
    const sppBefore = vp.spp;
    const ids = await vp.idPass();
    out.afterIdSpp = vp.spp; out.sppBefore = sppBefore;
    const seek = t => vp.repack(t);
    const still = await runRender({ kind: 'still', width: 160, height: 90, spp: 8, seed: 3, format: 'both', time: 0.25 }, { vp, seek });
    out.still = still.map(f => [f.name, f.data.length]);
    const exr = readEXR(still.find(f => f.name.endsWith('.exr')).data);
    const ch = exr.channels, n = exr.width * exr.height, stat = a => { let mn = Infinity, mx = -Infinity, s = 0; for (const v of a) { mn = Math.min(mn, v); mx = Math.max(mx, v); s += v; } return [+mn.toFixed(4), +mx.toFixed(4), +(s / a.length).toFixed(4)]; };
    out.exr = { size: [exr.width, exr.height], channels: Object.keys(ch), R: stat(ch.R), Z: stat(ch.Z.filter(v => v < 1e3)), inst: [...new Set(ch['id.instance'])].sort((a, b) => a - b), faces: [...new Set(ch['id.face'])].length, alb: stat(ch['albedo.G']), N: stat(ch['N.Y']), attrs: exr.attributes };
    // determinism: the same still twice gives the same PNG bytes
    const again = await runRender({ kind: 'still', width: 160, height: 90, spp: 8, seed: 3, format: 'png', time: 0.25 }, { vp, seek });
    const a = still.find(f => f.name.endsWith('.png')).data, b = again[0].data; let same = a.length === b.length; if (same) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
    out.deterministic = same;
    const seq = await runRender({ kind: 'sequence', width: 96, height: 54, spp: 4, seed: 1, format: 'png', start: 0, end: 0.1, fps: 20 }, { vp, seek, onProgress: () => {} });
    out.seq = seq.map(f => [f.name, f.data.length]);
    out.idsTop = [ids.width, ids.height, ids.data[(Math.floor(ids.height / 2) * ids.width + Math.floor(ids.width / 2)) * 4], ids.data[(Math.floor(ids.height / 2) * ids.width + Math.floor(ids.width / 2)) * 4 + 1]];
    const blob = await vp.snapshot(); out.png = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  } catch (e) { out.error = e.message; out.stack = String(e.stack).split('\n').slice(0, 6).join('\n'); }
  return out;
};

// video: a short sequence as MP4 and WebM; returns the files as base64 for ffprobe
window.runVideo = async (src, prefer, formats = ['mp4', 'webm']) => {
  const files = typeof src === 'string' ? { 'scene.js': src } : src;
  const out = { files: {} };
  try {
    const r = await build(files); if (!r.ok) return { error: r.diags.map(formatDiag).join('\n') };
    const vp = window.vp = new Viewport(document.getElementById('cv'));
    await vp.init(prefer); await vp.load(r.compiled);
    const { videoSupport } = await import('../src/video.js');
    out.support = await videoSupport(320, 180, 12);
    for (const fmt of formats) {
      const t0 = performance.now();
      const res = await runRender({ kind: 'sequence', width: 321, height: 181, spp: 2, seed: 1, format: fmt, start: 0, end: 1, fps: 12, quality: 'high' }, { vp, seek: t => vp.repack(t), onProgress: () => {} });
      const f = res[0];
      out.files[f.name] = { bytes: f.data.length, ms: Math.round(performance.now() - t0), b64: await new Promise(res2 => { const fr = new FileReader(); fr.onload = () => res2(fr.result.split(',')[1]); fr.readAsDataURL(new Blob([f.data])); }) };
    }
  } catch (e) { out.error = e.message; out.stack = String(e.stack).split('\n').slice(0, 6).join('\n'); }
  return out;
};

// a render job on a fresh viewport: build the files, run one job, return its files as base64
window.renderJob = async (files, prefer, opts) => {
  const out = {};
  try {
    const r = await build(files); if (!r.ok) return { error: r.diags.map(formatDiag).join('\n') };
    out.warnings = r.diags.filter(d => d.severity !== 'info').map(formatDiag);
    const vp = window.vp = new Viewport(document.getElementById('cv'));
    await vp.init(prefer); const t0 = performance.now(); await vp.load(r.compiled, { time: opts.time || opts.start || 0 }); out.compileMs = Math.round(performance.now() - t0);
    out.stats = r.compiled.stats; out.backend = vp.backendName;
    const t1 = performance.now(), log = [];
    const res = await runRender(opts, { vp, seek: t => vp.repack(t), onProgress: (p, note) => { const s = `${(p * 100).toFixed(0)}% ${note}`; if (log[log.length - 1] !== s) log.push(s); } });
    out.ms = Math.round(performance.now() - t1); out.ev = vp.ev;
    out.files = [];
    for (const f of res) out.files.push({ name: f.name, b64: await new Promise(res2 => { const fr = new FileReader(); fr.onload = () => res2(fr.result.split(',')[1]); fr.readAsDataURL(new Blob([f.data])); }) });
  } catch (e) { out.error = e.message; out.stack = String(e.stack).split('\n').slice(0, 6).join('\n'); }
  return out;
};
