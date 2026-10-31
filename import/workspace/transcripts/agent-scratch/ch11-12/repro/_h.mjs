import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
export const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
export async function run(code) {
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': code } });
  for (const d of r.program?.diagnostics || []) console.log(' ', d.level, d.kind, d.message, d.fix ? '· fix: ' + d.fix : '');
  for (const s of r.program?.sketches || []) console.log('  sketch', s.id, s.status, 'dof', s.dof, 'rank', s.rank);
}
