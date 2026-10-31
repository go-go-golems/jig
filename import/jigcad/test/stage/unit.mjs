// unit.mjs: the stage's geometry without a browser: mesh topology, the depth buffer, hidden-line classification,
// silhouettes and picking on the fixtures. usage: node test/stage/unit.mjs
import assert from 'node:assert/strict';
const runs = [];
globalThis.Path2D = class { constructor() { this.n = 0; } moveTo() { this.n++; } lineTo() {} closePath() {} };
const F = await import('./fixtures.js');
const { sceneOf, meshTopology, meshVolume } = await import('../../src/stage/scene.js');
const { viewCam, makeCam, proj, VIEWS, nearestView, fitScale } = await import('../../src/stage/camera.js');
const R = await import('../../src/stage/raster.js');
const { lineWork, pickEdge } = await import('../../src/stage/lines.js');
const { sketchStatus, handles, refPoint } = await import('../../src/stage/sketch.js');
const t = (name, fn) => { try { fn(); runs.push(['ok', name]); } catch (e) { runs.push(['FAIL', name, e.message]); } };
const frame = (p, view, W = 1200, H = 800, o = {}) => {
  const sc = sceneOf(p, o), cam = viewCam(typeof view === 'string' ? { name: view } : view, sc.box, W, H), buf = R.buffers({}, W, H);
  for (const inst of sc.instances) R.rasterInstance(buf, inst, R.projectInstance(inst, cam, 1));
  return { sc, cam, buf, lw: lineWork(sc, cam, buf, 1) };
};
const countRuns = (lw, ii = 0) => ({ vis: lw.runs[ii].filter(r => r && r.length).length, hid: lw.hidRuns[ii].filter(r => r && r.length).length });

t('box topology: 8 welded vertices, 18 mesh edges, closed', () => {
  const tp = meshTopology(F.box().bodies[0].mesh);
  assert.equal(tp.nw, 8); assert.equal(tp.ea.length, 18); assert.ok([...tp.t1].every(x => x >= 0));
});
t('box volume 72 000 mm³ by the divergence theorem', () => assert.ok(Math.abs(meshVolume(F.box().bodies[0].mesh) - 72000) < 1e-6));
t('camera: front looks from −Y with X right and Z up; plan from +Z', () => {
  const f = makeCam(VIEWS.front.yaw, 0, 1, [0, 0, 0], 0, 0), p = makeCam(0, VIEWS.plan.pitch, 1, [0, 0, 0], 0, 0);
  const r6 = a => a.map(v => +v.toFixed(6) + 0);
  assert.deepEqual(r6(f.c), [0, -1, 0]); assert.deepEqual(r6(f.u), [0, 0, 1]); assert.deepEqual(r6(p.c), [0, 0, 1]); assert.deepEqual(r6(p.u), [0, 1, 0]);
});
t('axo box: 9 edges visible, 3 hidden; 6 silhouette edges', () => {
  const { lw } = frame(F.box(), 'axo'), c = countRuns(lw);
  assert.equal(c.vis, 9); assert.equal(c.hid, 3); assert.equal(lw.silCount, 6);
});
t('front box: the back face hidden, 4 outline edges visible', () => {
  const { lw } = frame(F.box(), 'front'), c = countRuns(lw);
  assert.ok(c.vis >= 4, `visible ${c.vis}`);
});
t('plate axo: every bore bottom circle hidden at least in part', () => {
  const p = F.plate(), { lw } = frame(p, 'axo'), edges = p.bodies[0].edges;
  const bottoms = edges.map((e, i) => [e, i]).filter(([e]) => /bore.*∩ body\/start/.test(e.name));
  assert.equal(bottoms.length, 4);
  for (const [, i] of bottoms) assert.ok(lw.hidRuns[0][i].length > 0);
});
t('depth buffer: the box covers the projected centre of its top face; picking reads body/end', () => {
  const p = F.box(), { cam, buf, sc } = frame(p, 'axo'), q = proj(cam, [0, 0, 30]);
  const id = buf.id[Math.floor(q[1]) * buf.w + Math.floor(q[0])], inst = sc.instances[sc.faceInst[id]];
  assert.equal(inst.body.faces[id - inst.base].name, 'body/end');
});
t('pickEdge finds the top-right edge of the box', () => {
  const p = F.box(), { cam, lw } = frame(p, 'axo'), q = proj(cam, [30, 0, 30]), e = pickEdge(lw, q[0], q[1] + 1);
  assert.equal(p.bodies[0].edges[e.edge].name, 'body/side[base.l2] ∩ body/end');
});
t('torus (20 160 triangles): silhouettes found, no B-rep edges drawn (seams)', () => {
  const { lw } = frame(F.torus(), 'axo');
  assert.ok(lw.silCount > 100); assert.equal(lw.segs.length, 0);
});
t('print with the bed: two plate items placed inside the 250 × 210 bed', () => {
  const sc = sceneOf(F.printJob(), { bed: true });
  assert.equal(sc.instances.length, 2); assert.equal(sc.bed.x1, 250);
  for (const i of sc.instances) { assert.ok(i.box[0][0] >= 0 && i.box[1][0] <= 250 && i.box[0][1] >= 0 && i.box[1][1] <= 210, JSON.stringify(i.box)); assert.ok(Math.abs(i.box[0][2]) < 1e-6); }
});
t('print without the bed: bodies at their own transforms', () => {
  const sc = sceneOf(F.printJob(), { bed: false });
  assert.equal(sc.bed, null); assert.ok(Math.abs(sc.instances[1].box[0][0] - 50) < 1e-6);
});
t('fit: the same scale in every named view', () => {
  const sc = sceneOf(F.box(), {}), s = fitScale(sc.box, 1200, 800);
  for (const v of Object.keys(VIEWS)) assert.equal(viewCam({ name: v }, sc.box, 1200, 800).s, s);
});
t('square up: an orbited axo snaps back to axo; a near-plan pitch snaps to plan', () => {
  assert.equal(nearestView(makeCam(VIEWS.axo.yaw + 0.2, VIEWS.axo.pitch + 0.1, 1, [0, 0, 0], 0, 0)), 'axo');
  assert.equal(nearestView(makeCam(0.3, 1.45, 1, [0, 0, 0], 0, 0)), 'plan');
});
t('sketch: status lines, handles and refs', () => {
  assert.equal(sketchStatus(F.slotSketch()).text, 'under-constrained · 3 DOF');
  assert.equal(sketchStatus(F.rectSketch()).text, 'fully constrained · 0 DOF');
  assert.match(sketchStatus(F.slotSketch({ conflict: true })).text, /^over-constrained · conflict: dim\(l1, l2\) = 12 mm/);
  const sk = F.slotSketch(); assert.ok(handles(sk).some(h => h.ref === 'hole.center'));
  assert.deepEqual(refPoint(sk, 'a1.end').map(v => +v.toFixed(6)), [40, 10]);
});
// the sketch marks on A-03's outline, laid out on a fake context (Plex Mono at 0.6 em per character)
const { layoutMarks, drawMarks, drawEmphasis, hitMark, resolveRef, dimText, shortLabel, segHitsBox } = await import('../../src/stage/sketch-marks.js');
const { sketch: coreSketch, c: cc } = await import('../../src/engine/sketch/index.js');
const { mm } = await import('../../src/engine/units.js');
const fakeCtx = () => new Proxy({ font: '10px x', canvas: { width: 1200, height: 800 }, getTransform: () => ({ a: 1 }), measureText(t) { const px = +(/([\d.]+)px/.exec(this.font) || [0, 10])[1]; return { width: String(t).length * px * 0.6 }; } },
  { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
const plate = () => {
  const d = coreSketch('outline').line('l1', [0, 0], [80, 0]).line('l2', 'l1.end', [80, 40]).line('l3', 'l2.end', [0, 40]).line('l4', 'l3.end', 'l1.start')
    .circle('h1', 2, { at: [12, 20] }).circle('h2', 2, { at: [60, 20] })
    .constrain(cc.fix('l1.start'), cc.horizontal('l1'), cc.horizontal('l3'), cc.vertical('l2'), cc.vertical('l4'), cc.equal('h2', 'h1'))
    .dim('l1', 'w').dim('l2', 'd').dim('h1', 'hole_d').dim({ h: ['l1.start', 'h1.center'] }, 'edge').dim({ v: ['l1.start', 'h1.center'] }, 'd / 2').dim({ v: ['h1.center', 'h2.center'] }, 0)
    .solve({ scope: { w: mm(80), d: mm(40), hole_d: mm(4.5), edge: mm(12) } }).toSketchData();
  return d;
};
const sheetOf = sk => { const s = 7, P = p => [200 + p[0] * s, 500 - p[1] * s]; const ctx = fakeCtx(); return { ctx, P, L: layoutMarks(ctx, sk, P, { s }, [40, 20]) }; };
const boxOf = g => [g.x - g.w / 2, g.y - g.h / 2, g.x + g.w / 2, g.y + g.h / 2];
const over = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
t('sketch refs: dotted entity ids resolve by the longest id', () => {
  const sk = { entities: [{ id: 'outline.bl', kind: 'arc', c: [3, 3], r: 3, a0: Math.PI, a1: 1.5 * Math.PI }, { id: 'outline.center', kind: 'point', p: [0, 0] }] };
  assert.deepEqual(resolveRef(sk, 'outline.bl.center'), { e: sk.entities[0], sub: 'center' });
  assert.equal(resolveRef(sk, 'outline.center').sub, null);
  assert.deepEqual(refPoint(sk, 'outline.bl.center'), [3, 3]);
  assert.equal(resolveRef(sk, 'outline'), null);
});
t('sketch marks: values with their expressions, short labels', () => {
  const sk = plate(), K = id => sk.constraints.find(k => k.id === id);
  assert.equal(dimText(K('dim(l1)')), '80 mm · w');
  assert.equal(dimText(K('dim(h1)')), 'Ø4.50 mm · hole_d');
  assert.equal(dimText(K('dim(l1.start, h1.center)#2')), '20 mm · d / 2');
  assert.equal(shortLabel(K('dim(l1.start, h1.center)')), 'distanceX 12 mm = edge');
  assert.equal(shortLabel(K('horizontal(l1)')), 'horizontal l1');
  assert.equal(dimText({ ...K('dim(l1)'), driven: true }), '(80 mm)');
});
t('sketch marks: glyphs stand apart, linear dimensions take separate lanes, the zero one is a flat label', () => {
  const sk = plate(), { L } = sheetOf(sk);
  const gl = L.glyphs.map(boxOf);
  for (let i = 0; i < gl.length; i++) for (let j = i + 1; j < gl.length; j++) assert.ok(!over(gl[i], gl[j]), `${L.glyphs[i].text} on ${L.glyphs[j].text}`);
  for (const g of gl) for (const d of L.dims) assert.ok(!over(g, d.box), `a glyph on ${d.label}`);
  const lin = id => L.marks.get(id).dim;
  assert.ok(Math.abs(lin('dim(l1)').qa[1] - lin('dim(l1.start, h1.center)').qa[1]) >= 14, 'the 80 and the 12 below the plate on different lanes');
  assert.equal(L.marks.get('equal(h2, h1)').glyphs.map(g => g.text).join(), '=1,=1');
  const flat = L.marks.get('dim(h1.center, h2.center)').glyphs[0];
  assert.equal(flat.text, 'dy 0 mm');
  assert.equal(L.dots.length, 4);
  const v4 = L.marks.get('vertical(l4)').glyphs[0], l4x = 200;
  assert.ok(Math.abs(v4.x - l4x) < 20, `V of l4 stays beside l4 (x ${v4.x.toFixed(1)})`);
});
t('sketch marks: picking a glyph, a dimension value, a dimension line and an entity', () => {
  const sk = plate(), { L } = sheetOf(sk);
  const g = L.marks.get('horizontal(l3)').glyphs[0];
  assert.deepEqual(hitMark(L, g.x, g.y), { constraint: 'horizontal(l3)' });
  const d = L.marks.get('dim(l1)').dim;
  assert.deepEqual(hitMark(L, (d.box[0] + d.box[2]) / 2, (d.box[1] + d.box[3]) / 2), { constraint: 'dim(l1)' });
  assert.deepEqual(hitMark(L, d.qa[0] + 30, d.qa[1] + 1), { constraint: 'dim(l1)' });
  assert.deepEqual(hitMark(L, 200 + 80 * 7 + 1, 500 - 5 * 7), { entity: 'l2' });
  assert.equal(hitMark(L, 1100, 100), null);
  assert.ok(segHitsBox([0, 0], [10, 10], [4, 4, 6, 6]) && !segHitsBox([0, 0], [10, 0], [4, 4, 6, 6]));
});
t('sketch marks: drawing every mark and an emphasis does not throw; tones follow the state', () => {
  const sk = plate(), { ctx, P, L } = sheetOf(sk), C = { stage: '#fff', ink: '#111', muted: '#6e6e6e', red: '#d23a2a', warn: '#b0650a' };
  drawMarks(ctx, C, L);
  for (const target of [{ constraint: 'dim(l1)' }, { constraint: 'horizontal(l1)' }, { constraint: 'coincident(l2.start, l1.end)' }, { entity: 'h2' }, { constraint: 'nope' }]) drawEmphasis(ctx, C, sk, P, L, target);
  drawEmphasis(ctx, C, sk, P, L, { constraint: 'dim(l1)' }, { hover: true });
});

t('redraw core (raster + line work) of the 20k-triangle torus at 1200 × 800 under 50 ms', () => {
  const p = F.torus(); frame(p, 'axo');
  const ms = []; for (let i = 0; i < 10; i++) { const t0 = performance.now(); frame(p, { name: 'axo', yaw: i * 0.02 }); ms.push(performance.now() - t0); }
  ms.sort((a, b) => a - b); console.log(`  torus raster + lines: median ${ms[5].toFixed(1)} ms`);
  assert.ok(ms[5] < 50);
});
for (const r of runs) console.log(r[0].padEnd(4), r[1], r[2] ? '— ' + r[2] : '');
const failed = runs.filter(r => r[0] !== 'ok').length;
console.log(`${runs.length - failed}/${runs.length} passed`);
process.exit(failed ? 1 : 0);
