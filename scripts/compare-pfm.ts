// scripts/compare-pfm.ts — compare two renders of the same preset (CANDELA-002 phases 2–3): mean radiance per channel,
// relative RMSE of luminance, and how many pixels agree to 0.1 % and 1 %. Both renderers draw the same random
// numbers per pixel (renderPixel seeds its generator from the pixel and frame index), so a faithful translation makes
// most pixels agree to rounding; pixels where rounding flips a branch differ by sampling noise.
//
//   npx tsx scripts/compare-pfm.ts build/parity/B-01.wgsl.pfm build/parity/B-01.cuda.pfm [--png out.png] [--json out.json]
//
// --png writes reference | candidate | |difference| × 10, tone-mapped with one exposure taken from the reference.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseArgs } from './render-preset';

export interface PFM { w: number; h: number; rgb: Float32Array }   // rows top to bottom
export function readPFM(file: string): PFM {
  const b = fs.readFileSync(file);
  let p = 0; const tok = () => { while (b[p] === 0x20 || b[p] === 0x0a || b[p] === 0x0d) p++; const s = p; while (b[p] !== 0x20 && b[p] !== 0x0a && b[p] !== 0x0d) p++; return b.toString('latin1', s, p); };
  const magic = tok(); if (magic !== 'PF') throw new Error(`${file}: not an RGB PFM (${magic})`);
  const w = +tok(), h = +tok(), scale = +tok(); p++;
  const little = scale < 0, n = w * h * 3, rgb = new Float32Array(n);
  const dv = new DataView(b.buffer, b.byteOffset + p, n * 4);
  for (let y = 0; y < h; y++) for (let i = 0; i < w * 3; i++) rgb[(h - 1 - y) * w * 3 + i] = dv.getFloat32((y * w * 3 + i) * 4, little);
  return { w, h, rgb };
}

export interface Comparison { width: number; height: number; meanRef: number[]; meanCand: number[]; meanRelDiff: number; relRMSE: number; within0_1pct: number; within1pct: number; nonFinite: number; blockRelRMSE: number }
export function compare(a: PFM, b: PFM): Comparison {
  if (a.w !== b.w || a.h !== b.h) throw new Error(`size differs: ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  const n = a.w * a.h, mA = [0, 0, 0], mB = [0, 0, 0];
  let se = 0, sumL = 0, w01 = 0, w1 = 0, bad = 0;
  for (let i = 0; i < n; i++) {
    let LA = 0, LB = 0;
    for (let c = 0; c < 3; c++) { const x = a.rgb[i * 3 + c], y = b.rgb[i * 3 + c]; if (!Number.isFinite(y)) { bad++; continue; } mA[c] += x; mB[c] += y; const k = [0.2126, 0.7152, 0.0722][c]; LA += k * x; LB += k * y; }
    se += (LA - LB) ** 2; sumL += LA;
    const rel = Math.abs(LA - LB) / Math.max(Math.abs(LA), 1e-3);
    if (rel <= 1e-3) w01++;
    if (rel <= 1e-2) w1++;
  }
  const meanL = sumL / n;
  // what a viewer sees: luminance averaged over 8×8 blocks (sampling noise mostly cancels), relative RMSE of the blocks
  const B = 8, bw = Math.floor(a.w / B), bh = Math.floor(a.h / B);
  let bse = 0, bsum = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let la = 0, lb = 0;
    for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) {
      const i = (y * a.w + x) * 3;
      la += 0.2126 * a.rgb[i] + 0.7152 * a.rgb[i + 1] + 0.0722 * a.rgb[i + 2];
      const yb = 0.2126 * b.rgb[i] + 0.7152 * b.rgb[i + 1] + 0.0722 * b.rgb[i + 2];
      lb += Number.isFinite(yb) ? yb : 0;
    }
    bse += ((la - lb) / (B * B)) ** 2; bsum += la / (B * B);
  }
  const nb = Math.max(1, bw * bh);
  const blockRelRMSE = Math.sqrt(bse / nb) / Math.max(bsum / nb, 1e-12);
  const meanRef = mA.map(v => v / n), meanCand = mB.map(v => v / n);
  const lum = (m: number[]) => 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  return { width: a.w, height: a.h, meanRef, meanCand, meanRelDiff: (lum(meanCand) - lum(meanRef)) / Math.max(lum(meanRef), 1e-12), relRMSE: Math.sqrt(se / n) / Math.max(meanL, 1e-12), within0_1pct: w01 / n, within1pct: w1 / n, nonFinite: bad, blockRelRMSE };
}

/** reference | candidate | difference×10, as a PNG through ffmpeg (8-bit PPM in between) */
export function sideBySide(a: PFM, b: PFM, file: string) {
  let s = 0; for (let i = 0; i < a.w * a.h; i++) s += 0.2126 * a.rgb[i * 3] + 0.7152 * a.rgb[i * 3 + 1] + 0.0722 * a.rgb[i * 3 + 2];
  const k = 0.18 / Math.max(s / (a.w * a.h), 1e-6);
  const tm = (x: number) => { const v = Math.max(0, x * k); const r = v / (1 + v); const g = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(g * 255))); };
  const W = a.w * 3, H = a.h, px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < a.w; x++) {
    const i = (y * a.w + x) * 3;
    for (let c = 0; c < 3; c++) {
      px[(y * W + x) * 3 + c] = tm(a.rgb[i + c]);
      px[(y * W + a.w + x) * 3 + c] = tm(b.rgb[i + c]);
      px[(y * W + 2 * a.w + x) * 3 + c] = tm(Math.abs(a.rgb[i + c] - b.rgb[i + c]) * 10);
    }
  }
  const ppm = file.replace(/\.png$/, '') + '.ppm';
  fs.writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`, 'latin1'), px]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', ppm, file]);
  fs.unlinkSync(ppm);
}

function main() {
  const { rest, flags } = parseArgs(process.argv.slice(2));
  const [fa, fb] = rest;
  const a = readPFM(fa), b = readPFM(fb);
  const r = compare(a, b);
  const f = (v: number[]) => v.map(x => x.toPrecision(5)).join(', ');
  console.log(`${fa} vs ${fb}: ${r.width}x${r.height}`);
  console.log(`  mean RGB  ref (${f(r.meanRef)})  cand (${f(r.meanCand)})  luminance diff ${(r.meanRelDiff * 100).toFixed(3)} %`);
  console.log(`  8×8-block rel. RMSE ${(r.blockRelRMSE * 100).toFixed(2)} % (what the eye compares)`);
  console.log(`  rel. RMSE ${(r.relRMSE * 100).toFixed(2)} %;  pixels within 0.1 %: ${(r.within0_1pct * 100).toFixed(1)} %, within 1 %: ${(r.within1pct * 100).toFixed(1)} %;  non-finite ${r.nonFinite}`);
  if (typeof flags.png === 'string') { sideBySide(a, b, flags.png); console.log(`  → ${flags.png}`); }
  if (typeof flags.json === 'string') fs.writeFileSync(flags.json, JSON.stringify(r) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
