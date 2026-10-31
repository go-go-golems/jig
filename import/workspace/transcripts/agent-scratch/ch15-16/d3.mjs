import { compile, drag } from './lib.mjs';
const arm = `return j.sketch('arm', { on: j.plane.XY })
  .line('l1', [0, 0], [18, 24])
  .line('l2', 'l1.end', [38, 24])
  .constrain(j.c.fix('l1.start'))
  .dim('l1', 30).dim('l2', 20)`;
const bend = d => { const [l1, l2] = d.entities; const a1 = Math.atan2(l1.b[1] - l1.a[1], l1.b[0] - l1.a[0]), a2 = Math.atan2(l2.b[1] - l2.a[1], l2.b[0] - l2.a[0]); let b = (a2 - a1) * 180 / Math.PI; return b; };
async function path(from, to, n) {
  let d;
  for (let k = 1; k <= n; k++) { const t = k / n; d = await drag('arm', 'l2.end', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]); }
  return d;
}
await compile(arm);
let d = await path([38, 24], [10, 40], 20);
console.log('incremental to (10,40): elbow', d.entities[0].b.map(v => +v.toFixed(4)), 'bend', bend(d).toFixed(3));
await compile(arm);
for (const n of [1, 5, 20]) {
  await compile(arm);
  d = await path([38, 24], [60, 30], n);
  const tip = d.entities[1].b;
  console.log(`to (60,30) in ${n}: tip`, tip.map(v => +v.toFixed(4)), 'bend', bend(d).toFixed(4), 'iters last', d.drag.iterations, 'gap', Math.hypot(60 - tip[0], 30 - tip[1]).toFixed(5));
  d = await path([60, 30], [30, 30], n);
  console.log(`   back to (30,30) in ${n}: elbow`, d.entities[0].b.map(v => +v.toFixed(4)), 'bend', bend(d).toFixed(3));
}
