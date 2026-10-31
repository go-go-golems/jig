import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { sketch, c } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
const SV = await import('/home/claude/jigcad/src/engine/sketch/solver.js');
function build(N, linked) {
  let s = sketch('grid');
  const cs = [];
  for (let i = 0; i < N; i++) {
    const x = i * 30;
    s = s.polyline(`p${i}`, [[x, 0], [x + 22, 0.5], [x + 22.5, 11], [x + 0.3, 11.2]], { closed: true });
    cs.push(c.horizontal(`p${i}.1`), c.vertical(`p${i}.2`), c.horizontal(`p${i}.3`), c.vertical(`p${i}.4`));
    if (!linked || i === 0) cs.push(c.fix(`p${i}.1.start`));
    else cs.push(c.distanceX(`p${i - 1}.1.start`, `p${i}.1.start`, 30), c.distanceY(`p${i - 1}.1.start`, `p${i}.1.start`, 0));
  }
  s = s.constrain(...cs);
  for (let i = 0; i < N; i++) s = s.dim(`p${i}.1`, 20).dim(`p${i}.2`, 10);
  return s;
}
// warm-up
for (let k = 0; k < 3; k++) { SV.solveSketch(build(10, true).system()); SV.solveSketch(build(10, false).system()); }
for (const N of [5, 10, 20, 40]) {
  const row = [];
  for (const linked of [false, true]) {
    const times = []; let run, sys;
    for (let k = 0; k < 5; k++) { sys = build(N, linked).system(); const t0 = performance.now(); run = SV.solveSketch(sys); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    const n = run.clusters.reduce((s, c) => s + c.n, 0);
    row.push(`${linked ? 'one' : 'sep'}: clusters ${run.clusters.length}, largest n ${Math.max(...run.clusters.map(c => c.n))}, iters ${Math.max(...run.results.map(r => r.iters))}, rank ${run.results.reduce((s,r)=>s+r.rank,0)}, ${times[2].toFixed(1)} ms`);
    if (!linked) row.unshift(`N=${N} n=${n}`);
  }
  console.log(row.join(' | '));
}
