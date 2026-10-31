import { build, tally, K, oc, surfType } from './base.mjs';
const code = `const sec = j.sketch('sec', { on: j.plane.XZ })
  .line('base', [0, 0], [16, 0])
  .line('wall', [16, 0], [16, 6])
  .line('top', [16, 6], [0, 6])
  .line('axis', [0, 6], [0, 0])
return j.part('disc')
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'd' })`;
const { bodies, data } = await build(code);
const b = bodies[0];
b.faces.list.forEach((f, i) => { const fi = b.faceInfo(i); console.log(b.names[i], fi.kind, JSON.stringify(fi.normal), 'orient', f.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? 'REV' : 'FWD', JSON.stringify(K.normalMidUV(f))); });
console.log('vol', b.volume());
const ext = await build(`return j.part('e').extrude(j.region.circle(16), mm(6), { id: 'e' })`);
const e = ext.bodies[0];
e.faces.list.forEach((f, i) => { const fi = e.faceInfo(i); console.log(e.names[i], fi.kind, JSON.stringify(fi.normal)); });
console.log(data.bodies[0].faces.map(f => f.name + ' ' + JSON.stringify(f.normal)));
