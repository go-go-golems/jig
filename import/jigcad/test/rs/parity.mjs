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

// residual tapes on real sketches: compiled closure = JS tape interpreter = Rust residual; Rust Jacobian (exact)
// against central differences of the closure; cluster solve and drag, Rust against JS, on the same system
{
  const W = await import('../../src/engine/worker.js');
  const PG = await import('../../src/engine/program.js');
  const SY = await import('../../src/engine/sketch/sym.js');
  const SV = await import('../../src/engine/sketch/solver.js');
  const { readFileSync, readdirSync } = await import('node:fs');
  const PD = new URL('../../content/presets/', import.meta.url).pathname;
  let neq = 0, nsk = 0, worstJ = 0;
  for (const id of ['A-03', 'M-03', 'W-07', 'H-11', 'S-10', 'D-02', 'X-03']) {
    const dir = PD + readdirSync(PD).find(d => d.startsWith(id));
    const model = await W.runScript(readFileSync(dir + '/script.js', 'utf8'), { data: W.parseData(Object.fromEntries(readdirSync(dir).map(f => [f, readFileSync(dir + '/' + f, 'utf8')]))) });
    const prog = PG.compile(model, {});
    for (const part of prog.P.parts) for (const [sid, rec] of part.res.sketches) {
      const solved = rec.solved; if (!solved?.sys) continue;
      const sys = solved.sys, ref = SV.ensureTape(sys); if (!ref) continue;
      nsk++;
      const eqs = sys.cons.flatMap(c => c.eqs ?? []), x = Float64Array.from(solved.X ?? sys.x);
      const xs = [x, Float64Array.from(x, (v, i) => v + 0.37 * Math.sin(3.1 * i + 1))];   // the solution and a perturbed point
      for (const xv of xs) {
        const cols = Uint32Array.from(sys.x.map((_, i) => i).filter(i => !sys.fixed[i])), tids = Uint32Array.from(eqs, e => e.tid);
        const rj = RS.tapeJacobian(ref, xv, cols, tids), n = cols.length;
        eqs.forEach((e, k) => {
          neq++;
          const a = e.f(xv), b = SY.evalTape(ref.tape, e.tid, xv), c = rj.r[k];
          check(`${id}/${sid} eq ${k} residual`, near(a, b, 1e-12, 1e-12) && near(a, c, 1e-12, 1e-12), `closure ${a} js-tape ${b} rust ${c}`);
          for (let j = 0; j < n; j++) {
            const xp = Float64Array.from(xv), xm = Float64Array.from(xv), h = 1e-6 * Math.max(1, Math.abs(xv[cols[j]]));
            xp[cols[j]] += h; xm[cols[j]] -= h;
            const fd = (e.f(xp) - e.f(xm)) / (2 * h), ex = rj.J[k * n + j];
            const err = Math.abs(fd - ex) / Math.max(1, Math.abs(ex));
            if (err > worstJ) worstJ = err;
          }
        });
      }
      // a cluster solve from a perturbed start and a drag of the first free point, Rust then JS
      const free = sys.order.map(eid => sys.entities.get(eid)).find(en => en.kind === 'point' || en.kind === 'line');
      if (free) {
        const ref2 = free.kind === 'point' ? free.id : `${free.id}.end`;
        let pr; try { pr = solved.point(ref2); } catch { pr = null; }
        if (pr) {
          const to = [pr[0] + 1.5, pr[1] - 0.75];
          const dr = solved.drag(ref2, to), dj = RS.withJs(() => solved.drag(ref2, to));
          const prr = dr.point(ref2), pjj = dj.point(ref2);
          check(`${id}/${sid} drag ${ref2}`, near(prr[0], pjj[0], 1e-6, 1e-6) && near(prr[1], pjj[1], 1e-6, 1e-6), `rust ${prr} js ${pjj}`);
        }
      }
    }
  }
  check('tape Jacobians match central differences', worstJ < 1e-5, `worst relative error ${worstJ}`);
  console.log(`tapes: ${nsk} sketches, ${neq} equation evaluations, worst |exact − FD| / max(1, |exact|) = ${worstJ.toExponential(2)} · live tapes ${RS.liveTapes()}`);
}

console.log(`\n${pass} checks passed, ${fail} failed · ${ntri} triangles · ${(performance.now() - t0).toFixed(0)} ms · live meshes ${RS.liveMeshes()}`);
process.exit(fail ? 1 : 0);
