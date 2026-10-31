// scratch harness: build a sketch with the engine's builder, solve, and expose J, rank, null space
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const SK = await import('/home/claude/jigcad/src/engine/sketch/index.js');
const SV = await import('/home/claude/jigcad/src/engine/sketch/solver.js');
const LA = await import('/home/claude/jigcad/src/engine/sketch/linalg.js');
const U = await import('/home/claude/jigcad/src/engine/units.js');
const CN = await import('/home/claude/jigcad/src/engine/sketch/constraints.js');
export const { sketch, c } = SK;
export const { mm, deg } = U;
export { SV, LA, CN };

// solve; return { solved, sys, J (rows of the active, non-driven eqs, ordered by priority), cols, names, rowsOf }
export function analyse(sk) {
  const solved = sk.solve({});
  const sys = solved.sys, X = solved.X;
  const out = [];
  solved.run.clusters.forEach((cl, k) => {
    const r = solved.run.results[k];
    const cons = r.activeCons;
    const eqs = cons.flatMap(cc => cc.eqs.map((e, i) => ({ ...e, owner: cc.id, i })));
    const F = SV.makeProblem(Float64Array.from(X), eqs, cl.cols);
    const J = F.jac(F.get());
    out.push({ cluster: k, cols: cl.cols, names: cl.cols.map(i => sys.pname[i]), m: eqs.length, n: cl.cols.length,
      J, rows: eqs.map(e => e.owner), rank: r.rank, dof: r.dof, entityDof: r.entityDof, dofFree: r.dofFree });
  });
  return { solved, sys, X, clusters: out };
}
export const rowsOf = (J, m, n) => Array.from({ length: m }, (_, i) => Array.from(J.subarray(i * n, (i + 1) * n)));
export const fmt = v => (Math.abs(v) < 1e-12 ? '0' : (+v.toPrecision(6)).toString());
