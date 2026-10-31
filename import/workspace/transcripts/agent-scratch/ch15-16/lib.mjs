import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
let id = 1;
export async function compile(code) {
  const r = await W.handle({ id: id++, op: 'compile', entry: 'script.js', files: { 'script.js': code } });
  if (!r.ok) throw new Error(r.error?.message);
  return r.program;
}
export async function drag(sketchId, ref, to) {
  const r = await W.handle({ id: id++, op: 'solveSketch', sketchId, drag: { ref, to } });
  if (!r.ok) throw new Error(r.error?.message);
  return r.sketch;
}
export async function ir(node) {
  const d = await W.handle({ id: id++, op: 'call', method: 'ir', args: ['L3', { node }] });
  return d.value;
}
export const f = v => +(+v).toFixed(4);
export function ents(sk) {
  return sk.entities.map(e => e.kind === 'line' ? `${e.id} (${e.a.map(f)})→(${e.b.map(f)})` :
    e.kind === 'point' ? `${e.id} (${e.p.map(f)})` : e.kind === 'circle' ? `${e.id} c(${e.c.map(f)}) r${f(e.r)}` :
    e.kind === 'arc' ? `${e.id} c(${e.c.map(f)}) r${f(e.r)} a ${f(e.a0*180/Math.PI)}..${f(e.a1*180/Math.PI)}` : `${e.id} ${e.kind}`).join('\n');
}
