// Signed area, in the face's (u, v) plane, of each wire traversed with the edge orientations as explored from the face.
import { build, oc, K, r6 } from './lib.mjs';
import { oname } from './explore.mjs';
const O = oc.TopAbs_Orientation;
export function wireUV(f, wr, n = 1000) {
  const segs = [];
  K.explore(wr, 'EDGE', e0 => {
    const e = oc.TopoDS.Edge(e0);
    const c2 = new oc.BRepAdaptor_Curve2d(e, f);
    const a = c2.FirstParameter(), b = c2.LastParameter();
    const rev = e.Orientation() === O.TopAbs_REVERSED;
    const pts = [];
    for (let k = 0; k <= n; k++) { const t = rev ? b - (b - a) * k / n : a + (b - a) * k / n; const p = c2.Value(t); pts.push([p.X(), p.Y()]); p.delete(); }
    segs.push(pts); c2.delete(); e.delete();
  });
  // chain by connectivity in (u, v): TopExp order is not the order of traversal
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const chain = [segs.shift()];
  while (segs.length) {
    const end = chain[chain.length - 1].at(-1);
    let k = segs.findIndex(s => d(s[0], end) < 1e-6);
    if (k < 0) { k = 0; }
    chain.push(segs.splice(k, 1)[0]);
  }
  const pts = chain.flatMap(s => s.slice(0, -1));
  let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
  return A / 2;
}
export function normals(f) {
  const r = K.scope();
  const b = oc.BRepTools.UVBounds(f, 0, 0, 0, 0);
  const ad = r(new oc.BRepAdaptor_Surface(f, false));
  const P = r(new oc.gp_Pnt()), du = r(new oc.gp_Vec()), dv = r(new oc.gp_Vec());
  const u = (b.UMin + b.UMax) / 2, v = (b.VMin + b.VMax) / 2;
  ad.D1(u, v, P, du, dv);
  const n = K.V.unit(K.V.cross(K.xyz(du), K.xyz(dv)));
  const rev = f.Orientation() === O.TopAbs_REVERSED;
  const point = K.xyz(P);
  r.free();
  return { uv: [u, v], point, surfNormal: n, outward: rev ? K.V.neg(n) : n };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const code = process.argv[2] ?? `return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4).profiles(), mm(10), { id: 'block' })`;
  const prog = await build(code);
  const b = prog.kernelBodies()[0].body;
  b.faces.list.forEach((f, i) => {
    const outer = oc.BRepTools.OuterWire(f);
    const areas = []; K.explore(f, 'WIRE', w => areas.push(`${w.IsSame(outer) ? 'outer' : 'inner'} ${r6(wireUV(f, w))}`));
    const nm = normals(f);
    console.log(`f${i} ${b.names[i]} ${oname(f.Orientation())} | ${areas.join(' | ')} | at ${nm.point.map(r6)} dS/du×dS/dv ${nm.surfNormal.map(r6)} outward ${nm.outward.map(r6)}`);
  });
}
