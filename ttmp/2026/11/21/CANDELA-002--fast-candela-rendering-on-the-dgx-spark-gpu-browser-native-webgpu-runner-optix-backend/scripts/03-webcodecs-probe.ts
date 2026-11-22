// 03-webcodecs-probe.ts — which video encoders does headless Chromium (GPU flags) offer here, in software and
// hardware? The workbench's VideoWriter uses WebCodecs, so this is what a browser render can write today.
import { chromium } from 'playwright';
import http from 'node:http';
const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>probe</title>'); }).listen(8792);
const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-features=Vulkan,VaapiVideoEncoder', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.goto('http://localhost:8792/');
const r = await p.evaluate(async () => {
  const codecs = { 'H.264 high 5.1': 'avc1.640033', 'HEVC main10': 'hev1.2.4.L153.B0', 'AV1 main 10-bit': 'av01.0.12M.10', 'VP9 profile 0': 'vp09.00.51.08' };
  const out: Record<string, unknown> = {};
  for (const [name, codec] of Object.entries(codecs)) for (const hw of ['prefer-hardware', 'prefer-software'] as const) {
    try { const s = await VideoEncoder.isConfigSupported({ codec, width: 3840, height: 2160, bitrate: 40e6, framerate: 24, hardwareAcceleration: hw }); out[`${name} ${hw}`] = s.supported; }
    catch (e) { out[`${name} ${hw}`] = 'error: ' + (e as Error).message; }
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close(); srv.close();
