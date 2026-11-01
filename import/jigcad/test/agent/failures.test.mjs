// The failure report's classifier (tools/agent-eval/failures.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, analyse, MISUSE } from '../../tools/agent-eval/failures.mjs';

test('classify step results', () => {
  const c = result => classify({ result, error: /Error/.test(result) });
  assert.equal(c('ReferenceError: j is not defined (line 1)'), 'not defined: j');
  assert.equal(c("TypeError: Cannot read properties of undefined (reading 'volume') (line 4)"), 'read of undefined: .volume');
  assert.equal(c('TypeError: faces(...).map is not a function (line 1)'), 'promise not awaited');
  assert.equal(c('TypeError: files.list(...).then is not a function (line 1)'), 'not a function: .then');
  assert.equal(c('TypeError: program.metric is not a function (line 1)\nnote: x returned a Promise that this step never awaited.'), 'not a function: .metric');
  assert.equal(c('ok: true\nnote: run() returned a Promise that this step never awaited. Write: const x = await run();'), 'promise not awaited');
  assert.equal(c('TypeError: j.fit.holeComp does not exist; did you mean j.fit.hole?'), 'guarded name: j.fit.holeComp');
  assert.equal(c('Error: eval timed out after 25 s'), 'timeout');
  assert.equal(c('logs:\nhi\n---\nok: true'), null);
  assert.ok(MISUSE('not defined: mm') && !MISUSE('promise not awaited'));
});

test('analyse: recovery and stuck loops', () => {
  const err = r => ({ code: 'x', result: r, error: true }), ok = { code: 'return files.read(1)', result: 'ok', error: false };
  const a = analyse([{ tier: 't', repeat: 1, case: 'c', steps: [err('ReferenceError: j is not defined'), err('Error: boom'), err('Error: boom'), ok] }]);
  assert.equal(a.failedSteps, 3);
  assert.equal(a.stuckRuns, 1);
  assert.equal(a.misuseRuns, 1);
  assert.deepEqual(Object.fromEntries(a.recovery), { 1: 1, 2: 1, 3: 1 });
  assert.equal(a.coverage.get('files.read'), 1);
});

test('a promise kept in a variable and used as a value is the promise', () => {
  const c = r => classify({ result: r, error: true });
  assert.equal(c("TypeError: holes.map is not a function (line 3)\nnote: faces('x') returned a Promise that this step never awaited. Write: const x = await faces('x');"), 'promise not awaited');
});
