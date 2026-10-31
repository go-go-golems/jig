import { prog, K, exp, compile } from './h.mjs';
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const { unzip } = await import('/home/claude/jigcad/src/engine/io.js');
const src = `return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })`;
const pr = await prog(src);
const { body } = pr.kernelBodies()[0];
const m = M.meshBody(body);
function analyse(P, I, label) {
  const nv = P.length / 3, nt = I.length / 3;
  const key = i => `${P[3*i]},${P[3*i+1]},${P[3*i+2]}`;
  const weld = new Map(); const id = new Array(nv);
  for (let i = 0; i < nv; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, weld.size); id[i] = weld.get(k); }
  const count = (ids) => { const e = new Map(); let degenerate = 0;
    for (let t = 0; t < nt; t++) { const v = [ids[I[3*t]], ids[I[3*t+1]], ids[I[3*t+2]]]; if (v[0]===v[1]||v[1]===v[2]||v[0]===v[2]) { degenerate++; continue; }
      for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k+1)%3]; const kk = a < b ? a+','+b : b+','+a; const r = e.get(kk) ?? { n: 0, dir: 0 }; r.n++; r.dir += a < b ? 1 : -1; e.set(kk, r); } }
    const hist = {}; let badOrient = 0; for (const r of e.values()) { hist[r.n] = (hist[r.n]||0)+1; if (r.n === 2 && r.dir !== 0) badOrient++; }
    return { E: e.size, hist, badOrient, degenerate };
  };
  const raw = count([...Array(nv).keys()]);
  const w = count(id);
  console.log(label, 'vertices', nv, 'welded', weld.size, 'triangles', nt, '| unwelded edges by use', JSON.stringify(raw.hist), '| welded edges by use', JSON.stringify(w.hist), 'misoriented', w.badOrient, 'degenerate', w.degenerate, 'chi', weld.size - w.E + nt);
}
analyse(m.positions, m.indices, 'meshBody');
await compile(src);
const s = await exp('stl', {});
const st = await exp('step', {});
const t = await exp('3mf', {});
console.log('stl bytes', s.data.byteLength, 'triangles', s.triangles, JSON.stringify(s.report));
console.log('step chars', st.data.length, JSON.stringify(st.report));
console.log('3mf bytes', t.data.byteLength, JSON.stringify(t.report));
// parse STL
const dv = new DataView(s.data); const n = dv.getUint32(80, true); const P = new Float32Array(n * 9); const I = new Uint32Array(n * 3);
for (let i = 0; i < n; i++) { for (let k = 0; k < 9; k++) P[i*9+k] = dv.getFloat32(84 + 50*i + 12 + 4*k, true); I[3*i] = 3*i; I[3*i+1] = 3*i+1; I[3*i+2] = 3*i+2; }
analyse(P, I, 'STL');
// parse 3MF
const files = unzip(new Uint8Array(t.data));
const model = new TextDecoder().decode(files.find(f => f.name === '3D/3dmodel.model').data);
const vs = [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(x => [+x[1], +x[2], +x[3]]);
const ts = [...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(x => [+x[1], +x[2], +x[3]]);
analyse(vs, ts, '3MF');
// STEP head
console.log(st.data.split('\n').filter(l => /ADVANCED_FACE|TOROIDAL|CYLINDRICAL_SURFACE|PLANE\(|SI_UNIT|LENGTH_UNIT/.test(l)).slice(0, 12).join('\n'));
const cnt = re => (st.data.match(re) || []).length;
console.log('ADVANCED_FACE', cnt(/ADVANCED_FACE/g), 'TOROIDAL_SURFACE', cnt(/TOROIDAL_SURFACE/g), 'CYLINDRICAL_SURFACE', cnt(/CYLINDRICAL_SURFACE/g), 'PLANE(', cnt(/= PLANE\(/g), 'CIRCLE', cnt(/= CIRCLE\(/g), 'lines', st.data.split('\n').length);
