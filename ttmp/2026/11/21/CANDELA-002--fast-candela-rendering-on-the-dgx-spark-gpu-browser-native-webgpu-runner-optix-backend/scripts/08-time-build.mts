// 08-time-build.mts — time build+compile and per-frame animation+pack in Node for B-01, K-01, K-09.
// Run from the repo root: npx tsx <this file>
import { build } from '../../../../../../src/engine/candela';
import { loadCatalogFromDisk } from '../../../../../../src/content/node';
for (const id of ['B-01', 'K-01', 'K-09']) {
  const p = loadCatalogFromDisk().presets.find(p => p.id === id)!;
  let t = performance.now(); const r: any = await build(p.files); const tb = performance.now() - t;
  t = performance.now(); const anim = r.animation; const P = r.compiled.pack({ time: 0.5, poses: anim ? anim(0.5) : null }); const tp = performance.now() - t;
  t = performance.now(); for (let i = 0; i < 20; i++) r.compiled.pack({ time: i / 24, poses: anim ? anim(i / 24) : null }); const tp2 = (performance.now() - t) / 20;
  console.log(`${id}: build+compile ${tb.toFixed(0)} ms (WGSL ${r.compiled.stats.lines} lines), first pack ${tp.toFixed(1)} ms, per-frame animation+pack ${tp2.toFixed(2)} ms`);
}
