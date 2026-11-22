// node tools/lockstitch/render.js [--scenes 1,3,7] [--size 1280x720] [--spp 32] [--fps 24] [--stitch 2] [--turns 1]
//   [--format mp4|webm|png] [--still] [--backend webgl2|webgpu] [--out dir] [--orbit deg-per-stitch] [--name file-stem]
// Renders the Lockstitch head preset (K-09) headless: each scene as a video (or a still with --still), through the
// workbench's own render queue code in a headless Chromium.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/home/claude/.npm-global/lib/node_modules/playwright'); } })();
const esbuild = (() => { try { return require('esbuild'); } catch (e) { return require('/opt/npm-tools/node_modules/esbuild'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const T = path.join(__dirname, '../../test'), PRE = path.join(__dirname, '../../content/presets');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SCENES = ['S-01 Needle bar', 'S-02 Take-up lever', 'S-03 Rotary hook', 'S-04 Four-motion feed', 'S-05 Thread path', 'S-06 Zigzag', 'S-07 Whole head'];
const pick = String(arg('scenes', '1,2,3,4,5,6,7')).split(',').map(n => SCENES[+n - 1]).filter(Boolean);
const [W, H] = String(arg('size', '1280x720')).split('x').map(Number), spp = +arg('spp', 32), fps = +arg('fps', 24), stitch = +arg('stitch', 2), turns = +arg('turns', 1);
const fmt = arg('format', 'mp4'), still = !!arg('still', false), be = arg('backend', 'webgl2'), outDir = arg('out', '/home/claude/shots/lockstitch');
const orbit = +arg('orbit', 0), nameArg = arg('name', null);
fs.mkdirSync(outDir, { recursive: true });
esbuild.buildSync({ entryPoints: [path.join(T, 'harness.js')], bundle: true, format: 'iife', outfile: path.join(T, 'harness.bundle.js'), logLevel: 'error' });
const srv = http.createServer((q, r) => { const f = path.join(T, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'text/javascript'); r.end(fs.readFileSync(f)); }).listen(0);   // any free port
const src = fs.readFileSync(path.join(PRE, 'K-09-lockstitch.js'), 'utf8'), data = fs.readFileSync(path.join(PRE, 'K-09-lockstitch/lockstitch-data.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'] });
  for (const sc of pick) {
    const files = { 'scene.js': src.replace(/param\.choice\(Object\.keys\(SCENES\), '[^']+'\)/, `param.choice(Object.keys(SCENES), '${sc}')`).replace(/stitch: param\.float\(2\)/, `stitch: param.float(${stitch})`).replace(/orbit: param\.float\(0\)/, `orbit: param.float(${orbit})`), 'lib/lockstitch-data.js': data };
    const span = sc.startsWith('S-06') ? 2 : 1, dur = stitch * span * turns;
    const name = nameArg && pick.length === 1 ? nameArg : sc.slice(0, 4) + '-' + sc.slice(5).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const opts = still ? { kind: 'still', width: W, height: H, spp, seed: 1, format: 'png', time: +arg('time', stitch * 0.35), name }
      : { kind: 'sequence', width: W, height: H, spp, seed: 1, format: fmt, start: 0, end: dur - 1 / fps, fps, quality: arg('quality', 'high'), name };
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://localhost:${srv.address().port}/harness.html`);
    const t0 = Date.now();
    const out = await page.evaluate(([f, b, o]) => window.renderJob(f, b, o), [files, be, opts]);
    if (out.error) console.log(sc, 'FAILED', out.error, out.stack || '');
    for (const f of out.files || []) fs.writeFileSync(path.join(outDir, f.name), Buffer.from(f.b64, 'base64'));
    console.log(`${sc}: ${(out.files || []).map(f => f.name).join(', ')} · ${out.stats ? out.stats.triangles + ' tris, ' + out.stats.materials + ' materials' : ''} · compile ${out.compileMs} ms · render ${((out.ms || 0) / 1000).toFixed(1)} s · total ${((Date.now() - t0) / 1000).toFixed(0)} s · ev ${out.ev && out.ev.toFixed(2)}${errs.length ? ' · ' + errs.join(' | ') : ''}`);
    await page.close();
  }
  await browser.close(); srv.close();
})();
