#!/usr/bin/env node
// Checks jig's FEA path against CalculiX's own reference results: reads decks from CalculiX's test directory
// (C3D10 meshes with *BOUNDARY and *CLOAD on nodes or node sets, one linear *STATIC step), solves each with jig's
// reference solver (src/fea/jsolve.js) and, when a CalculiX module or program is present, through jig's deck writer
// and .dat reader (src/fea/deck.js, backends.js), and compares displacements and integration-point stresses with the
// deck's .dat.ref. Agreement checks the element (shape functions, the 4-point rule and its point order, which the
// stress extrapolation relies on), the support and load handling, and the reader.
//
//   node tools/fea-wasm/check-reference.mjs <calculix>/test [beam10p circ10p …]
//
// A deck that uses anything else (*DLOAD, *TRANSFORM, equations, other element types) is skipped with the reason.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { solveStatic } from '../../src/fea/jsolve.js';
import { writeDeck, readDat } from '../../src/fea/deck.js';
import { available, ccx } from '../../src/fea/backends.js';

const [dir, ...names] = process.argv.slice(2);
if (!dir || !existsSync(dir)) { console.error('usage: check-reference.mjs <calculix>/test [deck …]'); process.exit(2); }
const DEFAULT = ['beam10p', 'segmenttet', 'beam10psmooth'];

// the subset of the input language jig writes: keyword lines, data lines, ** comments
function parseInp(text) {
  const cards = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.startsWith('**')) continue;
    if (line.startsWith('*')) {
      const [kw, ...opts] = line.slice(1).split(',').map((s) => s.trim());
      cards.push({ kw: kw.toUpperCase(), opts: Object.fromEntries(opts.filter(Boolean).map((o) => { const [k, v = true] = o.split('='); return [k.trim().toUpperCase(), typeof v === 'string' ? v.trim() : v]; })), data: [] });
    } else cards.at(-1)?.data.push(line.split(',').map((s) => s.trim()).filter((s) => s !== ''));
  }
  return cards;
}

function problem(cards) {
  const nodeId = new Map(), xyz = [], sets = new Map(), elemId = new Map(), tets = [];
  let E = null, nu = null;
  const bcs = [], loads = [];
  const seen = new Set(cards.map((c) => c.kw));
  for (const kw of seen) if (!['NODE', 'ELEMENT', 'NSET', 'ELSET', 'BOUNDARY', 'MATERIAL', 'ELASTIC', 'SOLID SECTION', 'STEP', 'STATIC', 'CLOAD', 'NODE PRINT', 'EL PRINT', 'END STEP', 'NODE FILE', 'EL FILE', 'HEADING'].includes(kw)) return { skip: `*${kw}` };
  if (cards.filter((c) => c.kw === 'STEP').length !== 1) return { skip: 'more than one step' };
  for (const c of cards) {
    if (c.kw === 'NODE') for (const r of c.data) { nodeId.set(+r[0], xyz.length / 3); xyz.push(+r[1] || 0, +r[2] || 0, +(r[3] ?? 0) || 0); }
    else if (c.kw === 'ELEMENT') {
      if (String(c.opts.TYPE).toUpperCase() !== 'C3D10') return { skip: `element type ${c.opts.TYPE}` };
      // an element's ids may continue on the next line
      let cur = [];
      for (const r of c.data) { cur.push(...r.map(Number)); if (cur.length >= 11) { elemId.set(cur[0], tets.length / 10); tets.push(...cur.slice(1, 11)); cur = []; } }
    } else if (c.kw === 'NSET') {
      const name = String(c.opts.NSET).toUpperCase(), ids = sets.get(name) ?? [];
      if (c.opts.GENERATE) for (const r of c.data) for (let i = +r[0]; i <= +r[1]; i += +(r[2] ?? 1)) ids.push(i);
      else for (const r of c.data) for (const v of r) { if (/^\d+$/.test(v)) ids.push(+v); else ids.push(...(sets.get(v.toUpperCase()) ?? [])); }
      sets.set(name, ids);
    } else if (c.kw === 'ELASTIC') { if (c.opts.TYPE && String(c.opts.TYPE).toUpperCase() !== 'ISO') return { skip: `elastic ${c.opts.TYPE}` }; E = +c.data[0][0]; nu = +c.data[0][1]; }
    else if (c.kw === 'BOUNDARY') for (const r of c.data) { if (r[3] != null && +r[3] !== 0) return { skip: 'a prescribed displacement' }; bcs.push({ who: r[0], a: +r[1], b: +(r[2] ?? r[1]) }); }
    else if (c.kw === 'CLOAD') for (const r of c.data) loads.push({ who: r[0], dof: +r[1], value: +r[2] });
  }
  const nodesOf = (who) => (/^\d+$/.test(who) ? [+who] : sets.get(who.toUpperCase()) ?? []).map((id) => nodeId.get(id));
  const nn = xyz.length / 3;
  const T = Int32Array.from(tets, (id) => nodeId.get(id));
  const dofs = new Map();
  for (const bc of bcs) for (const n of nodesOf(bc.who)) for (let k = bc.a; k <= bc.b; k++) if (k <= 3) (dofs.get(n) ?? dofs.set(n, new Set()).get(n)).add(k - 1);
  const full = [], partial = new Map();
  for (const [n, s] of dofs) { if (s.size === 3) full.push(n); else partial.set(n, [...s].map((k) => [0, 1, 2].map((i) => (i === k ? 1 : 0)))); }
  const forces = new Float64Array(3 * nn);
  for (const l of loads) for (const n of nodesOf(l.who)) forces[3 * n + l.dof - 1] += l.value;
  // a node held in two directions is a roller with two normals: the solver takes a list per node
  const rollers = [...partial].map(([n, normals]) => ({ name: `R${n}`, nodes: [n], normals: new Map([[n, normals.length === 1 ? normals[0] : normals]]), many: normals.length > 1 }));
  return { nodeId, elemId, mesh: { nodes: Float64Array.from(xyz), tets: T }, material: { E, nu }, fixed: full.length ? [{ name: 'FIX', nodes: full }] : [], rollers, forces };
}

const rel = (a, b, scale) => Math.abs(a - b) / scale;

async function check(name) {
  const inp = join(dir, `${name}.inp`), ref = join(dir, `${name}.dat.ref`);
  if (!existsSync(inp) || !existsSync(ref)) return { name, skip: 'no .inp or .dat.ref' };
  const P = problem(parseInp(readFileSync(inp, 'utf8')));
  if (P.skip) return { name, skip: P.skip };
  if (P.rollers.some((r) => r.many)) {
    // jsolve takes one normal per roller entry: split a node held in two directions into two entries
    P.rollers = P.rollers.flatMap((r) => (r.many ? r.normals.get(r.nodes[0]).map((v, i) => ({ name: `${r.name}_${i}`, nodes: r.nodes, normals: new Map([[r.nodes[0], v]]) })) : [r]));
  }
  const nn = P.mesh.nodes.length / 3, ne = P.mesh.tets.length / 10;
  // the reference, renumbered to contiguous indices
  const text = readFileSync(ref, 'utf8');
  const idxN = new Map([...P.nodeId].map(([id, i]) => [id, i])), idxE = P.elemId;
  const Uref = new Float64Array(3 * nn), Sref = new Float64Array(24 * ne);
  let mode = null, gotU = false, gotS = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^displacements/i.test(line)) { mode = 'U'; gotU = true; continue; }
    if (/^stresses \(elem, integ\.pnt\./i.test(line)) { mode = 'S'; gotS = true; continue; }
    if (/^[a-z]/i.test(line)) { mode = null; continue; }
    const f = line.split(/\s+/).map(Number);
    if (mode === 'U' && idxN.has(f[0])) Uref.set(f.slice(1, 4), 3 * idxN.get(f[0]));
    if (mode === 'S' && idxE.has(f[0])) Sref.set(f.slice(2, 8), 24 * idxE.get(f[0]) + 6 * (f[1] - 1));
  }
  const out = { name, nodes: nn, elements: ne };
  const compare = (U, S) => {
    const us = Math.max(...Uref.map(Math.abs)), ss = Math.max(...Sref.map(Math.abs));
    let du = 0, ds = 0;
    for (let i = 0; i < Uref.length; i++) du = Math.max(du, rel(U[i], Uref[i], us));
    if (gotS) for (let i = 0; i < Sref.length; i++) ds = Math.max(ds, rel(S[i], Sref[i], ss));
    return { U: du, S: gotS ? ds : null };
  };
  if (!gotU) return { name, skip: 'the reference prints no displacements' };
  const t0 = performance.now();
  const js = solveStatic(P, { tol: 1e-12 });
  out.js = { ...compare(js.U, js.S), ms: Math.round(performance.now() - t0), iterations: js.iterations };
  if ((await available()).ccx) {
    const t1 = performance.now();
    const deck = writeDeck(P);
    const res = await ccx(deck);
    const r = readDat(res.dat, nn, ne);
    out.ccx = { ...compare(r.U, r.S), ms: Math.round(performance.now() - t1) };
  }
  return out;
}

let bad = 0;
for (const name of names.length ? names : DEFAULT) {
  const r = await check(name);
  if (r.skip) { console.log(`skip ${name}: ${r.skip}`); continue; }
  const fmt = (x) => (x == null ? '–' : x.toExponential(1));
  const ok = (x) => x.U < 1e-4 && (x.S == null || x.S < 1e-3);
  for (const k of ['js', 'ccx']) if (r[k] && !ok(r[k])) bad++;
  console.log(`${r.js && ok(r.js) && (!r.ccx || ok(r.ccx)) ? 'ok  ' : 'FAIL'} ${name}: ${r.nodes} nodes, ${r.elements} C3D10 · jig solver U ${fmt(r.js.U)} S ${fmt(r.js.S)} (${r.js.ms} ms, ${r.js.iterations} it)` +
    (r.ccx ? ` · CalculiX via jig's deck U ${fmt(r.ccx.U)} S ${fmt(r.ccx.S)} (${r.ccx.ms} ms)` : ' · no CalculiX module (vendor/fea/ccx.mjs or JIG_CCX)'));
}
process.exit(bad ? 1 : 0);
