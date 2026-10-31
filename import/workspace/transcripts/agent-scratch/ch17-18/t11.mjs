import { build, tally, K, oc, surfType, curveType } from './base.mjs';
const { bodies, data } = await build(`return j.part('s').extrude(j.region.text('S', { size: 20 }), mm(3), { id: 'txt' })`);
const b = bodies[0];
console.log(JSON.stringify(tally(b)), data.summary.volume);
// degrees of Bezier edges
const deg = {};
b.edges.list.forEach(e => { const ad = new oc.BRepAdaptor_Curve(e); if (curveType(e) === 'BezierCurve') { const bz = ad.Bezier(); const d = bz.get ? bz.get().Degree() : bz.Degree(); deg[d] = (deg[d] ?? 0) + 1; } ad.delete(); });
console.log('bezier degrees', deg);
// face info kinds and names
console.log(data.bodies[0].faces.slice(0, 5).map(f => f.kind + ' ' + f.name + ' ' + f.area.toFixed(3)));
