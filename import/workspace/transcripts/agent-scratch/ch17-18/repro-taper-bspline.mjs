// A tapered extrude of a polygon stores its flat sides as degree-1 B-spline patches (ThruSections, ruled), so
// faceInfo calls them 'bspline': '%plane' misses them and the interference check and slicer treat the body as freeform.
import { compile, call } from './base.mjs';
await compile(`return j.part('p').extrude(j.region.rect(30, 30), mm(20), { taper: deg(-10), id: 'f' })`);
for (const q of ['%plane', 'not %plane']) { const f = await call('faces', q); console.log(q, f.value.map(x => `${x.name}:${x.kind}`)); }
