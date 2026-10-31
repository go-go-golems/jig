import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
let n = 1;
export async function compile(code, options = {}) {
  const r = await W.handle({ id: n++, op: 'compile', entry: 'script.js', files: { 'script.js': code }, options });
  return r;
}
export async function call(method, ...args) { return W.handle({ id: n++, op: 'call', method, args }); }
const PR = await import('/home/claude/jigcad/src/engine/program.js');
export const K = await import('/home/claude/jigcad/src/engine/kernel.js');
const OCM = await import('/home/claude/jigcad/src/engine/oc.js');
export const oc = OCM.getOC();
// compile and return { prog, bodies } with live Body objects
export async function build(code, opts = {}) {
  const model = await W.runScript(code, {});
  const prog = PR.compile(model, opts);
  const bodies = prog.P.parts.flatMap(p => p.res.state.bodies);
  return { prog, bodies, data: prog.data };
}
const T = () => oc.GeomAbs_SurfaceType;
export function surfType(face) {
  const ad = new oc.BRepAdaptor_Surface(face, true);
  const t = ad.GetType(); ad.delete();
  return enumName(oc.GeomAbs_SurfaceType, t);
}
export function enumName(E, t) { for (const k of Object.keys(E)) if (E[k] === t) return k.replace('GeomAbs_', ''); return String(t); }
export function curveType(edge) {
  const ad = new oc.BRepAdaptor_Curve(edge);
  const t = ad.GetType(); ad.delete();
  return enumName(oc.GeomAbs_CurveType, t);
}
export function tally(body) {
  const s = {}, k = {};
  body.faces.list.forEach((f, i) => { const t = surfType(f); s[t] = (s[t] ?? 0) + 1; const kk = body.faceInfo(i).kind; k[kk] = (k[kk] ?? 0) + 1; });
  const e = {}; body.edges.list.forEach(x => { const t = curveType(x); e[t] = (e[t] ?? 0) + 1; });
  return { surf: s, kind: k, edges: e };
}
