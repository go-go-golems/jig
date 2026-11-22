// scripts/wgsl-render.ts — the WebGPU reference renderer without a browser (CANDELA-002 phase 2): Dawn from the
// `webgpu` npm package runs the scene's WGSL program (wgsl-entry.ts prelude + compiled.shared + main) on the same
// buffers and per-frame uniforms the browser uses (src/engine/headless.ts), and writes the mean radiance per pixel.
//
//   npx tsx scripts/wgsl-render.ts B-01 [--size 640x360] [--spp 64] [--time 0] [--out dir] [--aov]
//
// Output: <out>/<id>.wgsl.pfm (RGB float, mean radiance = accum.rgb / accum.a) and <id>.wgsl.json (timings, spp).
// candela-rt render --backend cuda writes the same files with `.cuda.` for scripts/compare-pfm.ts.
import fs from 'node:fs';
import path from 'node:path';
import { create, globals } from 'webgpu';
import { loadCatalogFromDisk } from '../src/content/node';
import { openRender } from '../src/engine/headless';
import { parseArgs } from './render-preset';

/** PFM, the float image format ffmpeg and most image tools read: rows bottom to top */
export function writePFM(file: string, w: number, h: number, rgb: Float32Array) {
  const head = Buffer.from(`PF\n${w} ${h}\n-1.0\n`, 'latin1');
  const body = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) body.set(rgb.subarray((h - 1 - y) * w * 3, (h - y) * w * 3), y * w * 3);
  fs.writeFileSync(file, Buffer.concat([head, Buffer.from(body.buffer)]));
}
/** accum (RGBA sums, A = sample count) → mean RGB */
export function meanRGB(acc: Float32Array, w: number, h: number) {
  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { const n = acc[i * 4 + 3] || 1; out[i * 3] = acc[i * 4] / n; out[i * 3 + 1] = acc[i * 4 + 1] / n; out[i * 3 + 2] = acc[i * 4 + 2] / n; }
  return out;
}

async function main() {
  const { rest, flags } = parseArgs(process.argv.slice(2));
  const id = rest[0];
  const [w, h] = String(flags.size || '640x360').split('x').map(Number);
  const sppTarget = +(flags.spp || 64), time = +(flags.time || 0);
  const outDir = String(flags.out || 'build/parity');
  fs.mkdirSync(outDir, { recursive: true });
  const preset = loadCatalogFromDisk().presets.find(p => p.id === id);
  if (!preset) throw new Error(`no preset ${id}`);

  const t0 = performance.now();
  const r = await openRender(preset.files, { width: w, height: h, time, target: null });
  if (!r.ok) throw new Error(r.error);
  const tBuild = performance.now() - t0;

  Object.assign(globalThis, globals);
  const gpu = create([]);
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 8, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
  const t1 = performance.now();
  const mod = device.createShaderModule({ code: r.wgsl });
  const info = await mod.getCompilationInfo();
  const errs = info.messages.filter(m => m.type === 'error');
  if (errs.length) throw new Error('WGSL: ' + errs.slice(0, 3).map(m => `line ${m.lineNum}: ${m.message}`).join('; '));
  const pipe = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
  const tCompile = performance.now() - t1;

  const S = GPUBufferUsage.STORAGE, D = GPUBufferUsage.COPY_DST, C = GPUBufferUsage.COPY_SRC;
  const buf = (data: Float32Array | number, usage: number) => {
    const size = Math.ceil((typeof data === 'number' ? data : data.byteLength) / 16) * 16;
    const b = device.createBuffer({ size: Math.max(16, size), usage });
    if (typeof data !== 'number') device.queue.writeBuffer(b, 0, data.buffer, data.byteOffset, data.byteLength);
    return b;
  };
  const U0 = r.frame(); r.spp = 0;   // size the uniform buffer
  const B = {
    uni: buf(U0.length * 4, S | D), objs: buf(r.O, S | D), lits: buf(r.LI, S | D), bvh: buf(r.BV, S | D), sd: buf(r.SD, S | D),
    accum: buf(w * h * 16, S | C), aovA: buf(w * h * 16, S | C), aovN: buf(w * h * 16, S | C),
  };
  const ent = [['uni', 0], ['objs', 1], ['lits', 2], ['bvh', 3], ['sd', 4], ['accum', 5], ['aovA', 6], ['aovN', 7]] as const;
  const bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: ent.map(([n, b]) => ({ binding: b, resource: { buffer: (B as any)[n] } })) });

  const t2 = performance.now();
  let launches = 0;
  while (r.spp < sppTarget) {
    const U = r.frame();
    device.queue.writeBuffer(B.uni, 0, U.buffer, U.byteOffset, U.byteLength);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(); pass.setPipeline(pipe); pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8)); pass.end();
    device.queue.submit([enc.finish()]);
    launches++;
    if (launches % 8 === 0) await device.queue.onSubmittedWorkDone();
  }
  const read = async (b: GPUBuffer) => {
    const st = device.createBuffer({ size: w * h * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(b, 0, st, 0, w * h * 16); device.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ); const f = new Float32Array(st.getMappedRange().slice(0)); st.unmap(); return f;
  };
  const acc = await read(B.accum);
  const tRender = performance.now() - t2;
  const base = path.join(outDir, `${id}.wgsl`);
  writePFM(base + '.pfm', w, h, meanRGB(acc, w, h));
  if (flags.aov) { writePFM(base + '.albedo.pfm', w, h, meanRGB(await read(B.aovA), w, h)); }
  const meta = { id, backend: 'wgsl-dawn', width: w, height: h, time, spp: r.spp, launches, buildMs: tBuild, compileMs: tCompile, renderMs: tRender, sppPerSec: r.spp * w * h / (tRender / 1000) };
  fs.writeFileSync(base + '.json', JSON.stringify(meta, null, 1) + '\n');
  console.log(`${id} wgsl/dawn: ${w}x${h} ${r.spp} spp in ${launches} launches; build ${tBuild.toFixed(0)} ms, compile ${tCompile.toFixed(0)} ms, render ${tRender.toFixed(0)} ms → ${base}.pfm`);
  device.destroy();
}

if (import.meta.url === `file://${process.argv[1]}`) main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
