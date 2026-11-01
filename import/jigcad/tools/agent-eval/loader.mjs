// Module hooks for running workbench modules (Host, agent) in Node: .json and .md files load as default exports
// (the browser bundle inlines them), and the engine tests' core.js shim still applies. Register before importing src/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export { resolve } from '../../test/engine/loader.mjs';

export async function load(url, context, next) {
  if (url.startsWith('file:') && /\.(json|md)$/.test(new URL(url).pathname)) {
    const text = await readFile(fileURLToPath(url), 'utf8');
    const value = url.endsWith('.json') ? text : JSON.stringify(text);
    return { format: 'module', source: `export default ${value};`, shortCircuit: true };
  }
  return next(url, context);
}
