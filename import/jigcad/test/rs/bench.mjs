// Benchmark the ported paths, JS reference vs Rust (jig-compute), on real preset meshes.
// Usage: node test/rs/bench.mjs [reps]
import { init, compilePreset } from './presets.mjs';
const I = await import('../../src/engine/inspect.js');
const P = await import('../../src/engine/print.js');
const RS = await import('../../src/engine/rs/index.js');
const LA = await import('../../src/engine/sketch/linalg.js');
await init();
const reps = +(process.argv[2] ?? 5);
function time(fn) { fn(); const t = []; for (let i = 0; i < reps; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return t[Math.floor(t.length / 2)]; }
const rows = [];
const row = (what, js, rs) => { rows.push({ what, js, rs }); console.log(`${what.padEnd(46)} js ${js.toFixed(2).padStart(9)} ms   rust ${rs.toFixed(2).padStart(9)} ms   ×${(js / rs).toFixed(1)}`); };

for (const id of ['M-07', 'M-06', 'X-08', 'M-10']) {
  const prog = await compilePreset(id);
  const bodies = prog.bodies.filter(b => b.mesh);
  const ntri = bodies.reduce((n, b) => n + b.mesh.indices.length / 3, 0);
  const tag = `${id} (${bodies.length} bodies, ${ntri} tris)`;
  // what print.js does per item: tris for all bodies, then rank every candidate direction (supports at 0.35)
  row(`${tag} rank orientations`,
    time(() => P.rankCandidates(bodies.flatMap(b => I.meshTrisJS(b.mesh, b.transform, b.faces)).map(t => t), Math.PI / 4, 0.35)),
    time(() => { const s = I.catTris(bodies.map(b => I.meshTris(b.mesh, b.transform, b.faces))); P.rankCandidates(s, Math.PI / 4, 0.35); s.free(); }));
  // slicing a complex body: 200 layers
  const b = bodies[0], lo = b.bbox[0][2], hi = b.bbox[1][2], zs = Array.from({ length: 200 }, (_, k) => lo + (k + 0.5) * (hi - lo) / 200);
  row(`${tag} 200 mesh sections`,
    time(() => { const t = I.meshTrisJS(b.mesh, b.transform); for (const z of zs) P.meshSectionJS(t, z); }),
    time(() => { const s = I.meshTris(b.mesh, b.transform); for (const z of zs) P.meshSection(s, z); s.free(); }));
  // clearance between two bodies (or a body and a moved copy)
  const b2 = bodies[1] ?? b, T = b2.transform.slice(); if (!bodies[1]) T[12] += b.bbox[1][0] - b.bbox[0][0] + 0.5;
  row(`${tag} mesh gap`,
    time(() => I.meshGapJS(I.meshTrisJS(b.mesh, b.transform), I.meshTrisJS(b2.mesh, T), 2)),
    time(() => { const A = I.meshTris(b.mesh, b.transform), B = I.meshTris(b2.mesh, T); I.meshGap(A, B, 2); A.free(); B.free(); }));
}
// solver-sized linear algebra: is it worth crossing the boundary for matrices this small?
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (const [m, n] of [[8, 10], [24, 30], [60, 80]]) {
  const J = Float64Array.from({ length: m * n }, rnd), bv = Float64Array.from({ length: m }, rnd);
  row(`factorJ + solve ${m}×${n} (×200)`, time(() => { for (let k = 0; k < 200; k++) LA.factorJJS(J, m, n).solve(bv); }), time(() => { for (let k = 0; k < 200; k++) RS.factorSolve(J, m, n, bv); }));
}
// whole sketch solves (all clusters, conflict search, rank analysis) on real preset sketches: tape solver vs JS
{
  const W = await import('../../src/engine/worker.js');
  const PG = await import('../../src/engine/program.js');
  const SV = await import('../../src/engine/sketch/solver.js');
  const { readFileSync, readdirSync } = await import('node:fs');
  const PD = new URL('../../content/presets/', import.meta.url).pathname;
  for (const id of ['A-03', 'M-03', 'H-11']) {
    const dir = PD + readdirSync(PD).find(d => d.startsWith(id));
    const model = await W.runScript(readFileSync(dir + '/script.js', 'utf8'), { data: W.parseData(Object.fromEntries(readdirSync(dir).map(f => [f, readFileSync(dir + '/' + f, 'utf8')]))) });
    const prog = PG.compile(model, {});
    const systems = prog.P.parts.flatMap(p => [...p.res.sketches.values()].map(r => r.solved?.sys).filter(s => s && s.cons.some(c => c.eqs?.length)));
    if (!systems.length) continue;
    const m = systems.reduce((k, s) => k + s.cons.reduce((q, c) => q + (c.eqs?.length ?? 0), 0), 0), n = systems.reduce((k, s) => k + s.x.length, 0);
    const run = () => { for (let r = 0; r < 20; r++) for (const s of systems) SV.solveSketch(s); };
    row(`${id} sketch solve ×20 (${systems.length} sketches, ${m} eqs, ${n} params)`, time(() => RS.withJs(run)), time(run));
  }
}
console.log(`\nmodule load ${RS.status.ms.toFixed(1)} ms · ${RS.status.bytes} bytes · live meshes ${RS.liveMeshes()}`);
