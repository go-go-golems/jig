// UI test for the Render view (JIG-016): serves dist/, opens preset F-06 (the needle-bar drive) in Chromium, opens
// the Render tab, waits until Candela accumulates samples, picks the rod's crank-pin bore by a click, chooses Brass
// from the library, and checks look.js gets the .meta() line and the view rebuilds; no console errors. Screenshots
// go to test/ui/out/render-*.png.
// Usage: node test/ui/render.cjs      (needs playwright: NODE_PATH=<dir with node_modules/playwright>; CHROMIUM=<a chrome
// binary> when its own browser is not installed)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const { serve } = require('./serve.cjs');

const OUT = path.join(__dirname, 'out');
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(0);
  const url = `http://127.0.0.1:${server.address().port}/`;
  // headless Chromium has no GPU here: WebGPU may be missing, and Candela falls back to WebGL2 (SwiftShader)
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-unsafe-webgpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.jigHost && window.jigHost.program && !window.jigHost.compiling, null, { timeout: 60000 });
    await page.evaluate(() => jigHost.loadPreset('F-06'));
    await page.waitForFunction(() => jigHost.preset?.id === 'F-06' && jigHost.program?.kind === 'assembly' && !jigHost.compiling, null, { timeout: 60000 });
    await page.click('button.lbl[role=tab]:has-text("Render")');
    await page.waitForFunction(() => window.jigRender && (jigRender.status === 'error' || (jigRender.status === 'ready' && jigRender.vp?.spp >= 16)), null, { timeout: 120000 });
    const st = await page.evaluate(() => ({ status: jigRender.status, message: jigRender.message, backend: jigRender.backend, spp: jigRender.vp?.spp, objects: jigRender.result?.compiled?.objects?.length, diags: jigRender.diags.map((d) => `${d.severity} ${d.code} ${d.message}`) }));
    check('Candela renders F-06', st.status === 'ready', JSON.stringify(st));
    await page.locator('.renderwrap').screenshot({ path: path.join(OUT, 'render-f06.png') });

    // find the rod's bore on screen: probe the view with the controller's own pick, then click there for real
    const spot = await page.evaluate(() => {
      for (let y = 0.1; y < 0.9; y += 0.01) for (let x = 0.1; x < 0.9; x += 0.01) { const h = jigRender.pick(x, y); if (h && h.component === 'rod' && /s\.big/.test(h.face)) return { x, y }; }
      return null;
    });
    check('the rod’s crank-pin bore is on screen', !!spot, JSON.stringify(spot));
    if (spot) {
      const box = await page.locator('.renderwrap').boundingBox();
      await page.mouse.click(box.x + spot.x * box.width, box.y + spot.y * box.height);
      const side = await page.locator('.renderside').innerText();
      check('a click names the face as jig does', /rod/.test(side) && /body\/side\[s\.big\]/.test(side.replace(/\s+/g, '')), side.split('\n').slice(0, 3).join(' | '));
      const sel = await page.evaluate(() => jigHost.selection && { name: jigHost.selection.name, body: jigHost.selection.body });
      check('and selects it on the stage', sel && sel.name === 'body/side[s.big]', JSON.stringify(sel));
      await page.click('.renderside button:has-text("Brass")');
      await page.waitForFunction(() => jigHost.files.has('look.js') && jigRender.status === 'ready' && /brass/.test(jigRender._lookKey || ''), null, { timeout: 60000 });
      const look = await page.evaluate(() => jigHost.files.get('look.js'));
      check('Brass writes one .meta() line to look.js', /\.meta\("rod#body\/side\[s\.big\]", \{ material: "brass", finish: null \}\)/.test(look), look.split('\n').filter((l) => l.includes('.meta(')).join(' | '));
      await page.waitForFunction(() => jigRender.vp?.spp >= 16, null, { timeout: 60000 });
      await page.locator('.renderwrap').screenshot({ path: path.join(OUT, 'render-f06-brass.png') });
    }
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('render test ran', false, e.message.split('\n')[0]);
  } finally {
    await browser.close(); server.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
