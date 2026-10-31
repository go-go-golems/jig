import { test, assert, near } from './harness.mjs';
import { pt, vec, dir, origin, tx, plane, axis, frame, point, Transform, Deferred, resolveDatum, Frame } from '../../src/engine/geom.js';
import { mm, deg, turn, AffineError } from '../../src/engine/units.js';

const nearPt = (p, xyz, tol = 1e-9) => xyz.forEach((v, i) => near(p.toArray()[i], v, tol));

test('affine space: p − q is a vector, p + q is an AffineError', () => {
  const p = pt(10, 0, 5), q = pt(40, 20, 5), v = q.sub(p);
  nearPt(v, [30, 20, 0]);
  assert.ok(p.add(v).eq(q));
  near(v.norm().value, Math.hypot(30, 20));
  nearPt(p.add(v.mul(0.5)), [25, 10, 5]);
  assert.equal(String(dir('+X').cross(dir('+Y'))), "dir('+Z')");
  near(dir('+X').angleTo(v).value, Math.atan2(20, 30));
  assert.throws(() => p.add(q), AffineError);
  assert.throws(() => p.add(dir('+X')), AffineError);
  // (p − q) + q = p
  assert.ok(q.add(p.sub(q)).eq(p));
});

const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
const randTx = () => tx.rotate(axis.through(pt(rnd() * 10, rnd() * 10, rnd() * 10), pt(rnd() * 10 + 1, rnd() * 10, rnd() * 10 + 2)), rnd() * 360)
  .then(tx.move(rnd() * 50 - 25, rnd() * 50 - 25, rnd() * 50 - 25));

test('transform group laws: associativity, identity, inverses', () => {
  for (let k = 0; k < 25; k++) {
    const a = randTx(), b = randTx(), c = randTx();
    assert.ok(a.then(b).then(c).eq(a.then(b.then(c)), 1e-9), 'associativity');
    assert.ok(a.then(tx.identity).eq(a) && tx.identity.then(a).eq(a), 'identity');
    assert.ok(a.then(a.inverse()).isIdentity && a.inverse().then(a).isIdentity, 'inverse');
    near(a.det, 1, 1e-9);
  }
});

test('rotations and moves: order matters, coaxial angles add, pow', () => {
  const rz30 = tx.rotate(axis.Z, deg(30)), right20 = tx.move(20, 0, 0);
  nearPt(rz30.then(right20).apply(pt(10, 0, 0)), [20 + 10 * Math.cos(Math.PI / 6), 5, 0]);
  nearPt(right20.then(rz30).apply(pt(10, 0, 0)), [30 * Math.cos(Math.PI / 6), 15, 0]);
  const rz45 = tx.rotate(axis.Z, deg(45));
  assert.ok(rz30.then(rz45).eq(tx.rotate(axis.Z, deg(75))));
  assert.ok(rz30.pow(12).isIdentity);
  assert.ok(rz30.pow(-3).eq(tx.rotate(axis.Z, -90)));
  nearPt(tx.rotate(axis.Z, turn(0.25)).apply(pt(10, 0, 0)), [0, 10, 0]);
  assert.equal(String(rz30.then(right20).then(right20.inverse())), 'rotate(Z, 30°)');
});

test('mirrors are involutions with det −1; scale is in Sim(3)', () => {
  const mx = tx.mirror(plane.YZ);
  assert.ok(mx.then(mx).isIdentity);
  nearPt(mx.apply(pt(12, 3, 4)), [-12, 3, 4]);
  near(mx.det, -1);
  const off = tx.mirror(plane.offset(plane.XY, 5));
  nearPt(off.apply(pt(1, 2, 0)), [1, 2, 10]);
  nearPt(tx.scale(1.006, { about: origin }).apply(pt(100, 0, 0)), [100.6, 0, 0]);
  nearPt(tx.scale(2, { about: pt(10, 0, 0) }).apply(pt(20, 0, 0)), [30, 0, 0]);
});

test('datum planes: conventions and the offset law', () => {
  assert.deepEqual(plane.XZ.toPlaneData(), { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], normal: [0, -1, 0] });
  assert.deepEqual(plane.YZ.toPlaneData().x, [0, 1, 0]);
  assert.equal(plane.offset(plane.XY, mm(10)).offset(mm(15)).key(), plane.offset(plane.XY, mm(25)).key());
  const tilted = plane.angle(plane.XY, axis.X, deg(30));
  near(tilted.normal.z, Math.cos(Math.PI / 6));
  const tri = plane.through(pt(0, 0, 0), pt(10, 0, 0), pt(0, 10, 5));
  const f = tri.offset(mm(2)).flip();
  near(f.normal.dot(tri.normal), -1);
  assert.throws(() => plane.through(pt(0, 0, 0), pt(1, 0, 0), pt(2, 0, 0)), AffineError);
  const mid = plane.mid(plane.XY, plane.offset(plane.XY, 10));
  near(mid.origin.z, 5);
});

test('frames, align and axis.through', () => {
  const lidBottom = frame({ origin: pt(0, 0, 0), x: dir('+X'), z: dir('-Z') });
  const boxTop = frame({ origin: pt(0, 0, 30), x: dir('+X'), z: dir('+Z') });
  const seat = tx.align(lidBottom.flip(), boxTop);
  nearPt(seat.apply(pt(0, 0, 0)), [0, 0, 30]);
  const a = axis.through(pt(0, 0, 0), pt(0, 0, 5));
  assert.ok(a.dir.eq(dir('+Z')));
  assert.ok(boxTop.toTransform() instanceof Transform);
});

test('topology and parameter datums are deferred and resolved later', () => {
  const on = plane.on('faceSel');
  assert.ok(on instanceof Deferred);
  assert.equal(on.kind, 'deferred');
  const chained = on.offset(3).flip();
  assert.deepEqual(chained.chain.map(c => c[0]), ['offset', 'flip']);
  const resolved = resolveDatum(chained, { resolve: (op, args) => { assert.equal(op, 'on'); return plane.XY; } });
  near(resolved.origin.z, 3); near(resolved.normal.z, -1);
  const pe = plane.offset(plane.XY, 'floor');
  assert.ok(pe instanceof Deferred);
  near(resolveDatum(pe, { scope: { floor: mm(1.55) } }).origin.z, 1.55);
  assert.throws(() => resolveDatum(axis.of('sel')), /kernel/);
  assert.ok(point.center('x') instanceof Deferred && frame.on('x', { flip: true }).chain.length === 1);
  assert.ok(resolveDatum(plane.XY) instanceof Frame);
  const dp = pt('w / 2', 0, 0);
  near(resolveDatum(dp, { scope: { w: mm(10) } }).x, 5);
  void vec;
});
