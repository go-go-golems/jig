import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { makeJCore } = await import('/home/claude/jigcad/src/engine/core.js');
const SV = await import('/home/claude/jigcad/src/engine/sketch/solver.js');
const j = makeJCore();
for (const [x0, len, ang] of [[0, 5, 0.3], [1000, 5, 0.3], [0, 0.5, 0.3], [200, 0.5, 0.3]]) {
  const a = [x0, 3], b = [x0 + len * Math.cos(ang), 3 + len * Math.sin(ang)];
  const sk = j.sketch('s', { on: j.plane.XY }).line('l', a, b).dim('l', len * 1.01);
  const sys = sk.system();
  const cons = sys.cons.filter(c => c.eqs?.length);
  const cl = SV.clustersOf(sys, cons)[0];
  const F = SV.makeProblem(Float64Array.from(sys.x), cl.cons.flatMap(c => c.eqs), cl.cols);
  const J = F.jac(F.get());
  // analytic: d/d(ax, ay, bx, by) of |b - a| - d
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const exact = [-dx / L, -dy / L, dx / L, dy / L];
  // map cols to entity params
  const e = sys.entities.get('l');
  const names = Object.keys(e.p);
  let maxErr = 0;
  cl.cols.forEach((c, k) => {
    const nm = names.find(nn => e.p[nn] === c);
    const idx = { ax: 0, ay: 1, bx: 2, by: 3 }[nm] ?? ['a.x','a.y','b.x','b.y'].indexOf(nm);
    if (idx >= 0) maxErr = Math.max(maxErr, Math.abs(J[k] - exact[idx]));
  });
  console.log(`line from x=${x0}, length ${len}: params ${names.join(',')}; m=${F.m} n=${F.n}; max |FD − exact| = ${maxErr.toExponential(2)}`);
}
