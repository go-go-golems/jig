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
const sys = build(40, true).system();
const eqs = sys.cons.flatMap(c => c.eqs);
const nnz = eqs.reduce((s, e) => s + e.vars.length, 0);
console.log('m', eqs.length, 'n', sys.x.length, 'nnz', nnz, 'density', nnz / (eqs.length * sys.x.length), 'max per row', Math.max(...eqs.map(e => e.vars.length)));
// time split for the linked N=40: factorJ vs analyse
const L = await import('/home/claude/jigcad/src/engine/sketch/linalg.js');
const run = SV.solveSketch(sys);
const cl = run.clusters[0];
const F = SV.makeProblem(Float64Array.from(run.X), eqs, cl.cols);
let t0 = performance.now(); const J = F.jac(F.get()); const tj = performance.now() - t0;
t0 = performance.now(); L.factorJ(J, F.m, F.n); const tf = performance.now() - t0;
t0 = performance.now(); SV.analyseCluster(sys, Float64Array.from(run.X), cl, run.results[0].activeCons); const ta = performance.now() - t0;
console.log('jac ms', tj.toFixed(1), 'factor ms', tf.toFixed(1), 'analyse ms', ta.toFixed(1));
