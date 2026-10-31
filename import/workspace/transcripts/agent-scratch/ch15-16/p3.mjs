import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { sketch } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
for (const d of [48.9, 48.94, 48.96, 48.97, 48.98]) {
  const sol = sketch('n', { mode: 'explicit' }).circle('big', 50).circle('small', 1, { at: [-d, 0] }).solve();
  console.log(`small circle at x = -${d} (gap to big circle ${(50 - d - 1).toFixed(3)} mm):`, sol.arrangement.profiles.map(p => `${p.id} ${p.area.toFixed(4)}`).join(' · '));
}
