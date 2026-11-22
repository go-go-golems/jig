// 02-throughput.ts — samples per second of the existing browser renderer, per GPU configuration and preset.
// Uses the workbench's own render queue (host.render → runRender → accumulate: 1 sample per dispatch, then
// backend.idle()), so it measures the path a still render takes today. Needs `npm run build` first (serves dist/).
// Run from the repo root: npx tsx <this file> [preset…]   env: SIZES=640x360,1920x1080  SPP=64  CONFIGS=gpu-webgpu,…
import { chromium } from 'playwright';
import { serve } from '../../../../../../scripts/shot';
import path from 'node:path';

const GPU = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const SW = ['--use-angle=swiftshader', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'];
const ALL: Record<string, { args: string[]; backend: string }> = {
  'gpu-webgpu': { args: GPU, backend: 'webgpu' },
  'gpu-webgl2': { args: GPU, backend: 'webgl2' },
  'swiftshader-webgl2': { args: SW, backend: 'webgl2' },
};
const presets = process.argv.slice(2).length ? process.argv.slice(2) : ['B-01', 'M-07', 'K-01'];
const sizes = (process.env.SIZES || '640x360,1920x1080').split(',').map(s => s.split('x').map(Number));
const spp = +(process.env.SPP || 64);
const configs = (process.env.CONFIGS || 'gpu-webgpu,gpu-webgl2').split(',');

const srv = serve(path.resolve('dist'), 8768);
console.log('config\tpreset\tsize\tspp\tms\tspp/s\tMsamples/s\tbackend');
for (const cname of configs) {
  const c = ALL[cname];
  const browser = await chromium.launch({ args: c.args });
  for (const id of presets) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs: string[] = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(b => { localStorage.setItem('candela.v1.backend', JSON.stringify(b)); }, c.backend);
    await page.goto(`http://localhost:8768/index.html#${id}`);
    // wait for the build and the shader compile
    await page.waitForFunction(() => { const w = (window as any).workbench; return w && w.vp && w.vp.compiled && w.vp.backend && !w.compiling && w.vp.spp > 0; }, null, { timeout: 300000 });
    for (const [W, H] of sizes) {
      const r = await page.evaluate(async ({ W, H, spp }) => {
        const w = (window as any).workbench;
        w.running = false;   // pause the clock: a still of the current frame
        const t0 = performance.now();
        const j = w.render({ kind: 'still', width: W, height: H, spp, format: 'png', autosave: false });
        while (j.status === 'queued' || j.status === 'running') await new Promise(r => setTimeout(r, 20));
        return { ms: performance.now() - t0, status: j.status, error: j.error, backend: w.vp.backend.name + ' ' + w.vp.backend.info };
      }, { W, H, spp });
      const sps = spp / (r.ms / 1000);
      console.log([cname, id, `${W}x${H}`, spp, r.ms.toFixed(0), sps.toFixed(1), (sps * W * H / 1e6).toFixed(1), r.status === 'done' ? r.backend : r.status + ' ' + r.error].join('\t'));
    }
    if (errs.length) console.log('  page errors: ' + errs.slice(0, 3).join(' | '));
    await page.close();
  }
  await browser.close();
}
srv.close();
