// node test/gallery.js [ids…] — render presets headless (WebGL2/swiftshader) into shots/p-<id>.png and a contact sheet
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/home/claude/.npm-global/lib/node_modules/playwright'); } })();
const esbuild = (() => { try { return require('esbuild'); } catch (e) { return require('/opt/npm-tools/node_modules/esbuild'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const { loadPresets } = require('../build/build.js');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'harness.js')], bundle: true, format: 'iife', outfile: path.join(__dirname, 'harness.bundle.js'), logLevel: 'error' });
const root = __dirname;
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'text/javascript'); r.end(fs.readFileSync(f)); }).listen(8768);
(async () => {
  const args = process.argv.slice(2), frames = +(process.env.FRAMES || 24), be = process.env.BACKEND || 'webgl2';
  const ps = loadPresets().filter(p => !args.length || args.some(a => p.id.startsWith(a)));
  const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'] });
  fs.mkdirSync('/home/claude/shots/g', { recursive: true });
  for (const p of ps) {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://localhost:8768/harness.html');
    const out = await page.evaluate(([files, b, f]) => window.runTest(files, b, f), [p.files, be, frames]);
    if (out.png) fs.writeFileSync(`/home/claude/shots/g/${p.id}.png`, Buffer.from(out.png.split(',')[1], 'base64'));
    console.log(p.id.padEnd(6), out.ok ? `ev ${(+out.ev).toFixed(2)} spp ${out.spp} ${(+out.ms).toFixed(0)} ms/f` : 'FAIL', out.error || '', out.logs && out.logs.length ? 'logs: ' + JSON.stringify(out.logs).slice(0, 200) : '', errs.join(' ').slice(0, 200));
    await page.close();
  }
  await browser.close(); srv.close();
})();
