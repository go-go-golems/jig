// node --test import/jigcad/test/render/shot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { drawShotAccent, trailPoints } from '../../src/stage/shot-marks.js';
import { normalizeShot, shotAt, mapShotComponents, shotComponents } from '../../src/render/shot.js';

test('sparse layer tracks interpolate independently, with selections changing on the keyed frame', () => {
  const keys = normalizeShot([
    { time: 0, surface: 1 },
    { time: 1, isolate: ['a'], section: { components: ['a'], normal: [0, 0, 4], offset: 5 } },
    { time: 2, surface: 0, edges: 0, annotations: 0 },
    { time: 3, isolate: null, section: null },
  ], 'example');
  assert.deepEqual(shotAt(keys, -1), { surface: 1, edges: 1, annotations: 1, isolate: null, section: null });
  assert.deepEqual(shotAt(keys, 1), {
    surface: 0.5, edges: 0.5, annotations: 0.5, isolate: ['a'],
    section: { components: ['a'], normal: [0, 0, 1], offset: 5 },
  });
  assert.deepEqual(shotAt(keys, 100), { surface: 0, edges: 0, annotations: 0, isolate: null, section: null });
  const nested = mapShotComponents(keys, id => 'child/' + id);
  assert.deepEqual(nested[1].section.components, ['child/a']);
  assert.deepEqual(keys[1].isolate, ['a']);
});

test('invalid authored shot values fail during study construction', () => {
  for (const bad of [
    [{ time: 2, edges: 1 }, { time: 2, edges: 0 }], [{ time: -1, edges: 0 }],
    [{ time: 0, edges: NaN }], [{ time: 0, annotations: 2 }], [{ time: 0, layers: {} }],
    [{ time: 0, view: 'other' }], [{ time: 0, view: { inset: '' } }],
    [{ time: 0, accent: { components: ['bar'], color: 'bad color' } }],
    [{ time: 0, trail: { component: 'bar', point: [1, NaN, 2], seconds: 1, color: '#112233' } }],
    [{ time: 0, isolate: [] }], [{ time: 0, section: { components: ['a'], normal: [0, 0, 0], offset: 5 } }],
  ]) assert.throws(() => normalizeShot(bad, 'visual'), /study visual\.shot/);
});

test('worker compiles the Singer shot with its mechanical study and detects an unknown occurrence', async () => {
  register(new URL('../engine/loader.mjs', import.meta.url));
  const W = await import('../../src/engine/worker.js');
  const dir = new URL('../../content/presets/SG-09-exploded-head/', import.meta.url);
  const files = Object.fromEntries(readdirSync(dir).filter(name => name.endsWith('.js'))
    .map(name => [name, readFileSync(new URL(name, dir), 'utf8')]));
  const compile = async () => (await W.handle({ op: 'compile', files })).program;
  const program = await compile();
  assert.ok(program.ok, JSON.stringify(program.diagnostics));
  const shot = program.assembly.studies['Stitch cycle'].shot;
  assert.equal(shotAt(shot, 3).surface, 0);
  assert.equal(shotAt(shot, 7).surface, 1);
  assert.deepEqual(shotAt(shot, 8).section.components, ['presserGuide']);
  assert.deepEqual(shotAt(shot, 13), shotAt(shot, 0));
  files['script.js'] = files['script.js'].replace("components: ['presserGuide']", "components: ['missing guide']");
  const invalid = await compile();
  assert.ok(invalid.diagnostics.some(d => d.kind === 'asm.shot' && d.message.includes('missing guide')));
});

test('accent, trail and camera selections switch at keys and remap with subassembly occurrence IDs', () => {
  const keys = normalizeShot([
    { time: 0, view: 'stage' },
    { time: 1, view: { inset: 'bar' },
      accent: { components: ['bar', 'crank'], color: '#112233' },
      trail: { component: 'needle', point: [0, 0, -17], seconds: 1.5, color: '#ff0000' } },
    { time: 2, view: 'turntable', trail: null, accent: null },
    { time: 3, view: 'front-side' },
  ], 'camera');
  assert.equal(shotAt(keys, 0.9).view, 'stage');
  const nested = mapShotComponents(keys, id => 'head/' + id);
  assert.deepEqual(shotAt(nested, 1).view, { inset: 'head/bar' });
  assert.equal(shotAt(nested, 1).trail.component, 'head/needle');
  assert.deepEqual(new Set(shotComponents(nested[1])), new Set(['head/bar', 'head/crank', 'head/needle']));
  assert.equal(shotAt(keys, 2.5).trail, undefined);
  assert.equal(shotAt(keys, 2.5).view, 'turntable');
  assert.equal(shotAt(keys, 3).view, 'front-side');
});

test('trajectory window transforms an occurrence-local point and splits across unavailable rows', () => {
  let calls = 0;
  const study = { seconds: 6, last: 6, rows: [0, 1, 2, 4, 5, 6], frameAt(row) {
    calls++;
    return { pose: { needle: [1,0,0,0, 0,1,0,0, 0,0,1,0, row,0,0,1] } };
  } };
  const spec = { component: 'needle', point: [1,2,3], seconds: 3 };
  assert.deepEqual(trailPoints(study, 5, spec), [[[3,2,3]], [[5,2,3], [6,2,3]]]);
  assert.deepEqual(trailPoints(study, 1, spec), [[[1,2,3], [2,2,3]]]);
  assert.equal(calls, study.rows.length);
});

test('selected-color mask tints only visible pixels of the selected occurrence', () => {
  const spans = [];
  const ctx = { save() {}, restore() {}, fillRect(...rect) { spans.push(rect); }, globalAlpha: 1 };
  const scene = { faceCount: 2, instances: [
    { base: 0, body: { part: 'needle', faces: [{}] } },
    { base: 1, body: { part: 'foot', faces: [{}] } },
  ] };
  const buf = { w: 5, x0: 0, x1: 4, y0: 0, y1: 0, id: [-1, 1, 0, 0, 1] };
  drawShotAccent(ctx, {scene, buf, k: 1}, {components:['needle'], color:'#223344', opacity:0.5});
  assert.deepEqual(spans, [[2,0,2,1]]);
});
