import { test, assert, near } from './harness.mjs';
import { sketch, c } from '../../src/engine/sketch/index.js';
import { q } from '../../src/engine/units.js';

test('rectangle with two circles inside: one profile with two holes', () => {
  const S = sketch('a').rect('r', 60, 40, { center: true }).circle('h1', 5, { at: [-15, 0] }).circle('h2', 5, { at: [15, 0] }).solve();
  const P = S.profiles();
  assert.equal(P.length, 1);
  assert.equal(P[0].holes, 2);
  assert.equal(P[0].id, 'r∖{h1, h2}');
  near(P[0].areaValue, 2400 - 2 * Math.PI * 25, 1e-9);
  near(P[0].area.value, 2400 - 2 * Math.PI * 25, 1e-9);
  assert.deepEqual(P[0].area.dims, { L: 2 });
  // exact segments with src for the kernel
  assert.deepEqual(P[0].segments[0].map(s => [s.kind, s.src]), [['line', 'r.bottom'], ['line', 'r.right'], ['line', 'r.top'], ['line', 'r.left']]);
  assert.deepEqual(P[0].segments.slice(1).map(L => L[0].kind), ['circle', 'circle']);
  // display polylines: outer CCW, holes CW
  const area = L => L.reduce((s, p, i) => s + p[0] * L[(i + 1) % L.length][1] - L[(i + 1) % L.length][0] * p[1], 0) / 2;
  assert.ok(area(P[0].loops[0]) > 0 && area(P[0].loops[1]) < 0 && area(P[0].loops[2]) < 0);
  assert.ok(P[0].contains([0, 0]) && !P[0].contains([-15, 0]));
});

test('a bow-tie polyline does not crash: two triangles', () => {
  const S = sketch('b').polyline('p', [[0, 0], [10, 10], [10, 0], [0, 10]], { closed: true }).solve();
  const P = S.profiles();
  assert.equal(P.length, 2);
  P.forEach(p => near(p.areaValue, 25, 1e-9));
  assert.ok(S.toSketchData().profiles.length === 2);
});

test('even–odd nesting: the tag of example 05', () => {
  const tag = sketch('tag').rect('outer', 60, 24, { center: true, r: 4 }).circle('hole', 3, { at: [-24, 0] })
    .rect('window', 30, 12, { at: [6, 0], center: true }).rect('island', 10, 4, { at: [6, 0], center: true }).solve();
  const P = tag.profiles();
  assert.deepEqual(P.map(p => p.id), ['outer∖{window, hole}', 'island']);
  near(P[0].areaValue, 60 * 24 - (64 - 16 * Math.PI) - 9 * Math.PI - 360, 1e-8);
  near(P[1].areaValue, 40, 1e-9);
  assert.deepEqual(tag.profile([-10, 8]).map(p => p.id), ['outer∖{window, hole}']);
  assert.deepEqual(tag.profile('island').map(p => p.id), ['island']);
  assert.deepEqual(tag.profile((r) => r.area.gte(q('100 mm^2'))).map(p => p.id), ['outer∖{window, hole}']);
  const arcs = P[0].segments[0].filter(s => s.kind === 'arc');
  assert.equal(arcs.length, 4);
  assert.ok(arcs.every(a => a.ccw && Math.abs(a.r - 4) < 1e-9 && a.src.startsWith('outer.')));
});

test('T-junctions split faces; dangling edges are pruned', () => {
  const T = sketch('t').rect('r', 40, 20).line('l', [20, 0], [20, 20]).solve().profiles();
  assert.equal(T.length, 2);
  T.forEach(p => near(p.areaValue, 400, 1e-9));
  const D = sketch('t').rect('r', 40, 20).line('l', [20, 0], [20, 30]).solve().profiles();
  assert.equal(D.length, 2);
  const free = sketch('t').rect('r', 40, 20).line('l', [50, 0], [60, 0]).solve().profiles();
  assert.equal(free.length, 1);
});

test('overlapping circles: three faces, all material (one component)', () => {
  const P = sketch('cc').circle('a', 10, { at: [0, 0] }).circle('b', 10, { at: [10, 0] }).solve().profiles();
  assert.equal(P.length, 3);
  near(P.reduce((s, p) => s + p.areaValue, 0), 2 * Math.PI * 100 - (2 * 100 * Math.acos(0.5) - 5 * Math.sqrt(400 - 100)), 1e-8);
});

test('arcs, splines and ellipses close loops', () => {
  const ar = sketch('ar').arc('a', { through: [[0, 0], [5, 5], [10, 0]] }).line('l', 'a.end', 'a.start').solve().profiles();
  near(ar[0].areaValue, Math.PI * 25 / 2, 1e-9);
  const el = sketch('el').ellipse('e', 10, 5).solve().profiles();
  near(el[0].areaValue, Math.PI * 50, 1e-9);
  assert.equal(el[0].segments[0][0].kind, 'ellipse');
  const sp = sketch('sp').spline('s', [[0, 0], [10, 5], [20, 0], [10, -5]], { closed: true }).solve().profiles();
  assert.equal(sp.length, 1);
  assert.equal(sp[0].segments[0][0].kind, 'spline');
  assert.ok(sp[0].areaValue > 100);
  const open = sketch('o').spline('s', [[0, 0], [10, 5], [20, 0]]).line('l', 's.end', 's.start').solve().profiles();
  assert.equal(open.length, 1);
  assert.deepEqual(open[0].segments[0].map(s => s.kind).sort(), ['line', 'spline']);
});

test('construction geometry is excluded; wire() gives open paths', () => {
  const S = sketch('w').rect('r', 40, 20).construction('r').line('a', [0, 0], [10, 0]).line('b', 'a.end', [10, 10]).solve();
  assert.equal(S.profiles().length, 0);
  const w = S.wire(['a', 'b']);
  assert.equal(w.closed, false);
  near(w.length, 20, 1e-9);
  assert.deepEqual(w.segments.map(s => s.src), ['a', 'b']);
});

test('SketchData has the BUILD.md shape', () => {
  const S = sketch('base').rect('r', 60, 40, { center: true }).circle('h', 3).constrain(c.fix('h.center')).dim('h', 6).solve();
  const d = S.toSketchData();
  for (const k of ['id', 'plane', 'dof', 'status', 'entities', 'constraints', 'conflicts', 'profiles']) assert.ok(k in d, k);
  assert.deepEqual(d.plane, { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] });
  assert.equal(d.status, 'fully');
  const line = d.entities.find(e => e.id === 'r.bottom');
  assert.deepEqual([line.kind, line.construction, line.a, line.b], ['line', false, [-30, -20], [30, -20]]);
  const circ = d.entities.find(e => e.id === 'h');
  assert.deepEqual([circ.kind, circ.r, circ.dofFree], ['circle', 3, []]);
  for (const k of d.constraints) for (const f of ['id', 'kind', 'refs', 'driven', 'status']) assert.ok(f in k);
  assert.deepEqual(Object.keys(d.profiles[0]).sort(), ['area', 'id', 'loops', 'outer', 'segments']);
  assert.equal(d.profiles[0].outer, 0);
  structuredClone(d);   // plain data
});
