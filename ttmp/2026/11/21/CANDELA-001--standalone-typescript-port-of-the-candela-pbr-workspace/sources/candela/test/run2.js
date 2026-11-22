const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/home/claude/.npm-global/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'text/javascript'); r.end(fs.readFileSync(f)); }).listen(8766);
(async () => {
  const src = fs.readFileSync(process.argv[2], 'utf8');
  const backends = (process.argv[3] || 'webgl2,webgpu').split(',');
  const frames = +(process.argv[4] || 8);
  const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'] });
  for (const be of backends) {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
    await page.goto('http://localhost:8766/harness2.html');
    const out = await page.evaluate(([s, b, f]) => window.runTest(s, b, f), [src, be, frames]);
    if (out.png) { fs.writeFileSync(`/home/claude/shots/test-${be}-big.png`, Buffer.from(out.png.split(',')[1], 'base64')); delete out.png; }
    if (out.srcLines && out.shaderErrors) { for (const e of out.shaderErrors.slice(0, 4)) { console.log('ERR line', e.line, e.message); for (let k = Math.max(0, e.line - 3); k < Math.min(out.srcLines.length, e.line + 2); k++) console.log('   ', k + 1, out.srcLines[k]); } }
    delete out.srcLines;
    console.log(be, JSON.stringify(out, null, 1).slice(0, 2500));
    if (errs.length) console.log('console:', errs.slice(0, 8).join('\n'));
    await page.close();
  }
  await browser.close(); srv.close();
})();
