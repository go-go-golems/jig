import { build, tally, K, oc, surfType } from './base.mjs';
const code = `const sec = j.sketch('sec', { on: j.plane.XZ })
  .line('base', [0, 0], [16, 0])
  .line('wall', [16, 0], [16, 6])
  .line('bevel', [16, 6], [12, 12])
  .arc('bead', { center: [8, 12], start: [12, 12], end: [8, 16] })
  .spline('neck', [[8, 16], [5, 19], [6, 26]])
  .arc('dome', { center: [0, 18], start: [6, 26], end: [0, 28] })
  .line('axis', [0, 28], [0, 0])
return j.part('knob')
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'knob' })`;
const t0 = performance.now();
const { bodies, data } = await build(code);
console.log('ms', performance.now() - t0, data.diagnostics.map(d => d.kind + ' ' + d.message));
const b = bodies[0];
console.log(JSON.stringify(tally(b)), b.topology(), data.summary.volume);
b.faces.list.forEach((f, i) => console.log(b.names[i], surfType(f), b.faceInfo(i).kind, b.faceInfo(i).area.toFixed(3), JSON.stringify(b.faceInfo(i).axis ?? b.faceInfo(i).normal)));
console.log(data.sketches[0].profiles.map(p => p.area));
