// faceInfo takes a plane's normal from gp_Pln.Axis() and flips it only for REVERSED faces; a revolve's cap
// sits on a left-handed gp_Ax3, so its outward normal comes out reversed: '-Z' finds nothing, '+Z' finds both caps.
import { compile, call } from './base.mjs';
await compile(`const sec = j.sketch('sec', { on: j.plane.XZ })
  .polyline('p', [[0, 0], [16, 0], [16, 6], [0, 6]], { closed: true })
return j.part('disc').revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'd' })`);
for (const q of ['-Z', '+Z']) { const f = await call('faces', q); console.log(q, f.value.map(x => `${x.name} ${JSON.stringify(x.normal)}`)); }
