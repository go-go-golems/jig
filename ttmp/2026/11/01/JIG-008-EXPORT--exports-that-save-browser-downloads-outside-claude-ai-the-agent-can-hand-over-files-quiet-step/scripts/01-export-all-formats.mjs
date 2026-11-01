import { register } from 'node:module';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const ROOT = process.argv[2], OUT = process.argv[3];
register(new URL(`file://${ROOT}/test/engine/loader.mjs`).href);
const W = await import(`file://${ROOT}/src/engine/worker.js`);
await W.handle({ id: 0, op: 'init' });
mkdirSync(OUT, { recursive: true });
for (const d of ['A-01-box', 'M-07-spur-gear-pair', 'H-01-plant-pot', 'S-08-wall-hook']) {
  const dir = `${ROOT}/content/presets/${d}`;
  const files = Object.fromEntries(readdirSync(dir).filter(f => f !== 'meta.json').map(f => [f, readFileSync(`${dir}/${f}`, 'utf8')]));
  const c = await W.handle({ id: 1, op: 'compile', files, entry: 'script.js', options: {} });
  for (const format of ['stl', '3mf', 'step', 'ir', 'svg', 'dxf', 'obj']) {
    const t = performance.now();
    const r = await W.handle({ id: 2, op: 'export', format });
    if (!r.ok) { console.log(d, format, 'ERROR', r.error.message.slice(0, 120)); continue; }
    const size = typeof r.data === 'string' ? r.data.length : r.data.byteLength;
    writeFileSync(`${OUT}/${r.filename}`, typeof r.data === 'string' ? r.data : Buffer.from(r.data instanceof ArrayBuffer ? r.data : r.data.buffer));
    console.log(d, format, r.filename, r.mime, size, Math.round(performance.now() - t) + 'ms', JSON.stringify(r.report).slice(0, 140));
  }
}
