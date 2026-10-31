// harness.mjs · a tiny test runner for plain node scripts (node:assert).
import assert from 'node:assert/strict';
export { assert };
const results = globalThis.__coreResults ??= { pass: 0, fail: 0, failures: [] };
export function test(name, fn) {
  try { fn(); results.pass++; console.log(`  ok   ${name}`); }
  catch (e) { results.fail++; results.failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`); }
}
export const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
export function summary() { return results; }
