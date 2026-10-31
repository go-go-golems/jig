import { test, assert, near } from './harness.mjs';
import { parseExpr, deps, evaluate, expr, printExpr, ExprError } from '../../src/engine/expr.js';
import { mm, deg, lw, q, DimensionError } from '../../src/engine/units.js';

test('parse once, extract dependencies', () => {
  assert.deepEqual(deps('w / 2 - wall - boss_d / 2'), ['boss_d', 'w', 'wall']);
  assert.deepEqual(deps('wall * 2 + 1 mm'), ['wall']);
  assert.deepEqual(deps('min(a, b) + sqrt(c) - 2 * pi'), ['a', 'b', 'c']);
  assert.deepEqual(deps('gap.slide + 0.1 mm'), ['gap.slide']);
  assert.equal(parseExpr('a + b'), parseExpr('a + b'));   // cached AST
});

test('evaluate with units and parameters', () => {
  near(evaluate('wall * 2 + 1 mm', { wall: mm(2) }).value, 5);
  near(evaluate('w / 2 - wall - boss_d / 2', { w: mm(60), wall: mm(1.35), boss_d: mm(7.35) }).value, 60 / 2 - 1.35 - 7.35 / 2);
  near(evaluate('min(a, b)', { a: mm(3), b: mm(2) }).value, 2);
  near(evaluate('sqrt(x)', { x: q('25 mm^2') }).value, 5);
  near(evaluate('sin(30°)'), 0.5, 1e-12);
  near(evaluate('cos(a)', { a: deg(60) }), 0.5, 1e-12);
  near(evaluate('-(2 mm) + 3 mm').value, 1);
  near(evaluate('(1 + 2) * 3'), 9);
  near(evaluate('2^3 + 1'), 9);
  near(evaluate('1/4 in').value, 6.35);
  near(evaluate('1.24 g/cm^3').value, 1.24e-3);
  assert.equal(String(evaluate('3 lw + wall', { wall: lw(1) })), '4lw');
  near(evaluate('count * 2', { count: 3 }), 6);
  near(evaluate('atan2(1 mm, 1 mm)').value, Math.PI / 4);
  near(evaluate('clamp(x, 1 mm, 2 mm)', { x: mm(5) }).value, 2);
  near(evaluate('w', name => (name === 'w' ? mm(7) : undefined)).value, 7);
});

test('dimension errors carry the expression and the column', () => {
  assert.throws(() => evaluate('w - count', { w: mm(3), count: 3 }), e => e instanceof DimensionError
    && e.message === "'w - count': cannot subtract 1 (dimensionless) from mm (L¹)" && e.column === 3);
  assert.throws(() => evaluate('sin(2 mm)'), DimensionError);
});

test('syntax and name errors report the column', () => {
  assert.throws(() => parseExpr('w * (2 + '), e => e instanceof ExprError && e.column === 10);
  assert.throws(() => parseExpr('w $ 2'), e => e instanceof ExprError);
  assert.throws(() => evaluate('w + nope', { w: 1 }), e => e instanceof ExprError && e.kind === 'param.unknown' && e.column === 5);
  assert.throws(() => parseExpr('3 furlongs'), e => /unknown unit/.test(e.message));
});

test('Expr values and printing', () => {
  const e = expr('screw_d * 2 + wall');
  assert.deepEqual([...e.deps], ['screw_d', 'wall']);
  near(e.evaluate({ screw_d: mm(3), wall: mm(1.35) }).value, 7.35);
  assert.equal(printExpr('w - 2 * wall'), 'w − 2·wall');
  assert.equal(printExpr('w - 2 * wall', n => ({ w: '120 mm', wall: '2 mm' })[n]), '120 mm − 2·2 mm');
  assert.ok(Object.isFrozen(e));
});
