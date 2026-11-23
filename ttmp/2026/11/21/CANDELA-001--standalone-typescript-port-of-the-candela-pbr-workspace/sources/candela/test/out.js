// node test/out.js scene.js [backend] — the output path (still, EXR passes, determinism, sequence) headless
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/home/claude/.npm-global/lib/node_modules/playwright'); } })();
const esbuild = (() => { try { return require('esbuild'); } catch (e) { return require('/opt/npm-tools/node_modules/esbuild'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'harness.js')], bundle: true, format: 'iife', outfile: path.join(__dirname, 'harness.bundle.js'), logLevel: 'error' });
const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'text/javascript'); r.end(fs.readFileSync(f)); }).listen(8769);
(async () => {
  const src = fs.readFileSync(process.argv[2], 'utf8'), be = process.argv[3] || 'webgl2';
  const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8769/harness.html');
  const out = await page.evaluate(([s, b]) => window.runOutput(s, b), [src, be]);
  if (out.png) { fs.writeFileSync(`/home/claude/shots/out-${be}.png`, Buffer.from(out.png.split(',')[1], 'base64')); delete out.png; }
  console.log(be, JSON.stringify(out, null, 1));
  if (errs.length) console.log('errors:', errs.join('\n'));
  await browser.close(); srv.close();
})();
