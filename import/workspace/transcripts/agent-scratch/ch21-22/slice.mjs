import { prog, K } from './h.mjs';
import { readFileSync } from 'node:fs';
const I = await import('/home/claude/jigcad/src/engine/inspect.js');
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const code = readFileSync('/home/claude/jigcad/src/engine/print.js', 'utf8');
const s = code.indexOf('function meshSection'), e = code.indexOf('// Split-to-fit');
const meshSection = new Function(code.slice(s, e) + '; return meshSection;')();
const pr = await prog(`return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })`);
const { body } = pr.kernelBodies()[0];
const tris = I.meshTris(M.meshBody(body));
for (const z of [1.5, 3.1, 3.5, 8]) {
  const ml = meshSection(tris, z), mp = I.loopsProps(ml);
  const bl = I.sectionLoops(body.shape, [0, 0, z], [0, 0, 1], { deflection: 0.05 }).loops, bp = I.loopsProps(bl);
  let exact;
  if (z < 3) exact = 900; else if (z < 4) { const r = 3.5 - Math.sqrt(1 - (z - 4) ** 2); exact = Math.PI * r * r; } else exact = Math.PI * 6.25;
  console.log('z', z, 'mesh loops', ml.length, ml.map(l => l.length).join('/'), 'area', mp.area.toFixed(5), '| brep loops', bl.length, bl.map(l => l.length).join('/'), 'area', bp.area.toFixed(5), '| exact', exact.toFixed(5));
}
// a gear: mesh section vs brep section
const g = await prog(`return j.lib.gear.spur({ module: mm(1), teeth: 24, width: mm(4) }).hole([[0, 0]], j.hole.simple(mm(5.3)), { id: 'bore' })`);
const gb = g.kernelBodies()[0].body;
const gt = I.meshTris(M.meshBody(gb));
const bb = gb.bbox(); console.log('gear bbox z', bb[0][2], bb[1][2], 'faces', gb.nFaces, 'tris', gt.length, 'vol', gb.volume());
const z = (bb[0][2] + bb[1][2]) / 2;
let t0 = performance.now();
const ml = meshSection(gt, z), mp = I.loopsProps(ml); const tm = performance.now() - t0;
t0 = performance.now();
const bl = I.sectionLoops(gb.shape, [0, 0, z], [0, 0, 1], { deflection: 0.05 }).loops, bp = I.loopsProps(bl); const tb = performance.now() - t0;
console.log('gear z', z, 'mesh', ml.length, 'loops', mp.area.toFixed(4), 'mm2', tm.toFixed(1), 'ms | brep', bl.length, 'loops', bp.area.toFixed(4), 'mm2', tb.toFixed(1), 'ms | vol/height', (gb.volume() / (bb[1][2] - bb[0][2])).toFixed(4), 'regions/holes', mp.regions, mp.holes);
