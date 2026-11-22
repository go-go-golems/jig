// A stress study, end to end: surface → tetrahedra → loads and supports → CalculiX (or the reference solver) →
// fields, peaks, safety factor, findings. The job is plain data (engine/fea.js builds it), so this runs in any
// worker, or in Node, with no kernel.
//
// job: {
//   name, surface: { positions, indices, triFace } (one closed body), faceNames: [name per face index],
//   material: { name, E (MPa), nu, strength (MPa), density (t/mm³) },
//   fixtures: [{ faces: [face index], type: 'fixed' | 'roller', label }],
//   loads: [{ type: 'force', faces, force: [N], label } | { type: 'pressure', faces, p: MPa, label }
//         | { type: 'wrench', faces, force, moment, point, mode, label } | { type: 'body', g, a0, alpha, omega, c, label }],
//   mesh: { size?, refine? (default true), budget? (dof) }, margin (default 2), checks: [{ type: 'displacement', limit, faces? }],
//   solver: 'auto' | 'ccx' | 'js'
// }
import { weld, closure, toSmesh, switches, readTetgen, quadratic } from './tetmesh.js';
import { facesOf, nodesOf, addForce, addPressure, addWrench, addBody, nodeNormals } from './loads.js';
import { writeDeck, readDat, netReactions } from './deck.js';
import { solveStatic } from './jsolve.js';
import { summarise, surfaceField } from './post.js';
import * as BK from './backends.js';

export const SOLVER_VERSION = 'jig-fea 1';
const DOF_BUDGET = 150000;

// what a material lacks for a linear elastic solve; each would turn into NaN in the stiffness or the safety factor,
// which no comparison (SF < 1, SF < margin) would catch. The compile blocks on them; solveJob refuses them too.
export function materialProblems(m) {
  const out = [];
  if (!(m.E > 0 && Number.isFinite(m.E))) out.push({ what: 'no elastic modulus', fix: 'modulus: MPa(…) (GPa × 1000)' });
  if (!(m.nu >= 0 && m.nu < 0.5)) out.push({ what: `a Poisson's ratio of ${m.nu}, outside 0 ≤ ν < 0.5`, fix: 'nu: 0.35' });
  if (!(m.strength > 0 && Number.isFinite(m.strength))) out.push({ what: 'no strength to judge the part against', fix: 'strength: MPa(…)' });
  if (!(m.density >= 0 && Number.isFinite(m.density))) out.push({ what: 'no density to weigh it', fix: 'density: q(\'1.24 g/cm^3\')' });
  return out;
}
export async function solveJob(job, o = {}) {
  const bad = materialProblems(job.material ?? {});
  if (bad.length) throw failure('fea.material', `${job.material?.name ?? 'the material'} has ${bad.map((b) => b.what).join(', ')}`, bad.map((b) => b.fix).join(', '));
  const t0 = now(), timings = {}, notes = [];
  const findings = [];
  const surf = job.surface;
  const bb = bbox(surf.positions), diag = Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]);
  const welded = weld(surf, Math.max(1e-9, diag * 1e-7));
  const cl = closure(welded.tris);
  if (cl.open || cl.over) throw failure('fea.openSurface', `the surface is not closed (${cl.open} open and ${cl.over} non-manifold edges): the part must be one closed solid`, 'fuse the part into one solid body');
  const avail = await BK.available();
  const solverKind = job.solver === 'js' ? 'js' : job.solver === 'ccx' ? (avail.ccx ? 'ccx' : null) : avail.ccx ? 'ccx' : 'js';
  if (!solverKind) throw failure('fea.noSolver', 'no CalculiX module is present (vendor/fea/ccx.mjs)', "build it with tools/fea-wasm/build.sh, or solve with { solver: 'js' }");
  if (solverKind === 'js' && job.solver !== 'js') notes.push('no CalculiX module present: solved by the JavaScript reference solver');
  const size0 = job.mesh?.size ?? diag / 30;

  const run = async (size) => {
    const tm = now();
    const tg = await BK.tetgen(toSmesh(welded), switches(size));
    const mesh = quadratic(readTetgen(tg));
    timings.mesh = (timings.mesh ?? 0) + now() - tm;
    const nn = mesh.nodes.length / 3, F = new Float64Array(3 * nn);
    const applied = [], fixed = [], rollers = [];
    const marksOf = (faces) => faces.map(Number);
    for (const [i, fx] of (job.fixtures ?? []).entries()) {
      const fs = facesOf(mesh, marksOf(fx.faces));
      if (!fs.length) throw failure('fea.fixture', `fixture ${fx.label ?? i + 1}: its faces did not reach the mesh`, 'check the selector');
      if (fx.type === 'roller') rollers.push({ name: `ROLLER${i + 1}`, nodes: nodesOf(fs), normals: nodeNormals(fs), label: fx.label });
      else fixed.push({ name: `FIX${i + 1}`, nodes: nodesOf(fs), label: fx.label });
    }
    if (!fixed.length && !rollers.length) throw failure('fea.free', 'nothing holds the part: add a fixture', ".fix(faces) holds faces still; .roller(faces) lets them slide in their plane");
    for (const ld of job.loads ?? []) {
      const before = Float64Array.from(F);
      if (ld.type === 'body') addBody(F, mesh, ld);
      else {
        const fs = facesOf(mesh, marksOf(ld.faces));
        if (!fs.length) throw failure('fea.load', `load ${ld.label ?? ld.type}: its faces did not reach the mesh`, 'check the selector');
        if (ld.type === 'force') addForce(F, fs, ld.force);
        else if (ld.type === 'pressure') addPressure(F, fs, ld.p);
        else if (ld.type === 'wrench') addWrench(F, mesh, fs, ld);
        else throw failure('fea.load', `unknown load type '${ld.type}'`);
      }
      const tot = [0, 0, 0]; for (let n = 0; n < nn; n++) for (let k = 0; k < 3; k++) tot[k] += F[3 * n + k] - before[3 * n + k];
      applied.push({ label: ld.label ?? ld.type, type: ld.type, total: tot });
    }
    const appliedTotal = [0, 1, 2].map((k) => applied.reduce((s, a) => s + a.total[k], 0));
    const ts = now();
    let sol, version;
    const problem = { mesh, material: job.material, fixed, rollers, forces: F };
    if (solverKind === 'ccx') {
      const deck = writeDeck(problem);
      const r = await BK.ccx(deck);
      sol = readDat(r.dat, nn, mesh.tets.length / 10); version = `CalculiX ${r.version}`;
      sol.RF = netReactions(sol.RF, F);
      if (o.keepDeck) sol.deck = deck;
    } else { sol = solveStatic(problem); version = 'jig reference solver (JavaScript)'; }
    timings.solve = (timings.solve ?? 0) + now() - ts;
    // whichever solver ran, a field that is not finite is a failed solve, never stresses to report
    if (!sol.U.every(Number.isFinite) || !sol.S.every(Number.isFinite)) throw failure('fea.solverFailed', `${version} returned a displacement or stress that is not a number`, 'check the supports hold every rigid motion, and that the loads are finite');
    // the reaction is summed over the held nodes once each: a node on two supports (an edge where a base meets a
    // side) is printed in both sets
    const reaction = [0, 0, 0], seen = new Set();
    for (const s of Object.values(sol.RF)) for (const [n, v] of s.nodes) if (!seen.has(n)) { seen.add(n); for (let k = 0; k < 3; k++) reaction[k] += v[k]; }
    const mag = Math.max(1e-12, Math.hypot(...appliedTotal), ...applied.map((a) => Math.hypot(...a.total)));
    const mismatch = Math.hypot(...[0, 1, 2].map((k) => appliedTotal[k] + reaction[k]));
    const sum = summarise(mesh, sol, { faceName: (k) => job.faceNames?.[k] ?? `face ${k}` });
    const supports = [...fixed, ...rollers].map((s) => ({ label: s.label ?? s.name, set: s.set ?? s.name, total: sol.RF[(s.set ?? s.name).toUpperCase()]?.total ?? null }));
    return { size, mesh, sol, sum, applied, appliedTotal, reaction, supports, balance: mismatch / mag, version, dof: 3 * nn };
  };

  let A = await run(size0), refined = null;
  const strength = job.material.strength;
  const sf = (r) => strength / r.sum.peak.value;
  const margin = job.margin ?? 2;
  if (job.mesh?.refine !== false && sf(A) < 3) {
    // half the element size, or what the dof budget allows (dof grows as the cube of the refinement)
    const budget = job.mesh?.budget ?? DOF_BUDGET, k = Math.max(0.5, Math.cbrt(A.dof / budget));
    if (k < 0.95) {
      try {
        const B = await run(A.size * k);
        refined = { fromSize: A.size, fromPeak: A.sum.peak.value, size: B.size, peak: B.sum.peak.value, change: Math.abs(B.sum.peak.value - A.sum.peak.value) / A.sum.peak.value };
        A = B;
      } catch (e) { findings.push({ level: 'warning', kind: 'fea.solverNote', message: `the finer solve failed (${e.message}); the first one is reported` }); }
    } else findings.push({ level: 'warning', kind: 'fea.solverNote', message: `no finer solve: the mesh already has ${A.dof} degrees of freedom` });
  }
  if (A.balance > 1e-3) throw failure('fea.unbalanced', `the reactions do not balance the applied load (mismatch ${(A.balance * 100).toFixed(2)} % of it): the solve is not the study's`, 'check the supports hold every rigid motion');
  const peak = A.sum.peak, SF = sf(A), disp = A.sum.displacement;
  const loc = (p) => `${p.faces.length ? p.faces.join(', ') : 'inside the part'} at (${p.at.map((x) => x.toFixed(1)).join(', ')})`;
  const heldMarks = new Set((job.fixtures ?? []).flatMap((f) => f.faces.map(Number)));
  const onHeld = peak.faces.some((nm) => (job.faceNames ?? []).indexOf(nm) >= 0 && heldMarks.has((job.faceNames ?? []).indexOf(nm)));
  if (SF < 1) findings.push({ level: 'error', kind: 'fea.yields', at: peak.faces[0] ?? 'inside', message: `peak von Mises ${peak.value.toFixed(1)} MPa is above ${job.material.name}'s strength ${strength} MPa (safety factor ${SF.toFixed(2)}), ${loc(peak)}`, fix: 'thicken the part where the peak is, round the corner it sits in, change the material, or check the load' });
  else if (SF < margin) findings.push({ level: 'warning', kind: 'fea.lowMargin', at: peak.faces[0] ?? 'inside', message: `safety factor ${SF.toFixed(2)} is under the margin ${margin} (peak ${peak.value.toFixed(1)} MPa, ${loc(peak)})`, fix: 'strengthen the part there, or report the margin it has; do not lower the margin to clear this' });
  const settled = refined && refined.change <= 0.1;
  if (SF < margin && onHeld && !settled) findings.push({ level: 'warning', kind: 'fea.peakAtFixture', at: peak.faces[0], message: `the peak sits on a held face, where a rigid support exaggerates stress`, fix: 'read the stress a little away from the support (probe), or hold the part more softly' });
  if (SF < margin && A.sum.gauss && A.sum.gauss.value > 1.5 * peak.value && !settled) findings.push({ level: 'warning', kind: 'fea.peakConcentration', at: 'mesh', message: `the integration-point peak ${A.sum.gauss.value.toFixed(1)} MPa is ${(A.sum.gauss.value / peak.value).toFixed(2)}× the nodal one: a concentration the mesh does not resolve`, fix: 'round the sharp corner, spread the load over a larger face, or set a smaller mesh size' });
  if (refined && refined.change > 0.1) findings.push({ level: 'warning', kind: 'fea.meshNotConverged', at: 'mesh', message: `halving the element size moved the peak ${(refined.change * 100).toFixed(0)} % (${refined.fromPeak.toFixed(1)} → ${refined.peak.toFixed(1)} MPa)`, fix: 'a peak that keeps rising sits on a sharp corner or a support edge: round it, or judge the stress away from it' });
  if (disp.value > 0.01 * diag) findings.push({ level: 'warning', kind: 'fea.largeDisplacement', at: disp.faces[0] ?? 'inside', message: `it moves ${disp.value.toFixed(3)} mm, more than 1 % of its size: the small-displacement model is stretched`, fix: 'stiffen the part, or treat the numbers as indicative' });
  const checks = [];
  for (const c of job.checks ?? []) if (c.type === 'displacement') {
    let v = disp.value, where = disp;
    if (c.faces?.length) { const fs = facesOf(A.mesh, c.faces.map(Number)); const ns = nodesOf(fs); v = Math.max(...ns.map((n) => A.sum.disp[n])); where = null; }
    const ok = v <= c.limit;
    checks.push({ type: 'displacement', value: v, limit: c.limit, ok });
    if (!ok) findings.push({ level: 'error', kind: 'fea.displacement', at: where?.faces?.[0] ?? c.label ?? 'displacement', message: `it moves ${v.toFixed(4)} mm, past the ${c.limit} mm limit`, fix: 'stiffen the part, or check the limit' });
  }
  for (const n of notes) findings.push({ level: 'info', kind: 'fea.solverNote', message: n });
  const result = {
    ok: !findings.some((f) => f.level === 'error'), name: job.name, solver: A.version, version: SOLVER_VERSION,
    material: { ...job.material }, strength, margin, safetyFactor: SF,
    peak: { value: peak.value, at: peak.at, faces: peak.faces }, gauss: A.sum.gauss ? { value: A.sum.gauss.value, at: A.sum.gauss.at } : null,
    displacement: { value: disp.value, at: disp.at, faces: disp.faces },
    applied: A.applied, appliedTotal: A.appliedTotal, reaction: A.reaction, supports: A.supports, balance: A.balance,
    mesh: { size: A.size, nodes: A.mesh.nodes.length / 3, elements: A.mesh.tets.length / 10, dof: A.dof, refined },
    checks, findings, timings: { ...timings, total: now() - t0 },
    surface: surfaceField(A.mesh, A.sum, A.sol.U),
  };
  if (o.keepVolume) result.volume = { mesh: A.mesh, vm: A.sum.vm, tensor: A.sum.tensor, U: A.sol.U };
  if (o.keepDeck && A.sol.deck) result.deck = A.sol.deck;
  return result;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function bbox(P) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  return [lo, hi];
}
const failure = (kind, message, fix) => Object.assign(new Error(message), { kind, fix });
export { BK as backends };
