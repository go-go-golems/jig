// scripts/parity-gallery.ts — an HTML page of a parity sweep (scripts/parity-sweep.ts): for every preset, the WebGPU
// render, the CUDA render and their difference × 10, with the sweep's numbers. Serve the output directory to look at
// it from another machine (CANDELA-002 phase 2).
//
//   npx tsx scripts/parity-gallery.ts [--in build/parity-sweep64] [--out build/parity-gallery]
//   python3 -m http.server 8090 --bind 0.0.0.0 --directory build/parity-gallery     → http://bling.local:8090/
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogFromDisk } from '../src/content/node';
import { readPFM, sideBySide } from './compare-pfm';
import { parseArgs } from './render-preset';

const { flags } = parseArgs(process.argv.slice(2));
const inDir = String(flags.in || 'build/parity-sweep64'), outDir = String(flags.out || 'build/parity-gallery');
fs.mkdirSync(path.join(outDir, 'img'), { recursive: true });
const sweep = JSON.parse(fs.readFileSync(path.join(inDir, 'parity.json'), 'utf8'));
const backend: string = sweep.backend || 'cuda';
const BACKEND = backend === 'optix' ? 'OptiX (RT cores)' : 'CUDA';
const titles = new Map(loadCatalogFromDisk().presets.map(p => [p.id, p.title as string]));
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const cards: string[] = [];
for (const r of sweep.rows) {
  const title = esc(titles.get(r.id) || '');
  if (r.error) { cards.push(`<article class="card bad"><h2>${r.id} <span>${title}</span></h2><p class="err">${esc(r.error)}</p></article>`); continue; }
  const img = `img/${r.id}-${backend}.png`;
  sideBySide(readPFM(path.join(inDir, `${r.id}.wgsl.pfm`)), readPFM(path.join(inDir, `${r.id}.${backend}.pfm`)), path.join(outDir, img));
  // "looks the same": blocks of 8×8 pixels agree to 2 % and the mean to 1 % (per-pixel agreement is not required)
  const good = r.blockRelRMSE != null ? r.blockRelRMSE <= 0.02 && Math.abs(r.meanRelDiff) <= 0.01 : r.within0_1pct >= 0.99;
  cards.push(`<article class="card ${good ? '' : 'diff'}" data-good="${good}">
  <h2>${r.id} <span>${title}</span></h2>
  <img src="${img}" loading="lazy" alt="${r.id}: WebGPU, CUDA, difference">
  <dl><div><dt>8×8-block difference</dt><dd>${r.blockRelRMSE != null ? (r.blockRelRMSE * 100).toFixed(2) + ' %' : '–'}</dd></div>
  <div><dt>pixels within 0.1 %</dt><dd>${(r.within0_1pct * 100).toFixed(1)} %</dd></div>
  <div><dt>mean luminance Δ</dt><dd>${(r.meanRelDiff * 100).toFixed(3)} %</dd></div>
  <div><dt>render WebGPU / ${BACKEND}</dt><dd>${r.wgslMs.toFixed(0)} / ${r.cudaMs.toFixed(0)} ms</dd></div></dl>
</article>`);
  process.stdout.write('.');
}
const rows = sweep.rows.filter((r: any) => !r.error);
const exact = rows.filter((r: any) => (r.blockRelRMSE != null ? r.blockRelRMSE <= 0.02 && Math.abs(r.meanRelDiff) <= 0.01 : r.within0_1pct >= 0.99)).length;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Candela parity: ${BACKEND}</title>
<style>
:root { --bg: #f6f5f2; --fg: #1d1d1b; --muted: #6b6a66; --card: #fff; --line: #e2e0da; --warn: #b45309; }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --fg: #ecebe7; --muted: #9a9892; --card: #1f1f1d; --line: #33322f; --warn: #f59e0b; } }
* { box-sizing: border-box; } body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, sans-serif; }
header { max-width: 1200px; margin: 0 auto 16px; } h1 { font-size: 20px; margin: 0 0 4px; } header p { margin: 0; color: var(--muted); }
.controls { margin-top: 10px; } .grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 560px), 1fr)); gap: 14px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; } .card.diff { border-color: var(--warn); }
.card h2 { font-size: 15px; margin: 0 0 8px; } .card h2 span { color: var(--muted); font-weight: 400; }
.card img { width: 100%; height: auto; display: block; border-radius: 4px; image-rendering: pixelated; }
dl { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 8px 0 0; } dl div { display: flex; gap: 6px; } dt { color: var(--muted); } dd { margin: 0; font-variant-numeric: tabular-nums; }
.err { color: var(--warn); } body.only-diff .card[data-good="true"] { display: none; }
</style></head><body>
<header><h1>Candela: WebGPU vs ${BACKEND}</h1>
<p>Each row: WebGPU (Dawn/Vulkan) · ${BACKEND}, the scene program translated by wgsl2cuda (candela-rt) · |difference| × 10. ${esc(sweep.size)}, ${sweep.spp} spp, t = ${sweep.time}${sweep.motionBlur === false ? ', motion blur off' : ''}.
${exact}/${rows.length} presets look the same (8×8-block luminance within 2 %, mean within 1 %); cards with an orange border do not.</p>
<label class="controls"><input type="checkbox" id="only"> show only presets that differ</label></header>
<main class="grid">${cards.join('\n')}</main>
<script>document.getElementById('only').addEventListener('change', e => document.body.classList.toggle('only-diff', e.target.checked));</script>
</body></html>
`;
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`\n${outDir}/index.html: ${sweep.rows.length} presets`);
