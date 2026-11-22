// tests/golden-pack.test.ts — golden test for the engine split (CANDELA-002 design doc 02, phase 1, §10.1).
//
//   npx tsx tests/golden-pack.test.ts            compare every preset with tests/golden/pack-digests.json
//   npx tsx tests/golden-pack.test.ts --update   (re)record the baseline; only when a change is meant to alter output
//   npx tsx tests/golden-pack.test.ts --ids B-01,K-09
//
// For every preset: the hash of the generated WGSL, its line count and uniform count, and the hashes of every buffer
// `pack` writes at t = 0, 0.37 and 1.5 with the viewport's env (poses, motion samples, seed 0). Refactoring
// compile/pack into lower + targets must leave all of them unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogFromDisk } from '../src/content/node';
import { digestPreset, type PresetDigest } from '../src/engine/digest';
import { compareDigests } from '../scripts/core-digest';

// The digests hash float buffers, and 10 of the 105 presets hash differently on the DGX Spark (arm64) and on x86-64
// (F-08, R-05, K-01, K-03…K-09: SDs, O or meta), at the same commit, while V8 11.3 to 14.6 agree on x86-64 (JIG-017
// diary). So each architecture has its own baseline: pack-digests.json for arm64, pack-digests.<arch>.json for others.
const GOLDEN = path.resolve(process.arch === 'arm64' ? 'tests/golden/pack-digests.json' : `tests/golden/pack-digests.${process.arch}.json`);
const TIMES = [0, 0.37, 1.5];
const args = process.argv.slice(2);
const update = args.includes('--update');
const idsArg = args.indexOf('--ids') >= 0 ? args[args.indexOf('--ids') + 1].split(',') : null;

const presets = loadCatalogFromDisk().presets.filter(p => !idsArg || idsArg.includes(p.id));
const t0 = Date.now();
const res: PresetDigest[] = [];
for (const p of presets) {
  const d = await digestPreset(p.id, p.files, TIMES, 1);
  delete d.buildMs; delete d.frameMs;            // timings are not part of the golden data
  res.push(d);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (update) {
  const old: PresetDigest[] = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : [];
  const merged = idsArg ? old.filter(o => !idsArg.includes(o.id)).concat(res).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) : res;
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, JSON.stringify(merged, null, 1) + '\n');
  console.log(`recorded ${res.length} presets (${res.filter(r => !r.ok).length} failing builds) → ${path.relative(process.cwd(), GOLDEN)} in ${secs} s`);
} else {
  if (!fs.existsSync(GOLDEN)) { console.log(`golden pack: no baseline for ${process.arch} (${path.relative(process.cwd(), GOLDEN)}); record one with --update`); process.exit(1); }
  const golden: PresetDigest[] = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const diffs = compareDigests(res as any, golden as any);
  console.log(`golden pack: ${res.length - diffs.length}/${res.length} identical in ${secs} s`);
  for (const d of diffs) console.log(`  DIFFERS ${d.id}: ${d.field}`);
  process.exit(diffs.length ? 1 : 0);
}
