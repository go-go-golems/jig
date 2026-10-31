// Engine test harness: loads OpenCascade in Node, compiles every script in test/engine/scripts through the
// worker protocol (handle()), and checks real numbers: volumes, Euler–Poincaré, Pappus, names, exports.
// Usage: node test/engine/run.mjs [filter]
import { register } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('./loader.mjs', import.meta.url).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const W = await import('../../src/engine/worker.js');
const { unzip } = await import('../../src/engine/io.js');
const filter = process.argv[2];
let pass = 0, fail = 0;
const results = [];
const script = f => readFileSync(join(HERE, 'scripts', f), 'utf8');
const near = (a, b, rel = 1e-6, abs = 1e-6) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));
async function compile(f, opts = {}) {
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': typeof f === 'string' && f.endsWith('.js') ? script(f) : f, ...(opts.files ?? {}) }, options: opts.options ?? {} });
  if (!r.ok) throw new Error(r.error.message);
  return r.program;
}
const call = async (method, ...args) => { const r = await W.handle({ id: 2, op: 'call', method, args }); if (!r.ok) throw new Error(r.error.message); return r.value; };
const exp = async (format, options) => { const r = await W.handle({ id: 3, op: 'export', format, options }); if (!r.ok) throw new Error(r.error.message); return r; };
const errs = p => p.diagnostics.filter(d => d.level === 'error');
async function test(name, fn) {
  if (filter && !name.includes(filter)) return;
  const t0 = performance.now();
  try { const note = await fn(); pass++; results.push(`ok   ${name} (${(performance.now() - t0).toFixed(0)} ms)${note ? ' · ' + note : ''}`); }
  catch (e) { fail++; results.push(`FAIL ${name}: ${e.message}`); }
  console.log(results[results.length - 1]);
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const t0 = performance.now();
const init = await W.handle({ id: 0, op: 'init' });
console.log(`init ${init.ms.toFixed(0)} ms · ${init.version}`);

await test('01 plate with holes: Cavalieri volume', async () => {
  const p = await compile('01-plate-holes.js');
  const want = (80 * 50 - 4 * (1 - Math.PI / 4) * 16 - 4 * Math.PI * 1.7 ** 2) * 4;
  assert(near(p.metrics.volume.value, want, 1e-6), `volume ${p.metrics.volume.value} ≠ ${want}`);
  assert(near(p.metrics.mass.value, want * 1.27 / 1000, 1e-6), 'PETG mass');
  assert(p.bodies[0].faces.filter(f => f.name.startsWith('body/side[outline.h1')).length === 4, 'four hole faces named from h1 and its pattern copies');
  return `volume ${p.metrics.volume.value.toFixed(3)} mm³`;
});
await test('02 open box: fillet + shell, Euler–Poincaré', async () => {
  const p = await compile('02-open-box.js');
  const t = p.bodies[0].topology;
  assert(t.residual === 0 && t.G === 0 && t.S === 1, `topology ${JSON.stringify(t)}`);
  const want = 72000 - 4 * (1 - Math.PI / 4) * 25 * 30 - (56 * 36 - 4 * (1 - Math.PI / 4) * 9) * 28;
  assert(near(p.metrics.volume.value, want, 1e-5), `volume ${p.metrics.volume.value} vs ${want}`);
  const names = p.bodies[0].faces.map(f => f.name);
  assert(names.includes('corners/face[body/side[base.r.bottom] ∩ body/side[base.r.left]]'), 'fillet face named from its edge');
  assert(names.includes('shell/inner[body/side[base.r.top]]') && names.includes('body/end'), 'shell inner faces and the rim keep genealogy');
  const f = await call('feature', 'shell');
  assert(near(f.innerCornerRadius, 3), `inner corner radius ${f.innerCornerRadius}`);
  return `V−E+F−(L−F)−2(S−G) = ${t.residual}, volume ${p.metrics.volume.value.toFixed(1)}`;
});
await test('03 revolve: Pappus within 1e-6', async () => {
  const p = await compile('03-revolve.js');
  const want = 2 * Math.PI * 25 * 40;
  assert(Math.abs(p.metrics.volume.value - want) / want < 1e-6, `volume ${p.metrics.volume.value} vs ${want}`);
  const q = await compile(script('03-revolve.js').replace('turn(1)', 'deg(90)'));
  assert(Math.abs(q.metrics.volume.value - want / 4) / want < 1e-6, 'quarter revolve');
  assert(q.bodies[0].faces.some(f => f.name === 'rev/start') && p.bodies[0].faces.every(f => f.name.startsWith('rev/side[sec.r.')), 'revolve names');
  return `${p.metrics.volume.value.toFixed(6)} mm³ (2π·25·40 = ${want.toFixed(6)})`;
});
await test('04 extrude with taper: frustum law', async () => {
  const p = await compile('04-taper.js');
  const a1 = (30 - 2 * 20 * Math.tan(Math.PI / 18)) ** 2, want = 20 / 3 * (900 + a1 + Math.sqrt(900 * a1));
  assert(near(p.metrics.volume.value, want, 1e-6), `${p.metrics.volume.value} vs ${want}`);
  return `${p.metrics.volume.value.toFixed(2)} mm³`;
});
await test('05 40-hole plate: one hole feature, 40 bores', async () => {
  const t = performance.now();
  const p = await compile('05-hole-grid.js');
  const ms = performance.now() - t;
  const bores = p.bodies[0].faces.filter(f => f.name.startsWith('holes/bore['));
  assert(bores.length === 40, `${bores.length} bores`);
  const d = 3 + 2 * 0.2 + 0.1;
  assert(near(p.metrics.volume.value, 170 * 100 * 5 - 40 * Math.PI * (d / 2) ** 2 * 5, 1e-6), 'volume');
  assert(p.bodies[0].topology.G === 40 && p.bodies[0].topology.residual === 0, 'genus 40');
  const f = await call('feature', 'holes');
  assert(f.modelled === 3.5, `modelled ${f.modelled}`);
  return `compile ${ms.toFixed(0)} ms, Ø ${f.modelled} mm, genus ${p.bodies[0].topology.G}`;
});
await test('06 teardrops for horizontal holes', async () => {
  const p = await compile('06-teardrops.js');
  const d = p.decisions.find(x => x.kind === 'teardrop');
  assert(d && /⟂ build direction \+Z/.test(d.reason), 'teardrop decision');
  const faces = p.bodies[0].faces.map(f => f.name);
  assert(faces.some(n => n.startsWith('cross/tear.')), 'teardrop flats named');
  assert(p.print.overhang.length === 0 && p.metrics.supportVolume.value === 0, 'no overhang with the teardrop');
  const wy = await call('why', "j.feat('cross').bores()");
  assert(wy.chain.some(c => c.includes('teardrop')), 'why explains the teardrop');
  return d.reason;
});
await test('07 sketch on a face: boss joins the plate, fillets concave first', async () => {
  const p = await compile('07-sketch-on-face.js');
  const d = p.decisions.find(x => x.at === 'boss' && x.kind === 'op');
  assert(d.chose === 'join', `boss op ${d.chose}`);
  assert(p.bodies.length === 1, 'one body');
  const order = p.decisions.find(x => x.kind === 'fillet.order');
  assert(order && order.chose[0].includes('concave'), 'concave first');
  const names = p.bodies[0].faces.map(f => f.name);
  assert(names.includes('blend/face[boss/side[b.c] ∩ plate/end]') && names.includes('blend/face[boss/side[b.c] ∩ boss/end]'), 'blend faces named from edges');
  return `${p.bodies[0].faces.length} faces`;
});
await test('08 selectors survive a parameter change (genealogy names stable)', async () => {
  const a = await compile('08-selectors-stable.js');
  const sel = "j.feat('body').sideFaces().edges('|Z').where(e => e.convex)";
  const na = (await call('faces', `j.feat('corners').faces()`)).map(r => r.name).sort();
  const wa = await call('why', sel);
  const b = await compile('08-selectors-stable.js', { options: { override: { w: 80 } } });
  const nb = (await call('faces', `j.feat('corners').faces()`)).map(r => r.name).sort();
  const wb = await call('why', sel);
  assert(JSON.stringify(na) === JSON.stringify(nb) && na.length === 4, `fillet faces differ: ${na} vs ${nb}`);
  assert(JSON.stringify(wa.resolved.sort()) === JSON.stringify(wb.resolved.sort()), 'edge names differ');
  assert(b.metrics.volume.value > a.metrics.volume.value, 'w changed');
  const cached = b.trace.filter(t => t.pass.startsWith('feature:')).map(t => t.cached);
  return `${na.length} fillet faces stable; ${wa.resolved.length} edges stable`;
});
await test('09 fit-aware holes (default and calibrated profile)', async () => {
  await compile('09-fit-holes.js');
  const f = await call('feature', 'pins'), s = await call('feature', 'screw');
  assert(near(f.modelled, 3 + 0.4 + 0.1), `pin hole ${f.modelled}`);
  assert(near(s.modelled, 3.5), `M3 clearance ${s.modelled}`);
  const p2 = await compile('09-fit-holes.js', { files: { 'cfg.json': '{"calibrated": true}' } });
  const f2 = await call('feature', 'pins');
  assert(near(f2.modelled, 3 + 2 * 0.135 + 0.05), `calibrated ${f2.modelled}`);
  assert(!p2.diagnostics.some(d => d.kind === 'fit.uncalibrated'), 'calibrated profile: no fit.uncalibrated');
  const g = p2.params.find(r => r.name === 'gap.slide');
  assert(g && near(g.value, 0.135), 'gap.slide param with provenance');
  return `default Ø ${f.modelled}, calibrated Ø ${f2.modelled}`;
});
await test('10 print job: auto orientation and skyline plates', async () => {
  const p = await compile('10-print-plates.js');
  assert(p.print.orientation.bin.dir === '+Z' && p.print.orientation.lid.dir === '+Z', JSON.stringify(p.print.orientation));
  const items = p.print.plates.flatMap(pl => pl.items);
  assert(items.length === 8, `${items.length} plate items`);
  assert(p.print.plates.length >= p.print.lowerBound, 'plates ≥ lower bound');
  // no overlaps between footprints on a plate
  for (const pl of p.print.plates) for (const it of pl.items) for (let k = 0; k < 16; k++) assert(Number.isFinite(it.transform[k]), 'transform');
  return `${p.print.plates.length} plate(s), lower bound ${p.print.lowerBound}`;
});
await test('11 slicing: layers, loops, Σ area·t ≈ volume, cusp', async () => {
  const p = await compile('11-slice-dome.js');
  const L = p.print.layers;
  assert(L.count === 200, `${L.count} layers`);
  const s0 = L.sample.find(s => s.k === 0);
  assert(near(s0.area, Math.PI * 40 ** 2, 2e-3), `layer 0 area ${s0.area}`);
  assert(s0.loops.length === 1 && s0.loops[0].length > 20, 'layer 0 loop');
  const sc = L.sample.find(s => s.z > 3 && s.z < 13);
  assert(sc && sc.holes === 1 && sc.regions === 1, 'cavity appears as a hole loop');
  assert(Math.abs(L.volume - p.metrics.volume.value) / p.metrics.volume.value < 2e-3, `Σ area·t ${L.volume} vs ${p.metrics.volume.value}`);
  assert(near(L.cuspMax, 0.2, 1e-6) && L.cuspMean > 0.05 && L.cuspMean < 0.15, `cusp ${L.cuspMax} ${L.cuspMean}`);
  return `200 layers, Σ area·t = ${L.volume.toFixed(0)} vs ${p.metrics.volume.value.toFixed(0)} mm³, cusp mean ${L.cuspMean.toFixed(3)}`;
});
await test('12 exports: STL, STEP, 3MF, IR bundle, SVG', async () => {
  const p = await compile('12-exports.js');
  const stl = await exp('stl');
  const n = new DataView(stl.data).getUint32(80, true);
  const tris = p.bodies.reduce((s, b) => s + b.mesh.indices.length / 3, 0);
  assert(n > 0 && stl.data.byteLength === 84 + 50 * n, `STL size for ${n} triangles`);
  const step = await exp('step');
  assert(typeof step.data === 'string' && step.data.startsWith('ISO-10303-21') && step.data.includes('MANIFOLD_SOLID_BREP'), 'STEP text');
  const tmf = await exp('3mf');
  const files = unzip(new Uint8Array(tmf.data));
  assert(files.every(f => f.crcOk) && files.some(f => f.name === '3D/3dmodel.model'), '3MF zip valid');
  const model = new TextDecoder().decode(files.find(f => f.name === '3D/3dmodel.model').data);
  assert(model.includes('unit="millimeter"') && (model.match(/<triangle /g) ?? []).length === n, '3MF triangles');
  const ir = await exp('ir');
  const irFiles = unzip(new Uint8Array(ir.data)).map(f => f.name);
  assert(['manifest.json', 'trace.json', 'diagnostics.json', 'L0.txt', 'L4.txt', 'L6.txt'].every(x => irFiles.includes(x)), 'IR bundle files');
  const svg = await exp('svg', { view: 'iso' });
  assert(svg.data.startsWith('<svg'), 'svg');
  assert(stl.report.approximated.length && step.report.approximated.length === 0, 'lowering reports');
  return `STL ${n} triangles (display mesh ${tris}), STEP ${(step.data.length / 1024).toFixed(0)} KiB, 3MF ${files.length} entries, IR ${irFiles.length} files`;
});
await test('13 sketch conflict diagnostic', async () => {
  const p = await compile('13-sketch-conflict.js');
  const d = p.diagnostics.find(x => x.kind === 'sketch.overConstrained');
  assert(d && d.level === 'error' && /conflicting/.test(d.message), JSON.stringify(p.diagnostics));
  const s = p.sketches.find(x => x.id === 'bad');
  assert(s.status === 'over' && s.conflicts.length, 'sketch data status over');
  return d.message.slice(0, 90);
});
await test('14 CSG die: inclusion–exclusion and genus 5', async () => {
  const p = await compile('14-csg-die.js');
  assert(Math.abs(p.metrics.volume.value - 3868.8) < 0.5, `volume ${p.metrics.volume.value}`);
  const t = p.bodies[0].topology;
  assert(t.residual === 0 && t.G === 5, `topology ${JSON.stringify(t)}`);
  return `volume ${p.metrics.volume.value.toFixed(1)} mm³, G = ${t.G}`;
});
await test('15 fillet too large reports the feasible maximum', async () => {
  const p = await compile('15-fillet-too-large.js');
  const d = p.diagnostics.find(x => x.kind === 'fillet.tooLarge');
  assert(d && d.at === 'huge' && /largest that works is about 1[45]\./.test(d.message) && d.line === 4, JSON.stringify(d));
  return d.fix;
});
await test('16 assembly: revolute joint between ports, print-in-place gap, mobility', async () => {
  const p = await compile('16-assembly.js');
  assert(errs(p).length === 0, JSON.stringify(errs(p)));
  const lid = p.bodies.find(b => b.part === 'lid');
  assert(near(lid.transform[13], 40.4, 1e-6) && near(lid.transform[5], -1, 1e-9), `lid transform ${lid.transform}`);
  const gap = p.decisions.find(d => d.kind === 'gap');
  assert(gap.chose === '0.400 mm', gap.chose);
  assert(p.metrics.assemblyDOF.value === 1, 'DOF 1');
  return `gap ${gap.chose}, DOF ${p.metrics.assemblyDOF.value}`;
});
await test('17 sweep along a helix and loft', async () => {
  const p = await compile('17-sweep-loft.js');
  const L = 3 * Math.hypot(2 * Math.PI * 10, 4);
  assert(Math.abs(p.metrics.volume.value - Math.PI * L) / (Math.PI * L) < 0.01, `sweep volume ${p.metrics.volume.value} vs ${Math.PI * L}`);
  assert(p.bodies[0].faces.some(f => f.name === 'wire/side[c.w]'), 'sweep side named from the profile');
  const q = await compile('17-sweep-loft.js', { files: { 'cfg.json': '{"which":"loft"}' } });
  assert(q.metrics.volume.value > 0 && q.bodies[0].faces.some(f => f.name === 'duct/start'), 'loft');
  return `coil ${p.metrics.volume.value.toFixed(1)} mm³, loft ${q.metrics.volume.value.toFixed(1)} mm³`;
});
await test('18 rules: thin wall and tiny hole', async () => {
  const p = await compile('18-rules.js');
  const kinds = p.diagnostics.map(d => d.kind);
  assert(kinds.includes('print.thinWall') && kinds.includes('print.thinFeature'), kinds.join(','));
  return kinds.filter(k => k.startsWith('print.')).join(', ');
});
await test('19 lib: insert boss and magnet pocket', async () => {
  const p = await compile('19-lib-hardware.js');
  const f = await call('feature', 'boss');
  assert(near(f.hole.d, 4.0) && near(f.hole.depth, 6.7) && near(f.boss.d, 4 + 2 * 1.35), JSON.stringify(f));
  assert(p.bodies[0].faces.some(n => n.name.startsWith('boss/bore')) && p.bodies[0].faces.some(n => n.name.startsWith('magnet/pocket')), 'boss and pocket faces');
  return `boss Ø ${f.boss.d.toFixed(2)}, hole Ø ${f.hole.d} × ${f.hole.depth.toFixed(1)}`;
});
await test('20 pattern and mirror replay feature tools', async () => {
  const p = await compile('20-pattern-mirror.js');
  const bosses = p.bodies[0].faces.filter(f => /boss\/side\[b\.c\]$/.test(f.name));
  assert(bosses.length === 6, `${bosses.length} boss sides`);
  const pins = p.bodies[0].faces.filter(f => f.name.includes('pin/side[h.c]'));
  assert(pins.length === 2, `${pins.length} pin bores`);
  const want = Math.PI * 900 * 5 + 6 * Math.PI * 16 * 6 - 2 * Math.PI * 4 * 5;
  assert(near(p.metrics.volume.value, want, 1e-6), `volume ${p.metrics.volume.value} vs ${want}`);
  return `6 bosses, 2 pins, volume ${p.metrics.volume.value.toFixed(1)}`;
});
await test('21 script errors map to script.js lines', async () => {
  const p = await compile('const a = 1\nconst b = j.part("x")\n  .extrude(j.region.rect(10, 10), mm(5))\nreturn b.fillet(j.sel.edges(">Q"), 1)');
  const d = p.diagnostics[0];
  assert(d.line === 4 && /bad direction/.test(d.message), JSON.stringify(d));
  const q = await W.handle({ id: 9, op: 'compile', files: { 'script.js': 'const a = 1\nconst b = nope(3)\nreturn b' } });
  assert(!q.ok && q.error.line === 2 && q.error.column === 11 && q.error.file === 'script.js' && q.program.diagnostics[0].line === 2, JSON.stringify(q.error));
  const r = await W.handle({ id: 9, op: 'compile', files: { 'script.js': 'const a = 1\nconst b = (3\nreturn b' } });
  assert(!r.ok && r.error.line === 3, JSON.stringify(r.error));
  return 'feature failure → diagnostic line 4; ReferenceError → error 2:11; SyntaxError → line 3';
});
await test('22 timeline edits: suppress, rollback, insertAfter, cache cone', async () => {
  const base = script('02-open-box.js').replace(/^return /m, 'const model = ');
  const a = await compile(base + '\nreturn model.suppress("corners")');
  const b = await compile(base + '\nreturn model.rollback("shell")');
  const c = await compile(base + '\nreturn model.insertAfter("body", x => x.chamfer(j.feat("body").startFace().edges(), mm(0.4), { id: "bed" }))');
  assert(near(a.metrics.volume.value, 72000 - 56 * 36 * 28), 'suppress = identity');
  assert(near(b.metrics.volume.value, 72000 - 4 * (1 - Math.PI / 4) * 25 * 30, 1e-6), 'rollback before shell');
  assert(c.graph.nodes.map(n => n.id).join(',').includes('body,bed,corners,shell'), c.graph.nodes.map(n => n.id).join(','));
  const d = await compile(base.replace("wall: mm(2)", "wall: mm(2.5)") + '\nreturn model');
  const tr = d.trace.filter(t => t.pass.startsWith('feature:'));
  assert(tr.find(t => t.pass === 'feature:body').cached && tr.find(t => t.pass === 'feature:corners').cached && !tr.find(t => t.pass === 'feature:shell').cached, 'only the shell recomputes');
  return `wall change: ${tr.map(t => `${t.pass.slice(8)}${t.cached ? ' cached' : ''}`).join(', ')}`;
});
await test('23 call methods: why, param, ir, sketch, metric, find', async () => {
  await compile('08-selectors-stable.js');
  const par = await call('param', 'w');
  assert(par && par.src === 'params', JSON.stringify(par));
  const ir = await call('ir', 'L4', { node: 'box/body1' });
  assert(ir.includes('Euler–Poincaré') && ir.includes('✓'), ir);
  const sk = await call('sketch', 'base');
  assert(sk.dof === 0 && sk.status === 'fully', 'sketch data');
  const m = await call('metric', 'volume');
  assert(m.unit === 'mm³' && m.fidelity === 'exact', 'metric');
  const nodes = await call('find', 'fillet');
  assert(nodes.length === 1 && nodes[0].id === 'corners', 'find');
  const why = await call('why', "j.sel.faces('>Z')");
  assert(why.resolved.length === 1 && why.resolved[0] === 'body/end', JSON.stringify(why));
  const frag = await compile(script('08-selectors-stable.js').replace(".chamfer(j.feat('body').endFace().edges()", ".chamfer(j.sel.edges().nth(3)"));
  assert(frag.diagnostics.some(d => d.kind === 'ref.fragile'), 'nth raises ref.fragile');
  return 'why/param/ir/sketch/metric/find ok; nth → ref.fragile';
});
await test('24 ref.expect and ref.autoId diagnostics', async () => {
  const p = await compile(script('02-open-box.js').replace('.expect(4)', '.expect(3)'));
  const d = p.diagnostics.find(x => x.kind === 'ref.expect');
  assert(d && d.level === 'error' && /expected 3/.test(d.message), JSON.stringify(p.diagnostics));
  const q = await compile("return j.part('a').extrude(j.region.rect(10, 10), mm(5)).fillet(j.feat('extrude1').endFace().edges(), mm(1))");
  assert(q.diagnostics.some(x => x.kind === 'ref.autoId'), 'autoId info');
  return d.message;
});
await test('25 solveSketch drag (runtime residual solve)', async () => {
  await compile("return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).line('l1', [0, 0], [40, 0]).line('l2', 'l1.end', [40, 30]).line('l3', 'l2.end', 'l1.start').constrain(j.c.fix('l1.start')).profiles(), mm(3), { id: 'b' })");
  const r = await W.handle({ id: 4, op: 'solveSketch', sketchId: 's', drag: { ref: 'l2.end', to: [45, 35] } });
  assert(r.ok, r.error?.message);
  const l2 = r.sketch.entities.find(e => e.id === 'l2');
  assert(Math.hypot(l2.b[0] - 45, l2.b[1] - 35) < 1e-6, JSON.stringify(l2));
  return `l2.end → (${l2.b.map(v => v.toFixed(2))})`;
});
await test('26 laws: extrude.volume, revolve.volume, brep.eulerPoincare, compile.deterministic, shape.boolean', async () => {
  const r = await W.handle({ id: 5, op: 'run', code: 'return j.laws.check(j.laws.suite, { n: 6, seed: 3 })' });
  assert(r.ok, r.error?.message);
  const bad = r.value.filter(x => !x.ok);
  assert(!bad.length, JSON.stringify(bad));
  return r.value.map(x => `${x.law} ✓${x.n}`).join(', ');
});
await test('27 explore: design space grid search', async () => {
  const r = await W.handle({ id: 6, op: 'run', code: `
    const d = j.design({ h: j.param.range(mm(2), mm(6), { step: mm(2) }) },
      p => j.part('plate').extrude(j.region.rect(40, 30), p.h, { id: 'body' }))
    const res = await j.search.grid(d, { objective: j.objective.minimize('mass') })
    return { best: res.best.point.h.value, n: res.ranked.length, staged: j.stage(d).note }` });
  assert(r.ok && r.value.best === 2 && r.value.n === 3, JSON.stringify(r));
  return `best h = ${r.value.best} mm of ${r.value.n}; ${r.value.staged}`;
});
await test('28 inspect: mass as printed, section, snap, mobility', async () => {
  const r = await W.handle({ id: 7, op: 'run', code: `
    const block = j.part('block').material(j.material('PLA')).extrude(j.region.rect(40, 40), mm(20), { id: 'body' })
    const solid = j.inspect.mass(block), printed = j.inspect.mass(block, { walls: 3, infill: 0.15 })
    const sec = j.inspect.section(block, j.plane.offset(j.plane.XY, mm(10)))
    const hook = j.lib.snap.cantilever({ length: mm(12), thickness: mm(1.6), deflection: mm(1), material: j.material('PETG') })
    return { solid: solid.mass.value, printed: printed.mass.value, area: sec.area, I: sec.I.xx, snap: j.inspect.snap(hook) }` });
  assert(r.ok, r.error?.message);
  const v = r.value;
  assert(near(v.solid, 32000 * 1.24 / 1000) && v.printed < v.solid / 2, JSON.stringify(v));
  assert(near(v.area, 1600, 1e-6) && near(v.I, 40 ** 4 / 12, 1e-6), `section ${v.area} ${v.I}`);
  assert(near(v.snap.strain, 1.5 * 1.6 * 1 / 144, 1e-9) && v.snap.ok, JSON.stringify(v.snap));
  return `solid ${v.solid.toFixed(1)} g, printed ${v.printed.toFixed(1)} g, I = ${v.I.toFixed(0)} mm⁴, snap ε ${v.snap.strain.toFixed(4)}`;
});

const BRACKET = `const bracket = j.part('bracket').material(j.material('PETG'))
  .add(j.box(60, 30, 5), { id: 'base' })
  .add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })
  .hole(j.sketch('hb', { on: j.plane.offset(j.plane.XY, mm(5)) }).point('p1', [15, 18]).point('p2', [45, 18]), j.hole.clearance('M4', { fit: 'free' }), { id: 'screws' })
  .hole(j.sketch('hc', { on: j.plane.XZ }).point('p', [30, 30]), j.hole.simple(mm(8), mm(5)), { id: 'cable' })
const job = j.print('bracket', { printer: j.printer('mk4'), material: j.material('PETG'), parts: [bracket] })`;
await test('29 orientation: auto, fixed, min-height fixpoint, flipping lambda, bed fit', async () => {
  const a = await compile(`${BRACKET}\nreturn job`);
  assert(a.print.orientation.bracket.dir === '+Z' && a.metrics.supportVolume.value === 0, JSON.stringify(a.print.orientation));
  const b = await compile(`${BRACKET}\nreturn job.orient('-Z').supports({ kind: 'grid' })`);
  assert(b.metrics.supportVolume.value > 30000 && b.diagnostics.some(d => d.kind === 'print.overhang'), 'support under -Z');
  const c = await compile(`${BRACKET}\nreturn job.orient('min-height')`);
  const fx = c.trace.find(t => t.pass === 'fixpoint');
  assert(c.print.orientation.bracket.dir === '+Y' && fx.note === 'converged in 2' && c.metrics.supportVolume.value === 0, `${c.print.orientation.bracket.dir} ${fx.note}`);
  const d = await compile(`${BRACKET}\nreturn job.orient((part, ctx) => ctx.previous?.dir?.[0] === 1 ? '+Y' : '+X')`);
  assert(d.diagnostics.some(x => x.kind === 'fixpoint.notConverged' && /\+X → \+Y → \+X → \+Y/.test(x.message)), 'notConverged');
  const e = await compile(`return j.print('big', { printer: j.printer('mk4'), parts: [j.part('tray').add(j.box(320, 140, 40), { id: 'b' })] })`);
  assert(e.diagnostics.some(x => x.kind === 'print.bedFit' && x.level === 'error'), 'bedFit');
  return `auto +Z; min-height → +Y (teardrops re-shaped, ${fx.note}); grid supports ${b.metrics.supportVolume.value.toFixed(0)} mm³`;
});
await test('30 feature coverage: symmetric/two/to-face extents, cbore/csink/tapped/insert/nut, split, move/copy, pushPull, custom, unsupported', async () => {
  const plate = `j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 40, 30, { center: true }).profiles(), mm(10), { id: 'body' })`;
  const v = async (code) => (await compile(code));
  const sym = await v(`return j.part('p').extrude(j.region.rect(10, 10), { symmetric: mm(10) }, { id: 'b' })`);
  assert(sym.bodies[0].bbox[0][2] === -5 && sym.bodies[0].bbox[1][2] === 5, 'symmetric');
  const two = await v(`return j.part('p').extrude(j.region.rect(10, 10), { two: [mm(10), mm(4)] }, { id: 'b' })`);
  assert(two.bodies[0].bbox[0][2] === -4 && two.bodies[0].bbox[1][2] === 10, 'two');
  const to = await v(`return ${plate}.add(j.box(10, 10, 5), { at: j.tx.move(10, 0, 20), id: 'shelf' }).extrude(j.sketch('t', { on: j.feat('body').endFace() }).rect('q', 4, 4, { at: [14, 4], center: true }).profiles(), { to: j.feat('shelf').faces('<Z') }, { id: 'post' })`);
  assert(to.bodies.length === 1 && near(to.metrics.volume.value, 12000 + 500 + 160), `to-face ${to.bodies.length} ${to.metrics.volume.value}`);
  const holes = await v(`return ${plate}.hole([[-12, 0]], j.hole.counterbore(mm(3.4), mm(6.5), mm(3)), { id: 'cb' }).hole([[0, 8]], j.hole.countersink(mm(3.4), mm(7), deg(90)), { id: 'cs' }).hole([[12, 0]], j.hole.tapped('M3', { depth: mm(8) }), { id: 'tap' }).hole([[0, -8]], j.hole.insert('M3x5.7'), { id: 'ins' }).hole([[0, 0]], j.hole.nutTrap('M3'), { id: 'nut' })`);
  const names = holes.bodies[0].faces.map(f => f.name);
  for (const n of ['cb/cbore[1]', 'cb/cbFloor[1]', 'cs/csink[1]', 'tap/floor[1]', 'ins/bore[1]', 'nut/nutFloor[1]']) assert(names.includes(n), `missing ${n}`);
  const split = await v(`return ${plate}.split(j.feat('body').body(), j.plane.YZ, { id: 'cut' })`);
  assert(split.bodies.length === 2 && near(split.bodies[0].volume + split.bodies[1].volume, 12000), 'split partitions the volume');
  const mc = await v(`return ${plate}.copy(j.feat('body').body(), j.tx.move(50, 0, 0), { id: 'dup' })`);
  assert(mc.bodies.length === 2, 'copy');
  const pp = await v(`return ${plate}.pushPull(j.feat('body').endFace(), mm(5), { id: 'pp' })`);
  assert(near(pp.metrics.volume.value, 18000), 'pushPull');
  const cu = await v(`return ${plate}.feature('twin', (bodies, ctx) => [...bodies, j.box(5, 5, 5).moved(j.tx.move(40, 0, 0))])`);
  assert(cu.bodies.length === 2 && near(cu.metrics.volume.value, 12125), 'custom feature');
  const un = await v(`return ${plate}.deleteFace(j.feat('body').endFace())`);
  assert(un.diagnostics.some(d => d.kind === 'feature.unsupported'), 'unsupported diagnostic');
  const pk = await v(`return ${plate}.cut(j.sketch('h', { on: j.feat('body').endFace() }).circle('c', 2, { at: [-10, 0] }).profiles(), mm(4), { id: 'pocket' }).pattern(j.feat('pocket'), j.pattern.linear(j.dir('+X'), { count: 3, step: mm(10) }), { id: 'pockets' })`);
  assert(near(pk.metrics.volume.value, 12000 - 3 * Math.PI * 4 * 4, 1e-6) && pk.decisions.some(d => d.kind === 'cut.direction'), 'cut into material + pattern');
  return 'all extents, hole kinds, split/copy/pushPull/custom ok';
});

await test('31 integration: run(compile text, files), graph ids, concave, summary.sketches, call answers, overrides as text, lines', async () => {
  const r = await W.handle({ id: 10, op: 'run', files: { 'script.js': 'return 1', 'cfg.json': '{"h": 7}' }, code: `
    const P = await compile("return j.part('a').extrude(j.region.rect(10, 10), mm(data.cfg.h), { id: 'b' })")
    return { volume: P.metrics.volume.value, names: Object.keys(files) }` });
  assert(r.ok && near(r.value.volume, 700) && r.value.names.includes('cfg.json'), JSON.stringify(r));
  const p = await compile(`return j.part('x').extrude(j.sketch('back', { on: j.plane.XY }).rect('r', 50, 30, { center: true }).profiles(), mm(4), { id: 'back' })
    .extrude(j.sketch('b', { on: j.feat('back').endFace() }).circle('c', 6).profiles(), mm(10), { id: 'boss' })
    .fillet(j.feat('boss').edges('%circle').where(e => e.concave), mm(1), { id: 'root' })
    .chamfer(j.sel.edges('%circle').radius(mm(99)), mm(1), { id: 'none' })`);
  const ids = p.graph.nodes.map(n => n.id);
  assert(new Set(ids).size === ids.length && ids.includes('sketch:back') && ids.includes('back'), ids.join(','));
  assert(p.summary.sketches === 2, `summary.sketches ${p.summary.sketches}`);
  const rootF = p.bodies[0].faces.filter(f => f.name.startsWith('root/face['));
  assert(rootF.length === 1 && rootF[0].name.includes('back/end'), 'concave selects only the root edge');
  const recs = await call('faces', '>Z');
  assert(recs.length === 1 && recs[0].name === 'boss/end' && recs[0].normal[2] === 1 && recs[0].body === 'x/body1', JSON.stringify(recs));
  const byName = await call('faces', 'boss/end');
  assert(byName[0].area > 0, 'faces by name');
  const wf = await call('why', 'boss/end'), we = await call('why', 'boss/side[b.c] ∩ boss/end'), wft = await call('why', 'root');
  assert(wf.kind === 'face' && we.kind === 'edge' && wft.kind === 'feature', JSON.stringify([wf.kind, we.kind, wft.kind]));
  const o = await compile('08-selectors-stable.js', { options: { override: { w: '80 mm', 'box.d': '50 mm' } } });
  assert(near(o.metrics.bbox.value[0], 80) && near(o.metrics.bbox.value[1], 50), JSON.stringify(o.metrics.bbox.value));
  const lost = p.diagnostics.find(d => d.kind === 'ref.lost');
  assert(lost && lost.line === 4, `ref.lost line ${JSON.stringify(lost)}`);
  return 'run/compile, sketch:back, concave, 2 sketches, faces/why records, "80 mm" override, line 4';
});

await test('32 text: j.region.text, emboss cut/join on faces, sketch.text (real fonts)', async () => {
  const solo = await compile(`return j.part('t').extrude(j.region.text('PARTS', { size: mm(8) }), mm(1), { id: 'label' })`);
  const tv = solo.metrics.volume.value;
  assert(solo.bodies.length === 5 && tv > 50, `${solo.bodies.length} glyph bodies, ${tv}`);
  assert(Math.abs(solo.metrics.bbox.value[1] - 8) < 0.4, `cap height ${solo.metrics.bbox.value[1]}`);
  const cut = await compile(`return j.part('lid').extrude(j.region.rect(60, 40), mm(2), { id: 'plate' }).emboss(j.region.text('PARTS', { size: mm(8) }), mm(0.6), { on: j.feat('plate').endFace(), op: 'cut', id: 'label' })`);
  assert(cut.bodies.length === 1 && near(cut.metrics.volume.value, 4800 - 0.6 * tv, 1e-6), `cut ${cut.metrics.volume.value} vs ${4800 - 0.6 * tv}`);
  assert(cut.bodies[0].faces.some(f => f.name.startsWith('label/side[text.')), 'label faces named per glyph');
  const join = await compile(`return j.part('tag').extrude(j.region.rect(60, 20), mm(2), { id: 'plate' }).emboss(j.region.text('jig 0.4', { size: mm(5), font: 'mono' }), mm(0.8), { on: j.feat('plate').endFace(), id: 'label' })`);
  assert(join.bodies.length === 1 && join.metrics.volume.value > 2400 && near(join.bodies[0].bbox[1][2], 2.8), 'raised mono label on top');
  const sk = await compile(`return j.part('sk').extrude(j.sketch('s', { on: j.plane.XY }).text('t', 'AB', { size: mm(10) }).profiles(), mm(2), { id: 'txt' })`);
  assert(sk.bodies.length === 2 && sk.metrics.volume.value > 100, `sketch text ${sk.bodies.length}`);
  return `PARTS ${tv.toFixed(1)} mm³ per mm, cut and raised labels, sketch text`;
});
// A screw-invariant solid has the same cross-section at every z, so a thread clipped by two planes holds
// V = π·rm²·L + A·2π·r̄·L/P exactly (A, r̄: tooth area and centroid radius above rm; b, c: base and crest × P).
const pappus = (rM, rm, P, L, b = 0.75, c = 0.125) => { const d = rM - rm, B = b * P, C = c * P, A = (B + C) / 2 * d, rc = rm + d * (B + 2 * C) / (3 * (B + C)); return Math.PI * rm * rm * L + A * 2 * Math.PI * rc * L / P; };
await test('33 threads: external bolt, internal nut, printed tapped hole, 2-start trapezoid', async () => {
  const bolt = await compile(`return j.part('bolt').add(j.lib.thread('M8', { length: mm(12) }), { id: 'thread' })`);
  const f = await call('feature', 'thread');
  assert(near(f.modelled.major, 7.6) && f.pitch === 1.25, JSON.stringify(f.modelled));
  const v = bolt.metrics.volume.value, rM = 3.8, rm = 3.8 - 0.5413 * 1.25, want = pappus(rM, rm, 1.25, 12);
  assert(near(v, want, 1e-4), `bolt volume ${v} vs ${want}`);
  assert(v > Math.PI * rm * rm * 12 && v < Math.PI * rM * rM * 12, `bolt volume ${v} between core and crest cylinders`);
  assert(bolt.bodies.length === 1 && bolt.bodies[0].topology.residual === 0, `bolt bodies ${bolt.bodies.length} ${JSON.stringify(bolt.bodies[0].topology)}`);
  const bn = bolt.bodies[0].faces.map(x => x.name);
  assert(['thread/core', 'thread/flank.lo', 'thread/flank.hi', 'thread/crest', 'thread/start', 'thread/end'].every(n => bn.some(x => x === n || x.startsWith(n + '#'))), bn.join(', '));
  const hex = [[7, 0], [3.5, 6.06], [-3.5, 6.06], [-7, 0], [-3.5, -6.06], [3.5, -6.06]];
  const hexA = hex.reduce((s, p, i) => { const q = hex[(i + 1) % 6]; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
  const nut = await compile(`return j.part('nut').extrude(j.region.polygon(${JSON.stringify(hex)}), mm(6.5), { id: 'hex' }).add(j.lib.thread('M8', { length: mm(6.5), internal: true }), { id: 'thread' })`);
  const fn = await call('feature', 'thread');
  assert(near(fn.modelled.major, 8.4) && nut.bodies[0].topology.G === 1, `nut ${JSON.stringify(fn.modelled)} G ${nut.bodies[0].topology.G}`);
  const wantNut = hexA * 6.5 - pappus(4.2, 4.2 - 0.5413 * 1.25, 1.25, 6.5);
  assert(near(nut.metrics.volume.value, wantNut, 1e-4), `nut ${nut.metrics.volume.value} vs ${wantNut}`);
  const tap = await compile(`return j.part('blk').extrude(j.region.rect(20, 20), mm(10), { id: 'b' }).hole([[0, 0]], j.hole.tapped('M6', { depth: mm(8), method: 'printed' }), { id: 'tap' })`);
  const wantTap = 4000 - pappus(3.2, 3.2 - 0.5413, 1, 8);
  assert(near(tap.metrics.volume.value, wantTap, 1e-4) && tap.bodies[0].faces.some(x => x.name.startsWith('tap/thread.flank')), `printed thread in the hole: ${tap.metrics.volume.value} vs ${wantTap}`);
  const cap = await compile(`return j.part('neck').add(j.lib.thread({ d: mm(40), pitch: mm(3) }, { length: mm(8), profile: 'trapezoid', starts: 2 }), { id: 'neck' })`);
  const wantCap = pappus(19.8, 18.3, 3, 8, 0.634, 0.366);
  assert(cap.bodies.length === 1 && cap.bodies[0].bbox[1][2] <= 8 + 1e-6 && near(cap.metrics.volume.value, wantCap, 1e-4), `two-start neck ${cap.metrics.volume.value} vs ${wantCap}`);
  return `bolt ${v.toFixed(2)} mm³ (Pappus ${want.toFixed(2)}), nut ${nut.metrics.volume.value.toFixed(1)}, M6 printed tap, 2-start Tr40×3 ${cap.metrics.volume.value.toFixed(0)} mm³`;
});
await test('34 gears: generated involute spur, undercut, fit backlash, helical/herringbone, internal, rack, gearMesh', async () => {
  const G = await import('../../src/engine/gears.js');
  const a20 = Math.PI / 9, inv = a => Math.tan(a) - a;
  // the flank crosses the pitch circle at half the tooth thickness s/2 (s = πm/2 + 2xm·tan α − Δs), exactly
  for (const [z, x, ds] of [[20, 0, 0], [12, 0.4, 0.1], [40, -0.2, 0.2]]) {
    const T = G.toothFlank({ m: 2, z, alpha: a20, x, ds });
    const rp = z, rb = rp * Math.cos(a20), s = Math.PI + 4 * x * Math.tan(a20) - ds;
    const th = r => s / (2 * rp) + inv(a20) - inv(Math.acos(rb / r));
    const at = T.involute.find(([r]) => r > rp) ?? T.involute.at(-1);
    assert(near(at[1], th(at[0]), 1e-12) && near(th(rp), s / (2 * rp), 1e-12), `involute z${z}`);
    assert(near(T.fillet[0][0], rp - 2 * (1.25 - x), 1e-9) && T.fillet.at(-1)[0] >= rb - 1e-9, `fillet from the root circle z${z}`);
  }
  // undercut by the ISO 53 rack (tip radius 0.38 m): z ≥ 2/sin²α ≈ 17.1 is free of it; a shift of 1 − z·sin²α/2 cures it
  assert(G.toothFlank({ m: 1, z: 18, alpha: a20 }).undercut === false && G.toothFlank({ m: 1, z: 12, alpha: a20 }).undercut === true
    && G.toothFlank({ m: 1, z: 12, alpha: a20, x: 0.31 }).undercut === false, 'undercut limit');
  const sp = await compile(`return j.lib.gear.spur({ module: mm(1.5), teeth: 20, width: mm(6), bore: mm(5) })`);
  const ra = 15 + 1.5, rf = 15 - 1.25 * 1.5;
  const v = sp.metrics.volume.value;
  assert(v > Math.PI * (rf * rf - 6.25) * 6 && v < Math.PI * (ra * ra - 6.25) * 6, `spur volume ${v}`);
  assert(Math.max(...sp.metrics.bbox.value.slice(0, 2)) <= 2 * ra + 1e-6 && Math.max(...sp.metrics.bbox.value.slice(0, 2)) > 2 * ra - 0.5, `bbox ${sp.metrics.bbox.value}`);
  const fn = sp.bodies[0].faces.map(f => f.name);
  assert(fn.filter(n => /tip\]$/.test(n)).length === 20 && fn.filter(n => /filletR\]$/.test(n)).length === 20, '20 tips and root fillets');
  assert(sp.bodies[0].topology.G === 1 && sp.bodies[0].topology.residual === 0, 'bored spur');
  // backlash from the fit context: a tighter slide class makes thicker teeth (Δs = c / cos α per tooth)
  const tight = await compile(`return j.lib.gear.spur({ module: mm(1.5), teeth: 20, width: mm(6), bore: mm(5) }).fit(j.fit.profile('tight', { classes: { slide: mm(0.1) } }))`);
  const dv = tight.metrics.volume.value - v;
  const dvWant = 20 * (0.1 / Math.cos(a20)) * 6 * (ra - rf);   // ≈ thinning × tooth height × width, per tooth
  assert(dv > 0.6 * dvWant && dv < 1.1 * dvWant, `fit backlash: Δvolume ${dv} vs ≈ ${dvWant}`);
  const zero = await compile(`return j.lib.gear.spur({ module: mm(1.5), teeth: 20, width: mm(6), bore: mm(5), backlash: mm(0) })`);
  assert(zero.metrics.volume.value > tight.metrics.volume.value, 'explicit zero backlash');
  // twisting preserves the section: helical and herringbone volumes equal the spur's
  const base = `{ module: mm(1), teeth: 16, width: mm(6), bore: mm(3) }`;
  const s16 = await compile(`return j.lib.gear.spur(${base})`), hb = await compile(`return j.lib.gear.herringbone(${base})`), hx = await compile(`return j.lib.gear.helical(${base})`);
  assert(hb.bodies.length === 1 && near(hb.metrics.volume.value, s16.metrics.volume.value, 2e-4) && hb.bodies[0].topology.G === 1, `herringbone ${hb.metrics.volume.value} vs spur ${s16.metrics.volume.value}`);
  assert(near(hx.metrics.volume.value, s16.metrics.volume.value, 2e-4), `helical ${hx.metrics.volume.value}`);
  const ring = await compile(`return j.lib.gear.internal({ module: mm(1), teeth: 40, width: mm(5), rim: mm(3) })`);
  assert(ring.bodies[0].topology.G === 1, 'ring');
  const ringH = await compile(`return j.lib.gear.internal({ module: mm(1), teeth: 40, width: mm(5), rim: mm(3), herringbone: true })`);
  assert(ringH.bodies.length === 1 && near(ringH.metrics.volume.value, ring.metrics.volume.value, 2e-4), `herringbone ring ${ringH.metrics.volume.value} vs ${ring.metrics.volume.value}`);
  const rk = await compile(`return j.lib.gear.rack({ module: mm(1.5), teeth: 8, width: mm(6) })`);
  assert(near(rk.metrics.bbox.value[0], 8 * Math.PI * 1.5, 1e-6), `rack length ${rk.metrics.bbox.value[0]}`);
  const r = await W.handle({ id: 11, op: 'run', code: `
    const a = j.lib.gear.spur({ module: mm(1.5), teeth: 20 }), b = j.lib.gear.spur({ module: mm(1.5), teeth: 30 })
    const g = j.inspect.gearMesh(a, b), bad = j.inspect.gearMesh(a, b, { centreDistance: mm(38) })
    const sh = j.inspect.gearMesh(j.lib.gear.spur({ module: mm(1.5), teeth: 20, shift: 0.3 }), b)
    const h = j.inspect.gearMesh(j.lib.gear.herringbone({ module: mm(1), teeth: 16 }), j.lib.gear.herringbone({ module: mm(1), teeth: 32 }))
    const ri = j.inspect.gearMesh(j.lib.gear.spur({ module: mm(1), teeth: 12 }), j.lib.gear.internal({ module: mm(1), teeth: 40 }))
    return { ok: g.ok, cd: g.centreDistance.value, eps: g.contactRatio, bad: bad.ok, sh: sh.centreDistance.value, hand: h.ok, hm: h.messages, icd: ri.centreDistance.value, iok: ri.ok, im: ri.messages }` });
  assert(r.ok, r.error?.message);
  assert(r.value.ok && near(r.value.cd, 37.5) && r.value.eps > 1.4 && r.value.eps < 1.8 && r.value.bad === false, JSON.stringify(r.value));
  let aw = a20; const tgt = inv(a20) + 2 * Math.tan(a20) * 0.3 / 50; for (let k = 0; k < 50; k++) aw -= (inv(aw) - tgt) / Math.tan(aw) ** 2;
  assert(near(r.value.sh, 37.5 * Math.cos(a20) / Math.cos(aw), 1e-9), `shifted centre distance ${r.value.sh}`);
  assert(r.value.hand === false && /opposite hands/.test(r.value.hm.join()), 'herringbone pair needs opposite hands');
  assert(near(r.value.icd, 14) && /undercut/.test(r.value.im.join()), `internal ${JSON.stringify(r.value)}`);
  const ports = await W.handle({ id: 12, op: 'run', code: `const g = j.lib.gear.spur({ module: mm(2), teeth: 10 }); return g.meta.ports.map(p => p.name + ':' + p.frame.origin[0])` });
  assert(ports.value.join() === 'axis:0,pitch:10', ports.value.join());
  return `spur ${v.toFixed(0)} mm³ (+${dv.toFixed(1)} at slide 0.1), herringbone = spur ±${Math.abs(hb.metrics.volume.value / s16.metrics.volume.value - 1).toExponential(0)}, centre distance 37.5 → ${r.value.sh.toFixed(3)} with x = 0.3, ε ${r.value.eps.toFixed(2)}`;
});
await test('35 print-in-place pin hinge (two parts, one part with plates), snap hook, living hinge, dovetail with fit', async () => {
  const h = await compile(`const hinge = j.lib.hinge.pin({ knuckles: 5, length: mm(50), d: mm(3) })
    const at = j.frame({ origin: j.pt(0, 0, 0), x: j.dir('+Y'), z: j.dir('+X') })
    return j.assembly('h').add('a', j.part('a').add(hinge, { at, leaf: 'a', id: 'hinge' })).add('b', j.part('b').add(hinge, { at, leaf: 'b', id: 'hinge' })).printInPlace(['a', 'b'], { check: true })`);
  assert(!errs(h).length, JSON.stringify(errs(h)));
  const gap = h.decisions.find(d => d.kind === 'gap');
  assert(Math.abs(parseFloat(gap.chose) - 0.4) < 1e-3, `gap ${gap.chose}`);
  assert(h.bodies.filter(b => b.part === 'a').length === 1 && h.bodies.filter(b => b.part === 'b').length === 2, 'leaf a: knuckles fused by the pin; leaf b: two bored knuckles');
  // a whole print-in-place hinge in one part: two leaves with plates, notched around each other's knuckles
  const both = await compile(`return j.part('h').add(j.lib.hinge.pin({ knuckles: 5, length: mm(40), d: mm(3), plates: { width: mm(20), thickness: mm(2) } }), { leaf: 'both', id: 'hinge' })`);
  const hb = await call('feature', 'hinge');
  assert(!errs(both).length && both.bodies.length === 2 && near(hb.gap, 0.4, 1e-6) && both.bodies.every(b => b.topology.G === 2), `both leaves: ${both.bodies.length} bodies, gap ${hb.gap}, G ${both.bodies.map(b => b.topology.G)}`);
  // a hinge leaf cuts room for the other leaf's knuckles out of the body it joins
  const lid = await compile(`return j.part('lid').add(j.box(40, 30, 3.5), { at: j.tx.move(0, 0, 0), id: 'plate' }).add(j.lib.hinge.pin({ knuckles: 3, length: mm(40), d: mm(3) }), { at: j.frame({ origin: j.pt(0, 0, 3.5), x: j.dir('+Y'), z: j.dir('+X') }), leaf: 'a', id: 'hinge' })`);
  assert(lid.bodies.length === 1 && lid.bodies[0].faces.some(f => f.name.startsWith('hinge/room')), 'room cut into the lid');
  const snapP = await compile(`return j.part('s').add(j.box(20, 10, 3), { id: 'base' }).add(j.lib.snap.cantilever({ length: mm(12), thickness: mm(1.6), deflection: mm(1), width: mm(6) }), { at: j.tx.move(10, 5, 3), id: 'hook' })`);
  const sh = await call('feature', 'hook'), ramp = 1 / Math.tan(Math.PI / 6);
  assert(near(snapP.metrics.volume.value, 600 + 6 * (1.6 * 12 + 0.3 + ramp / 2), 1e-9) && snapP.bodies[0].faces.some(f => f.name === 'hook/ramp') && near(sh.insertionForce, 7.923, 1e-3), `snap ${snapP.metrics.volume.value} ${JSON.stringify(sh)}`);
  const lv = await compile(`return j.part('cap').add(j.box(30, 20, 2), { id: 'a' }).add(j.box(30, 20, 2), { at: j.tx.move(0, 21, 0), id: 'b' }).add(j.lib.hinge.living({ length: mm(30), thickness: layer(2), material: 'PP' }), { at: j.tx.move(15, 20.5, 0), id: 'hinge' })`);
  assert(lv.bodies.length === 1, 'living hinge joins both leaves');
  const dv = await compile(`return j.part('right').add(j.box(80, 40, 10), { id: 'b' }).add(j.lib.dovetail({ width: mm(20), depth: mm(6), angle: deg(15), fit: 'slide' }), { at: j.frame.on(j.sel.faces('>X').expect(1)), op: 'cut', id: 'dovetail' })`);
  const hw = 10.2, tw = hw + 6 * Math.tan(Math.PI / 12), zd = 6.2, tw2 = tw + 0.2 * Math.tan(Math.PI / 12);
  const area = (2 * hw + 2 * tw2) / 2 * zd;
  assert(Math.abs(dv.metrics.volume.value - (32000 - area * 10)) < 0.5, `socket ${dv.metrics.volume.value} vs ${32000 - area * 10}`);
  return `knuckle gap ${gap.chose}, one-part hinge 2 leaves, room cut, snap ramp, living hinge 1 body, socket ${(32000 - dv.metrics.volume.value).toFixed(1)} mm³`;
});
await test('36 draft, rib, thicken', async () => {
  const d = await compile(`return j.part('d').extrude(j.region.rect(40, 30), mm(20), { id: 'body' }).draft(j.feat('body').sideFaces(), deg(5), { id: 'dr' })`);
  const t = 20 * Math.tan(5 * Math.PI / 180), A0 = 1200, A1 = (40 - 2 * t) * (30 - 2 * t), Am = (40 - t) * (30 - t);
  assert(near(d.metrics.volume.value, 20 / 6 * (A0 + 4 * Am + A1), 1e-6), `draft ${d.metrics.volume.value} vs prismatoid ${20 / 6 * (A0 + 4 * Am + A1)}`);
  assert(d.bodies[0].faces.filter(f => f.name.startsWith('body/side[')).length === 4, 'drafted faces keep their names');
  const r = await compile(`return j.part('c').extrude(j.region.rect(60, 40), mm(30), { id: 'body' }).shell(j.feat('body').endFace(), mm(2), { id: 'shell' })
    .rib(j.sketch('div', { on: j.plane.XZ }).line('l', [-28, 25], [28, 25]).wire(['l']), mm(1.6), { direction: '-Z', id: 'divider' })`);
  assert(near(r.metrics.volume.value, 15552 + 1.6 * 56 * 23, 1e-6), `rib ${r.metrics.volume.value}`);
  const th = await compile(`return j.part('t').extrude(j.region.rect(40, 30), mm(5), { id: 'body' }).thicken(j.feat('body').endFace(), mm(2), { id: 'th' })`);
  assert(near(th.metrics.volume.value, 8400), `thicken ${th.metrics.volume.value}`);
  return 'prismatoid volume after draft, rib 1.6 × 56 × 23, thicken 2 mm';
});
await test('37 split-to-fit with dowels or a dovetail; countersunk screw holes', async () => {
  const p = await compile(`return j.print('bar', { printer: j.printer('mk4') }).add('bar', j.part('bar').add(j.box(400, 20, 20), { id: 'b' })).split('bar', { fit: 'bed', joint: j.lib.dowel({ d: mm(4), l: mm(12), fit: 'press' }) })`);
  assert(!errs(p).length && p.bodies.length === 2 && p.bodies.map(b => b.id).join() === 'bar.a/body1,bar.b/body1', p.bodies.map(b => b.id).join());
  const hole = Math.PI * (4.2 / 2) ** 2 * 13;
  assert(near(p.metrics.volume.value, 160000 - hole, 1e-6), `pieces ${p.metrics.volume.value} vs ${160000 - hole}`);
  const dj = p.decisions.find(d => d.kind === 'joint');
  assert(/1 × dowel Ø4/.test(dj.chose) && !p.print.orientation.bar, dj.chose);
  // a sliding dovetail instead of dowels: tail on the piece below the cut, socket (+ slide gap) above, along +Z
  const dvt = await compile(`return j.print('bar', { printer: j.printer('mk4') }).add('bar', j.part('bar').add(j.box(400, 30, 20), { id: 'b' })).split('bar', { fit: 'bed', joint: j.lib.dovetail({ width: mm(10), depth: mm(6), fit: 'slide' }) })`);
  const t15 = Math.tan(Math.PI / 12), tailA = (5 + 5 + 6 * t15) * 6, sockA = (5.2 + 5.2 + 6.2 * t15) * 6.2;
  const [pa, pb] = dvt.bodies;
  assert(dvt.bodies.length === 2 && near(pa.volume, 120000 + 20 * tailA, 1e-6) && near(pb.volume, 120000 - 20 * sockA, 1e-5), `dovetail pieces ${pa?.volume} ${pb?.volume} vs ${120000 + 20 * tailA} ${120000 - 20 * sockA}`);
  assert(/dovetail 10\.0 × 6\.0 mm at 15°, sliding along \+Z/.test(dvt.decisions.find(d => d.kind === 'joint').chose), 'dovetail joint decision');
  const tray = await compile(`return j.print('desk', { printer: j.printer('mk4') }).add('tray', j.part('tray').extrude(j.region.rect(320, 140, { r: 6 }), mm(40), { id: 'body' }).shell(j.feat('body').endFace(), mm(3), { id: 'shell' })).split('tray', { fit: 'bed' })`);
  const sd = tray.decisions.find(d => d.kind === 'split');
  assert(/seam 642 mm²/.test(sd.reason) && tray.diagnostics.some(d => d.kind === 'print.split'), sd.reason);
  const cs = await compile(`return j.part('p').extrude(j.region.rect(30, 20), mm(6), { id: 'b' }).hole([[0, 0]], j.hole.countersink('M3'), { id: 'cs' })`);
  const hcs = (3.56 - 1.75), want = 3600 - Math.PI * 1.75 ** 2 * (6 - hcs) - Math.PI * hcs / 3 * (3.56 ** 2 + 3.56 * 1.75 + 1.75 ** 2);
  assert(near(cs.metrics.volume.value, want, 1e-6) && cs.bodies[0].faces.some(f => f.name === 'cs/csink[1]' && f.kind === 'cone'), `countersink ${cs.metrics.volume.value} vs ${want}`);
  return `bar → 2 pieces + Ø4 dowel or a 10 × 6 mm dovetail, tray seam 642 mm², M3 countersink ${cs.metrics.volume.value.toFixed(2)} mm³`;
});

await test('38 fit functions and names, exact region areas, Latin hypercube, Pareto fronts, hollow and core-less threads', async () => {
  // (1) a holeComp function: j.fit.hole(5, slide) = 5 + 2·0.2 + holeComp(5.4)
  const f1 = await compile(`const p = j.fit.profile('mine', { holeComp: d => mm(0.1).add(d.mul(0.01)) })
    return j.part('a').fit(p).extrude(j.region.rect(20, 20), mm(5), { id: 'b' }).hole([[0, 0]], j.hole.simple(j.fit.hole(mm(5), 'slide')), { id: 'h' })`);
  const h = await call('feature', 'h');
  assert(!errs(f1).length && near(h.modelled, 5.4 + 0.1 + 0.054), `holeComp fn: ${h.modelled} ${JSON.stringify(errs(f1))}`);
  // (2) gap.<class> in expressions; a j.fit.gap value as a param (both follow the fit context)
  const f2 = await compile(`return j.part('a').params({ w: mm(20), g: j.fit.gap('slide'), t: 'gap.slide * 10' }).extrude(j.region.rect('w + g', 'w + gap.free'), 't', { id: 'b' })`);
  assert(!errs(f2).length && near(f2.metrics.volume.value, 20.2 * 20.3 * 2), `gap names ${f2.metrics.volume.value} ${JSON.stringify(f2.diagnostics)}`);
  assert(f2.params.find(r => r.name === 'g').text.startsWith('0.2'), 'j.fit.gap param resolved');
  const f2b = await compile(`return j.part('a').params({ w: mm(20), g: j.fit.gap('slide'), t: 'gap.slide * 10' }).extrude(j.region.rect('w + g', 'w + gap.free'), 't', { id: 'b' })`, { options: { override: { 'gap.slide': 0.1 } } });
  assert(near(f2b.metrics.volume.value, 20.1 * 20.3 * 1) && !f2b.trace.find(t => t.pass === 'feature:b').cached, `gap override recomputes: ${f2b.metrics.volume.value}`);
  // (3) region areas with arcs are exact (Green's theorem)
  const r3 = await W.handle({ id: 13, op: 'run', code: `return [j.region.rect(20, 10, { r: 3 }).area(), j.region.slot([0, 0], [10, 0], 4).area(), j.region.circle(5).subtract(j.region.circle(2)).area()]` });
  assert(r3.ok && near(r3.value[0], 200 - (4 - Math.PI) * 9, 1e-12) && near(r3.value[1], 40 + Math.PI * 4, 1e-12) && near(r3.value[2], Math.PI * 21, 1e-12), JSON.stringify(r3.value));
  // (4) Latin hypercube strata and Pareto fronts
  const r4 = await W.handle({ id: 14, op: 'run', code: `
    const d = j.design({ a: j.param.range(0, 1), b: j.param.range(mm(10), mm(20)), n: j.param.int(1, 5) }, p => j.part('x'))
    const pts = d.lhs(5, { seed: 7 })
    const strata = k => pts.map(p => Math.floor((k === 'a' ? p.a : (p.b.value - 10) / 10) * 5)).sort().join()
    const box = j.design({ w: j.param.range(mm(10), mm(40), { step: mm(10) }), h: j.param.range(mm(2), mm(8), { step: mm(2) }) },
      p => j.part('box').extrude(j.region.rect(p.w, mm(10)), p.h, { id: 'b' }))
    const res = await j.search.grid(box, { objective: j.objective.pareto([j.objective.minimize('volume'), j.objective.maximize('area')]) })
    return { a: strata('a'), b: strata('b'), n: pts.map(p => p.n).sort().join(), fronts: res.ranked.map(r => r.front), front1: res.front.length, firstCrowd: res.ranked[0].crowding }` });
  assert(r4.ok, r4.error?.message);
  assert(r4.value.a === '0,1,2,3,4' && r4.value.b === '0,1,2,3,4' && r4.value.n === '1,2,3,4,5', `LHS strata ${JSON.stringify(r4.value)}`);
  const fr = r4.value.fronts;
  assert(fr.every((x, i) => !i || x >= fr[i - 1]) && fr[0] === 1 && r4.value.front1 >= 1 && r4.value.front1 < fr.length, `pareto fronts ${fr}`);
  // threads: core: false (a ridge for a hollow neck), bore (a threaded tube)
  const jar = await compile(`return j.part('jar').extrude(j.region.circle(mm(22.8)), mm(40), { id: 'body' }).shell(j.feat('body').endFace(), mm(2), { id: 'cup' })
    .add(j.lib.thread({ d: mm(50), pitch: mm(4) }, { length: mm(10), profile: 'trapezoid', core: false }), { at: j.tx.move(0, 0, 28), id: 'thread' })`);
  const cup = await compile(`return j.part('jar').extrude(j.region.circle(mm(22.8)), mm(40), { id: 'body' }).shell(j.feat('body').endFace(), mm(2), { id: 'cup' })`);
  const ridge = pappus(24.8, 22.8, 4, 10, 0.634, 0.366) - Math.PI * 22.8 ** 2 * 10;
  assert(jar.bodies.length === 1 && near(jar.metrics.volume.value - cup.metrics.volume.value, ridge, 2e-4), `jar ridge ${jar.metrics.volume.value - cup.metrics.volume.value} vs ${ridge}`);
  const tube = await compile(`return j.part('tube').add(j.lib.thread('M12', { length: mm(15), bore: mm(6) }), { id: 'thread' })`);
  const wantTube = pappus(5.8, 5.8 - 0.5413 * 1.75, 1.75, 15) - Math.PI * 9 * 15;
  assert(tube.bodies.length === 1 && tube.bodies[0].topology.G === 1 && near(tube.metrics.volume.value, wantTube, 1e-4), `tube ${tube.metrics.volume.value} vs ${wantTube}`);
  return `holeComp fn Ø${h.modelled}, gap.slide in expressions, rounded-rect area exact, LHS strata, ${r4.value.front1} Pareto-optimal of ${fr.length}, jar ridge and M12 tube`;
});

await test('39 household fixes: text params, round heads on teardrops, expression points, region booleans, explicit fillets, size expressions, noEffect, exact 45°, chamfer order, multi-part param names', async () => {
  const kinds = p => p.diagnostics.filter(d => d.level !== 'info').map(d => d.kind);
  // 1 text follows a text param (and its override)
  const t1 = `return j.part('t').params({ name: j.lit('AB') }).extrude(j.region.text(j.ref('name'), { size: mm(8) }), mm(1), { id: 'label' })`;
  const a1 = await compile(t1), b1 = await compile(t1, { options: { override: { name: 'WXYZ' } } });
  assert(a1.bodies.length === 2 && b1.bodies.length === 4 && !kinds(a1).length, `text param: ${a1.bodies.length} / ${b1.bodies.length} glyphs`);
  // 2 a horizontal countersink keeps its cone; only the bore is a teardrop
  const job = cs => `return j.print('j', { printer: j.printer('mk4') }).add('p', j.part('p').add(j.box(20, 20, 10), { id: 'b' }).hole([j.pt(20, 10, 5)], ${cs}, { id: 'cs' })).orient('+Z')`;
  const c2 = await compile(job(`j.hole.countersink('M4')`)), s2 = await compile(job(`j.hole.clearance('M4')`));
  assert(c2.bodies[0].faces.some(f => f.name === 'cs/csink[1]' && f.kind === 'cone') && c2.metrics.volume.value < s2.metrics.volume.value - 10
    && /countersink stays round/.test(c2.decisions.find(d => d.kind === 'teardrop').reason), 'countersink kept on a teardrop hole');
  // 3 hole points given as expressions
  const p3 = await compile(`return j.part('p').params({ x: mm(5) }).extrude(j.region.rect(20, 20), mm(5), { id: 'b' }).hole([['x', 0]], j.hole.simple(mm(3)), { id: 'h' })`);
  const bore = p3.bodies[0].faces.find(f => f.name.startsWith('h/bore'));
  assert(!kinds(p3).length && near(p3.metrics.volume.value, 2000 - Math.PI * 2.25 * 5, 1e-9) && near(bore.center[0], 5, 1e-9), 'expression hole point');
  // 4 overlapping regions fuse; a crossing subtract is a real boolean; exact areas
  const u4 = await compile(`return j.part('f').extrude(j.region.circle(mm(55)).union(j.region.slot([0, 0], [80, 0], mm(20))).subtract(j.region.circle(mm(4), { at: [80, 0] })), mm(5), { id: 'b' })`);
  const chord = 10 * Math.sqrt(55 ** 2 - 100) + 55 ** 2 * Math.asin(10 / 55), want4 = Math.PI * 55 ** 2 + 1600 - chord + Math.PI * 50 - Math.PI * 16;
  assert(u4.bodies.length === 1 && u4.bodies[0].topology.G === 1 && near(u4.metrics.volume.value, 5 * want4, 1e-6), `union ${u4.bodies.length} bodies, ${u4.metrics.volume.value} vs ${5 * want4}`);
  const r4 = await W.handle({ id: 15, op: 'run', code: `return j.region.rect(40, 20).subtract(j.region.circle(mm(15), { at: [20, 0] })).area()` });
  assert(near(r4.value, 800 - (10 * Math.sqrt(125) + 225 * Math.asin(10 / 15)), 1e-6), `crossing subtract ${r4.value}`);
  // 5 fillets on an explicit polyline: no redundant-constraint warnings
  const p5 = await compile(`return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).polyline('p', [[0, 0], [40, 0], [40, 30], [0, 30]], { closed: true }).fillet('f', 'p.1.end', 3).profiles(), mm(5), { id: 'b' })`);
  assert(!p5.diagnostics.some(d => d.kind === 'sketch.redundant') && p5.diagnostics.some(d => d.kind === 'sketch.implied'), 'explicit fillet quiet');
  // 6 a param name where a size is expected
  const p6 = await compile(`return j.part('p').params({ screw_d: mm(4) }).extrude(j.region.rect(20, 20), mm(6), { id: 'b' }).hole([[0, 0]], j.hole.countersink('screw_d', mm(8), deg(90)), { id: 'cs' })`);
  assert(!kinds(p6).length && near(p6.metrics.volume.value, 2400 - Math.PI * 2 / 3 * (16 + 8 + 4) - Math.PI * 4 * 4, 1e-9), `size expression ${p6.metrics.volume.value}`);
  // 7 cuts and joins that change nothing warn
  const miss = await compile(`return j.part('p').extrude(j.region.rect(20, 20), mm(5), { id: 'b' }).cut(j.region.circle(mm(3)).on(j.plane.offset(j.plane.XY, mm(10))), mm(4), { id: 'away' })`);
  const inner = await compile(`return j.part('p').extrude(j.region.rect(20, 20), mm(5), { id: 'b' }).extrude(j.region.rect(4, 4), mm(2), { id: 'inside', op: 'join' })`);
  const fine = await compile(`return j.part('p').extrude(j.region.rect(20, 20), mm(5), { id: 'b' }).hole([[0, 0]], j.hole.simple(mm(3)), { id: 'h' })`);
  assert(miss.diagnostics.some(d => d.kind === 'feature.noEffect' && d.at === 'away') && inner.diagnostics.some(d => d.kind === 'feature.noEffect' && d.at === 'inside') && !fine.diagnostics.some(d => d.kind === 'feature.noEffect'), 'feature.noEffect');
  // 8 an exact 45° countersink is not an overhang; asymmetric chamfers measure d on the same kind of face
  const p8 = await compile(`return j.print('j', { printer: j.printer('mk4') }).add('c', j.part('c').extrude(j.region.circle(mm(10)), mm(10), { id: 'b' }).hole([[0, 0]], j.hole.countersink('M4'), { id: 'cs' })).orient('-Z')`);
  assert(p8.print.orientation.c.overhangArea === 0, `45° overhang ${p8.print.orientation.c.overhangArea}`);
  const ch = await compile(`return j.part('c').extrude(j.region.polygon([[10, 0], [5, 8.66], [-5, 8.66], [-10, 0], [-5, -8.66], [5, -8.66]]), mm(10), { id: 'b' }).chamfer(j.feat('b').endFace().edges(), mm(1), { d2: mm(3), id: 'ch' })`);
  const zs = ch.bodies[0].faces.filter(f => f.name.startsWith('ch/')).map(f => f.center[2]);
  assert(zs.length === 6 && zs.every(z => Math.abs(z - zs[0]) < 1e-4) && zs[0] > 9, `chamfer faces z ${zs}`);
  // 9 multi-part names: overrides by job item id or part name; links resolve plain and part-prefixed names
  const multi = `const jar = j.part('jar').params({ d: mm(30) }).extrude(j.region.circle('d / 2'), mm(10), { id: 'b' })
    const lid = j.part('lid').params({ t: mm(2) }).extrude(j.region.circle(mm(20)), 't', { id: 'b' })
    return j.print('set', { printer: j.printer('mk4') }).add('front', jar).add('top', lid)`;
  const m0 = await compile(multi), m1 = await compile(multi, { options: { override: { 'front.d': '20 mm' } } }), m2 = await compile(multi, { options: { override: { 'jar.d': '20 mm' } } });
  const vj = p => p.bodies.find(b => b.id.startsWith('front/')).volume;
  assert(near(vj(m1), Math.PI * 100 * 10, 1e-9) && near(vj(m2), Math.PI * 100 * 10, 1e-9) && near(vj(m0), Math.PI * 225 * 10, 1e-9), `multi-part overrides ${vj(m0)} ${vj(m1)} ${vj(m2)}`);
  const { resolveParamName } = await import('../../src/host/param-names.js');
  const rows = m0.params;
  assert(resolveParamName(rows, 'd').name === 'front.d' && resolveParamName(rows, 'jar.d').name === 'front.d' && resolveParamName(rows, 'front.d').name === 'front.d' && resolveParamName(rows, 'q').error, JSON.stringify(rows.map(r => [r.name, r.partName])));
  return 'text param, csink on teardrop, [x, 0], fused union, quiet explicit fillet, screw_d size, noEffect, 45° cone ok, chamfer d on sides, front.d / jar.d / d';
});

await test('40 region subtract/union placement, sketch pattern holes, fit values as quantities, expression transforms and axes, M10×20, assemblies in print jobs, shared job params, mesh interference', async () => {
  // A circle minus a rectangle that crosses it (2D boolean): area = circle − the cap above y = 5
  const a = await compile(`return j.part('a').extrude(j.region.circle(10).subtract(j.region.rect(30, 10, { at: [0, 10] })), mm(1), { id: 'b' })`);
  const cap = 100 * Math.acos(0.5) - 5 * Math.sqrt(75);
  assert(near(a.metrics.volume.value, Math.PI * 100 - cap, 1e-6) && near(a.metrics.bbox.value[1], 15, 1e-9), `A ${a.metrics.volume.value} vs ${Math.PI * 100 - cap}`);
  // B holes at sketch pattern copies
  const b = await compile(`return j.part('a').extrude(j.region.rect(60, 40), mm(5), { id: 'b' }).hole(j.sketch('h', { on: j.plane.offset(j.plane.XY, mm(5)) }).point('p', [-20, 0]).pattern(['p'], j.pattern.linear(j.dir('+X'), { count: 3, step: mm(20) })), j.hole.simple(mm(3)), { id: 'holes' })`);
  assert(b.bodies[0].faces.filter(f => f.name.startsWith('holes/bore')).length === 3, 'B three pattern holes');
  // C union keeps placement
  const c = await compile(`return j.part('a').extrude(j.region.circle(5, { at: [20, 0] }).union(j.region.rect(4, 4, { at: [20, 3] })), mm(1), { id: 'b' })`);
  assert(c.bodies.length === 1 && near(c.metrics.bbox.value[0], 10, 1e-9) && near(c.bodies[0].bbox[0][0], 15, 1e-9), `C ${JSON.stringify(c.bodies[0].bbox)}`);
  // D / 4 fit values are quantities: arithmetic, sketch dimensions, params
  const d = await compile(`const r = j.fit.pin(mm(5), 'slide').div(2)
    return j.part('a').params({ g: j.fit.gap('free') }).extrude(j.sketch('s', { on: j.plane.XY }).circle('c', r).profiles(), mm(2), { id: 'b' })
      .extrude(j.region.rect('10 mm + g', 4, { at: [20, 0] }), mm(1), { id: 'c' })`);
  assert(near(d.bodies.find(x => x.faces.some(f => f.name.startsWith('b/'))).volume, Math.PI * 2.3 ** 2 * 2, 1e-9) && d.metrics.bbox.value[0] > 0, `D ${d.bodies.map(x => x.volume)}`);
  // E / 1 / 3 expressions in transforms, frames and axes
  const e = await compile(`return j.part('a').params({ w: mm(40), k: mm(7), a: mm(20) })
    .add(j.box(10, 10, 10), { at: j.tx.move('w / 2', 0, 'k'), id: 'b' })
    .extrude(j.region.rect(10, 10).on(j.frame({ origin: j.pt('w', 0, 'k'), z: j.dir('+Z') })), mm(2), { id: 'e' })
    .revolve(j.region.rect(4, 10, { at: [30, 5] }).on(j.plane.XZ), j.axis.through(j.pt('a', 0, 0), j.pt('a', 0, 1)), turn(1), { id: 'r', op: 'new' })`);
  const box = e.bodies.find(x => x.faces.some(f => f.name.startsWith('b/'))), rev = e.bodies.find(x => x.faces.some(f => f.name.startsWith('r/')));
  assert(near(box.bbox[0][0], 20) && near(box.bbox[0][2], 7) && e.bodies.some(x => near(x.bbox[0][0], 35) && near(x.bbox[0][2], 7)), 'E move and frame');
  assert(near(rev.volume, Math.PI * (12 ** 2 - 8 ** 2) * 10, 1e-6), `1 revolve about an expression axis ${rev.volume}`);
  // 2 the M10 × 20 thread fuses
  const t2 = await compile(`return j.part('b').add(j.lib.thread('M10', { length: mm(20) }), { id: 't' })`);
  assert(t2.bodies.length === 1 && near(t2.metrics.volume.value, pappus(4.8, 4.8 - 0.5413 * 1.5, 1.5, 20), 1e-4), `M10×20 ${t2.metrics.volume.value}`);
  // 6 an assembly prints as one item, in its print pose even when the joint has a value
  const asm = `const hinge = j.lib.hinge.pin({ knuckles: 3, length: mm(30), d: mm(3) })
    const at = j.frame({ origin: j.pt(0, 0, 0), x: j.dir('+Y'), z: j.dir('+X') })
    const asm = j.assembly('h').add('a', j.part('a').add(hinge, { at, leaf: 'a', id: 'hinge' })).add('b', j.part('b').add(hinge, { at, leaf: 'b', id: 'hinge' })).printInPlace(['a', 'b'])`;
  const p6 = await compile(`${asm}\n return j.print('job', { printer: j.printer('mk4') }).add('hinge', asm)`);
  const items = p6.print.plates.flatMap(pl => pl.items);
  assert(items.length === 2 && JSON.stringify(items[0].transform) === JSON.stringify(items[1].transform) && Object.keys(p6.print.orientation).join() === 'hinge', `6 one item ${JSON.stringify(items.map(i => i.body))}`);
  // F shared job params: one value for box and lid, listed once
  const job = `const box = j.part('box').params({ W: mm(60), H: mm(20) }).extrude(j.region.rect('W', 'W'), 'H', { id: 'b' })
    const lid = j.part('lid').params({ W: mm(60) }).extrude(j.region.rect('W', 'W'), mm(2), { id: 'b' })
    return j.print('enc', { printer: j.printer('mk4') }).params({ W: mm(80) }).add('box', box).add('lid', lid)`;
  const f0 = await compile(job), f1 = await compile(job, { options: { override: { W: '70 mm' } } });
  const vol = (p, id) => p.bodies.find(x => x.id.startsWith(id + '/')).volume;
  assert(near(vol(f0, 'box'), 6400 * 20) && near(vol(f0, 'lid'), 6400 * 2) && near(vol(f1, 'box'), 4900 * 20) && near(vol(f1, 'lid'), 4900 * 2), 'F shared W');
  const names = f1.params.map(r => r.name);
  assert(names.filter(n => /(^|\.)W$/.test(n)).join() === 'W' && f1.params.find(r => r.name === 'W').shared, `F rows ${names}`);
  // 5 interference between gears uses meshes (fast) and is traced
  const g5 = await compile(`const p = j.lib.gear.spur({ module: mm(1), teeth: 18, width: mm(4) }), w = j.lib.gear.spur({ module: mm(1), teeth: 30, width: mm(4) })
    return j.assembly('g').add('p', p, { ground: true, at: j.tx.rotate(j.axis.Z, deg(10)) }).add('w', w, { at: j.tx.move(24, 0, 0) }).interference()`);
  const it = g5.trace.find(t => t.pass === 'interference');
  assert(it && /1 mesh/.test(it.note) && !errs(g5).length && /≈ 0\.\d+ mm/.test(g5.decisions.find(x => x.kind === 'gap').chose), `5 ${it?.note} ${g5.decisions.find(x => x.kind === 'gap')?.chose}`);
  return `A ${a.metrics.volume.value.toFixed(1)} mm³, B 3 holes, C placed, D fit quantities, E/1 expressions, M10×20, 6 one posed item, F one W, gears ${g5.decisions.find(x => x.kind === 'gap').chose}`;
});

await test('41 sketch lines: entities, constraints and dims carry their script.js line, also from a cached feature', async () => {
  const src = readFileSync(join(HERE, '../../content/presets/A-03-constrained-plate/script.js'), 'utf8');
  const lineOf = (text, needle) => text.split('\n').findIndex(l => l.includes(needle)) + 1;
  const check = (p, text, tag) => {
    const sk = p.sketches.find(s => s.id === 'outline'), K = id => sk.constraints.find(k => k.id === id), E = id => sk.entities.find(e => e.id === id);
    const want = { l2: lineOf(text, ".line('l2'"), fix: lineOf(text, 'j.c.fix('), eq: lineOf(text, "j.c.equal('h2'"), w: lineOf(text, ".dim('l1', 'w')"), edge: lineOf(text, "'edge')") };
    assert(E('l2').line === want.l2 && K('coincident(l2.start, l1.end)').line === want.l2, `${tag} l2 line ${E('l2').line} ≠ ${want.l2}`);
    assert(K('fix(l1.start)').line === want.fix && K('equal(h2, h1)').line === want.eq, `${tag} constrain lines ${K('fix(l1.start)').line}, ${K('equal(h2, h1)').line}`);
    assert(K('dim(l1)').line === want.w && K('dim(l1)').expr === 'w' && K('dim(l1.start, h1.center)').line === want.edge && K('dim(l1.start, h1.center)').expr === 'edge', `${tag} dim lines`);
    return want;
  };
  const p0 = await compile(src), w0 = check(p0, src, 'first');
  const moved = '// two lines\n// above everything\n' + src;
  const p1 = await compile(moved);
  assert(p1.trace.some(t => t.pass === 'feature:body' && t.cached), 'the extrude is cached across the edit');
  const w1 = check(p1, moved, 'cached');
  assert(w1.fix === w0.fix + 2, 'lines moved by two');
  const r = await W.handle({ id: 4, op: 'solveSketch', sketchId: 'outline', drag: { ref: 'h2.center', to: [50, 10] } });
  assert(r.ok && r.sketch.constraints.find(k => k.id === 'fix(l1.start)').line === w1.fix, 'a drag keeps the lines');
  const p2 = await compile(moved);
  assert(near(p2.sketches[0].entities.find(e => e.id === 'h2').c[0], 60), 'a recompile drops the drag');
  return `fix(l1.start) at script.js:${w0.fix}, then :${w1.fix} from the cache`;
});

await test('42 a blend that would drop another feature is refused; mesh interference sees meshes passing through each other', async () => {
  // a 1 mm fillet round a Ø16 hub reaches r = 9, the crank's nearest point: OpenCascade drops the crank without an error
  const p = await compile(`return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(1), { id: 'hub-root' })`);
  const d = p.diagnostics.find(x => x.kind === 'fillet.tangent');
  assert(d && d.at === 'hub-root' && /rim exactly on crank\/side\[circle\], crank\/end/.test(d.message) && /0\.98 mm and 1\.02 mm work/.test(d.message), JSON.stringify(d));
  assert(near(p.bodies[0].bbox[1][2], 22), 'the crank is still there');
  const ok = await compile(`return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(0.8), { id: 'hub-root' })`);
  assert(!errs(ok).length && ok.bodies[0].faces.some(f => f.name === 'hub-root/face[hub/side[circle] ∩ disc/end]') && near(ok.bodies[0].bbox[1][2], 22), 'r = 0.8 keeps the crank');
  // a filleted peg through a gear's bore: every vertex is clear of the other mesh, yet the solids overlap
  const peg = r => `const g = j.lib.gear.spur({ module: mm(1), teeth: 24, width: mm(4) }).hole([[0, 0]], j.hole.simple(mm(5.3)), { id: 'bore' })
    const b = j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
      .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
      ${r ? `.fillet(j.feat('peg').edges().where(e => e.concave), mm(${r}), { id: 'root' })` : ''}
    return j.assembly('a').add('b', b, { ground: true }).add('g', g, { at: j.tx.move(0, 0, 3.2) }).interference()`;
  const clear = await compile(peg(0)), hit = await compile(peg(1));
  const gap = p => p.decisions.find(x => x.kind === 'gap')?.chose;
  assert(!errs(clear).length && /≈ 0\.[12]/.test(gap(clear)), `clear ${gap(clear)}`);
  assert(errs(hit).some(x => x.kind === 'asm.interference') && /≈ 0\.000/.test(gap(hit)), `hit ${gap(hit)} ${JSON.stringify(errs(hit))}`);
  return `tangent fillet refused naming the crank; peg ${gap(clear)} clear, ${gap(hit)} with a 1 mm root fillet`;
});

console.log(`\n${pass} passed, ${fail} failed · ${((performance.now() - t0) / 1000).toFixed(1)} s`);
const { gc } = await import('../../src/engine/program.js');
process.exit(fail ? 1 : 0);
