import { build, tally, oc } from './base.mjs';
const { bodies, data } = await build("return j.part('p').extrude(j.region.rect(20, 10), mm(5))");
console.log(data.summary.volume, bodies.map(tally));
const t = oc.GeomAbs_SurfaceType.GeomAbs_Plane; console.log(t, String(t), t?.constructor?.name, Object.keys(oc.GeomAbs_SurfaceType));
