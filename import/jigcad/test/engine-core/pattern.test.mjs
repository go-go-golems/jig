import { test, assert, near } from './harness.mjs';
import { pattern } from '../../src/engine/pattern.js';
import { axis, plane, dir, origin, pt } from '../../src/engine/geom.js';
import { mm, deg } from '../../src/engine/units.js';

test('linear with vary: counts and per-instance params', () => {
  const p = pattern.linear(dir('+X'), { count: 8, step: mm(12.5) }).vary(inst => ({ d: mm(1).add(mm(1).mul(inst.index)) }));
  assert.equal(p.count, 8);
  const inst = p.instances();
  assert.deepEqual(inst.map(i => String(i.params.d)), ['1 mm', '2 mm', '3 mm', '4 mm', '5 mm', '6 mm', '7 mm', '8 mm']);
  near(inst[7].tx.translation[0], 87.5);
  near(pattern.linear('+Y', { count: 5, extent: mm(40) }).instances()[4].at.y, 40);
});

test('products multiply counts and commute for translations', () => {
  const gx = pattern.linear(dir('+X'), { count: 4, step: mm(25) }), gy = pattern.linear(dir('+Y'), { count: 3, step: mm(25) });
  assert.equal(gx.times(gy).count, 12);
  assert.ok(gx.times(gy).eq(gy.times(gx)));
  assert.ok(pattern.grid(dir('+X'), dir('+Y'), { count: [4, 3], step: [mm(25), mm(25)] }).eq(gx.times(gy)));
  assert.ok(!gx.eq(gy));
});

test('circular closure', () => {
  const c24 = pattern.circular(axis.Z, { count: 24 });
  assert.equal(c24.closed, true);
  assert.equal(c24.count, 24);
  const arc = pattern.circular(axis.Z, { count: 5, angle: deg(120) });
  assert.equal(arc.closed, false);
  const last = arc.instances()[4].tx.apply(pt(10, 0, 0));
  near(last.x, 10 * Math.cos((2 * Math.PI) / 3), 1e-9);
  // C6: six steps of 60° return to the start
  const c6 = pattern.circular(axis.Z, { count: 6 });
  assert.ok(c6.instances()[1].tx.pow(6).isIdentity);
  assert.equal(pattern.mirror(plane.XZ).closed, true);
  assert.equal(c6.skip([3]).closed, false);
  assert.equal(c6.skip([3]).count, 5);
});

test('D6 orbit–stabiliser collapse is recorded as pattern.dedupe', () => {
  const d6 = pattern.circular(axis.Z, { count: 6 }).times(pattern.mirror(plane.XZ));
  assert.equal(d6.count, 12);
  const spoke = [[15, -1.5, 0], [25, -1.5, 0], [25, 1.5, 0], [15, 1.5, 0]];   // symmetric about XZ
  const e = d6.expand({ samples: spoke, at: 'spokes' });
  assert.equal(e.count, 6);
  assert.deepEqual(e.decisions.map(d => [d.kind, d.chose, d.alternatives[0], d.at]), [['pattern.dedupe', 6, 12, 'spokes']]);
  const fin = [[20, 2, 0], [23, 2, 0], [21, 5, 0]];                              // chiral
  assert.equal(d6.expand({ samples: fin }).count, 12);
  // identical transforms always merge
  const dup = pattern.circular(axis.Z, { count: 4 }).times(pattern.circular(axis.Z, { count: 2 }));
  assert.equal(dup.expand().count, 4);
});

test('hex lattice with a filter: 91 centres, 55 within 22 mm', () => {
  const hex = pattern.hex(plane.XY, { pitch: mm(6), rings: 5 });
  assert.equal(hex.count, 91);
  const f = hex.filter(inst => inst.at.sub(origin).norm().lte(mm(22))).expand();
  assert.equal(f.count, 55);
  assert.equal(f.filtered, 36);
  assert.equal(pattern.hex(plane.XY, { pitch: 5, count: [4, 3] }).count, 12);
});

test('points and path patterns', () => {
  const p = pattern.points([pt(0, 0, 0), pt(10, 0, 0), pt(10, 10, 0)]);
  assert.equal(p.count, 3);
  near(p.instances()[2].at.y, 10);
  const path = pattern.path('edgeSel', { count: 5 });
  assert.equal(path.expand().deferred, true);
  const e = path.expand({ path: { at: t => ({ point: [100 * t, 0, 0], tangent: [1, 0, 0] }) } });
  assert.equal(e.count, 5);
  near(e.instances[4].at.x, 100);
});
