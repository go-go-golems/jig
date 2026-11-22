import { test, assert, near } from './harness.mjs';
import { N, MPa, mm, q } from '../../src/engine/units.js';
import { dir } from '../../src/engine/geom.js';
import { G0, direction, scalarIn, vectorIn, acceleration, force, moment } from '../../src/engine/vectors.js';
import { solveStatic } from '../../src/fea/jsolve.js';

const close3 = (a, b, tol = 1e-9) => b.forEach((x, k) => near(a[k], x, tol * Math.max(1, Math.abs(x)), `[${k}]`));

test('an acceleration vector keeps its magnitude; a direction is 1 g', () => {
  close3(acceleration([0, 0, -2]), [0, 0, -2 * G0]);
  close3(acceleration([0, 0, -0.1]), [0, 0, -0.1 * G0]);
  close3(acceleration('-Z'), [0, 0, -G0]);
  close3(acceleration(dir('+Y')), [0, G0, 0]);
  close3(acceleration(2, { dir: [0, 0, -5] }), [0, 0, -2 * G0], 1e-12);   // a dir's own length is ignored
  close3(acceleration([0, q('3 m/s^2'), 0]), [0, 3000, 0]);
});

test('a quantity of the wrong dimension is refused, not read by its canonical value', () => {
  assert.throws(() => acceleration([0, 0, N(5)]), /takes an acceleration/);
  assert.throws(() => force([0, 0, MPa(1)]), /takes a force/);
  assert.throws(() => force(mm(3), { dir: '-Z' }), /takes a force/);
  close3(force([0, 0, N(-40)]), [0, 0, -40]);
  close3(moment([0, 0, N(2).mul(mm(3))]), [0, 0, 6]);   // N·mm, not the canonical g·mm²/s²
});

test('a vector with a { dir } too is an error; a magnitude needs one', () => {
  assert.throws(() => force([0, 0, -1], { dir: '-Z' }), /carries its own direction/);
  assert.throws(() => force(N(5)), /magnitude with \{ dir/);
  assert.throws(() => force('-Z'), /magnitude with \{ dir/);   // a force has no unit along a bare direction
  assert.throws(() => acceleration('sideways'), /unknown direction/);
  assert.throws(() => direction(undefined), /a direction is/);
  assert.throws(() => direction([0, 0, 0]), /non-zero/);
});

test('params resolve before the grammar does: a param named like an axis is a param', () => {
  close3(vectorIn('F', 'N', { dir: '-Z', values: { F: N(20) } }), [0, 0, -20]);
  close3(vectorIn(['a', 0, 0], 'mm/s^2', { values: { a: 2 } }), [2 * G0, 0, 0]);
  near(scalarIn('Z', 'MPa', { values: { Z: MPa(0.5) } }), 0.5);
  near(scalarIn('5', 'N'), 5);
});

// one C3D10 held on its z = 0 face: the reference solver's conjugate gradients, at the edge of no work to do
test('the reference solver returns u = 0 for a load the supports take whole', () => {
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], E = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
  const mesh = { nodes: Float64Array.from([...C, ...E.map(([a, b]) => C[a].map((x, i) => (x + C[b][i]) / 2))].flat()), tets: Int32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  const solve = (forces) => solveStatic({ mesh, material: { E: 1000, nu: 0.3 }, fixed: [{ name: 'FIX', nodes: [0, 1, 2, 4, 5, 6] }], forces });
  const none = solve(new Float64Array(30));
  assert.ok(none.U.every((x) => x === 0) && none.iterations === 0, 'zero load: zero displacement, no steps');
  close3(none.RF.FIX.total, [0, 0, 0]);
  const held = new Float64Array(30); held[3 * 1 + 2] = -5;   // on a fixed node
  const h = solve(held);
  assert.ok(h.U.every((x) => x === 0), 'a load on a held node moves nothing');
  close3(h.RF.FIX.total, [0, 0, 5]);
  const free = new Float64Array(30); free[3 * 3 + 2] = -5;   // on the apex
  const f = solve(free);
  assert.ok(f.U.every(Number.isFinite) && f.U[3 * 3 + 2] < 0 && f.iterations > 0, 'a real load still solves');
  close3(f.RF.FIX.total, [0, 0, 5], 1e-9);
});
