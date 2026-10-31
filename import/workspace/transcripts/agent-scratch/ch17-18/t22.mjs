import { build, tally, K, oc, surfType, compile, call } from './base.mjs';
const code = `return j.part('p').extrude(j.region.rect(30, 30), mm(20), { taper: deg(-10), id: 'f' })`;
const { bodies } = await build(code);
const b = bodies[0];
b.faces.list.forEach((f, i) => { const t = surfType(f); if (t === 'BSplineSurface') { const ad = new oc.BRepAdaptor_Surface(f, true); const h = ad.BSpline(); const s = h.get ? h.get() : h; const P = []; for (let u = 1; u <= s.NbUPoles(); u++) for (let v = 1; v <= s.NbVPoles(); v++) { const p = s.Pole(u, v); P.push([p.X(), p.Y(), p.Z()]); }
  // plane through first three, distance of 4th
  const n = K.V.unit(K.V.cross(K.V.sub(P[1], P[0]), K.V.sub(P[2], P[0])));
  const dmax = Math.max(...P.map(q => Math.abs(K.V.dot(K.V.sub(q, P[0]), n))));
  console.log(b.names[i], 'deg', s.UDegree(), s.VDegree(), 'poles', s.NbUPoles(), s.NbVPoles(), 'maxdev from plane', dmax.toExponential(2), 'faceInfo', b.faceInfo(i).kind, JSON.stringify(b.faceInfo(i).normal)); ad.delete(); } });
await compile(code);
for (const q of ['%plane', 'not %plane']) { const f = await call('faces', q); console.log(q, f.ok ? f.value.map(x => x.name + ':' + x.kind) : f.error.message); }
