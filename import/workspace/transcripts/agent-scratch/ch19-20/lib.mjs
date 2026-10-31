import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const W = await import('/home/claude/jigcad/src/engine/worker.js');
export const P = await import('/home/claude/jigcad/src/engine/program.js');
export const K = await import('/home/claude/jigcad/src/engine/kernel.js');
export const B = await import('/home/claude/jigcad/src/engine/body.js');
export const O = await import('/home/claude/jigcad/src/engine/ops.js');
const { getOC } = await import('/home/claude/jigcad/src/engine/oc.js');
await W.handle({ id: 0, op: 'init' });
export const oc = getOC();
export async function build(code) {
  const model = await W.runScript(code);
  const prog = P.compile(model);
  prog.keep();
  return prog;
}
export const r6 = x => Math.round(x * 1e6) / 1e6;
export const pt = p => `(${p.map(x => r6(x)).join(', ')})`;
export const orient = s => ['F', 'R', 'I', 'E'][s.Orientation().value ?? s.Orientation()] ;
