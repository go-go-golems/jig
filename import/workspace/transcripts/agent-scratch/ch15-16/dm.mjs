// Dulmage–Mendelsohn decomposition of a jig sketch's equation–unknown graph (jig itself does not compute this)
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const S = await import('/home/claude/jigcad/src/engine/sketch/index.js');
export function incidence(sk) {
  const sys = sk.system();
  const unknown = sys.x.map((_, i) => i).filter(i => !sys.fixed[i]);
  const rows = [];
  for (const c of sys.cons) if (!c.driven && c.status !== 'invalid') c.eqs.forEach((e, k) => rows.push({ name: c.eqs.length > 1 ? `${c.id}[${k}]` : c.id, cons: c.id, vars: [...new Set(e.vars)] }));
  return { sys, unknown, rows, names: sys.pname };
}
export function dm({ unknown, rows }) {
  const m = rows.length;
  const adj = rows.map(r => r.vars);
  const matchR = new Array(m).fill(-1), matchC = new Map(unknown.map(c => [c, -1]));
  const tryAug = (r, seen) => {
    for (const c of adj[r]) {
      if (seen.has(c)) continue; seen.add(c);
      if (matchC.get(c) === -1 || tryAug(matchC.get(c), seen)) { matchR[r] = c; matchC.set(c, r); return true; }
    }
    return false;
  };
  for (let r = 0; r < m; r++) tryAug(r, new Set());
  const size = matchR.filter(c => c >= 0).length;
  // over: rows reachable from unmatched rows by alternating paths (row -any-> col -matched-> row)
  const overR = new Set(), overC = new Set();
  const stack = []; for (let r = 0; r < m; r++) if (matchR[r] < 0) { overR.add(r); stack.push(r); }
  while (stack.length) { const r = stack.pop(); for (const c of adj[r]) { if (overC.has(c)) continue; overC.add(c); const r2 = matchC.get(c); if (r2 >= 0 && !overR.has(r2)) { overR.add(r2); stack.push(r2); } } }
  // under: cols reachable from unmatched cols (col -any-> row -matched-> col)
  const colRows = new Map(unknown.map(c => [c, []])); rows.forEach((r, i) => r.vars.forEach(c => colRows.get(c)?.push(i)));
  const underC = new Set(), underR = new Set();
  const st2 = []; for (const c of unknown) if (matchC.get(c) < 0) { underC.add(c); st2.push(c); }
  while (st2.length) { const c = st2.pop(); for (const r of colRows.get(c)) { if (underR.has(r)) continue; underR.add(r); const c2 = matchR[r]; if (c2 >= 0 && !underC.has(c2)) { underC.add(c2); st2.push(c2); } } }
  // well: the rest, split into strongly connected blocks (Tarjan), in solve order
  const wellR = [...Array(m).keys()].filter(r => !overR.has(r) && !underR.has(r));
  const idx = new Map(), low = new Map(), on = new Set(), stk = [], blocks = []; let t = 0;
  const wellSet = new Set(wellR);
  const succ = r => adj[r].map(c => matchC.get(c)).filter(r2 => r2 >= 0 && r2 !== r && wellSet.has(r2));
  const strong = r => {
    idx.set(r, t); low.set(r, t); t++; stk.push(r); on.add(r);
    for (const r2 of succ(r)) { if (!idx.has(r2)) { strong(r2); low.set(r, Math.min(low.get(r), low.get(r2))); } else if (on.has(r2)) low.set(r, Math.min(low.get(r), idx.get(r2))); }
    if (low.get(r) === idx.get(r)) { const b = []; let x; do { x = stk.pop(); on.delete(x); b.push(x); } while (x !== r); blocks.push(b); }
  };
  for (const r of wellR) if (!idx.has(r)) strong(r);
  // Tarjan emits a block after everything it depends on: that is solve order
  return { size, matchR, over: { rows: [...overR], cols: [...overC] }, under: { rows: [...underR], cols: [...underC] }, blocks };
}
export function report(inc, D, { verbose = true } = {}) {
  const { rows, names, unknown } = inc;
  console.log(`unknowns ${unknown.length} · equations ${rows.length} · maximum matching ${D.size}`);
  console.log(`over: ${D.over.rows.length} equations in ${D.over.cols.length} unknowns · under: ${D.under.rows.length} equations in ${D.under.cols.length} unknowns · well: ${D.blocks.reduce((s, b) => s + b.length, 0)} in ${D.blocks.length} blocks, sizes ${D.blocks.map(b => b.length).join(',')}`);
  if (verbose) {
    D.blocks.forEach((b, k) => console.log(`  block ${k + 1}: ${b.map(r => rows[r].name).join(', ')}  →  ${b.map(r => names[D.matchR[r]]).join(', ')}`));
    if (D.over.rows.length) console.log('  over rows:', D.over.rows.map(r => rows[r].name).join(', '));
    if (D.under.cols.length) console.log('  under cols:', D.under.cols.map(c => names[c]).join(', '), '| rows', D.under.rows.map(r => rows[r].name).join(', '));
  }
}
// the generic pattern: which unknowns each equation really depends on, from the Jacobian at a random nearby point
const SV = await import('/home/claude/jigcad/src/engine/sketch/solver.js');
export function genericIncidence(sk, seed = 1) {
  const inc = incidence(sk);
  const { sys, unknown } = inc;
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const X = Float64Array.from(sys.x, (v, i) => sys.fixed[i] ? v : v + (rnd() - 0.5) * 2);
  const rows = [];
  for (const c of sys.cons) if (!c.driven && c.status !== 'invalid') c.eqs.forEach((e, k) => {
    const cols = [...new Set(e.vars)];
    const F = SV.makeProblem(Float64Array.from(X), [e], cols);
    const J = F.jac(F.get());
    rows.push({ name: c.eqs.length > 1 ? `${c.id}[${k}]` : c.id, cons: c.id, vars: cols.filter((_, j) => Math.abs(J[j]) > 1e-9) });
  });
  return { ...inc, rows };
}
