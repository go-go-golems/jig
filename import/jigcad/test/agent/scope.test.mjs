// node --test test/agent/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labScope, enc } from '../../src/agent/scope.js';
import { createMockHost, BOX_SCRIPT } from './mock-host.js';

async function setup() { const host = createMockHost(); await host.compile(); return { host, s: labScope(host) }; }

test('files: list, read with numbers, grep, edit exact and unique, write', async () => {
  const { host, s } = await setup();
  assert.deepEqual(s.files.list(), [{ path: 'notes.md', lines: 4, edited: false }, { path: 'script.js', lines: 6, edited: false }]);
  assert.equal(s.files.read('script.js', 1, 1), "1  const box = j.part('box')");
  assert.deepEqual(s.files.grep('wall', 'script.js'), ["script.js:2  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })", "script.js:4  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })"]);
  assert.equal(s.files.grep('wall').length, 3);
  assert.deepEqual(s.files.grep(/endFace\(\)/), ["script.js:4  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })"]);
  assert.throws(() => s.files.edit('script.js', 'mm(', 'cm('), /text occurs 4 times in script.js; include more context so it is unique/);
  assert.throws(() => s.files.edit('nope.js', 'a', 'b'), /edit: no file nope.js; files are notes.md, script.js/);
  assert.deepEqual(s.files.edit('script.js', 'wall: mm(2)', 'wall: mm(2.4)'), { path: 'script.js', line: 2 });
  assert.equal(s.files.list()[1].edited, true);
  assert.deepEqual(s.files.write('data.json', '{"a":1}'), { path: 'data.json', lines: 1 });
});

test('run and check report { ok, errors } and numbers; check leaves the editor alone', async () => {
  const { host, s } = await setup();
  const before = (await s.check({})).metrics.volume;
  const variant = await s.check(host.files.get('script.js').replace('wall: mm(2)', 'wall: mm(3)'));
  assert.equal(variant.ok, true);
  assert.ok(variant.metrics.volume > before);
  assert.equal(host.files.get('script.js').includes('wall: mm(2)'), true);
  s.files.edit('script.js', '.params({', '.params({{');
  const bad = await s.run();
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 1);
  assert.equal(bad.errors[0].level, 'error');
  s.files.edit('script.js', '.params({{', '.params({');
  const good = await s.run();
  assert.equal(good.ok, true);
  assert.deepEqual(good.errors, []);
  assert.equal(good.summary.faces, 11);
});

test('program helpers', async () => {
  const { s } = await setup();
  assert.deepEqual(s.program.metrics('mass'), { mass: { value: 15552 * 1.24e-3, unit: 'g', fidelity: 'exact' } });
  assert.equal(s.program.params('w*').length, 2);
  assert.deepEqual(s.program.graph().edges, ['base → body profile', 'body → shell body']);
  assert.equal(s.program.diagnostics('info')[0].kind, 'fit.uncalibrated');
  assert.equal((await s.program.ir('L2')).split('\n')[0], 'w = 60 mm');
  assert.equal(await s.program.ir('L4', { node: 'shell', from: 1, to: 1 }), '1  L4 of shell:');
  assert.deepEqual(s.program.bodies()[0], { id: 'box/body1', part: 'box', faces: 11, edges: 2, bbox: [[-30, -20, 0], [30, 20, 30]] });
});

test('queries, measurement and selection', async () => {
  const { host, s } = await setup();
  const top = await s.faces('>Z');
  assert.deepEqual(top.map(f => f.name), ['body/end']);
  assert.deepEqual(s.measure.distance('body/start', 'body/end'), { distance: 30, unit: 'mm', how: 'between parallel planes' });
  assert.deepEqual(s.measure.distance('body/side[base.l2]', 'shell/inner[body/side[base.l2]]'), { distance: 2, unit: 'mm', how: 'between parallel planes' });
  assert.deepEqual(s.measure.angle('body/start', 'body/side[base.l1]'), { angle: 90, unit: '°' });
  assert.deepEqual(s.measure.bbox(), { min: [-30, -20, 0], max: [30, 20, 30], size: [60, 40, 30], unit: 'mm' });
  assert.deepEqual(s.measure.edge('body/side[base.l1] ∩ body/side[base.l2]'), { name: 'body/side[base.l1] ∩ body/side[base.l2]', body: 'box/body1', kind: 'line', length: 30, faces: ['body/side[base.l1]', 'body/side[base.l2]'] });
  // 2400 bottom + 2 × 1800 + 2 × 1200 sides + 384 rim + 2 × 1568 + 2 × 1008 inner walls + 2016 floor
  assert.deepEqual(await s.measure.area('%plane'), { area: 15952, unit: 'mm²', faces: 11 });
  assert.deepEqual(await s.measure.area(['body/end', 'shell/floor']), { area: 2400, unit: 'mm²', faces: 2 });
  assert.deepEqual(s.select('body/end'), { selected: 'body/end', body: 'box/body1', face: 5 });
  assert.deepEqual(host.selection, { body: 0, face: 5, edge: null, name: 'body/end' });
  assert.deepEqual(s.selection(), { name: 'body/end', body: 'box/body1', face: 5, edge: null });
  assert.throws(() => s.select('body/nowhere'), /select: no face, edge or body named body\/nowhere/);
  assert.equal((await s.why('>Z')).resolved[0], 'body/end');
  assert.equal((await s.sketch('base')).status, 'fully');
});

test('params, view, export, presets', async () => {
  const { host, s } = await setup();
  const r = await s.params.set('wall', 3);
  assert.deepEqual(r, { name: 'wall', value: '3 mm', ok: true });
  assert.deepEqual(s.params.overrides(), { wall: 3 });
  assert.equal(host.program.params.find(p => p.name === 'wall').src, 'override');
  await s.params.clear();
  assert.deepEqual(s.params.overrides(), {});
  assert.deepEqual(s.view.set({ name: 'front', overlays: { dims: false, names: true } }), { name: 'front', overlays: ['shadows', 'grid', 'names'] });
  assert.throws(() => s.view.set({ name: 'iso' }), /axo, front, side or plan/);
  const ex = await s.exportFile('stl');
  assert.deepEqual(Object.keys(ex), ['format', 'filename', 'mime', 'bytes', 'report']);
  assert.equal(ex.bytes, 1284);
  assert.equal((await s.exportFile('step')).bytes, 4014);
  assert.deepEqual(s.presets.list().map(p => p.id), ['A-01', 'A-02']);
  await assert.rejects(s.presets.load('Z-99'), /no preset Z-99; presets are A-01, A-02/);
});

test('lab link builders escape what links need and keep names readable', () => {
  const host = createMockHost();
  const s = labScope(host);
  assert.equal(s.lab.face('body/side[base.l1]#a'), 'lab:face?name=body/side[base.l1]%23a');
  assert.equal(s.lab.open('script.js', 12), 'lab:open?file=script.js&line=12');
  assert.equal(s.lab.open('script.js', ".shell(j.feat('body')"), "lab:open?file=script.js&find=.shell%28j.feat%28'body'%29");
  assert.equal(s.lab.param('wall', '2.4 mm'), 'lab:param?name=wall&value=2.4 mm');
  assert.equal(s.lab.feature('shell'), 'lab:node?id=shell');
  assert.equal(s.lab.node('shell', 'ir'), 'lab:node?id=shell&in=ir');
  assert.equal(s.lab.md('the rim', s.lab.face('body/end')), '[the rim](lab:face?name=body/end)');
  assert.equal(enc('a&b+c%'), 'a%26b%2Bc%25');
});

test('presets: current, create from files or a copy, rename; files: rename and remove', async () => {
  const host = createMockHost();
  await host.compile();
  const s = labScope(host);
  assert.deepEqual(s.presets.current(), { id: 'A-01', title: host.preset.title, group: host.preset.group, about: host.preset.about, mine: false, edited: false });
  const a = await s.presets.create({ title: 'Lid', files: { 'script.js': BOX_SCRIPT, 'notes.md': '# Lid\n' } });
  assert.deepEqual(a, { id: 'U-01', title: 'Lid', files: ['notes.md', 'script.js'], open: true });
  assert.equal(s.presets.current().id, 'U-01');
  assert.equal(s.presets.current().mine, true);
  assert.ok(s.presets.list().find(p => p.id === 'U-01').mine);
  assert.deepEqual(s.presets.rename('U-01', 'Snap lid'), { id: 'U-01', title: 'Snap lid' });
  assert.throws(() => s.presets.rename('A-01', 'x'), /presets.rename: A-01 ships with the workbench; copy it first/);
  assert.throws(() => s.presets.rename('U-01', '  '), /presets.rename/);
  const b = await s.presets.create({ from: 'U-01', title: 'Snap lid, wider', open: false });
  assert.equal(b.id, 'U-02'); assert.equal(b.open, false); assert.equal(s.presets.current().id, 'U-01');
  await assert.rejects(s.presets.create({ from: 'Q-9' }), /presets.create: no preset Q-9 to copy/);
  await assert.rejects(s.presets.create({ from: 'A-01', files: {} }), /give files or from, not both/);
  assert.deepEqual(s.files.rename('notes.md', 'README.md'), { from: 'notes.md', to: 'README.md' });
  assert.throws(() => s.files.rename('script.js', 'main.js'), /script.js is the entry point and keeps its name/);
  assert.throws(() => s.files.rename('README.md', 'script.js'), /keeps its name/);
  assert.throws(() => s.files.rename('nope.md', 'x.md'), /rename: no file nope.md/);
  assert.deepEqual(s.files.remove('README.md'), { removed: 'README.md' });
  assert.throws(() => s.files.remove('script.js'), /cannot be removed/);
  const ro = labScope(host, { readOnly: true });
  await assert.rejects(async () => ro.presets.create({ title: 'x' }), /read-only mode: presets.create is off/);
  assert.throws(() => ro.presets.rename('U-01', 'x'), /read-only mode: presets.rename is off/);
  assert.throws(() => ro.files.rename('a', 'b'), /read-only mode: files.rename is off/);
  assert.throws(() => ro.files.remove('a'), /read-only mode: files.remove is off/);
});

test('exportFile reports without saving, and saves through host.saveFile when asked', async () => {
  const { labScope } = await import('../../src/agent/scope.js');
  const { createMockHost } = await import('./mock-host.js');
  const host = createMockHost();
  await host.compile();
  const saved = [];
  host.export = async format => ({ data: new Uint8Array(134), filename: `box.${format}`, mime: 'model/stl', report: { kept: ['geometry'], approximated: [], dropped: [] } });
  const s = labScope(host);
  await assert.rejects(s.exportFile('stl', { save: true }), /cannot save files/);
  host.saveFile = async f => { saved.push(f); return true; };
  const quiet = await s.exportFile('stl');
  assert.equal(quiet.bytes, 134); assert.equal(quiet.saved, undefined); assert.equal(saved.length, 0);
  const r = await s.exportFile('stl', { save: true });
  assert.equal(r.saved, true);
  assert.equal(saved[0].filename, 'box.stl'); assert.equal(saved[0].data.byteLength, 134);
  const ro = labScope(host, { readOnly: true });
  assert.equal((await ro.exportFile('stl', { save: true })).saved, true, 'saving a file is allowed in read mode: it changes nothing');
});

test('run() and check() return warnings as text, at most six', async () => {
  const { labScope } = await import('../../src/agent/scope.js');
  const { createMockHost } = await import('./mock-host.js');
  const host = createMockHost();
  const w = n => Array.from({ length: n }, (_, i) => ({ level: 'warning', kind: 'feature.noEffect', at: `f${i}`, message: `f${i}: the cut removes no material`, fix: 'use a positive depth' }));
  const prog = n => ({ ok: true, diagnostics: [{ level: 'info', kind: 'x', message: 'i' }, ...w(n)], summary: {}, metrics: {} });
  host.compile = async () => (host.program = prog(1));
  host.check = async () => prog(9);
  const s = labScope(host);
  const r = await s.run();
  assert.deepEqual(r.warnings, [{ level: 'warning', kind: 'feature.noEffect', at: 'f0', message: 'f0: the cut removes no material', fix: 'use a positive depth' }]);
  const c = await s.check('x');
  assert.equal(c.warnings.length, 7);
  assert.deepEqual(c.warnings[6], { more: 3, see: 'program.diagnostics()' });
});
