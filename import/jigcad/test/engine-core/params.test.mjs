import { test, assert, near } from './harness.mjs';
import { resolveAll, paramLayers, paramRows, explainParam, paramInfo, table, exposeMeta, activeConfig, Literal } from '../../src/engine/params.js';
import { mm, lw, q } from '../../src/engine/units.js';

const base = { w: mm(60), d: mm(40), h: mm(30), corner: mm(4), wall: lw(3), floor: 'wall + 0.2 mm', screw_d: mm(3),
  boss_d: 'screw_d * 2 + wall', inner_w: 'w - 2 * wall', count: 3 };
const configs = { S: { w: mm(40), d: mm(30), h: mm(20) }, M: { w: mm(60), d: mm(40), h: mm(30) }, L: { w: mm(90), d: mm(60), h: mm(45), screw_d: mm(4) } };
const csv = `name,w,d,h,count
tray-2,80 mm,40 mm,20 mm,2
tray-3,120 mm,40 mm,20 mm,3
tray-4,160 mm,40 mm,20 mm,4`;

test('DAG evaluation in topological order with symbolic units resolved', () => {
  const R = resolveAll(paramLayers({ params: base }), { lw: 0.45 });
  assert.equal(R.diagnostics.length, 0);
  near(R.values.wall.value, 1.35); near(R.values.floor.value, 1.55); near(R.values.boss_d.value, 7.35); near(R.values.inner_w.value, 57.3);
  assert.deepEqual(R.levels, [['w', 'd', 'h', 'corner', 'wall', 'screw_d', 'count'], ['floor', 'boss_d', 'inner_w']]);
  const p = paramInfo('boss_d', R);
  assert.deepEqual([p.expr, p.src, p.deps], ['screw_d * 2 + wall', 'params', ['screw_d', 'wall']]);
  assert.equal(R.info.wall.raw, '3lw');
});

test('precedence: params < configs row < override < compile override, with provenance', () => {
  const S = resolveAll(paramLayers({ params: base, configs, config: 'S' }));
  assert.equal(S.info.w.src, 'configs.S');
  assert.deepEqual(S.info.w.shadowed.map(s => [s.src, s.value]), [['params', '60 mm']]);
  near(S.values.inner_w.value, 37.3);
  assert.deepEqual(S.info.inner_w.via, { w: 'configs.S' });
  const T = table(csv, { key: 'name' });
  const t4 = resolveAll(paramLayers({ params: base, configs: T, config: 'tray-4' }));
  assert.equal(t4.values.count, 4);
  assert.equal(t4.info.count.src, 'configs.tray-4 (table row 3)');
  const M = resolveAll(paramLayers({ params: base, configs: T, config: 'tray-3', overrides: [{ wall: mm(2) }] }));
  assert.equal(M.info.wall.src, 'override');
  assert.deepEqual(M.info.wall.shadowed.map(s => s.value), ['3lw']);
  near(M.values.inner_w.value, 116);
  assert.equal(explainParam('inner_w', M), 'inner_w = w − 2·wall = 120 mm − 2·2 mm = 116 mm; w from configs.tray-3 (table row 2), wall from override');
  const C = resolveAll(paramLayers({ params: base, configs: T, config: 'tray-3', overrides: [{ wall: mm(2) }], compileOverride: { wall: mm(2.4) } }));
  assert.equal(C.info.wall.src, 'compile.override');
  near(C.values.wall.value, 2.4);
});

test('the default configuration is the middle row', () => {
  const a = activeConfig(configs, null);
  assert.equal(a.name, 'M');
  assert.equal(a.active, 'M (default: the middle row)');
  assert.throws(() => activeConfig(configs, 'XL'));
});

test('cycles are reported with their path and a fix', () => {
  const R = resolveAll(paramLayers({ params: [base, { wall: 'floor - 0.2 mm' }] }));
  const d = R.diagnostics.find(x => x.kind === 'param.cycle');
  assert.ok(d);
  assert.equal(d.at, 'params.wall');
  assert.equal(d.message, 'wall → floor → wall');
  assert.deepEqual(d.path, ['wall', 'floor', 'wall']);
  assert.equal(d.fix, 'give one of them a value, e.g. wall: lw(3)');
  assert.equal(R.diagnostics.filter(x => x.kind === 'param.cycle').length, 1);
  assert.ok(R.failed.includes('boss_d'));   // downstream of the cycle
  near(R.values.w.value, 60);                // unaffected names still resolve
  const self = resolveAll([{ src: 'params', values: { a: 'a + 1' } }]);
  assert.equal(self.diagnostics[0].message, 'a → a');
  const three = resolveAll([{ src: 'params', values: { a: 'b', b: 'c', c: 'a' } }]);
  assert.equal(three.diagnostics[0].message, 'a → b → c → a');
});

test('dimension errors and unknown names become diagnostics', () => {
  const R = resolveAll(paramLayers({ params: [base, { inner_w: 'w - count' }] }));
  assert.deepEqual(R.diagnostics.map(d => [d.kind, d.at, d.message]), [['units.dimension', 'params.inner_w', "'w - count': cannot subtract 1 (dimensionless) from mm (L¹)"]]);
  const U = resolveAll([{ src: 'params', values: { a: 'b + 1 mm' } }]);
  assert.equal(U.diagnostics[0].kind, 'param.unknown');
});

test('lambdas, literals and lookups', () => {
  const R = resolveAll([{ src: 'params', values: { a: mm(2), b: ctx => ctx.p.a.mul(3), mat: new Literal('PLA'), g: 'gap.slide * 2' } }], {},
    { lookup: n => (n === 'gap.slide' ? mm(0.2) : undefined) });
  near(R.values.b.value, 6);
  assert.deepEqual(R.info.b.deps, ['a']);
  assert.equal(R.values.mat, 'PLA');
  near(R.values.g.value, 0.4);
});

test('design tables parse quantities, numbers, expressions and literals', () => {
  const T = table('name,w,material,inner\nA,80 mm,PLA,w - 2 mm\nB,90 mm,PETG,w - 3 mm', { key: 'name' });
  assert.deepEqual(T.names, ['A', 'B']);
  near(T.rows.A.w.value, 80);
  assert.ok(T.rows.A.material instanceof Literal);
  assert.equal(T.rows.B.inner, 'w - 3 mm');
});

test('rows in the ProgramData shape, with exposed metadata', () => {
  const ex = exposeMeta(['w', 'count'], { labels: { w: 'Width', count: 'Compartments' }, ranges: { w: [mm(30), mm(200)], count: [1, 8] } });
  const R = resolveAll(paramLayers({ params: base, configs }), {}, { exposed: ex });
  const rows = paramRows(R);
  const w = rows.find(r => r.name === 'w'), cnt = rows.find(r => r.name === 'count'), wall = rows.find(r => r.name === 'wall');
  assert.deepEqual([w.value, w.unit, w.text, w.src], [60, 'mm', '60 mm', 'configs.M']);
  assert.deepEqual(w.exposed, { label: 'Width', range: [30, 200], step: null, kind: 'length' });
  assert.deepEqual(cnt.exposed, { label: 'Compartments', range: [1, 8], step: null, kind: 'int' });
  assert.deepEqual([wall.value, wall.text, wall.raw, wall.expr], [1.35, '1.35 mm', '3lw', null]);
  for (const r of rows) for (const k of ['name', 'value', 'unit', 'text', 'expr', 'src', 'deps', 'exposed']) assert.ok(k in r, `row ${r.name} has ${k}`);
  assert.ok(JSON.stringify(rows));          // structured-cloneable plain data
  void q;
});
