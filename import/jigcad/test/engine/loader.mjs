// Node module hooks for the engine tests: until core's src/engine/core.js lands, './core.js' resolves to a
// test shim assembled from core's finished modules. Registered by run.mjs via module.register().
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function resolve(specifier, context, next) {
  if (specifier === './core.js' && context.parentURL?.includes('/src/engine/')) {
    const real = new URL('./core.js', context.parentURL);
    if (!existsSync(fileURLToPath(real))) return { url: new URL('./core-shim.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
