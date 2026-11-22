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
  // the machine's GPU through ANGLE on Vulkan (a software adapter compiles Candela's kernel for half a minute and
  // loses the device to the watchdog); RENDER_BACKEND=webgl2 forces Candela's WebGL2 backend
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (process.env.RENDER_BACKEND) await context.addInitScript((b) => { try { localStorage.setItem('jig.render.backend', b); } catch { /* */ } }, process.env.RENDER_BACKEND);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location()?.url ?? ''}`.trim()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.jigHost && window.jigHost.program && !window.jigHost.compiling, null, { timeout: 60000 });
    await page.evaluate(() => jigHost.loadPreset('F-06'));
    await page.waitForFunction(() => jigHost.preset?.id === 'F-06' && jigHost.program?.kind === 'assembly' && !jigHost.compiling, null, { timeout: 60000 });
    await page.click('button.lbl[role=tab]:has-text("Render")');
    await page.waitForFunction(() => window.jigRender && (jigRender.status === 'error' || (jigRender.status === 'ready' && jigRender.vp?.spp >= 16)), null, { timeout: 120000 });
    const st = await page.evaluate(() => ({ status: jigRender.status, message: jigRender.message, backend: jigRender.backend, spp: jigRender.vp?.spp, objects: jigRender.result?.compiled?.objects?.length, diags: jigRender.diags.map((d) => `${d.severity} ${d.code} ${d.message}`) }));
    check('Candela renders F-06', st.status === 'ready', JSON.stringify(st));
    const t0 = await page.evaluate(() => jigRender.time);
    check('the timeline opens at the stage’s pose (the drive at 30° of 0–360° in 4 s)', Math.abs(t0 - 4 * 30 / 360) < 1e-6, `t = ${t0}`);
    console.log('     load', await page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); const i = a?.info || {}; return `${Math.round(jigRender.loadMs)} ms (shader compile), ${jigRender.vp.spp} spp, adapter ${[i.vendor, i.architecture, i.description].filter(Boolean).join(' ') || 'n/a'}${a?.isFallbackAdapter ? ' (fallback)' : ''}`; }));
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
    // the timeline: the default look animates the assembly's first study, F-06's cycle
    const tl = await page.evaluate(() => {
      const rodM = () => { const vp = jigRender.vp, O = vp.packed.O; for (let k = 0; k < vp.packed.nObjs; k++) { const b = k * 24, o = vp.compiled.objects[O[b + 21] | 0]; if (o.def?.name === 'rod/body1') return Array.from(O.subarray(b + 4, b + 16)); } return null; };
      jigRender.setTime(0); const a = rodM(); jigRender.setTime(1); const b = rodM(); jigRender.setTime(0);
      return { duration: jigRender.duration(), study: jigRender.result.compiled.animation?.study, moved: a && b && a.some((v, i) => Math.abs(v - b[i]) > 1e-6), ui: !!document.querySelector('.renderview .rendertime input[type=range]') };
    });
    check('the timeline plays the study cycle and moves the rod', tl.duration === 4 && tl.study === 'cycle' && tl.moved && tl.ui, JSON.stringify(tl));
    const still = await page.evaluate(async () => { const f = await jigRender.renderJob({ kind: 'still', width: 96, height: 64, spp: 4, format: 'png' }); const d = new Uint8Array(f[0].data); return { name: f[0].name, png: d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47, bytes: d.length }; });
    check('a still renders to PNG', still.png && /\.png$/.test(still.name), JSON.stringify(still));
    const seq = await page.evaluate(async () => {
      const out = {};
      for (const format of ['mp4', 'webm']) {
        try { const f = await jigRender.renderJob({ kind: 'sequence', start: 0, end: 0.125, fps: 24, width: 96, height: 64, spp: 2, format }); out[format] = { name: f[0].name, bytes: new Uint8Array(f[0].data).length }; }
        catch (e) { out[format] = { error: e.message }; }
      }
      return out;
    });
    check('a sequence of the timeline encodes to video', (seq.mp4 && seq.mp4.bytes > 0) || (seq.webm && seq.webm.bytes > 0), JSON.stringify(seq));
    const real = errors.filter((e) => !/Failed to load resource.*favicon/.test(e));   // the browser asks for /favicon.ico itself
    check('no console errors', real.length === 0, real.slice(0, 6).join(' | '));
  } catch (e) {
    check('render test ran', false, e.message.split('\n')[0]);
  } finally {
    await browser.close(); server.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
