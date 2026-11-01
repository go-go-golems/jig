// node --test test/agent/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEval, cut, createEvalTool, EVAL_TIMEOUT_MS, RESULT_CUT, DECLINED_RESULT, DECLINED_TO_MODEL } from '../../src/agent/evaltool.js';
import { createMockHost } from './mock-host.js';

test('the limits are the guide\'s: 25 s and 9,000 characters', () => {
  assert.equal(EVAL_TIMEOUT_MS, 25000);
  assert.equal(RESULT_CUT, 9000);
});

test('a step that never settles times out', async () => {
  const host = createMockHost();
  const r = await runEval(host, 'await new Promise(() => {}); return 1;', { timeoutMs: 150 });
  assert.equal(r.error, true);
  assert.match(r.text, /^Error: eval timed out after 0\.2 s/);
  assert.ok(r.ms >= 140 && r.ms < 1000, `ms ${r.ms}`);
  const r2 = await runEval(host, 'await new Promise(() => {});', { timeoutMs: 25 });
  assert.match(r2.text, /timed out after 0 s|timed out after 0\.1 s|timed out after 0 s/);
});

test('a result over 9,000 characters is cut with the note', async () => {
  const host = createMockHost();
  const r = await runEval(host, "return 'x'.repeat(20000);");
  assert.equal(r.text.length, 9000 + '\n… cut (20000 chars). Return less: pick fields, slice arrays.'.length);
  assert.ok(r.text.endsWith('\n… cut (20000 chars). Return less: pick fields, slice arrays.'));
  assert.equal(cut('short'), 'short');
});

test('values come back as YAML; logs come first under logs: and ---', async () => {
  const host = createMockHost();
  await host.compile();
  const r = await runEval(host, "const s = program.summary(); console.log(s.faces, 'faces'); log({ ok: true }); console.warn('careful'); return { volume: s.volume, kind: s.kind };");
  assert.equal(r.error, false);
  assert.equal(r.text, 'logs:\n11 faces\n{ ok: true }\nwarn: careful\n---\nvolume: 15552\nkind: part');
});

test('errors name the line of the step\'s own code', async () => {
  const host = createMockHost();
  const r1 = await runEval(host, "throw new Error('boom');");
  assert.equal(r1.text, 'Error: boom (line 1)');
  const r2 = await runEval(host, "const a = 1;\n\nfiles.edit('script.js', 'nope', 'x');");
  assert.equal(r2.text, 'Error: edit: text not found in script.js (it must match exactly, including spaces) (line 3)');
  const r3 = await runEval(host, 'return (;');
  assert.match(r3.text, /^SyntaxError: /);
  const r4 = await runEval(host, 'return undefinedName;');
  assert.match(r4.text, /^ReferenceError: undefinedName is not defined \(line 1\)\nnote: undefinedName is not in this step.s scope\. Steps do not share variables/);
});

test('the host is not in scope; const names do not carry over', async () => {
  const host = createMockHost();
  assert.equal((await runEval(host, 'return typeof host;')).text, 'undefined');
  await runEval(host, 'const keep = 1; return keep;');
  assert.match((await runEval(host, 'return keep;')).text, /ReferenceError/);
  assert.equal((await runEval(host, 'return typeof lab.face;')).text, 'function');
});

test('Read-only: every editing path throws, reading works', async () => {
  const host = createMockHost();
  await host.compile();
  const ro = { readOnly: true };
  for (const [code, name] of [
    ["files.edit('script.js', 'mm(2)', 'mm(3)')", 'files.edit'],
    ["files.write('x.js', '')", 'files.write'],
    ['await run()', 'run'],
    ["await params.set('wall', 3)", 'params.set'],
    ['await params.clear()', 'params.clear'],
    ["await presets.load('A-02')", 'presets.load'],
    ["lab.follow('lab:param?name=wall&value=3')", 'lab.follow lab:param'],
  ]) {
    const r = await runEval(host, code, ro);
    assert.equal(r.text, `Error: read-only mode: ${name} is off (line 1)`, code);
  }
  assert.equal((await runEval(host, "return files.grep('wall:').length", ro)).text, '1');
  assert.match((await runEval(host, 'return (await check({})).ok', ro)).text, /true/);
  assert.equal(host.files.get('script.js').includes('mm(2) })'), true);
});

test('the tool snapshots files, marks changed steps, and asks in Ask mode', async () => {
  const host = createMockHost();
  await host.compile();
  const steps = [];
  let mode = 'auto';
  const tool = createEvalTool(host, { getMode: () => mode, onStep: s => steps.push(s) });
  const read = await tool.execute({ code: "return files.read('script.js', 2, 2);" });
  assert.equal(read, "2    .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })");
  assert.equal(steps[0].changed, false);
  await tool.execute({ code: "return files.edit('script.js', 'wall: mm(2)', 'wall: mm(2.4)');" });
  assert.equal(steps[1].changed, true);
  assert.match(steps[1].snapshot.files['script.js'], /wall: mm\(2\) \}/);

  mode = 'ask';
  const p = tool.execute({ code: 'return 1 + 1;' });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(steps[2].asking, true);
  steps[2].resolve(true);
  assert.equal(await p, '2');
  const p2 = tool.execute({ code: 'return 3;' });
  await new Promise(r => setTimeout(r, 5));
  steps[3].resolve(false);
  assert.equal(await p2, DECLINED_TO_MODEL);
  assert.equal(steps[3].result, DECLINED_RESULT);
  assert.equal(steps[3].error, true);
});

test('Stop resolves a waiting step as declined', async () => {
  const host = createMockHost();
  const ctl = new AbortController();
  const steps = [];
  const tool = createEvalTool(host, { getMode: () => 'ask', onStep: s => steps.push(s), signal: ctl.signal });
  const p = tool.execute({ code: 'return 1;' });
  await new Promise(r => setTimeout(r, 5));
  ctl.abort();
  assert.equal(await p, DECLINED_TO_MODEL);
  assert.equal(steps[0].result, DECLINED_RESULT);
});

// ── JIG-004: promises a step forgets to await ────────────────────────────────
test('an unawaited lab call gets a note and a marker instead of {}', async () => {
  const host = createMockHost();
  await host.compile();
  const r = await runEval(host, "const fs = faces('%plane');\nreturn { fs, n: fs.length };");
  assert.equal(r.error, false);
  assert.match(r.text, /<Promise from faces\('%plane'\): not awaited>/);
  assert.match(r.text, /note: faces\('%plane'\) returned a Promise that this step never awaited\. Write: const x = await faces\('%plane'\);/);
});

test('awaited, returned and Promise.all calls get no note', async () => {
  const host = createMockHost();
  await host.compile();
  for (const code of ["const fs = await faces('%plane'); return fs.length;", "return faces('%plane');",
    "const [a, b] = await Promise.all([faces('%plane'), why('body/end')]); return [a.length, b.target];",
    "return await feature('nope').catch(e => e.message);"]) {
    const r = await runEval(host, code);
    assert.doesNotMatch(r.text, /note:|not awaited/, code);
  }
});

test('a rejected unawaited call reports its error inside the step, with no unhandled rejection', async () => {
  const host = createMockHost();
  await host.compile();
  let unhandled = 0;
  const on = () => { unhandled++; };
  process.on('unhandledRejection', on);
  try {
    const r = await runEval(host, "feature('nope'); return 'started';");
    await new Promise(res => setTimeout(res, 20));
    assert.match(r.text, /note: feature\('nope'\) returned a Promise that this step never awaited\. Write: const x = await feature\('nope'\); It failed: .*no feature nope/);
    assert.equal(unhandled, 0);
  } finally { process.off('unhandledRejection', on); }
});

test('a TypeError from using a promise as a value comes with the note; logs show the marker', async () => {
  const host = createMockHost();
  await host.compile();
  const r = await runEval(host, "const fs = faces('%plane');\nconsole.log(fs);\nreturn fs.map(f => f.name);");
  assert.equal(r.error, true);
  assert.match(r.text, /logs:\n<Promise from faces\('%plane'\): not awaited>/);
  assert.match(r.text, /TypeError: fs\.map is not a function[\s\S]*note: faces\('%plane'\)/);
});

test('the same call written twice gets one note with a count', async () => {
  const host = createMockHost();
  await host.compile();
  const r = await runEval(host, "faces('%plane'); faces('%plane'); return 1;");
  assert.match(r.text, /never awaited \(2×\)/);
});

// ── JIG-006: look() ──────────────────────────────────────────────────────────
import { TOOL_IMAGES } from '../../src/agent/evaltool.js';
const JPEG = '/9j/4AAQSkZJRg==';
const drawingHost = () => {
  const host = createMockHost(), calls = [];
  host.renderView = async o => { calls.push(o); return { mimeType: 'image/jpeg', data: JPEG, width: o.width, height: o.height, view: o.view || 'axo' }; };
  return { host, calls };
};

test('look() attaches a JPEG to the step and says so; at most two per step', async () => {
  const { host, calls } = drawingHost();
  const r = await runEval(host, "const a = await look('front', { width: 800 }); return a;");
  assert.equal(r.error, false, r.text);
  assert.match(r.text, /image 1: front view, 800 × 600 px, \d+ KB, attached after the tool results/);
  assert.deepEqual(r.images, [{ mimeType: 'image/jpeg', data: JPEG }]);
  assert.deepEqual(calls[0], { view: 'front', width: 800, height: 600, overlays: null });
  const three = await runEval(host, 'await look(); await look(); await look();');
  assert.equal(three.error, true);
  assert.match(three.text, /at most 2 images per step/);
  assert.equal(three.images.length, 2, 'the two that were drawn still go');
  const bad = await runEval(host, "await look('iso')");
  assert.match(bad.text, /the view is axo, front, side or plan/);
  const tiny = await runEval(host, 'return await look({ width: 10000, height: 5 })');
  assert.deepEqual([calls.at(-1).width, calls.at(-1).height], [1600, 64]);
  assert.equal(tiny.error, false);
});

test('look() works in read mode; without a drawing host it explains', async () => {
  const { host } = drawingHost();
  const r = await runEval(host, 'return await look()', { readOnly: true });
  assert.equal(r.error, false, r.text);
  const plain = createMockHost();
  const r2 = await runEval(plain, 'return await look()');
  assert.match(r2.text, /look: this workbench cannot draw here/);
});

test('the eval tool returns images with its text so the adapter can send them', async () => {
  const { host } = drawingHost();
  const steps = [];
  const tool = createEvalTool(host, { onStep: s => steps.push(s) });
  const out = await tool.execute({ code: 'return await look()' });
  assert.equal(typeof out, 'object');
  assert.match(out.value, /image 1: axo view/);
  assert.equal(out[TOOL_IMAGES].length, 1);
  assert.equal(steps[0].images, 1);
  const plain = await tool.execute({ code: 'return 1' });
  assert.equal(plain, '1', 'a step without images returns its text as before');
});
