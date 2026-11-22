// scripts/shot.ts [presetId] [out.png] [w h waitMs light|dark webgl2|webgpu] — screenshot the built workbench
// (dist/, from `npm run build`) in headless Chromium with SwiftShader, and print the page's console errors.
// Env: DIST (default dist), CLICK (comma-separated visible texts to click first).
// Port of the original test/shot.js; serves dist/ itself, so no preview server is needed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function serve(root: string, port: number): http.Server {
  return http.createServer((q, r) => {
    let rel = decodeURIComponent((q.url || '/').split('?')[0].split('#')[0]);
    if (rel === '/') rel = '/index.html';
    const f = path.join(root, rel);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; r.end(); return; }
    r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
    r.end(fs.readFileSync(f));
  }).listen(port);
}

export const chromiumArgs = (backend: string) => backend === 'webgpu'
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader']
  : ['--use-angle=swiftshader'];

async function main() {
  const [hash = '', out = 'shots/wb.png', w = '1440', h = '900', wait = '8000', scheme = 'light', backend = 'webgl2'] = process.argv.slice(2);
  const root = path.resolve(process.env.DIST || 'dist'), port = 8767;
  const srv = serve(root, port);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const browser = await chromium.launch({ args: chromiumArgs(backend) });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme as 'light' | 'dark' });
  const errs: string[] = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  await page.addInitScript(b => { try { localStorage.setItem('candela.v1.backend', JSON.stringify(b)); } catch { /* none */ } }, backend);
  await page.goto(`http://localhost:${port}/index.html` + (hash ? '#' + hash : ''));
  await page.waitForTimeout(+wait);
  // CLICK='Agent,Connection': click elements by their visible text, in order, before the screenshot
  for (const label of (process.env.CLICK || '').split(',').map(x => x.trim()).filter(Boolean)) { await page.getByText(label, { exact: true }).first().click(); await page.waitForTimeout(300); }
  const info = await page.evaluate(() => {
    const wb = (window as any).workbench;
    const vp = wb && wb.vp;
    return { preset: wb && wb.preset && wb.preset.id, ok: wb && wb.result && wb.result.ok, backend: vp && vp.backend && vp.backend.name, spp: vp && vp.spp };
  });
  await page.screenshot({ path: out });
  console.log(JSON.stringify(info));
  console.log(errs.filter(e => !/GPU stall|GL Driver/.test(e)).slice(0, 12).join('\n') || 'no console errors');
  await browser.close();
  srv.close();
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
