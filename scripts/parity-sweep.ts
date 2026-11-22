// scripts/parity-sweep.ts — render every preset with the WGSL program on Dawn and with the CUDA translation in
// candela-rt, and compare (CANDELA-002 phase 2, design doc 02 §10.2–10.3).
//
//   npx tsx scripts/parity-sweep.ts [--ids B-01,K-09] [--size 320x180] [--spp 1] [--time 0] [--out build/parity-sweep]
//
// At 1 spp both renderers draw the same random numbers per pixel, so "pixels within 0.1 %" measures how often the
// translated program follows the same path as the original; at higher spp the mean-luminance difference measures bias.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadCatalogFromDisk } from '../src/content/node';
import { dawnDevice, wgslRender, writePFM, meanRGB } from './wgsl-render';
import { readPFM, compare, sideBySide, type Comparison } from './compare-pfm';
import { parseArgs } from './render-preset';

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const ids = typeof flags.ids === 'string' ? flags.ids.split(',') : null;
  const size = String(flags.size || '320x180'), [w, h] = size.split('x').map(Number);
  const spp = +(flags.spp || 1), time = +(flags.time || 0);
  const out = String(flags.out || 'build/parity-sweep');
  fs.mkdirSync(out, { recursive: true });
  const presets = loadCatalogFromDisk().presets.filter(p => !ids || ids.includes(p.id));
  const device = await dawnDevice();
  const rows: (Comparison & { id: string; wgslMs: number; cudaMs: number; error?: string })[] = [];
  for (const p of presets) {
    try {
      const r = await wgslRender(device, p.files, { width: w, height: h, spp, time });
      const base = path.join(out, p.id);
      writePFM(base + '.wgsl.pfm', w, h, meanRGB(r.acc, w, h));
      const log = execFileSync('./build/rt/candela-rt', ['render', p.id, '--size', size, '--spp', String(spp), '--time', String(time), '--out', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const cm = JSON.parse(fs.readFileSync(base + '.cuda.json', 'utf8'));
      const c = compare(readPFM(base + '.wgsl.pfm'), readPFM(base + '.cuda.pfm'));
      if (c.within0_1pct < 0.99 || Math.abs(c.meanRelDiff) > 0.01) sideBySide(readPFM(base + '.wgsl.pfm'), readPFM(base + '.cuda.pfm'), base + '.cmp.png');
      rows.push({ id: p.id, ...c, wgslMs: +r.meta.renderMs, cudaMs: cm.renderMs });
      console.log(`${p.id.padEnd(6)} within 0.1 %: ${(c.within0_1pct * 100).toFixed(1).padStart(5)} %  within 1 %: ${(c.within1pct * 100).toFixed(1).padStart(5)} %  mean ΔL ${(c.meanRelDiff * 100).toFixed(3).padStart(7)} %  relRMSE ${(c.relRMSE * 100).toFixed(2).padStart(7)} %${c.nonFinite ? '  NON-FINITE ' + c.nonFinite : ''}${log.includes('error') ? '  ' + log.trim() : ''}`);
    } catch (e: any) {
      const msg = String(e.stderr || e.message || e).split('\n').slice(0, 3).join(' | ');
      rows.push({ id: p.id, error: msg } as any);
      console.log(`${p.id.padEnd(6)} FAILED ${msg.slice(0, 300)}`);
    }
  }
  fs.writeFileSync(path.join(out, 'parity.json'), JSON.stringify({ size, spp, time, rows }, null, 1) + '\n');
  const good = rows.filter(r => !r.error);
  const exact = good.filter(r => r.within0_1pct >= 0.99).length;
  console.log(`${good.length}/${rows.length} rendered on both; ${exact} with ≥ 99 % of pixels within 0.1 %; worst mean ΔL ${(Math.max(...good.map(r => Math.abs(r.meanRelDiff))) * 100).toFixed(3)} %`);
  device.destroy();
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
