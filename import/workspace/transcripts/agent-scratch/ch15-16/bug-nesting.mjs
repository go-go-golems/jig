// A hole within ~0.05 mm of an arc boundary is not nested: containment is tested on the sampled display polygon.
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { sketch } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
for (const d of [48.94, 48.96]) {
  const sol = sketch('n').circle('big', 50).circle('small', 1, { at: [-d, 0] }).solve();
  console.log(`hole ${(50 - d - 1).toFixed(2)} mm inside the rim:`, sol.arrangement.profiles.map(p => `${p.id} ${p.area.toFixed(2)}`).join(' · '));
}
// 0.06 mm: big∖{small} 7850.84 (right) · 0.04 mm: big 7853.98 · small 3.14 (the hole is lost; an extrude fills it)
