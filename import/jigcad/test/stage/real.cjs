// real.cjs: the stage on real OpenCascade output. Compiles the stress scripts in test/stage/real/*.js and every
// preset in content/presets/ with dist/worker.js, draws each at sheet size (1000 × 700, light) in one view and all
// of them as shelf thumbnails on a contact sheet, and times the thumbnails (budget 15 ms each).
// usage: node test/stage/real.cjs [filter…] [--view=axo] [--dark] [--no-sheets]      (needs `node build.mjs`)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { build } = require('/opt/npm-tools/node_modules/esbuild/lib/main.js');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out/real');
const args = process.argv.slice(2), filters = args.filter(a => !a.startsWith('--'));
const view = (args.find(a => a.startsWith('--view=')) || '--view=axo').slice(7), theme = args.includes('--dark') ? 'dark' : 'light';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.gz': 'application/octet-stream', '.wasm': 'application/wasm' };
const save = (name, url) => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await build({ entryPoints: [path.join(__dirname, 'real-entry.js')], bundle: true, format: 'esm', outfile: path.join(OUT, '_real.js'), logLevel: 'error' });
  fs.writeFileSync(path.join(OUT, '_real.html'), '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/dist/fonts/fonts.css"></head><body><script type="module" src="./_real.js"></script></body></html>');
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const jobs = [];
  for (const f of fs.readdirSync(path.join(__dirname, 'real')).filter(f => f.endsWith('.js')).sort())
    jobs.push({ name: 'x-' + f.replace(/\.js$/, ''), files: { 'script.js': fs.readFileSync(path.join(__dirname, 'real', f), 'utf8') }, view: null });
  const PD = path.join(ROOT, 'content/presets');
  for (const d of fs.readdirSync(PD).filter(d => fs.statSync(path.join(PD, d)).isDirectory()).sort()) {
    if (!fs.existsSync(path.join(PD, d, 'meta.json')) || !fs.existsSync(path.join(PD, d, 'script.js'))) continue;
    const files = {};
    for (const f of fs.readdirSync(path.join(PD, d))) if (f !== 'meta.json' && fs.statSync(path.join(PD, d, f)).isFile()) files[f] = fs.readFileSync(path.join(PD, d, f), 'utf8');
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(PD, d, 'meta.json'), 'utf8')); } catch {}
    jobs.push({ name: d, files, view: meta.view || null });
  }
  const list = jobs.filter(j => !filters.length || filters.some(f => j.name.includes(f)));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1140, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/test/stage/out/real/_real.html`);
  await page.waitForFunction(() => window.boot);
  await page.evaluate(() => window.boot());
  for (const j of list) {
    const r = await page.evaluate(([n, f]) => window.compile(n, f), [j.name, j.files]);
    j.ok = r.ok;
    let line = `${r.ok ? 'ok  ' : 'FAIL'} ${j.name.padEnd(34)} ${r.ms.toFixed(0).padStart(5)} ms · ${r.kind} · ${r.bodies} bodies · ${r.tris} tris · ${r.edges} edges${r.plates ? ` · ${r.plates} plates` : ''}`;
    if (!args.includes('--no-sheets')) {
      const s = await page.evaluate(([n, v, t]) => window.sheet(n, v, t), [j.name, view === 'meta' ? (j.view || 'axo') : view, theme]);
      save(`${j.name}-${view}${theme === 'dark' ? '-dark' : ''}`, s.png);
      line += ` · sheet ${s.ms.toFixed(1)} ms`;
    }
    console.log(line + (r.error ? ` · ${r.error}` : '') + (r.diagnostics.length ? '\n     ' + r.diagnostics.slice(0, 3).join('\n     ') : ''));
  }
  const times = await page.evaluate(([l, v, t]) => window.thumbs(l, v, t), [list.map(j => ({ name: j.name, view: view === 'meta' ? j.view : null })), view === 'meta' ? 'axo' : view, theme]);
  await page.setViewportSize({ width: 1140, height: Math.max(200, Math.ceil(list.length / 5) * 172 + 30) });
  await page.screenshot({ path: path.join(OUT, `contact-${view}${theme === 'dark' ? '-dark' : ''}.png`), fullPage: true });
  const slow = times.filter(t => t.ms > 15);
  const mean = times.reduce((a, t) => a + t.ms, 0) / Math.max(1, times.length);
  const meanCold = times.reduce((a, t) => a + t.cold, 0) / Math.max(1, times.length);
  console.log(`\nthumbnails: ${times.length}, redraw mean ${mean.toFixed(1)} ms, max ${Math.max(0, ...times.map(t => t.ms)).toFixed(1)} ms; first draw mean ${meanCold.toFixed(1)} ms, max ${Math.max(0, ...times.map(t => t.cold)).toFixed(1)} ms${slow.length ? ` · redraws over 15 ms: ${slow.map(t => `${t.name} ${t.ms.toFixed(1)}`).join(', ')}` : ''}`);
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 5).join('\n  '));
  console.log(`sheets and contact-${view}.png in test/stage/out/real/`);
  await browser.close(); srv.close();
})();
