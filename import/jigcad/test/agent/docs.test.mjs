// The documentation registry (JIG-012 phase 3): every name of the agent's scope has a record, every record names
// something in the scope, the reference's table is rendered from it, and help() answers from it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCOPE_DOCS, scopeNames, scopeTable, renderReference, SCOPE_MARKER } from '../../src/agent/docs.js';
import { parseLangDocs } from '../../src/agent/langdocs.js';
import { labScope } from '../../src/agent/scope.js';
import { runEval } from '../../src/agent/evaltool.js';
import { createNodeSandbox } from '../../src/agent/sandbox/node.js';
import { runInSandbox } from '../../src/agent/sandbox/client.js';
import { makeJ } from '../../src/engine/j.js';
import { createMockHost } from './mock-host.js';

const fresh = async () => { const h = createMockHost({ delay: 0 }); await h.compile(); return h; };
const paths = scope => Object.entries(scope).flatMap(([k, v]) => k === 'host' ? [] :
  v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && k !== 'console' ? Object.keys(v).filter(k2 => typeof v[k2] === 'function').map(k2 => `${k}.${k2}`) : [k]);

test('every scope name has a record; every record names something in the scope', async () => {
  const host = await fresh();
  const page = paths(labScope(host, {}));
  // the sandbox adds the language (j, data and the bare units: those are documented in the language reference), help
  const { bare } = makeJ();
  const all = new Set([...page, 'j', 'data', 'help', 'log', 'console']);
  const documented = new Set(scopeNames());
  assert.deepEqual(page.filter(p => !documented.has(p)), [], 'scope names without a record');
  assert.deepEqual([...documented].filter(p => !all.has(p)), [], 'records naming nothing');
  const lang = parseLangDocs(readFileSync(new URL('../../content/docs/reference.md', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(bare).filter(u => !lang.bare.has(u)), [], 'units without a line in the language reference');
});

test('the reference renders its scope table from the registry', () => {
  const md = readFileSync(new URL('../../src/agent/reference.md', import.meta.url), 'utf8');
  assert.ok(md.includes(SCOPE_MARKER));
  const r = renderReference(md);
  assert.ok(!r.includes(SCOPE_MARKER));
  assert.ok(r.includes('| files | `files.list()` |'));
  assert.equal(scopeTable().split('\n').length, SCOPE_DOCS.length + 2);
});

const sb = createNodeSandbox();
after(() => sb.close());

test('help() answers from the registry and the language reference', async () => {
  const host = await fresh();
  const run = async c => (await runInSandbox(sb, host, c)).text;
  assert.match(await run('return help()'), /files: files\.\{list, read, grep, edit, write, rename, remove\}/);
  assert.match(await run('return help(files.read)'), /^files\.read\(path, from\?, to\?\)\n {2}the whole file/);
  assert.match(await run("return help('check')"), /live/);
  assert.match(await run('return help(j.fit)'), /j\.fit\.hole: modelled hole/);
  assert.match(await run("return help('j.fit.hole')"), /Example: j\.fit\.hole\(mm\(3\), 'slide'\)/);
  assert.match(await run('return help(mm)'), /lengths, canonical unit mm/);
  assert.match(await run("return help(j.part('box'))"), /\(a part\)\. Its methods:\n.*\n[\s\S]*\.extrude\(\): extent/);
  assert.match(await run("return help('chek')"), /Nearest: check/);
  assert.match(await run('return files.reed'), /help\('files'\) says what each does/);
  assert.match(await run('return j.fit.hol'), /help\('j\.fit'\) says what each does/);
  // the page has the scope's records; the language is the sandbox's
  assert.match((await runEval(host, 'return help(files.read)')).text, /^files\.read/);
});

test('the awaited names are exactly the asynchronous ones (JIG-013): the bridged calls, check, and nothing else', async () => {
  const { awaitedNames } = await import('../../src/agent/docs.js');
  const { BRIDGED } = await import('../../src/agent/sandbox/serve.js');
  // a bridged call crosses to the page, so it returns a Promise in the sandbox; file edits apply locally first
  const async = new Set([...BRIDGED.filter(p => !p.startsWith('files.')), 'check']);
  assert.deepEqual([...new Set(awaitedNames())].sort(), [...async].sort());
  assert.ok(scopeTable().includes('`await run()`') && scopeTable().includes('`await check(variant?, options?)`'));
  const host = await fresh();
  assert.match((await runInSandbox(sb, host, "return help('run')")).text, /^await run\(\)/);
});
