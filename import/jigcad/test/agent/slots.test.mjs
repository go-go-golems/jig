// Engine slots (JIG-013 phase 1): Programs kept beside the current one survive the next compile's gc(), and
// callSync answers on any of them like call() does on the current one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../../src/engine/worker.js';

const A01 = readFileSync(new URL('../../content/presets/A-01-box/script.js', import.meta.url), 'utf8');

test('two slots and the current program answer side by side; selector text and values; faces() lists all', async () => {
  await W.init({});
  await W.compileFiles({ files: { 'script.js': A01 }, options: { slot: 'shadow' } });
  const wide = A01.replace('w: mm(60)', 'w: mm(80)');
  await W.compileFiles({ files: { 'script.js': wide }, options: { slot: 'check' } });
  await W.compileFiles({ files: { 'script.js': A01.replace('h: mm(30)', 'h: mm(10)') } });   // current
  // after three compiles (three gc() runs) each slot still answers from its own bodies
  const top = slot => W.callSync(slot, 'faces', ['>Z'])[0];
  assert.equal(top('shadow').center[2], 30);
  assert.equal(top('current').center[2], 10);
  assert.equal(W.slotData('check').metrics.bbox.value[0], 80);
  // callSync answers like call
  assert.deepEqual(W.callSync('current', 'faces', ['%plane']).map(f => f.name), (await W.call('faces', ['%plane'])).map(f => f.name));
  // selector text and selector values
  const { j } = W.lang();
  assert.equal(W.callSync('shadow', 'faces', ["j.sel.faces('>Z')"]).length, W.callSync('shadow', 'faces', [j.sel.faces('>Z')]).length);
  // no selector: every face
  assert.equal(W.callSync('shadow', 'faces', []).length, W.slotData('shadow').summary.faces);
  assert.throws(() => W.callSync('nope', 'faces', []), /nothing compiled in the nope slot yet/);
});

test('the same inputs give the same program hash in any slot (the shadow\'s contract)', async () => {
  await W.init({});
  const x05 = readFileSync(new URL('../../content/presets/X-05-project-box/script.js', import.meta.url), 'utf8');
  for (const [files, override] of [[{ 'script.js': A01 }, { wall: 3 }], [{ 'script.js': x05 }, {}]]) {
    const a = (await W.compileFiles({ files, options: { override } })).program.hash;
    const b = (await W.compileFiles({ files, options: { override, slot: 'shadow' } })).program.hash;
    assert.match(a, /^h:/);
    assert.equal(a, b);
  }
});
