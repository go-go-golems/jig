import { test, assert, near } from './harness.mjs';
import { sketch, c, solver } from '../../src/engine/sketch/index.js';
import { pattern } from '../../src/engine/pattern.js';
import { axis, plane } from '../../src/engine/geom.js';
import { mm } from '../../src/engine/units.js';

// s0 itself has no .constrain()/.dim(), so the explicit-geometry default would fix it; example 04 reads numbers as starting positions
const slotBase = () => sketch('slot', { on: plane.XY, mode: 'constrained' })
  .line('l1', [0, 0], [40, 0]).line('l2', [40, 10], [0, 10])
  .arc('a1', { center: [40, 5], start: 'l1.end', end: 'l2.start' })
  .arc('a2', { center: [0, 5], start: 'l2.end', end: 'l1.start' });
const s0 = slotBase();
const s1 = s0.constrain(c.tangent('l1', 'a1'), c.tangent('l1', 'a2'), c.tangent('l2', 'a1'), c.tangent('l2', 'a2'));
const s2 = s1.constrain(c.equal('a1', 'a2'), c.horizontal('l1'));
const s3 = s2.constrain(c.fix('l1.start')).dim('l1', 40).dim('a1', 5);

test('entity DOF: a free line has 4, a point 2, a circle 3, an arc 5', () => {
  const C = { mode: 'constrained' };
  assert.equal(sketch('l', C).line('l1', [0, 0], [10, 0]).solve().dof, 4);
  assert.equal(sketch('p', C).point('p', [1, 2]).solve().dof, 2);
  assert.equal(sketch('c', C).circle('c', 3).solve().dof, 3);
  assert.equal(sketch('a', C).arc('a', { center: [0, 0], start: [5, 0], end: [0, 5] }).solve().dof, 5);
  assert.equal(sketch('l', C).line('l1', [0, 0], [10, 0]).solve().status, 'under');
});

test("rect('r', 60, 40, { center: true }) is fully constrained", () => {
  const S = sketch('r').rect('r', 60, 40, { center: true }).solve();
  assert.equal(S.dof, 0);
  assert.equal(S.status, 'fully');
  assert.deepEqual(S.point('r.tr'), [30, 20]);
  assert.equal(S.diagnostics.length, 0);
  assert.equal(sketch('r').rect('r', 'w', 'd', { center: true, r: 'corner' }).solve({ scope: { w: mm(60), d: mm(40), corner: mm(4) } }).dof, 0);
  assert.equal(sketch('r').rect('r', 20, 10, { at: [5, 5] }).solve().dof, 0);
});

test('slot sequence of example 04 gives DOF [10, 6, 4, 0]', () => {
  assert.deepEqual([s0, s1, s2, s3].map(s => s.solve().dof), [10, 6, 4, 0]);
  const S = s3.solve();
  assert.equal(S.status, 'fully');
  assert.equal(S.n, 18); assert.equal(S.rank, 18);
  assert.ok(/rank 18 · dof 0 · status fully/.test(S.ir()));
});

test('under-constrained: says what is free; strict makes it an error', () => {
  const d = s1.solve().diagnostics.find(x => x.kind === 'sketch.underConstrained');
  assert.equal(d.level, 'warning');
  assert.equal(d.message, '6 DOF remain');
  assert.ok(/a1/.test(d.fix) && /a2/.test(d.fix));
  assert.equal(s1.strict().solve().diagnostics.find(x => x.kind === 'sketch.underConstrained').level, 'error');
  const ent = s1.solve().toSketchData().entities;
  assert.ok(ent.every(e => Array.isArray(e.dofFree)));
});

test('a redundant constraint is reported as redundant (rank unchanged)', () => {
  const R = s3.constrain(c.parallel('l1', 'l2')).solve();
  assert.equal(R.dof, 0);
  assert.equal(R.rank, 18);
  assert.equal(R.status, 'fully');
  assert.deepEqual(R.redundant, ['parallel(l1, l2)']);
  const d = R.diagnostics.find(x => x.kind === 'sketch.redundant');
  assert.equal(d.level, 'warning');
  assert.ok(/^parallel\(l1, l2\) is implied by .*equal\(a1, a2\); dropped$/.test(d.message), d.message);
  const dup = sketch('d').line('l', [0, 0], [10, 1]).constrain(c.horizontal('l'), c.horizontal('l')).solve();
  assert.deepEqual(dup.redundant, ['horizontal(l)#2']);
  assert.equal(dup.dof, 3);
});

// build the slot with a chosen subset of the conflicting constraints (implicit coincidences always present)
const ALL = {
  'tangent(l1, a1)': s => s.constrain(c.tangent('l1', 'a1')), 'tangent(l1, a2)': s => s.constrain(c.tangent('l1', 'a2')),
  'tangent(l2, a1)': s => s.constrain(c.tangent('l2', 'a1')), 'tangent(l2, a2)': s => s.constrain(c.tangent('l2', 'a2')),
  'equal(a1, a2)': s => s.constrain(c.equal('a1', 'a2')), 'horizontal(l1)': s => s.constrain(c.horizontal('l1')),
  'fix(l1.start)': s => s.constrain(c.fix('l1.start')), 'dim(l1)': s => s.dim('l1', 40), 'dim(a1)': s => s.dim('a1', 5),
  'dim(l1, l2)': s => s.dim(['l1', 'l2'], 12),
};
const withOnly = ids => ids.reduce((s, id) => ALL[id](s), slotBase());

test('a contradictory constraint is a conflict with a minimal set', () => {
  const C = s3.dim(['l1', 'l2'], 12).solve();
  assert.equal(C.status, 'over');
  assert.equal(C.conflicts.length, 1);
  const set = C.conflicts[0];
  assert.ok(set.includes('dim(l1, l2)'));
  const d = C.diagnostics.find(x => x.kind === 'sketch.overConstrained');
  assert.equal(d.level, 'error');
  assert.ok(d.message.startsWith('no solution; minimal conflicting set: '));
  assert.ok(/dim\(l1, l2\) = 12 mm/.test(d.message));
  assert.ok(/measures 10 mm/.test(d.fix), d.fix);
  // the set itself is infeasible, and removing any one member makes it feasible (irreducible)
  assert.equal(withOnly(set).solve().status, 'over');
  for (const m of set) assert.notEqual(withOnly(set.filter(x => x !== m)).solve().status, 'over', `without ${m}`);
  // the rest of the sketch still solves with the conflicting constraint dropped
  near(C.point('a1.center')[1], 5, 1e-6);
});

test('driven dimensions measure without constraining', () => {
  const S = s3.dim(['l1', 'l2'], null, { driven: true }).solve();
  assert.equal(S.dof, 0);
  const k = S.toSketchData().constraints.find(x => x.driven);
  assert.equal(k.id, 'dim(l1, l2)');
  near(k.value, 10, 1e-9);
});

test('independent clusters add their DOF; dragging moves only one cluster', () => {
  const two = s3.circle('hole', 1.7, { at: [20, 5] });
  const S = two.solve();
  assert.equal(S.dof, 3);
  assert.equal(S.run.clusters.length, 2);
  const D = S.drag('hole.center', [22, 6]);
  assert.deepEqual(D.moved, ['hole']);
  assert.deepEqual(D.point('hole.center'), [22, 6]);
  assert.deepEqual(D.point('l1.end'), S.point('l1.end'));
  // a rigid point does not move
  const F = S.drag('l1.start', [5, 5]);
  assert.deepEqual(F.moved, []);
  // dragging inside an under-constrained cluster: least change, constraints kept
  const G = s2.solve().drag('a1.center', [52, 5]);
  near(G.point('a1.center')[0], 52, 1e-6); near(G.point('a1.center')[1], 5, 1e-6);
  near(G.point('l1.start')[1], G.point('l1.end')[1], 1e-8);   // horizontal(l1) still holds
  assert.ok(G.moved.includes('a1') && G.moved.includes('l1'));
  const H = G.drag('a1.center', [52, 9]);
  near(H.point('l1.start')[1] - G.point('l1.start')[1], 4, 1e-4);   // the whole slot moved up
});

test('solver slot: name, params, lambda with ctx.default', () => {
  const lm = s3.solver('lm').solve();
  assert.equal(lm.dof, 0);
  assert.equal(lm.decisions.find(d => d.kind === 'solver').chose, 'lm');
  assert.equal(s3.solver(solver.lm({ maxIter: 400 })).solve().status, 'fully');
  let seen = null;
  const lam = s3.solver((cluster, ctx) => { seen = cluster; return cluster.has('spline') ? solver.lm({}) : ctx.default; }).solve();
  assert.ok(seen && seen.has('arc') && !seen.has('spline'));
  assert.equal(lam.decisions.find(d => d.kind === 'solver').chose, 'dogleg');
  assert.ok(/^default; converged/.test(lam.decisions.find(d => d.kind === 'solver').reason));
  assert.equal(s3.solver('newton').solve().status, 'fully');
});

test('helpers: polygon, slot, fillet and chamfer stay fully constrained', () => {
  const hex = sketch('h').polygon('hex', 6, 2.4, { inscribed: false }).solve();
  assert.equal(hex.dof, 0);
  near(hex.profiles()[0].areaValue, 2 * Math.sqrt(3) * 2.4 * 2.4, 1e-9);
  const sl = sketch('s').slot('s', [0, 0], [30, 8], 10).solve();
  assert.equal(sl.dof, 0);
  near(sl.profiles()[0].areaValue, Math.hypot(30, 8) * 10 + Math.PI * 25, 1e-8);
  const f = sketch('f').rect('r', 40, 20).fillet('f1', 'r.tr', 5).solve();
  assert.equal(f.dof, 0);
  near(f.profiles()[0].areaValue, 800 - (25 - (Math.PI * 25) / 4), 1e-8);
  const ch = sketch('c').rect('r', 40, 20).chamfer('c1', 'r.tr', 5).solve();
  assert.equal(ch.dof, 0);
  near(ch.profiles()[0].areaValue, 800 - 12.5, 1e-8);
  const rr = sketch('rr').rect('r', 60, 24, { center: true, r: 4 }).solve();
  assert.equal(rr.dof, 0);
  near(rr.profiles()[0].areaValue, 60 * 24 - (64 - 16 * Math.PI), 1e-8);
});

test('mirror and pattern are parametric copies', () => {
  const m = sketch('m').line('l1', [1, 0], [5, 3]).constrain(c.fix('l1')).mirror(['l1'], 'Y').solve();
  assert.equal(m.dof, 0);
  assert.deepEqual(m.point('l1.m.end').map(v => +v.toFixed(9)), [-5, 3]);
  const ma = sketch('ma').arc('a', { center: [5, 0], start: [8, 0], end: [5, 3] }).constrain(c.fix('a')).mirror(['a'], 'Y').solve();
  assert.equal(ma.dof, 0);
  const p = sketch('p').circle('c', 2, { at: [10, 0] }).constrain(c.fix('c.center')).dim('c', 4)
    .pattern(['c'], pattern.circular(axis.Z, { count: 6 })).solve();
  assert.equal(p.dof, 0);
  assert.equal(p.profiles().length, 6);
  near(p.point('c.p3.center')[0], -10, 1e-9);
});

test('offset (mitred) and trim', () => {
  const o = sketch('o').rect('r', 40, 20).offset('o', ['r'], 2).solve();
  assert.equal(o.dof, 0);
  const prof = o.profiles();
  assert.equal(prof.length, 1);
  near(prof[0].areaValue, 44 * 24 - 800, 1e-8);
  const oc = sketch('oc').circle('c', 10).offset('o', ['c'], -2).solve();
  near(oc.toSketchData().entities.find(e => e.id === 'o.1').r, 8, 1e-9);
  const t = sketch('t').line('l', [0, 0], [20, 0]).line('m', [5, -5], [5, 5]).line('n', [15, -5], [15, 5]).trim('l', [10, 0]).solve();
  const ents = t.toSketchData().entities;
  assert.deepEqual(ents.find(e => e.id === 'l').b.map(v => +v.toFixed(9)), [5, 0]);
  assert.deepEqual(ents.find(e => e.id === 'l.2').a.map(v => +v.toFixed(9)), [15, 0]);
});

test('project/intersect/text are deferred to the kernel', () => {
  const S = sketch('p').project('e', 'edgeSel').solve();
  assert.ok(S.diagnostics.some(d => d.kind === 'sketch.unsupported'));
  const K = sketch('p', { mode: 'constrained' }).project('e', 'edgeSel').line('l', 'e.start', [10, 10])
    .solve({ external: (id, op) => [{ kind: 'line', a: [0, 0], b: [5, 0] }] });
  assert.equal(K.dof, 2);
  assert.deepEqual(K.point('l.start'), [0, 0]);
});

test('import a region as a rigid body (3 DOF)', () => {
  const S = sketch('badge').circle('rim', 20).import('logo', { loops: [[[0, 0], [4, 0], [4, 2], [0, 2]]] }).constrain(c.concentric('rim', 'logo')).solve();
  assert.equal(S.dof, 4);
});

test('offset of an open path is a closed stroke (end caps); mirror patterns in a sketch', () => {
  const sk = sketch('side').line('back', [0, 0], [0, 26]).line('top', 'back.end', [24, 26]).line('lip', 'top.end', [24, 18])
    .line('stem', 'back.start', [0, -30]).line('arm', 'stem.end', [35, -30]).line('tip', 'arm.end', [35, -22])
    .offset('body', ['back', 'top', 'lip', 'stem', 'arm', 'tip'], 2);
  const S = sk.solve();
  assert.equal(S.diagnostics.filter(d => d.level === 'error').length, 0);
  assert.equal(S.profiles().length, 1);
  assert.ok(S.profiles()[0].areaValue > 200 && S.profiles()[0].areaValue < 2 * 129);
  const plate = sketch('outline').rect('r', 80, 50, { center: true, r: 4 }).circle('h1', 1.7, { at: [32, 17] }).constrain(c.fix('h1'))
    .pattern(['h1'], pattern.mirror(axis.X).times(pattern.mirror(axis.Y))).solve();
  assert.equal(plate.dof, 0);
  const P = plate.profiles();
  assert.equal(P.length, 1);
  assert.equal(P[0].holes, 4);
  near(P[0].areaValue, 80 * 50 - 4 * (1 - Math.PI / 4) * 16 - 4 * Math.PI * 1.7 * 1.7, 1e-8);
});

test('explicit-geometry default: no constraints means fixed coordinates', () => {
  const S = sketch('plain').line('l1', [0, 0], [40, 0]).line('l2', 'l1.end', [40, 30]).circle('c', 3, { at: [10, 10] })
    .arc('a', { center: [0, 0], start: [5, 0], end: [0, 5] }).spline('s', [[0, 0], [5, 5], [10, 0]]).ellipse('e', 4, 2).solve();
  assert.equal(S.dof, 0);
  assert.equal(S.status, 'fully');
  assert.ok(!S.diagnostics.some(d => d.kind === 'sketch.underConstrained'));
  assert.deepEqual(S.decisions.find(d => d.kind === 'sketch.mode'),
    { at: 'plain', kind: 'sketch.mode', chose: 'explicit', alternatives: ['constrained'], reason: 'no constraints: coordinates are fixed' });
  assert.ok(S.constraintData().every(k => k.src !== 'user'));          // the fixing is not a user constraint
  assert.deepEqual(S.drag('c.center', [20, 20]).moved, []);
  // helpers and corner operations stay exact (and fixed) in explicit mode
  const H = sketch('h').rect('r', 40, 20).fillet('f', 'r.tr', 5).circle('c', 2, { at: [10, 10] }).solve();
  assert.equal(H.dof, 0); assert.equal(H.status, 'fully');
  near(H.profiles()[0].areaValue, 800 - (25 - (Math.PI * 25) / 4) - 4 * Math.PI, 1e-8);
  const F = sketch('f').line('a', [0, 0], [20, 0]).line('b', 'a.end', [20, 20]).line('c', 'b.end', 'a.start').fillet('k', 'a.end', 3).solve();
  assert.equal(F.dof, 0);
});

test('any constraint or dimension switches the whole sketch to constrained', () => {
  const S = sketch('c').line('l1', [0, 0], [40, 0]).circle('c', 3, { at: [10, 10] }).dim('l1', 40).solve();
  assert.equal(S.dof, 3 + 3);
  assert.equal(S.status, 'under');
  const d = S.decisions.find(x => x.kind === 'sketch.mode');
  assert.deepEqual([d.chose, d.alternatives], ['constrained', ['explicit']]);
  assert.equal(sketch('k').point('p', [1, 1]).constrain(c.fix('p')).solve().decisions.find(x => x.kind === 'sketch.mode').chose, 'constrained');
});

test('mode override in j.sketch(id, { mode })', () => {
  const free = sketch('o', { mode: 'constrained' }).line('l1', [0, 0], [10, 0]).solve();
  assert.equal(free.dof, 4);
  assert.equal(free.decisions.find(x => x.kind === 'sketch.mode').reason, "set by { mode: 'constrained' }");
  const fixed = sketch('x', { mode: 'explicit' }).line('l1', [0, 0], [40, 0]).line('l2', [40, 10], [0, 10]).dim(['l1', 'l2'], null, { driven: true }).solve();
  assert.equal(fixed.dof, 0);
  assert.equal(fixed.status, 'fully');
  near(fixed.toSketchData().constraints.find(k => k.driven).value, 10, 1e-9);
  assert.notEqual(sketch('x', { mode: 'explicit' }).line('l', [0, 0], [1, 0]).key(), sketch('x').line('l', [0, 0], [1, 0]).key());
});

// a script body run the way the worker runs one (a one-line header, sourceURL=script.js), so builders see its lines
const asScript = (body, scope) => (0, eval)(`(function (${Object.keys(scope).join(', ')}) {\n${body}\n})\n//# sourceURL=script.js`)(...Object.values(scope));
test('entities, constraints and dimensions carry their script.js line; expressions are kept', () => {
  const body = [
    "const sk = sketch('outline')",            // 1
    "  .line('l1', [0, 0], [80, 0])",          // 2
    "  .line('l2', 'l1.end', [80, 40])",       // 3
    "  .rect('r', 'w', 10, { at: [5, 5] })",   // 4
    "  .constrain(",                           // 5
    "    c.fix('l1.start'),",                  // 6
    "    c.horizontal('l1'), c.vertical('l2'),", // 7
    "  )",                                     // 8
    "  .dim('l1', 'w')",                       // 9
    "  .dim({ h: ['l1.start', 'r.bl'] }, 5)",  // 10
    'return sk',                               // 11
  ].join('\n');
  const S = asScript(body, { sketch, c }).solve({ scope: { w: mm(80) } }), D = S.toSketchData();
  const E = Object.fromEntries(D.entities.map(e => [e.id, e.line])), K = Object.fromEntries(D.constraints.map(k => [k.id, k]));
  assert.deepEqual([E.l1, E.l2, E['r.bottom'], E['r.center']], [2, 3, 4, 4]);
  assert.equal(K['fix(l1.start)'].line, 6);
  assert.equal(K['horizontal(l1)'].line, 7); assert.equal(K['vertical(l2)'].line, 7);
  assert.equal(K['dim(l1)'].line, 9); assert.equal(K['dim(l1)'].expr, 'w'); assert.equal(K['dim(l1)'].src, 'user');
  assert.equal(K['dim(l1.start, r.bl)'].line, 10); assert.equal(K['dim(l1.start, r.bl)'].expr, null);
  assert.equal(K['coincident(l2.start, l1.end)'].line, 3);                       // implicit: the entity's line
  assert.equal(K['dim(r.w)'].line, 4); assert.equal(K['dim(r.w)'].src, 'helper'); assert.equal(K['dim(r.w)'].expr, 'w');
  assert.equal(K['horizontal(r.bottom)'].line, 4); assert.equal(K['horizontal(r.bottom)'].src, 'implicit');
  // lines do not take part in keys: the same sketch two lines lower has the same key and reads its own lines
  const lower = asScript('\n\n' + body, { sketch, c });
  assert.equal(lower.key(), asScript(body, { sketch, c }).key());
  const moved = S.withSketch(lower).toSketchData();
  assert.equal(moved.constraints.find(k => k.id === 'fix(l1.start)').line, 8);
  assert.equal(moved.entities.find(e => e.id === 'l2').line, 5);
  assert.equal(moved.dof, D.dof);
});
