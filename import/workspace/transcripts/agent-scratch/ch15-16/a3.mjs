import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { sketch, c } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
function build(N, linked) {
  let s = sketch('grid');
  const cs = [];
  for (let i = 0; i < N; i++) {
    const x = i * 30;
    // drawn 10 % off-size: 20 x 10 wanted, 22 x 11 drawn, a little skewed
    s = s.polyline(`p${i}`, [[x, 0], [x + 22, 0.5], [x + 22.5, 11], [x + 0.3, 11.2]], { closed: true });
    cs.push(c.horizontal(`p${i}.1`), c.vertical(`p${i}.2`), c.horizontal(`p${i}.3`), c.vertical(`p${i}.4`));
    if (!linked || i === 0) cs.push(c.fix(`p${i}.1.start`));
    else cs.push(c.distanceX(`p${i - 1}.1.start`, `p${i}.1.start`, 30), c.distanceY(`p${i - 1}.1.start`, `p${i}.1.start`, 0));
  }
  s = s.constrain(...cs);
  for (let i = 0; i < N; i++) s = s.dim(`p${i}.1`, 20).dim(`p${i}.2`, 10);
  return s;
}
for (const N of [5, 10, 20, 40]) {
  for (const linked of [false, true]) {
    const sk = build(N, linked);
    // warm up + median of 3
    const times = [];
    let sol;
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); sol = sk.solve({ k: Math.random() }); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    const its = sol.run.results.map(r => r.iters);
    console.log(`N=${N} ${linked ? 'linked  ' : 'separate'} n=${sol.n} m=${sol.run.clusters.reduce((s, c) => s + c.m, 0)} clusters=${sol.run.clusters.length} rank=${sol.rank} dof=${sol.dof} iters(max)=${Math.max(...its)} solve ms=${times[1].toFixed(1)} clusterms=${sol.run.results.reduce((s,r)=>s+r.ms,0).toFixed(1)}`);
  }
}
