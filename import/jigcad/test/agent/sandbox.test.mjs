// The agent's sandbox (JIG-012) in Node: a worker_threads Worker with its own engine, bridged to a host for workbench
// calls. The page side is the mock host (test/agent/mock-host.js); the sandbox side is the real engine.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeSandbox } from '../../src/agent/sandbox/node.js';
import { runInSandbox } from '../../src/agent/sandbox/client.js';
import { createEvalTool } from '../../src/agent/evaltool.js';
import { createMockHost } from './mock-host.js';

const sb = createNodeSandbox();
after(() => sb.close());
const fresh = async () => { const h = createMockHost({ delay: 0 }); await h.compile(); return h; };
const run = async (host, code, o) => (await runInSandbox(sb, host, code, o)).text;

test('the language is in scope, and check() gives a live program of the current files', async () => {
  const host = await fresh();
  assert.equal(await run(host, "return String(j.fit.hole(mm(6), 'press'))"), 'j.fit.hole(6 mm, press)');
  const t = await run(host, "const r = await check(); return { ok: r.ok, volume: r.metrics.volume, name: r.summary.name, planes: (await r.program.faces('%plane')).length }");
  assert.match(t, /^ok: true\nvolume: 1\d+\.?\d*\nname: box\nplanes: \d+$/);
  // a variant: nothing on the page changes
  const v = await run(host, "const r = await check(files.read('script.js').replace('wall: mm(2)', 'wall: mm(3)')); return r.metrics.volume > (await check()).metrics.volume");
  assert.equal(v, 'true');
  assert.match(host.files.get('script.js'), /wall: mm\(2\)/);
});

test('sync calls stay sync (the mirror); file changes reach the page in order', async () => {
  const host = await fresh();
  assert.equal(await run(host, "return files.read('script.js').split('\\n').length > 3"), 'true');
  assert.equal(await run(host, 'return program.summary().name'), 'box');
  const t = await run(host, "files.edit('script.js', 'wall: mm(2)', 'wall: mm(2.4)'); return files.read('script.js').includes('mm(2.4)')");
  assert.equal(t, 'true');
  assert.match(host.files.get('script.js'), /wall: mm\(2\.4\)/, 'the page has the edit');
  // run() compiles on the page; the mirror's program follows
  const r = await run(host, "const r = await run(); return { ok: r.ok, same: program.summary().volume === r.summary.volume }");
  assert.equal(r, 'ok: true\nsame: true');
});

test('read-only mode is enforced on both sides', async () => {
  const host = await fresh();
  const t = await run(host, "files.edit('script.js', 'wall', 'w')", { readOnly: true });
  assert.match(t, /^Error: read-only mode: files\.edit is off/);
  assert.match(await run(host, 'await run()', { readOnly: true }), /read-only mode: run is off/);
  assert.match(host.files.get('script.js'), /wall: mm\(2\)/);
  assert.match(await run(host, 'const r = await check(); return r.ok', { readOnly: true }), /^true$/, 'check() changes nothing, so it runs');
});

test('errors keep their line; functions cannot cross to the page; globals do not leak', async () => {
  const host = await fresh();
  assert.match(await run(host, "const a = 1;\nawait files.edit('script.js', 'nope', 'x');"), /^Error: edit: text not found in script\.js .*\(line 2\)$/);
  assert.match(await run(host, "await params.set('wall', () => 3)"), /params\.set: functions cannot be sent to the workbench/);
  await run(host, 'globalThis.kept = 1; return 1');
  assert.equal(await run(host, 'return typeof globalThis.kept'), 'undefined');
});

test('a runaway step restarts the sandbox; the next step works', async () => {
  const host = await fresh();
  assert.match(await run(host, 'while (true) {}', { timeoutMs: 1500 }), /^Error: eval timed out after 1\.5 s; the sandbox restarted/);
  assert.equal(await run(host, 'return 2 + 2'), '4');
});

test('the eval tool runs its steps in the sandbox when it has one', async () => {
  const host = await fresh();
  const tool = createEvalTool(host, { sandbox: sb });
  assert.equal(await tool.execute({ code: "return String(mm(3).add(mm(2)))" }), '5 mm');
  const pageTool = createEvalTool(host, {});
  assert.match(await pageTool.execute({ code: 'return mm(1)' }), /^ReferenceError: mm is not defined/);
});

test('one result shape: summary as program.summary(), plain metrics, logs from the script (JIG-012 phase 4)', async () => {
  const host = await fresh();
  const same = await run(host, 'const r = await check(); return JSON.stringify(r.summary) === JSON.stringify(r.program.summary()) && JSON.stringify((await run()).summary) === JSON.stringify(program.summary())');
  assert.equal(same, 'true');
  assert.match(await run(host, 'return typeof program.metrics().volume'), /^number$/);
  assert.match(await run(host, "return program.metrics('volume', { detail: true }).volume.fidelity"), /^exact$/);
  assert.match(await run(host, 'return Object.keys(program.bodies()[0])'), /- faceCount\n- edgeCount/);
  const logged = await run(host, "const r = await check(files.read('script.js').replace('return box', 'log(\"wall\", mm(2).add(mm(0.4)), { n: 3 })\\nreturn box')); return r.logs");
  assert.equal(logged, '- "wall 2.4 mm {\\"n\\":3}"');
  const failed = await run(host, "const r = await check('log(\"before\")\\nthrow new Error(\"no\")'); return { ok: r.ok, logs: r.logs }");
  assert.match(failed, /ok: false\nlogs:\n {2}- before/);
  assert.match(await run(host, 'return { v: program.metrics().volume.value }'), /note: NaN or undefined in the result: program\.metrics\(\) and check\(\)\.metrics give plain numbers/);
});

test('the language is the engine\'s own j: members of its functions and its guard survive', async () => {
  const host = await fresh();
  assert.equal(await run(host, "return typeof j.frame.on + ' ' + typeof j.q.sin"), 'function function');
  assert.match(await run(host, 'return j.bx'), /^TypeError: j\.bx does not exist\. Did you mean j\.box/);
  assert.equal(await run(host, 'return Math.round(j.q.sin(deg(30)) * 1e6) / 1e6'), '0.5');
});

test('reads are synchronous in the sandbox (JIG-013): the shadow of the page\'s program, and check()\'s program', async () => {
  const host = await fresh();
  assert.equal(await run(host, "return faces('%plane').length > 0 && !(faces('%plane') instanceof Promise)"), 'true');
  assert.equal(await run(host, "return faces().length === faces('*').length && faces().length >= faces('%plane').length && faces('').length === faces().length"), 'true');
  assert.match(await run(host, "return why('>Z').kind"), /^faces$/);
  assert.equal(await run(host, "return typeof feature('body').id"), 'string');
  assert.equal(await run(host, "return params.get('wall').text"), '2 mm');
  assert.equal(await run(host, "return measure.area('%plane').faces > 0"), 'true');
  assert.equal(await run(host, "return faces(j.sel.faces('>Z')).length === faces('>Z').length"), 'true');
  assert.equal(await run(host, "const r = await check(); return r.program.faces('%plane').length === faces('%plane').length"), 'true');
  // await on a value is harmless
  assert.equal(await run(host, "return (await faces('%plane')).length > 0"), 'true');
  // after run() the reads follow the page's new compile
  const t = await run(host, "const before = faces('>Z')[0].center[2]; files.edit('script.js', 'h: mm(30)', 'h: mm(20)'); await run(); return [before, faces('>Z')[0].center[2]]");
  assert.equal(t, '[30, 20]');
});
