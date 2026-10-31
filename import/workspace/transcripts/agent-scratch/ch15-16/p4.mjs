import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { sketch } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
for (const r of [4.999, 4.99999, 4.999997, 5, 5.000003, 5.00001, 5.0001, 5.001]) {
  const sol = sketch('s').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).circle('c', r, { at: [20, 15] }).solve();
  const A = sol.arrangement;
  console.log(`r=${r}: V ${A.vertices} E ${A.edges} faces ${A.faces} comps ${A.components} | ` + A.profiles.map(p => `${p.id} ${p.area.toPrecision(7)} (depth ${p.depth})`).join(' · '));
}
