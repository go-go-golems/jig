// Full topology dump of a jig body: vertices, edges, faces, wires (loops), orientations, pcurves, tolerances.
import { build, oc, K, r6, pt } from './lib.mjs';
const O = oc.TopAbs_Orientation;
export const oname = o => o === O.TopAbs_FORWARD ? 'F' : o === O.TopAbs_REVERSED ? 'R' : o === O.TopAbs_INTERNAL ? 'I' : 'E';
const CT = oc.GeomAbs_CurveType, ST = oc.GeomAbs_SurfaceType;
const cname = t => Object.keys(CT).find(k => CT[k] === t)?.replace('GeomAbs_', '') ?? String(t);
const sname = t => Object.keys(ST).find(k => ST[k] === t)?.replace('GeomAbs_', '') ?? String(t);
export function dump(b, { pcurves = true } = {}) {
  const r = K.scope();
  const out = [];
  const vi = v => b.vertices.indexOf(v);
  out.push(`solid orientation ${oname(b.shape.Orientation())}`);
  let shells = 0; K.explore(b.shape, 'SHELL', s => { shells++; out.push(`shell ${shells} orientation ${oname(s.Orientation())} closed=${s.Closed()}`); });
  b.vertices.list.forEach((v, i) => out.push(`v${i} ${pt(b.vertexPoint(i))} tol ${oc.BRep_Tool.Tolerance(v)}`));
  b.edges.list.forEach((e, i) => {
    const ad = r(new oc.BRepAdaptor_Curve(e));
    const vs = []; K.explore(e, 'VERTEX', v => vs.push(`v${vi(v)}${oname(v.Orientation())}`));
    const deg = oc.BRep_Tool.Degenerated(e);
    const fs = b.edgeFaces[i];
    const seam = fs.length === 2 && fs[0] === fs[1];
    const info = deg ? { length: 0 } : b.edgeInfo(i);
    out.push(`e${i} ${deg ? 'degenerate' : cname(ad.GetType())} [${vs.join(' ')}] len ${r6(info.length)} tol ${oc.BRep_Tool.Tolerance(e)} faces ${fs.map(f => 'f' + f).join(',')}${seam ? ' SEAM' : ''} sameParam ${oc.BRep_Tool.SameParameter(e)} range ${r6(ad.FirstParameter())}..${r6(ad.LastParameter())}`);
  });
  b.faces.list.forEach((f, i) => {
    const ad = r(new oc.BRepAdaptor_Surface(f, true));
    const uv = oc.BRepTools.UVBounds(f, 0, 0, 0, 0);
    const outer = r(oc.BRepTools.OuterWire(f));
    out.push(`f${i} ${b.names[i]} ${sname(ad.GetType())} orient ${oname(f.Orientation())} tol ${oc.BRep_Tool.Tolerance(f)} uv [${r6(uv.UMin)},${r6(uv.UMax)}]x[${r6(uv.VMin)},${r6(uv.VMax)}] area ${r6(b.faceInfo(i).area)}`);
    let w = 0;
    K.explore(f, 'WIRE', wr => {
      const isOuter = wr.IsSame(outer);
      const items = [];
      K.explore(wr, 'EDGE', e0 => {
        const e = oc.TopoDS.Edge(e0);
        const ei = b.edges.indexOf(e);
        // orientation as seen in the face (composition of face, wire, edge orientations): explore the face itself
        let s = `e${ei}${oname(e.Orientation())}`;
        if (pcurves) {
          const ef = r(oc.TopoDS.Edge(r(e.Oriented(e.Orientation()))));
          try {
            const c2 = r(new oc.BRepAdaptor_Curve2d(ef, f));
            const a = r(c2.Value(c2.FirstParameter())), z = r(c2.Value(c2.LastParameter()));
            s += `{${cname(c2.GetType())} (${r6(a.X())},${r6(a.Y())})→(${r6(z.X())},${r6(z.Y())})}`;
          } catch (x) { s += `{no pcurve: ${x.message ?? x}}`; }
        }
        items.push(s); e.delete();
      });
      out.push(`   wire ${++w}${isOuter ? ' outer' : ' inner'} orient ${oname(wr.Orientation())}: ${items.join(' ')}`);
    });
  });
  r.free();
  return out.join('\n');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const code = process.argv[2] ?? `return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4).profiles(), mm(10), { id: 'block' })`;
  const prog = await build(code);
  for (const kb of prog.kernelBodies()) { console.log(prog.data.bodies.find(x => x.id.endsWith(kb.body.id))?.topology); console.log(dump(kb.body)); }
}
