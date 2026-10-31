import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const SK = await import('/home/claude/jigcad/src/engine/sketch/index.js');
export const SV = await import('/home/claude/jigcad/src/engine/sketch/solver.js');
export const LA = await import('/home/claude/jigcad/src/engine/sketch/linalg.js');
export const { sketch, c } = SK;
// build the problem of a sketch's single cluster (all active constraints)
export function problem(sk) {
  const sys = sk.system();
  sys.cons.forEach((k, i) => { k.order = i; });
  const active = sys.cons.filter(k => k.status !== 'invalid' && !k.driven && k.eqs && k.eqs.length);
  const cls = SV.clustersOf(sys, active);
  return { sys, active, cls };
}
// instrument F: log x at every Jacobian evaluation (one per iteration in dogleg/newton; per accepted step in LM)
export function traced(F) {
  const xs = [];
  const jac = F.jac;
  return { F: { ...F, jac: x => { xs.push(Float64Array.from(x)); return jac(x); } }, xs };
}
export const ninf = v => Math.max(0, ...Array.from(v, Math.abs));
