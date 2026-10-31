import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { sketch, c } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
const { polyArea } = await import('/home/claude/jigcad/src/engine/sketch/geom2d.js');
export function show(name, sk) {
  const sol = sk.solve();
  const A = sol.arrangement;
  console.log(`== ${name}: vertices ${A.vertices}, edges ${A.edges}, faces ${A.faces}, components ${A.components}, pruned ${A.pruned}`);
  for (const p of A.profiles) console.log(`   ${p.id}: area ${p.area.toFixed(6)} depth ${p.depth} loops ${p.loops.length} polyArea ${p.loops.reduce((s, L, i) => s + (i ? -1 : 1) * Math.abs(polyArea(L)), 0).toFixed(6)} segs ${p.segments.map(L => L.map(s => s.kind).join('+')).join(' | ')}`);
  return sol;
}
const tab = sketch('tab').line('b', [0, 0], [40, 0]).arc('end', { center: [40, 10], start: [40, 0], end: [40, 20] })
  .line('t', [40, 20], [0, 20]).line('l', [0, 20], [0, 0]).circle('h', 4, { at: [40, 10] });
show('tab', tab);
const cross = sketch('x').rect('r', 40, 20).circle('c', 10 * Math.SQRT2, { at: [40, 10] });
show('rect x circle', sketch('x', { mode: 'explicit' }).polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).circle('c', 10 * Math.SQRT2, { at: [40, 10] }));
show('concentric', sketch('o').circle('a', 20).circle('b', 14).circle('c', 8));
show('two circles', sketch('o').circle('a', 10).circle('b', 10, { at: [12, 0] }));
show('spur', sketch('s').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).line('spur', [20, 20], [20, 30]));
show('chord', sketch('s').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).line('k', [10, 0], [10, 20]));
show('open', sketch('s').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]]));
show('touch inside', sketch('s').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).circle('c', 5, { at: [20, 15] }));
show('apart inside', sketch('s').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).circle('c', 4.999, { at: [20, 15] }));
show('shared edge', sketch('s').polyline('a', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).polyline('b', [[40, 0], [70, 0], [70, 20], [40, 20]], { closed: true }));
show('ellipse', sketch('s').ellipse('e', 10, 5));
