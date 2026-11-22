// scripts/live-browser-check.ts — the workbench's OptiX mode end to end (CANDELA-002 phase 5): open the workbench in
// headless Chromium, switch the viewport to OptiX (candela-rt serve must be running), wait for streamed frames, orbit
// the camera, change a param, and take screenshots of the viewport along the way.
//   npx tsx scripts/live-browser-check.ts <presetId> [--url http://localhost:5173/] [--out build/live] [--tweak id=value]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { GPU_ARGS, parseArgs } from './render-preset';

async function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const id = rest[0] || 'B-02';
  const base = String(flags.url || 'http://localhost:5173/');
  const out = path.resolve(String(flags.out || 'build/live'));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: GPU_ARGS });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)); });
  await page.goto(`${base}#${encodeURIComponent(id)}`);
  await page.waitForFunction(() => !!(window as any).workbench && (window as any).workbench.vp && (window as any).workbench.vp.compiled, null, { timeout: 120000 });
  console.log('workbench loaded', id);
  const state = (): Promise<any> => page.evaluate(() => { const r = (window as any).workbench.remote; return r ? { state: r.state, message: r.message, frames: r.frames, frame: r.frame, built: r.built, mismatch: r.mismatch, localHash: r.localHash } : null; });
  await page.getByRole('button', { name: 'OptiX' }).click();
  const t0 = Date.now();
  let s: any = null;
  while (Date.now() - t0 < 90000) { s = await state(); if (s && s.frames > 0 && s.frame && s.frame.spp >= 64) break; await page.waitForTimeout(250); }
  console.log(`OptiX mode after ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify({ state: s.state, frames: s.frames, spp: s.frame && s.frame.spp, size: s.frame && `${s.frame.width}x${s.frame.height}`, target: s.built && s.built.target, irHash: s.built && s.built.irHash, localHash: s.localHash, mismatch: s.mismatch, message: s.message }));
  const vp = page.locator('.vpwrap');
  await vp.screenshot({ path: path.join(out, `${id}-browser-optix.png`) });
  // orbit: drag across the viewport; the server should get a new view and restart accumulation
  const box = (await vp.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  const f0 = (await state()).frame.epoch;
  await page.waitForTimeout(1500);
  const s2 = await state();
  console.log(`after orbit: epoch ${f0} → ${s2.frame.epoch}, spp ${s2.frame.spp}`);
  await vp.screenshot({ path: path.join(out, `${id}-browser-optix-orbit.png`) });
  if (flags.tweak) {
    const [k, v] = String(flags.tweak).split('=');
    await page.evaluate(([k, v]) => { const d = (window as any).workbench.params().find((p: any) => p.id === k); if (d) d.set(isNaN(+v) ? v : +v); }, [k, v]);
    await page.waitForTimeout(2000);
    const s3 = await state();
    console.log(`after ${k}=${v}: epoch ${s3.frame.epoch}, spp ${s3.frame.spp}`);
    await vp.screenshot({ path: path.join(out, `${id}-browser-optix-tweak.png`) });
  }
  // back to the local renderer
  await page.getByRole('button', { name: 'OptiX' }).click();
  // the local view denoises below 512 spp; let it pass that before comparing with the server's converged frame
  await page.waitForFunction(() => (window as any).workbench.vp.spp >= 600, null, { timeout: 60000, polling: 200 }).catch(() => {});
  const local = await page.evaluate(() => { const w = (window as any).workbench; return { spp: w.vp.spp, denoise: w.vp.post && w.vp.post.denoise, params: w.params().map((p: any) => `${p.id}=${JSON.stringify(p.value)}`).join(' ') }; });
  console.log('local WebGPU:', JSON.stringify(local));
  await vp.screenshot({ path: path.join(out, `${id}-browser-webgpu.png`) });
  console.log('screenshots →', out);
  await browser.close();
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
