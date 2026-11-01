// The message lint (JIG-012 phase 0; pattern from factory-videos' test_fx_lint): call every function of the agent's
// scope with the junk models send, and read what comes back. A model learns from the message, so a message must name
// the call and must not be the implementation talking (NaN, "Cannot read properties", "is not a function",
// "[object Object]"). No model is involved. Offenders known when the lint was written are listed in KNOWN; the test
// fails on a new one, and on a KNOWN entry that has been fixed (so the list only shrinks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labScope } from '../../src/agent/scope.js';
import { createMockHost } from './mock-host.js';

export const JUNK = [[], [undefined], [null], [''], [42], [{}], [[]], ['no-such-thing'], ['no-such-thing', 'x', 'y']];
const BAD = [/NaN/, /Cannot read propert/, /is not a function/, /undefined is not/, /\[object Object\]/, /is not iterable/, /Unexpected token/];

// functions that change the workbench or reach out are linted too: the mock host keeps it all in memory
const SKIP = new Set(['look', 'lab.follow', 'exportFile']);   // need a renderer / a link handler / a saver

function walk(scope) {
  const out = [];
  for (const [k, v] of Object.entries(scope)) {
    if (k === 'console' || k === 'log') continue;
    if (typeof v === 'function') out.push([k, v]);
    else if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'function') out.push([`${k}.${k2}`, v2]);
  }
  return out;
}

export async function lintScope(makeScope) {
  const offenders = new Map();   // path → first bad message
  for (const [path] of walk(await makeScope())) {
    if (SKIP.has(path)) continue;
    const verb = path.split('.').pop();
    for (const args of JUNK) {
      const scope = await makeScope();   // fresh host per call: a junk write must not affect the next call
      const fn = path.includes('.') ? scope[path.split('.')[0]][verb] : scope[path];
      let msg = null;
      try { await fn(...args); } catch (e) { msg = String(e && e.message || e); }
      if (msg == null) continue;
      const bad = BAD.find(re => re.test(msg));
      const named = msg.includes(path) || msg.includes(verb);
      if (bad || !named) { if (!offenders.has(path)) offenders.set(path, `${JSON.stringify(args)} → ${msg.slice(0, 140)}`); break; }
    }
  }
  return offenders;
}

// What the lint found when it was written (2026-11-01); phase 2 empties this list.
export const KNOWN = new Set(['faces', 'feature', 'sketch', 'select', 'view.set', 'presets.create', 'presets.rename', 'presets.load', 'measure.face', 'measure.edge', 'measure.bbox']);

test('every scope function answers junk with a message that names the call', async () => {
  const offenders = await lintScope(async () => { const host = createMockHost({ delay: 0 }); await host.compile(); return labScope(host, {}); });
  const fresh = [...offenders.keys()].filter(p => !KNOWN.has(p));
  const fixed = [...KNOWN].filter(p => !offenders.has(p));
  if (offenders.size) console.log('lint offenders:\n' + [...offenders].map(([p, m]) => `  ${p}: ${m}`).join('\n'));
  assert.deepEqual(fresh, [], 'new offenders');
  assert.deepEqual(fixed, [], 'fixed: remove them from KNOWN');
});
