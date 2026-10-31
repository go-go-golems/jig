import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
let id = 1;
export async function compile(code) {
  const r = await W.handle({ id: id++, op: 'compile', entry: 'script.js', files: { 'script.js': code }, options: {} });
  return r;
}
export async function ir(node) {
  const d = await W.handle({ id: id++, op: 'call', method: 'ir', args: ['L3', { node }] });
  return d?.value;
}
