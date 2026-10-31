// shoot.cjs: render every fixture in all four views and both themes to PNGs under test/stage/out/, plus the
// overlays, selection, hover, sketch and print-bed sheets, time the redraws, and drive the interactive stage
// (orbit, hover, click to select, square up, sketch drag) with a mock host.
// usage: node test/stage/shoot.cjs [--only box,plate] [--no-live]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out');
const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : [];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const save = (name, dataURL) => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(dataURL.split(',')[1], 'base64'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/test/stage/demo.html#nobar`);
  await page.waitForFunction(() => window.ready && window.render);
  await page.evaluate(() => window.ready);
  const fixtures = (await page.evaluate(() => Object.keys(window.FIXTURES))).filter(f => !only.length || only.includes(f));
  let n = 0;
  const shot = async (file, name, view, theme, o = {}) => {
    const r = await page.evaluate(([a, b, c, d]) => window.render(a, b, c, d), [name, view, theme, o]);
    save(file, r.png); n++;
    return r;
  };
  // 1. every fixture × four views × two themes (sketch fixtures also in their own view)
  for (const f of fixtures) for (const theme of ['light', 'dark']) {
    const views = ['axo', 'front', 'side', 'plan'].concat(f.startsWith('sketch') ? ['sketch'] : []);
    for (const v of views) {
      const r = await shot(`${f}-${v}-${theme}`, f, v, theme);
      if (theme === 'light') console.log(`${f.padEnd(15)} ${v.padEnd(6)} ${r.ms.toFixed(1).padStart(6)} ms`);
    }
  }
  // 2. overlays, selection and hover
  const all = ['shadows', 'grid', 'names', 'dims', 'hidden', 'overhang', 'bed', 'normals', 'dof'];
  if (!only.length || only.includes('box')) {
    await shot('box-hidden-normals-light', 'box', 'axo', 'light', { overlays: all });
    await shot('box-selected-light', 'box', 'axo', 'light', { selection: { body: 'box/body1', face: 3, edge: null, name: 'body/side[base.l2]' } });
    await shot('box-selected-dark', 'box', 'axo', 'dark', { selection: { body: 'box/body1', face: 1, edge: 4, name: 'body/side[base.l2] ∩ body/end' } });
    await shot('box-hover-light', 'box', 'axo', 'light', { hover: { body: 'box/body1', face: 1, edge: null, name: 'body/end', at: [600, 300] } });
    await shot('box-sketch-base-light', 'box', { name: 'sketch', sketch: 'base' }, 'light');
    await shot('box-sketch-axo-light', 'box', { name: 'axo', sketch: 'base' }, 'light');
    await shot('box-orbit-light', 'box', { name: 'axo', yaw: 0.9, pitch: 0.35, zoom: 1.1 }, 'light');
    await shot('box-small-light', 'box', 'axo', 'light', { width: 480, height: 320 });
  }
  if (!only.length || only.includes('plate')) await shot('plate-hidden-light', 'plate', 'axo', 'light', { overlays: all });
  if (!only.length || only.includes('plate')) await shot('plate-hidden-front-light', 'plate', 'front', 'light', { overlays: all });
  if (!only.length || only.includes('bracket')) await shot('bracket-hidden-light', 'bracket', 'axo', 'light', { overlays: all });
  if (!only.length || only.includes('print')) {
    await shot('print-overhang-light', 'print', 'axo', 'light', { overlays: all });
    await shot('print-overhang-dark', 'print', 'axo', 'dark', { overlays: all });
    await shot('print-nobed-light', 'print', 'axo', 'light', { overlays: ['shadows', 'grid', 'dims'] });
  }
  if (!only.length || only.includes('torus')) await shot('torus-hidden-light', 'torus', 'axo', 'light', { overlays: all });
  if (!only.length || only.includes('sketch')) await shot('sketch-sketch-hidpi-light', 'sketch', 'sketch', 'light', { dpr: 2 });
  console.log(`${n} sheets in ${path.relative(ROOT, OUT)}/`);

  // 3. redraw time: the 20k-triangle torus at 1200 × 800
  for (const [name, dpr] of [['torus', 1], ['torus', 2], ['plate', 1], ['box', 1]]) {
    const t = await page.evaluate(([a, d]) => window.timeRedraw(a, 'axo', 20, { dpr: d }), [name, dpr]);
    console.log(`redraw ${name} (${t.tris} triangles) 1200 × 800 @${dpr}x: median ${t.median.toFixed(1)} ms (min ${t.min.toFixed(1)}, max ${t.max.toFixed(1)}; ${Object.entries(t.timing).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', ')})`);
  }

  // 4. the interactive stage
  if (!args.includes('--no-live')) {
    const live = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 1 });
    live.on('pageerror', e => errors.push(e.message));
    await live.goto(`http://127.0.0.1:${port}/test/stage/demo.html#nobar`);
    await live.waitForFunction(() => window.ready); await live.evaluate(() => window.ready);
    await live.evaluate(() => window.mountLive('box'));
    await live.waitForTimeout(100);
    const box = await live.locator('#live').boundingBox();
    const at = (x, y) => [box.x + x, box.y + y];
    // hover the top face, then an edge
    const p = await live.evaluate(() => { const s = window.stage._state(); const P = window.Stage.proj(s.cam, [0, 0, 30]); return P; });
    await live.mouse.move(...at(p[0], p[1])); await live.waitForTimeout(60);
    await live.locator('#live').screenshot({ path: path.join(OUT, 'live-hover-face.png') });
    const pe = await live.evaluate(() => { const s = window.stage._state(); return window.Stage.proj(s.cam, [30, 0, 30]); });
    await live.mouse.move(...at(pe[0], pe[1] + 1)); await live.waitForTimeout(60);
    await live.locator('#live').screenshot({ path: path.join(OUT, 'live-hover-edge.png') });
    // click the front face
    const pf = await live.evaluate(() => { const s = window.stage._state(); return window.Stage.proj(s.cam, [0, -20, 15]); });
    await live.mouse.move(...at(pf[0], pf[1])); await live.mouse.down(); await live.mouse.up(); await live.waitForTimeout(80);
    const sel = await live.evaluate(() => window.host.log.filter(x => x[0] === 'select').pop());
    console.log('click →', JSON.stringify(sel && sel[1]));
    await live.locator('#live').screenshot({ path: path.join(OUT, 'live-selected.png') });
    // orbit by dragging, then square up
    await live.mouse.move(...at(600, 400)); await live.mouse.down(); await live.mouse.move(...at(680, 430), { steps: 8 }); await live.mouse.up(); await live.waitForTimeout(80);
    const v1 = await live.evaluate(() => window.stage.getView());
    await live.locator('#live').screenshot({ path: path.join(OUT, 'live-orbit.png') });
    await live.evaluate(() => window.stage.squareUp()); await live.waitForTimeout(50);
    const v2 = await live.evaluate(() => window.stage.getView());
    console.log('orbit →', JSON.stringify({ name: v1.name, yaw: +v1.yaw.toFixed(3), pitch: +v1.pitch.toFixed(3) }), '· square up →', JSON.stringify({ name: v2.name, yaw: v2.yaw, pitch: v2.pitch, zoom: v2.zoom }));
    // wheel zoom, theme switch
    await live.mouse.move(...at(600, 400)); await live.mouse.wheel(0, -300); await live.waitForTimeout(80);
    console.log('wheel → zoom', (await live.evaluate(() => window.stage.getView().zoom)).toFixed(3));
    await live.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await live.waitForTimeout(120);
    await live.locator('#live').screenshot({ path: path.join(OUT, 'live-dark.png') });
    console.log('overlays →', (await live.evaluate(() => window.stage.overlays().map(o => (o.on ? '+' : '-') + o.key).join(' '))));
    // selecting a sketch shows it in its plane; clearing the selection goes back
    await live.evaluate(() => window.host.select({ body: null, face: null, edge: null, sketch: 'base', name: 'base' })); await live.waitForTimeout(80);
    const vs = await live.evaluate(() => window.stage.getView());
    await live.locator('#live').screenshot({ path: path.join(OUT, 'live-sketch-selected.png') });
    await live.evaluate(() => window.host.select(null)); await live.waitForTimeout(80);
    const vb = await live.evaluate(() => window.stage.getView());
    console.log(`select sketch → ${vs.name} ${vs.sketch} · clear → ${vb.name}`);
    // the sketch: drag the hole's centre
    await live.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.host.program = window.FIXTURES.sketch(); window.host.emit('program', window.host.program); });
    await live.waitForTimeout(100);
    const ph = await live.evaluate(() => { const s = window.stage._state(); return window.Stage.proj(s.cam, [20, 5, 0]); });
    await live.mouse.move(...at(ph[0], ph[1])); await live.mouse.down();
    await live.mouse.move(...at(ph[0] + 60, ph[1] - 20), { steps: 12 }); await live.waitForTimeout(60); await live.mouse.up(); await live.waitForTimeout(120);
    const solves = await live.evaluate(() => window.host.log.filter(x => x[0] === 'solve').map(x => x[2].to.map(v => +v.toFixed(2))));
    console.log(`sketch drag → ${solves.length} solves, last ${JSON.stringify(solves[solves.length - 1])}`);
    await live.locator('#live').screenshot({ path: path.join(OUT, 'live-sketch-drag.png') });
    const png = await live.evaluate(() => window.stage.toPNG().slice(0, 22));
    console.log('toPNG →', png);
    await live.evaluate(() => window.stage.destroy());
  }
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
