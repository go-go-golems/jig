import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { makeJCore } = await import('/home/claude/jigcad/src/engine/core.js');
const SV = await import('/home/claude/jigcad/src/engine/sketch/solver.js');
const LA = await import('/home/claude/jigcad/src/engine/sketch/linalg.js');
const j = makeJCore();
function stairs(K) {
  const pts = [[0, 0]];
  for (let i = 1; i <= K; i++) { const [x, y] = pts[i - 1]; pts.push(i % 2 ? [x + 5.3, y + 0.2] : [x - 0.3, y + 4.6]); }
  const cs = [j.c.fix('p.1.start')];
  for (let i = 1; i <= K; i++) cs.push(i % 2 ? j.c.horizontal('p.' + i) : j.c.vertical('p.' + i));
  let sk = j.sketch('stairs', { on: j.plane.XY }).polyline('p', pts).constrain(...cs);
  for (let i = 1; i <= K; i++) sk = sk.dim('p.' + i, 5);
  return sk;
}
const time = (fn, reps = 3) => { let best = Infinity, out; for (let r = 0; r < reps; r++) { const t = performance.now(); out = fn(); best = Math.min(best, performance.now() - t); } return [best, out]; };
for (const K of [20, 40, 80, 160, 320]) {
  const sk = stairs(K);
  const sys = sk.system();
  sys.cons.forEach((c, i) => { c.order = i; });
  const active = sys.cons.filter(c => c.status !== 'invalid' && !c.driven && c.eqs && c.eqs.length);
  const cl = SV.clustersOf(sys, active);
  const c0 = cl[0];
  const X = Float64Array.from(sys.x);
  const F = SV.makeProblem(X, c0.cons.flatMap(c => c.eqs), c0.cols);
  const x0 = F.get();
  const [tJ, J] = time(() => F.jac(x0));
  let nnz = 0; for (const v of J) if (v !== 0) nnz++;
  let evals = 0; const eqs = c0.cons.flatMap(c => c.eqs); for (const e of eqs) evals += 4 * e.vars.length;
  const [tQR] = time(() => LA.factorJ(J, F.m, F.n));
  const [tSolve, out] = time(() => SV.dogleg(SV.makeProblem(Float64Array.from(sys.x), eqs, c0.cols), x0), 1);
  const [tAn] = time(() => SV.analyseCluster(sys, Float64Array.from(out.X ?? X), c0, c0.cons), 1);
  console.log(`K=${K}: clusters ${cl.length}, m=${F.m} n=${F.n}, nnz ${nnz} (${(100 * nnz / (F.m * F.n)).toFixed(2)} %), residual evals per FD Jacobian ${evals}; jac ${tJ.toFixed(1)} ms, factorJ ${tQR.toFixed(1)} ms, dogleg ${tSolve.toFixed(1)} ms (${out.iters} it), analyse ${tAn.toFixed(1)} ms`);
}
