import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
let n = 1;
export async function compile(src, options = {}) {
  const r = await W.handle({ id: n++, op: 'compile', entry: 'script.js', files: { 'script.js': src }, options });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.program;
}
export const call = async (method, ...args) => { const r = await W.handle({ id: n++, op: 'call', method, args }); if (!r.ok) throw new Error(r.error.message); return r.value; };
export const exp = async (format, options) => { const r = await W.handle({ id: n++, op: 'export', format, options }); if (!r.ok) throw new Error(r.error.message); return r; };
export const P = await import('/home/claude/jigcad/src/engine/program.js');
export const K = await import('/home/claude/jigcad/src/engine/kernel.js');
export const { getOC } = await import('/home/claude/jigcad/src/engine/oc.js');
// compile to a Program object with kernel bodies
export async function prog(src, opts = {}) {
  const model = await W.runScript(src);
  return P.compile(model, { mesh: true, ...opts });
}
