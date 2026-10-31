import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { sketch } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
const sol = sketch('x').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).circle('c', 10 * Math.SQRT2, { at: [40, 10] }).solve();
const f = v => +v.toFixed(4);
for (const p of sol.arrangement.profiles) console.log(p.area.toFixed(6), p.segments[0].map(s => s.kind === 'line' ? `line (${s.a.map(f)})→(${s.b.map(f)}) ${s.src}` : `arc ${s.src} (${s.a.map(f)})→(${s.b.map(f)}) a0 ${f(s.a0*180/Math.PI)} a1 ${f(s.a1*180/Math.PI)} ccw ${s.ccw}`).join(' | '));
