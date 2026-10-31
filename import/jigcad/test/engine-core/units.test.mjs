import { test, assert, near } from './harness.mjs';
import { mm, cm, inch, deg, rad, turn, gram, kg, minute, hour, usd, lw, layer, nozzle, bbox, N, MPa, q, coerce, Quantity, DimensionError, dimsKind, Toleranced } from '../../src/engine/units.js';

test('vector-space operations and display units', () => {
  const c = mm(12).add(inch(0.25));
  near(c.value, 18.35);
  assert.equal(String(c), '18.35 mm');
  assert.equal(String(c.mul(2).sub(cm(1))), '26.7 mm');
  assert.equal(String(inch(0.25)), '0.25 in');
  assert.equal(String(c.to('in')), '0.7224 in');
  near(c.in('in'), 18.35 / 25.4);
  near(q('1/4 in + 2 mm').value, 8.35);
});

test('multiplication adds dimensions; addition refuses unlike ones', () => {
  const area = mm(40).mul(mm(25));
  assert.deepEqual(area.dims, { L: 2 });
  assert.equal(String(area), '1000 mm²');
  const vol = area.mul(mm(30));
  const mass = vol.mul(q('1.24 g/cm^3'));
  assert.deepEqual(mass.dims, { M: 1 });
  near(mass.value, 37.2);
  const cost = mass.mul(q('22 usd/kg')).to('usd');
  near(cost.value, 0.8184);
  assert.throws(() => mm(3).add(area), e => e instanceof DimensionError && e.name === 'DimensionError' && /L¹.*L²/.test(e.message));
  assert.throws(() => mm(1).lt(gram(1)), DimensionError);
  assert.throws(() => mm(1).add(3), DimensionError);
});

test('angles are tracked; trig consumes them', () => {
  assert.equal(String(deg(30).add(rad(Math.PI / 6))), '60°');
  assert.equal(String(turn(0.25).to('deg')), '90°');
  near(q.sin(deg(30)), 0.5, 1e-12);
  assert.throws(() => deg(30).add(mm(1)), DimensionError);
  assert.equal(dimsKind(deg(3)), 'angle');
});

test('symbolic printer units stay linear until resolved', () => {
  const wall = lw(3);
  assert.equal(String(wall), '3lw');
  assert.equal(String(wall.add(mm(0.1))), '3lw + 0.1mm');
  near(wall.resolve({ lw: mm(0.45) }).value, 1.35);
  near(wall.resolve({ lw: mm(0.68) }).value, 2.04);
  near(bbox(0.05).resolve({ bboxDiag: mm(120) }).value, 6);
  const sides = wall.mul(2).add(nozzle(0.5));
  assert.equal(String(sides), '6lw + 0.5nozzle');
  near(sides.resolve({ lw: 0.45, nozzle: 0.4 }).value, 2.9);
  near(sides.resolve({ lw: 0.68, nozzle: 0.6 }).value, 4.38);
  // resolve is linear: resolve(x + k·y) = resolve(x) + k·resolve(y)
  const ctx = { lw: 0.5, layer: 0.25, nozzle: 0.6 }, x = lw(2).add(layer(1)), y = nozzle(3).add(mm(1));
  near(x.add(y.mul(2.5)).resolve(ctx).value, x.resolve(ctx).value + 2.5 * y.resolve(ctx).value, 1e-12);
  assert.equal(String(q('3 lw')), '3lw');
});

test('lambda quantities resolve against the context', () => {
  const sturdy = q(ctx => lw(3).resolve(ctx).max(mm(1.2)));
  near(sturdy.resolve({ lw: mm(0.45) }).value, 1.35);
  near(sturdy.resolve({ lw: mm(0.25) }).value, 1.2);
  const viaCtx = q(ctx => ctx.lw.mul(2));
  near(viaCtx.resolve({ lw: 0.4 }).value, 0.8);
});

test('comparisons are dimension-checked, eq uses kernel tolerance', () => {
  assert.ok(mm(1.35).gte(mm(1.2)));
  assert.ok(mm(25.4).eq(inch(1)));
  assert.ok(!mm(25.4).eq(mm(25.5)));
  assert.ok(mm(1).eq(mm(1.05), mm(0.1)));
  assert.ok(lw(3).gt(mm(1)));
});

test('parsed quantities: areas, densities, money, time, force', () => {
  assert.deepEqual(q('25 mm^2').dims, { L: 2 });
  assert.equal(String(q('25 mm^2')), '25 mm²');
  near(q('1 hour').value, 3600);
  const t = minute(95).add(q('1 hour'));
  assert.equal(String(t), '155 min');
  near(t.mul(q('0.05 usd/minute')).value, 7.75);
  near(N(100).value, q('100 N').value);
  near(MPa(2).mul(mm(1).mul(mm(1))).to('N').in('N'), 2);
  near(kg(1).in('g'), 1000);
});

test('typed-slot coercion', () => {
  assert.equal(String(coerce(60, 'length')), '60 mm');
  assert.equal(String(coerce(30, 'angle')), '30°');
  near(coerce(30, 'angle').value, Math.PI / 6);
  near(coerce('w / 2', 'length', { w: mm(10) }).value, 5);
  assert.equal(coerce('w / 2', 'length').kind, 'expr');
  assert.throws(() => coerce(deg(3), 'length'), DimensionError);
  assert.equal(coerce(q('3'), 'number'), 3);
});

test('tolerances, toJSON and toString', () => {
  const t = mm(10).pm(0.1);
  assert.ok(t instanceof Toleranced);
  assert.equal(String(t), '10 mm ± 0.1');
  near(t.min.value, 9.9); near(t.max.value, 10.1);
  const js = mm(60).toJSON();
  assert.deepEqual([js.value, js.unit, js.text], [60, 'mm', '60 mm']);
  assert.ok(mm(1) instanceof Quantity);
  assert.ok(Object.isFrozen(mm(1)));
});
