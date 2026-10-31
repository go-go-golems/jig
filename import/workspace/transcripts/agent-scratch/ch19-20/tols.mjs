// Tolerance survey: max and distribution of vertex/edge/face tolerances on real jig bodies; validity.
import { build, oc, K, r6 } from './lib.mjs';
import { readFileSync } from 'node:fs';
const TA = oc.TopAbs_ShapeEnum;
function survey(label, b) {
  const t = { VERTEX: [], EDGE: [], FACE: [] };
  for (const k of Object.keys(t)) { const idx = K.subShapes(b.shape, k); for (const s of idx.list) t[k].push(oc.BRep_Tool.Tolerance(s)); idx.free(); }
  const desc = k => { const a = t[k].slice().sort((x, y) => x - y); const n1 = a.filter(x => x <= 1.0000001e-7).length; return `${k[0]} n=${a.length} at1e-7=${n1} max=${a.at(-1).toExponential(2)}`; };
  const mt = ['VERTEX', 'EDGE', 'FACE'].map(k => oc.BRep_Tool.MaxTolerance(b.shape, TA['TopAbs_' + k]).toExponential(2));
  console.log(`${label}: ${desc('VERTEX')} | ${desc('EDGE')} | ${desc('FACE')} | MaxTolerance ${mt.join(' ')} | valid ${K.isValid(b.shape)}`);
  // ordering rule: tol(face) <= tol(edge) <= tol(vertex) for incident pairs
  let bad = 0, pairs = 0;
  b.edges.list.forEach((e, i) => { const te = oc.BRep_Tool.Tolerance(e); K.explore(e, 'VERTEX', v => { pairs++; if (oc.BRep_Tool.Tolerance(oc.TopoDS.Vertex(v)) < te - 1e-15) bad++; }); for (const fi of b.edgeFaces[i]) { pairs++; if (oc.BRep_Tool.Tolerance(b.faces.list[fi]) > te + 1e-15) bad++; } });
  console.log(`   ordering violations ${bad} of ${pairs} incident pairs`);
}
const files = process.argv.slice(2);
for (const f of files) {
  const code = f.startsWith('return') ? f : readFileSync(`/home/claude/jigcad/content/presets/${f}/script.js`, 'utf8');
  const prog = await build(code);
  for (const kb of prog.kernelBodies()) survey(`${f.slice(0, 40)} ${kb.body.id}`, kb.body);
}
