// Shared by parity.mjs and bench.mjs: compile presets with the real engine and return their ProgramData.
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
register(new URL('../engine/loader.mjs', import.meta.url).href);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const W = await import('../../src/engine/worker.js');
export async function init() { return (await W.handle({ id: 0, op: 'init' })); }
export async function compilePreset(id) {
  const dir = join(ROOT, 'content/presets', readdirSync(join(ROOT, 'content/presets')).find(d => d.startsWith(id)));
  const files = {};
  for (const f of readdirSync(dir)) if (f !== 'meta.json') files[f] = readFileSync(join(dir, f), 'utf8');
  const r = await W.handle({ id: 1, op: 'compile', files, options: {} });
  if (!r.ok) throw new Error(`${id}: ${r.error.message}`);
  return r.program;
}
