// node --test import/jigcad/test/render/shot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { normalizeShot, shotAt, mapShotComponents } from '../../src/render/shot.js';

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
