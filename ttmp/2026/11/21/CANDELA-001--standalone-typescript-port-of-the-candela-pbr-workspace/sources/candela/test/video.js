// node test/video.js scene.js [backend] — render a short MP4 and WebM headless, then check them with ffprobe/ffmpeg
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/home/claude/.npm-global/lib/node_modules/playwright'); } })();
const esbuild = (() => { try { return require('esbuild'); } catch (e) { return require('/opt/npm-tools/node_modules/esbuild'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'harness.js')], bundle: true, format: 'iife', outfile: path.join(__dirname, 'harness.bundle.js'), logLevel: 'error' });
const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'text/javascript'); r.end(fs.readFileSync(f)); }).listen(8772);
(async () => {
  const src = fs.readFileSync(process.argv[2], 'utf8'), be = process.argv[3] || 'webgl2', dir = '/home/claude/shots/video';
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8772/harness.html');
  const out = await page.evaluate(([s, b]) => window.runVideo(s, b), [src, be]);
  console.log('support', JSON.stringify(out.support), out.error || '', out.stack || '');
  for (const [name, f] of Object.entries(out.files || {})) {
    const p = path.join(dir, name); fs.writeFileSync(p, Buffer.from(f.b64, 'base64'));
    console.log(`\n${name}: ${f.bytes} bytes, ${f.ms} ms`);
    try { console.log(execSync(`ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,nb_frames,pix_fmt,color_space,color_primaries,color_transfer,color_range:format=format_name,duration -of compact "${p}"`).toString().trim()); } catch (e) { console.log('ffprobe FAILED', e.stdout && e.stdout.toString(), e.stderr && e.stderr.toString()); }
    try { const r = execSync(`ffmpeg -v error -i "${p}" -f null - 2>&1`).toString().trim(); console.log('decode:', r || 'clean'); } catch (e) { console.log('decode FAILED', (e.stdout || '').toString().slice(0, 600)); }
    try { console.log('frames decoded:', execSync(`ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "${p}"`).toString().trim()); } catch (e) { console.log('count FAILED'); }
    try { execSync(`ffmpeg -v error -y -ss 0.5 -i "${p}" -frames:v 1 "${p}.png"`); console.log('frame at 0.5 s →', p + '.png'); } catch (e) { console.log('extract FAILED'); }
  }
  if (errs.length) console.log('errors:', errs.join('\n'));
  await browser.close(); srv.close();
})();
