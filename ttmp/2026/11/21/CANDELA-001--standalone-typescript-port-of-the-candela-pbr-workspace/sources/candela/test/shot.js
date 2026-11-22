const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/home/claude/.npm-global/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0].split('#')[0]) || '/local.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(f)); }).listen(8767);
(async () => {
  const [hash = '', out = '/home/claude/shots/wb.png', w = 1440, h = 900, wait = 6000, scheme = 'light', backend = 'webgl2'] = process.argv.slice(2);
  const args = backend === 'webgpu' ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'] : ['--use-angle=swiftshader'];
  const browser = await chromium.launch({ channel: 'chromium', args });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme });
  const errs = []; page.on('pageerror', e => errs.push('pageerror ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | '))); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  await page.addInitScript(b => { try { localStorage.setItem('candela.v1.backend', JSON.stringify(b)); } catch (e) {} }, backend);
  await page.goto('http://localhost:8767/local.html' + (hash ? '#' + hash : ''));
  await page.waitForTimeout(+wait);
  if (process.env.ACTIONS) { const f = require(process.env.ACTIONS); await f(page); }
  await page.screenshot({ path: out });
  console.log(errs.filter(e => !/GPU stall|GL Driver/.test(e)).slice(0, 12).join('\n') || 'no console errors');
  await browser.close(); srv.close();
})();
