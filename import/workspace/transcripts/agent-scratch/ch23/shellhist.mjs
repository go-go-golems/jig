import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { loadOC } = await import('/home/claude/jigcad/src/engine/oc.js');
const K = await import('/home/claude/jigcad/src/engine/kernel.js');
const { historyOf } = await import('/home/claude/jigcad/src/engine/body.js');
const oc = await loadOC();
const S = await import('/home/claude/jigcad/src/engine/shapes.js');
// rounded-rect box 60x40x30, r=3, shell top by 2
function test(label, shape) {
  const fs = K.subShapes(shape, 'FACE');
  const infos = fs.list.map(f => K.faceInfo(f));
  const top = infos.findIndex(i => i.kind === 'plane' && i.normal[2] > 0.99 && i.center[2] > 1);
  const mk = new oc.BRepOffsetAPI_MakeThickSolid();
  mk.MakeThickSolidByJoin(shape, K.arrayToList([fs.list[top]]), -2, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, new oc.Message_ProgressRange());
  const out = mk.Shape();
  const h = historyOf(mk);
  const nf = K.subShapes(out, 'FACE');
  const viaHist = new Set(), kept = new Set();
  let modTotal = 0, genTotal = 0;
  fs.list.forEach((f, i) => {
    if (i === top) return;
    const j = nf.indexOf(f); if (j >= 0) kept.add(j);
    for (const m of h.modified(f)) { const k = nf.indexOf(m); modTotal++; if (k >= 0 && k !== j) viaHist.add(k); }
    for (const g of h.generated(f)) { const k = nf.indexOf(g); genTotal++; if (k >= 0) viaHist.add(k); }
  });
  console.log(`${label}: input faces ${fs.list.length}, output faces ${nf.list.length}; kept same face ${kept.size}; inner faces found through history ${viaHist.size} (Modified entries ${modTotal}, Generated ${genTotal}); left for geometric matching ${nf.list.length - kept.size - viaHist.size}`);
}
const box = new oc.BRepPrimAPI_MakeBox(new oc.gp_Pnt(-30, -20, 0), new oc.gp_Pnt(30, 20, 30)).Shape();
test('plain box 60x40x30', box);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': `return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2), r: mm(3) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('outline', 'w', 'd', { center: true, r: 'r' }).profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })` } });
console.log('A-01 box faces', r.program.bodies[0].faces.map(f => f.name).filter(n => /inner|face#/.test(n)).length, r.program.bodies[0].faces.length, r.program.bodies[0].faces.map(f=>f.name).filter(n=>/face#/.test(n)));
// rounded rectangle 60x40, r=3, extruded 30
const w = 30, d = 20, rr = 3;
const loop = [
  { kind: 'line', a: [-w + rr, -d], b: [w - rr, -d], src: 'bottom' },
  { kind: 'arc', c: [w - rr, -d + rr], r: rr, a0: -Math.PI / 2, a1: 0, ccw: true, src: 'br' },
  { kind: 'line', a: [w, -d + rr], b: [w, d - rr], src: 'right' },
  { kind: 'arc', c: [w - rr, d - rr], r: rr, a0: 0, a1: Math.PI / 2, ccw: true, src: 'tr' },
  { kind: 'line', a: [w - rr, d], b: [-w + rr, d], src: 'top' },
  { kind: 'arc', c: [-w + rr, d - rr], r: rr, a0: Math.PI / 2, a1: Math.PI, ccw: true, src: 'tl' },
  { kind: 'line', a: [-w, d - rr], b: [-w, -d + rr], src: 'left' },
  { kind: 'arc', c: [-w + rr, -d + rr], r: rr, a0: Math.PI, a1: 1.5 * Math.PI, ccw: true, src: 'bl' },
];
const prof = { frame: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, regions: [{ loops: [loop] }] };
const [p] = S.prism(prof, { id: 'body', dist: 30, offset: 0 });
test('rounded box 60x40x30 r3', p.shape);
