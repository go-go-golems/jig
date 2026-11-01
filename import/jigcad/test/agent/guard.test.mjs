// Guard proxies (JIG-012 phase 2): a name a namespace does not have is an error at the read, with the nearest
// names; probes (await, JSON, Symbol.*) and real members pass through.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { guard, closest } from '../../src/engine/guard.js';
import { makeJ } from '../../src/engine/j.js';
import { createNodeSandbox } from '../../src/agent/sandbox/node.js';
import { runInSandbox } from '../../src/agent/sandbox/client.js';
import { runEval } from '../../src/agent/evaltool.js';
import { createMockHost } from './mock-host.js';

test('closest: typos, case, prefixes; nothing for a far name', () => {
  assert.deepEqual(closest('hol', ['hole', 'pin', 'gap']), ['hole']);
  assert.deepEqual(closest('Faces', ['faces', 'edges']), ['faces']);
  assert.deepEqual(closest('rotat', ['rotate', 'move', 'scale']), ['rotate']);
  assert.deepEqual(closest('zebra', ['hole', 'pin']), []);
});

test('a guarded namespace: errors that teach, probes that pass, frozen members', () => {
  const ns = Object.freeze({ hole: () => 1, inner: Object.freeze({ a: 1 }) });
  const g = guard(ns, 'ns');
  assert.equal(g.hole(), 1);
  assert.equal(g.inner.a, 1);
  assert.throws(() => g.hol, /^TypeError: ns\.hol does not exist\. Did you mean ns\.hole\? \(ns has: hole, inner\)$/);
  assert.throws(() => g.inner.b, /ns\.inner\.b does not exist/);
  assert.equal(g.then, undefined);
  assert.equal(JSON.stringify(g), '{"inner":{"a":1}}');
  assert.deepEqual(Object.keys(g), ['hole', 'inner']);
  assert.equal('hol' in g, false);
  assert.deepEqual({ ...g }.hole(), 1);
});

test('j is guarded; j.mm points at the bare unit; a name elsewhere in j is named', () => {
  const { j, bare } = makeJ();
  assert.throws(() => j.fit.hol, /Did you mean j\.fit\.hole\?/);
  assert.throws(() => j.mm, /mm is not under j: units and unit functions are in scope on their own, as mm\(…\)/);
  assert.throws(() => j.fit.faces, /faces is j\.sel\.faces/);
  assert.equal(String(j.fit.hole(bare.mm(6), 'press')), 'j.fit.hole(6 mm, press)');
});

const sb = createNodeSandbox();
after(() => sb.close());
const fresh = async () => { const h = createMockHost({ delay: 0 }); await h.compile(); return h; };

test('the scope namespaces are guarded on the page and in the sandbox', async () => {
  const host = await fresh();
  for (const run of [async c => (await runEval(host, c)).text, async c => (await runInSandbox(sb, host, c)).text]) {
    assert.match(await run("return files.reed('script.js')"), /^TypeError: files\.reed does not exist\. Did you mean files\.read\?/);
    assert.match(await run('return files.check()'), /In scope on its own: check\(…\)/);
    assert.match(await run("return files.read('script.js').length > 0"), /^true$/);
  }
  assert.match((await runInSandbox(sb, host, 'const r = await check(); return r.program.bodys()')).text, /check\(\)\.program\.bodys does not exist\. Did you mean check\(\)\.program\.bodies\?/);
  assert.match((await runInSandbox(sb, host, 'return data.missing ?? "none"')).text, /^none$/);
});

test('hints: not defined, a value without the method, a read of undefined, NaN', async () => {
  const host = await fresh();
  const sbx = async c => (await runInSandbox(sb, host, c)).text;
  assert.match(await sbx('return box(1, 1, 1)'), /note: box is j\.box\./);
  assert.match(await sbx('return fles.read("script.js")'), /note: did you mean files\?/);
  assert.match(await sbx('return myPart'), /Steps do not share variables/);
  assert.match(await sbx("return j.part('x').extrud(1)"), /j\.part\(\.\.\.\)\.extrud|has no \.extrud\(\)\. .*\.extrude\(\) \(part\)/);
  assert.match(await sbx("const r = await check('syntax error here('); return r.summary.name"), /r\.summary is undefined\. check\(\) and run\(\) give summary/);
  assert.match(await sbx('const o = {}; return o.a.b'), /note: o\.a is undefined on line 1, so \.b cannot be read/);
  assert.match(await sbx('return { v: mm(1) * undefined }'), /note: NaN in the result/);
  // the page has no j: the note still points at the scope
  assert.match((await runEval(host, 'return fles')).text, /did you mean files\?/);
});
