// Render presets to PNG with the real engine in headless Chromium: node tools/preset-shot.cjs <filter…> [--view=front]
// Writes test/presets/out/<preset>-<view>.png. Needs `node build.mjs` first (uses dist/worker.js).
const { chromium } = require('playwright');
const { build } = require('/opt/npm-tools/node_modules/esbuild/lib/main.js');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
(async () => {
  const view = (process.argv.find(a => a.startsWith('--view=')) || '--view=axo').slice(7);
  const filters = process.argv.slice(2).filter(a => !a.startsWith('--'));
  await build({ entryPoints: [path.join(__dirname, 'shot-entry.js')], bundle: true, format: 'esm', outfile: path.join(ROOT, 'dist/_shot.js'), logLevel: 'error' });
  fs.writeFileSync(path.join(ROOT, 'dist/_shot.html'), '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fonts/fonts.css"></head><body style="margin:0;background:#fff"><script type="module" src="./_shot.js"></script></body></html>');
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, 'dist', decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = server.address().port;
  const PDIR = path.join(ROOT, 'content/presets');
  let dirs = fs.readdirSync(PDIR).filter(d => fs.statSync(path.join(PDIR, d)).isDirectory()).sort();
  if (filters.length) dirs = dirs.filter(d => filters.some(f => d.includes(path.basename(f))));
  const outDir = path.join(ROOT, 'test/presets/out'); fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  for (const d of dirs) {
    const files = {};
    for (const f of fs.readdirSync(path.join(PDIR, d))) if (f !== 'meta.json') files[f] = fs.readFileSync(path.join(PDIR, d, f), 'utf8');
    const page = await b.newPage({ viewport: { width: 1000, height: 700 } });
    await page.goto(`http://localhost:${port}/_shot.html`);
    await page.waitForFunction(() => window.shoot);
    const r = await page.evaluate(a => window.shoot(a), { files, view });
    const out = path.join(outDir, `${d}-${view}.png`);
    await page.locator('canvas').screenshot({ path: out });
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${d} → ${path.relative(ROOT, out)}${r.error ? ' · ' + r.error : ''}${r.diagnostics.length ? '\n     ' + r.diagnostics.join('\n     ') : ''}`);
    await page.close();
  }
  await b.close(); server.close();
})();
