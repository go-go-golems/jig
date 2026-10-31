// Bundled to dist/_shot.js by tools/preset-shot.cjs: renders one preset with the real worker and renderSheet.
import { renderSheet } from '../src/stage/index.js';
window.shoot = async ({ files, view = 'axo', width = 1000, height = 700, theme = 'light' }) => {
  document.documentElement.setAttribute('data-theme', theme);
  const w = new Worker('./worker.js', { type: 'module' });
  const rpc = (msg) => new Promise((res) => { const id = Math.random(); w.onmessage = e => e.data.id === id && res(e.data); w.postMessage({ ...msg, id }); });
  await rpc({ op: 'init' });
  const r = await rpc({ op: 'compile', files, entry: 'script.js', options: {} });
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
  document.body.appendChild(canvas);
  if (r.program) renderSheet(canvas, r.program, { name: view }, { overlays: ['dims', 'shadows', 'grid'] });
  return { ok: r.ok, error: r.error?.message, diagnostics: (r.program?.diagnostics ?? []).map(d => `${d.level} ${d.kind}: ${d.message}`) };
};
