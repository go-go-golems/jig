// Which sketches the sheet draws: the sketch view draws its one sketch; the 3D views draw view.shown (Sketch ▾ › 3D).
// "Back to the part" clears view.sketch, so the sketch it had open is no longer drawn on the part. node --test test/ui/
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Path2D ??= class { addPath() {} moveTo() {} lineTo() {} closePath() {} };
const { activeSketch, shownSketches } = await import('../../src/stage/sheet.js');

const program = { kind: 'print', sketches: [{ id: 'pot' }, { id: 'saucer' }, { id: 'ribs' }] };

test('the sketch view draws its sketch; the 3D views draw none unless shown', () => {
  assert.equal(activeSketch(program, { name: 'sketch', sketch: 'saucer' }).id, 'saucer');
  assert.equal(activeSketch(program, { name: 'axo', sketch: 'saucer' }), null, 'a leftover view.sketch is not drawn on the part');
  assert.deepEqual(shownSketches(program, { name: 'axo', shown: new Set() }), []);
  assert.deepEqual(shownSketches(program, { name: 'front', shown: new Set(['pot', 'ribs', 'gone']) }).map(s => s.id), ['pot', 'ribs']);
  assert.deepEqual(shownSketches(program, { name: 'sketch', sketch: 'pot', shown: new Set(['saucer']) }), [], 'the sketch view shows only its own');
});

test('a sketch program still opens on its sketch', () => {
  assert.equal(activeSketch({ kind: 'sketch', sketches: [{ id: 's' }] }, { name: 'axo' }).id, 's');
});

test('a dragged sketch is drawn as solved', () => {
  const solved = new Map([['pot', { id: 'pot', moved: true }]]);
  assert.equal(shownSketches(program, { name: 'axo', shown: new Set(['pot']) }, solved)[0].moved, true);
});

test('host.toggleSketchShown adds, removes and forces', async () => {
  const { register } = await import('node:module');
  register(new URL('../../tools/agent-eval/loader.mjs', import.meta.url).href);
  const { Host } = await import('../../src/host/host.js');
  const h = new Host({ engine: { ready: Promise.resolve(), request: async () => ({}), compute: null } });
  const seen = [];
  h.on('view', v => seen.push([...v.shown]));
  h.toggleSketchShown('pot'); h.toggleSketchShown('saucer'); h.toggleSketchShown('pot'); h.toggleSketchShown('saucer', true);
  assert.deepEqual([...h.view.shown], ['saucer']);
  assert.deepEqual(seen, [['pot'], ['pot', 'saucer'], ['saucer'], ['saucer']]);
  h.setView({ shown: ['ribs'] });
  assert.ok(h.view.shown instanceof Set);
});
