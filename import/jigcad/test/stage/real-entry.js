// Bundled by test/stage/real.cjs: compiles scripts with the real worker (dist/worker.js) and draws them with
// renderSheet, at sheet size and as shelf thumbnails.
import { renderSheet } from '../../src/stage/index.js';
let w = null;
const rpc = msg => new Promise(res => {
  const id = Math.random();
  const on = e => { if (e.data.id === id) { w.removeEventListener('message', on); res(e.data); } };
  w.addEventListener('message', on); w.postMessage({ ...msg, id });
});
window.boot = async () => { w = new Worker('/dist/worker.js', { type: 'module' }); await rpc({ op: 'init' }); return true; };
const programs = new Map();
window.programs = programs;            // for ad-hoc inspection from Playwright
window.compile = async (name, files) => {
  const t0 = performance.now();
  const r = await rpc({ op: 'compile', files, entry: 'script.js', options: { keep: false } });
  const program = r.program || null;
  if (program) programs.set(name, program);
  const s = program && program.summary || {};
  return { ok: r.ok && program && program.ok !== false, ms: performance.now() - t0, error: r.error && r.error.message, kind: program && program.kind,
    tris: program ? program.bodies.reduce((a, b) => a + b.mesh.indices.length / 3, 0) : 0, edges: program ? program.bodies.reduce((a, b) => a + b.edges.length, 0) : 0,
    bodies: program ? program.bodies.length : 0, plates: program && program.print ? program.print.plates.length : 0,
    diagnostics: (program && program.diagnostics || []).filter(d => d.level !== 'info').map(d => `${d.level} ${d.kind}: ${d.message}`) };
};
window.sheet = (name, view, theme, o = {}) => {
  document.documentElement.setAttribute('data-theme', theme);
  const p = programs.get(name);
  const c = document.createElement('canvas');
  const W = o.width || 1000, H = o.height || 700;
  c.style.width = W + 'px'; c.style.height = H + 'px';
  const r = renderSheet(c, p, { name: view }, { width: W, height: H, dpr: o.dpr || 1, theme, overlays: o.overlays || ['dims', 'shadows', 'grid', 'bed'], ...(o.extra || {}) });
  return { png: c.toDataURL('image/png'), ms: r.ms };
};
window.thumbs = async (list, view, theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.innerHTML = '';
  document.body.style.cssText = `margin:0;padding:12px;display:grid;grid-template-columns:repeat(5, 210px);gap:14px 12px;font:11px Arial;background:${theme === 'dark' ? '#1a1a1a' : '#fff'};color:${theme === 'dark' ? '#f2f2f2' : '#111'}`;
  const times = [];
  for (const { name, view: v } of list) {
    const p = programs.get(name);
    const cell = document.createElement('div');
    const c = document.createElement('canvas');
    c.style.cssText = `width:200px;height:140px;display:block;border:1px solid ${theme === 'dark' ? '#333' : '#ddd'}`;
    cell.appendChild(c);
    const cap = document.createElement('div'); cap.textContent = name; cap.style.marginTop = '3px'; cell.appendChild(cap);
    document.body.appendChild(cell);
    if (!p) continue;
    // first draw (cold: mesh topology and world data are built and cached) and the best of three warm redraws
    let t0 = performance.now();
    renderSheet(c, p, { name: v || view }, { thumbnail: true, width: 200, height: 140, dpr: 2, theme });
    const cold = performance.now() - t0;
    let warm = Infinity;
    for (let i = 0; i < 3; i++) { t0 = performance.now(); renderSheet(c, p, { name: v || view }, { thumbnail: true, width: 200, height: 140, dpr: 2, theme }); warm = Math.min(warm, performance.now() - t0); }
    times.push({ name, ms: warm, cold });
  }
  return times;
};
