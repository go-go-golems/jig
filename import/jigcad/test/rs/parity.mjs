// Parity: every Rust path (jig-compute) against the JS reference on real preset meshes and synthetic cases.
// Usage: node test/rs/parity.mjs   (exit 1 on any mismatch)
import { init, compilePreset } from './presets.mjs';
const I = await import('../../src/engine/inspect.js');
const P = await import('../../src/engine/print.js');
const RS = await import('../../src/engine/rs/index.js');
const LA = await import('../../src/engine/sketch/linalg.js');

const info = await init();
if (info.compute?.kind !== 'rust') { console.log('Rust is not active:', info.compute); process.exit(1); }
let pass = 0, fail = 0;
const near = (a, b, rel = 1e-9, abs = 1e-9) => (a === b) || Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));
function check(name, ok, detail = '') { if (ok) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); } }
const vnear = (a, b, rel, abs) => a.length === b.length && a.every((x, i) => near(x, b[i], rel, abs));

function compareScores(name, a, b) {
  for (const k of ['overhangArea', 'bedContact', 'height', 'supportVolume', 'lo', 'hi'])
    check(`${name}.${k}`, near(a[k], b[k], 1e-9, 1e-7), `rust ${a[k]} js ${b[k]}`);
  check(`${name}.dir`, vnear(a.dir, b.dir, 1e-12, 1e-12));
  check(`${name}.faces`, JSON.stringify(a.overhangFaces) === JSON.stringify(b.overhangFaces), `rust ${a.overhangFaces} js ${b.overhangFaces}`);
}
function compareLoops(name, a, b) {
  check(`${name}.count`, a.length === b.length, `rust ${a.length} js ${b.length}`);
  if (a.length !== b.length) return;
  for (let i = 0; i < a.length; i++) {
    check(`${name}[${i}].len`, a[i].length === b[i].length, `rust ${a[i].length} js ${b[i].length}`);
    check(`${name}[${i}].area`, near(I.polyArea(a[i]), I.polyArea(b[i]), 1e-9, 1e-9));
  }
}

const PRESETS = ['A-01', 'H-07', 'M-06', 'M-07', 'M-08', 'X-08', 'C-02', 'D-10'];
const t0 = performance.now();
let ntri = 0;
for (const id of PRESETS) {
  const prog = await compilePreset(id);
  const bodies = prog.bodies.filter(b => b.mesh);
  const soups = [], arrays = [];
  for (const b of bodies) {
    const js = I.meshTrisJS(b.mesh, b.transform, b.faces), rs = I.meshTris(b.mesh, b.transform, b.faces);
    check(`${id}/${b.id} is a TriSoup`, RS.isSoup(rs));
    const recs = rs.records();
    ntri += js.length;
    check(`${id}/${b.id} count`, recs.length === js.length);
    let worst = 0;
    for (let t = 0; t < js.length; t++) for (const k of ['a', 'b', 'c', 'n', 'cen']) for (let d = 0; d < 3; d++) worst = Math.max(worst, Math.abs(recs[t][k][d] - js[t][k][d]));
    check(`${id}/${b.id} records`, worst < 1e-9 && recs.every((r, t) => r.face === js[t].face && near(r.area, js[t].area, 1e-12, 1e-12)), `worst ${worst}`);
    for (const d of P.CANDIDATES) compareScores(`${id}/${b.id} score ${d}`, I.orientationScore(rs, d, { maxAngle: Math.PI / 4, supportFactor: 0.35 }), I.orientationScoreJS(js, d, { maxAngle: Math.PI / 4, supportFactor: 0.35 }));
    const lo = Math.min(...js.flatMap(t => [t.a[2], t.b[2], t.c[2]])), hi = Math.max(...js.flatMap(t => [t.a[2], t.b[2], t.c[2]]));
    for (const f of [0.1, 0.37, 0.5, 0.81]) {
      const z = lo + f * (hi - lo);
      const lr = P.meshSection(rs, z), lj = P.meshSectionJS(js, z);
      compareLoops(`${id}/${b.id} section ${f}`, lr, lj);
      const pr = RS.loopsProps(lj), pj = I.loopsPropsJS(lj);
      for (const k of ['area', 'Ixx', 'Iyy', 'regions', 'holes']) check(`${id}/${b.id} props ${f} ${k}`, near(pr[k], pj[k], 1e-9, 1e-6), `rust ${pr[k]} js ${pj[k]}`);
    }
    soups.push(rs); arrays.push(js);
  }
  // catTris = flatMap
  if (soups.length > 1) {
    const cat = I.catTris(soups), flat = arrays.flat();
    check(`${id} catTris length`, cat.length === flat.length);
    compareScores(`${id} catTris score`, I.orientationScore(cat, [0, 0, 1]), I.orientationScoreJS(flat, [0, 0, 1]));
    for (let i = 0; i < soups.length; i++) for (let j = i + 1; j < soups.length; j++) for (const maxD of [0.5, 2, 10]) {
      const gr = I.meshGap(soups[i], soups[j], maxD), gj = I.meshGapJS(arrays[i], arrays[j], maxD);
      check(`${id} gap ${i}-${j} @${maxD}`, near(gr, gj, 1e-9, 1e-9), `rust ${gr} js ${gj}`);
    }
  }
  // a body against a moved copy of itself: separated, touching and overlapping
  const b = bodies[0], size = b.bbox[1][0] - b.bbox[0][0];
  for (const dx of [size + 1.5, size + 0.3, size * 0.5]) {
    const T = b.transform.slice(); T[12] += dx;
    const A = I.meshTris(b.mesh, b.transform), B = I.meshTris(b.mesh, T);
    const gr = I.meshGap(A, B, 2), gj = I.meshGapJS(I.meshTrisJS(b.mesh, b.transform), I.meshTrisJS(b.mesh, T), 2);
    check(`${id} self-gap dx=${dx.toFixed(2)}`, near(gr, gj, 1e-9, 1e-9), `rust ${gr} js ${gj}`);
  }
  console.log(`${id}: ${bodies.length} bodies checked`);
}

// stale handles rebuild after resetArena
{
  const prog = await compilePreset('A-01');
  const b = prog.bodies[0];
  const s = I.meshTris(b.mesh, b.transform, b.faces);
  const before = I.orientationScore(s, [0, 0, 1]);
  RS.resetArena();
  compareScores('after resetArena', I.orientationScore(s, [0, 0, 1]), before);
  s.free(); s.free();
  check('double free is harmless', I.orientationScore(s, [0, 0, 1]).bedContact === before.bedContact);
}

// linear algebra against sketch/linalg.js on random matrices (including rank-deficient ones)
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let trial = 0; trial < 60; trial++) {
  const m = 1 + (trial % 9), n = 1 + ((trial * 7) % 13);
  const J = Float64Array.from({ length: m * n }, rnd);
  if (trial % 3 === 0 && m > 1) J.set(J.subarray(0, n), n);   // a repeated row
  const b = Float64Array.from({ length: m }, rnd);
  const fj = LA.factorJJS(J, m, n), fr = RS.factorSolve(J, m, n, b, { wantNull: true });
  check(`factorJ rank ${m}×${n}`, fj.rank === fr.rank, `js ${fj.rank} rust ${fr.rank}`);
  check(`factorJ solve ${m}×${n}`, vnear(Array.from(fr.h), Array.from(fj.solve(b)), 1e-9, 1e-10));
  const nj = fj.nullBasis;
  check(`factorJ null ${m}×${n}`, nj.length === fr.nullBasis.length && nj.every((v, k) => vnear(Array.from(fr.nullBasis[k]), Array.from(v), 1e-9, 1e-10)));
  check(`qrcp rank ${m}×${n}`, LA.qrcp(J, m, n).rank === RS.qrcpRank(J, m, n));
  const A = new Float64Array(n * n); for (let i = 0; i < m; i++) for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) A[a * n + c] += J[i * n + a] * J[i * n + c];
  const g = Float64Array.from({ length: n }, rnd), cj = LA.cholSolveJS(A, n, g, 1e-3), cr = RS.cholSolve(A, n, g, 1e-3);
  check(`chol ${n}`, (cj == null && cr == null) || vnear(Array.from(cr), Array.from(cj), 1e-9, 1e-10));
}

console.log(`\n${pass} checks passed, ${fail} failed · ${ntri} triangles · ${(performance.now() - t0).toFixed(0)} ms · live meshes ${RS.liveMeshes()}`);
process.exit(fail ? 1 : 0);
