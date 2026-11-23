// Appearance in jig (JIG-016 phase 2): .finish(), inferred processes, display colours, and the one material
// vocabulary, as the CAD package carries them and Candela's autoFinish reads them.
//   node --test test/render/appearance.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('../engine/loader.mjs', import.meta.url).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const W = await import('../../src/engine/worker.js');
const C = await import('../../dist/candela.js');
const BRIDGE = readFileSync(join(ROOT, 'src/render/jig-candela.js'), 'utf8');

before(async () => { await W.handle({ id: 0, op: 'init' }); });

async function compile(src) {
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': src }, options: {} });
  if (!r.ok) throw new Error(r.error.message);
  return r.program;
}
async function pkgOf(src) {
  const prog = await compile(src);
  const errors = prog.diagnostics.filter((d) => d.level === 'error');
  if (errors.length) throw new Error(errors.map((d) => d.message).join('; '));
  const e = await W.handle({ id: 2, op: 'export', format: 'candela', options: {} });
  if (!e.ok) throw new Error(e.error.message);
  return { prog, pkg: JSON.parse(e.data) };
}
const faces = (pkg) => Object.fromEntries(pkg.bodies.flatMap((b) => b.faces.map((f) => [f.id, f.meta])));

// a turned steel pin: a 5 × 30 mm section revolved about Z
const PIN = (finishes = '') => `const sec = j.sketch('sec', { on: j.plane.XZ }).rect('s', 5, 30, { at: [0, 0] })
return j.part('pin').material(j.material('steel'))
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'rev' })${finishes}`;

test('a revolved metal part: the turned surface is turned about the revolve axis, its ends faced', async () => {
  const f = faces((await pkgOf(PIN())).pkg);
  const side = f['rev/side[sec.s.right]'];
  assert.equal(side.kind, 'cylinder');
  assert.equal(side.process, 'turned');
  assert.deepEqual(side.axis.map(Math.abs), [0, 1, 0], 'jig Z is Candela Y');
  assert.equal(f['rev/side[sec.s.top]'].process, 'faced');
  assert.equal(f['rev/side[sec.s.top]'].finish, undefined, 'no finish unless one is given');
});

test('.finish(): the whole part, then some faces; later calls win; the inferred axis stays', async () => {
  const f = faces((await pkgOf(PIN(`
  .finish({ finish: 'black-oxide' })
  .finish('rev/side[sec.s.top]', { process: 'polished' })
  .finish(j.feat('rev').faces(), { roughness: 0.2 })`))).pkg);
  for (const m of Object.values(f)) { assert.equal(m.finish, 'black-oxide'); assert.equal(m.roughness, 0.2); }
  assert.equal(f['rev/side[sec.s.top]'].process, 'polished');
  assert.equal(f['rev/side[sec.s.right]'].process, 'turned');
  assert.ok(f['rev/side[sec.s.right]'].axis, 'a finish keeps the axis the grooves need');
});

test('.finish() checks its words where it is written', async () => {
  // the script throws at the call, so the compile fails with the call's place
  const bad = async (x) => {
    const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': PIN(`.finish(${x})`) }, options: {} });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /\(script\.js:3:\d+\)/);
    return r.error.message;
  };
  assert.match(await bad(`{ finsh: 'black-oxide' }`), /unknown key 'finsh'/);
  assert.match(await bad(`{ process: 'lathed' }`), /process 'lathed' is not one of turned, faced, milled/);
  assert.match(await bad(`{ finish: 'gold-leaf' }`), /finish 'gold-leaf' is not one of black-oxide/);
  assert.match(await bad(`{ roughness: 3 }`), /roughness is in \[0, 1\]/);
});

test('a finish that selects nothing is a warning in the package, with names to choose from', async () => {
  const { pkg } = await pkgOf(PIN(`.finish('rev/end', { process: 'polished' })`));
  assert.equal(pkg.diagnostics.length, 1);
  const d = pkg.diagnostics[0];
  assert.equal(d.kind, 'finish.unresolved');
  assert.equal(d.level, 'warning');
  assert.match(d.message, /no face named 'rev\/end'; names like 'rev\/side\[sec\.s\./);
  assert.ok(d.line > 0, 'the line of the .finish() call');
});

test('changing a finish re-runs no feature', async () => {
  await compile(PIN(`.finish({ finish: 'black-oxide' })`));
  const p = await compile(PIN(`.finish({ finish: 'zinc' })`));
  const rev = p.graph.nodes.find((n) => n.id === 'rev');
  assert.equal(rev.cached, true, JSON.stringify(rev));
});

test('display colours: a plastic takes them; a metal only under a coat; .finish({ color }) always', async () => {
  const plate = (mat, extra) => `return j.part('plate').material(j.material('${mat}'))
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 10, { center: true }).profiles(), mm(3), { id: 'body' })${extra}`;
  const pla = faces((await pkgOf(plate('PLA', `.color('#c8102e')`))).pkg);
  assert.ok(Object.values(pla).every((m) => m.color === '#c8102e'));
  const steel = faces((await pkgOf(plate('steel', `.color('#c8102e')`))).pkg);
  assert.ok(Object.values(steel).every((m) => m.color === undefined), 'a steel part looks like steel');
  const painted = faces((await pkgOf(plate('steel', `.color('#c8102e').finish({ finish: 'paint' })`))).pkg);
  assert.ok(Object.values(painted).every((m) => m.color === '#c8102e'), 'paint takes the display colour');
  const perFace = faces((await pkgOf(plate('PLA', `.color('#c8102e').color(j.feat('body').endFace(), '#1f5fbf')`))).pkg);
  assert.equal(perFace['body/end'].color, '#1f5fbf');
  assert.equal(perFace['body/start'].color, '#c8102e');
  const explicit = faces((await pkgOf(plate('aluminium', `.finish({ finish: 'anodized', color: '#2b4c7e' })`))).pkg);
  assert.ok(Object.values(explicit).every((m) => m.color === '#2b4c7e'));
});

test('one vocabulary: brass, bronze and copper weigh in jig and render as themselves', async () => {
  const { prog, pkg } = await pkgOf(`return j.part('nut').material(j.material('brass'))
  .extrude(j.sketch('s', { on: j.plane.XY }).circle('c', 5).profiles(), mm(4), { id: 'body' })`);
  assert.equal(prog.summary.material, 'brass');
  assert.ok(Math.abs(prog.summary.mass - 8.5e-3 * Math.PI * 25 * 4) < 0.05, `mass ${prog.summary.mass} g`);
  assert.deepEqual(pkg.components[0].look, { material: 'brass' });
  const polymer = (await pkgOf(`return j.part('clip').material(j.material('PETG'))
  .extrude(j.sketch('s', { on: j.plane.XY }).circle('c', 5).profiles(), mm(4), { id: 'body' })`)).pkg;
  assert.deepEqual(polymer.components[0].look, { material: 'petg', finish: 'plastic', roughness: 0.25 }, 'a polymer Candela does not list renders as a plastic');
});

// what each material looks like is Candela's finish.fromMetadata (tested there); here: the faces get distinct ones
test('Candela dresses each face from its meta: turned side, faced end and black-oxide end are three materials', async () => {
  const { pkg } = await pkgOf(PIN(`.finish('rev/side[sec.s.top]', { finish: 'black-oxide' })`));
  const files = {
    'jig-candela.js': BRIDGE, 'jig-program.js': 'export const program = __jigPackage;',
    'scene.js': `import { scene, light, hdri } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig-program';
export default scene().add(jigScene(program)).add(light.env.hdri(hdri.studio()));`,
  };
  const r = await C.build(files, { scope: { __jigPackage: pkg } });
  assert.ok(r.ok, r.error?.message);
  const obj = r.compiled.objects.find((o) => o.def);
  const ix = (id) => obj.faceMats[obj.def.faces.findIndex((f) => f.id === id)];
  const three = ['rev/side[sec.s.right]', 'rev/side[sec.s.bottom]', 'rev/side[sec.s.top]'].map(ix);
  assert.ok(three.every((m) => m >= 0), JSON.stringify(three));
  assert.equal(new Set(three).size, 3, `turned, faced, black-oxide: ${JSON.stringify(three)}`);
});

// a primitive added to a metal part is machined as on a lathe about its own axis; pattern copies carry their source
test('.add(j.cyl) on a metal part: its side turned, its ends faced about its axis; a bore cut in ground', async () => {
  const f = faces((await pkgOf(`return j.part('shaft').material(j.material('steel'))
  .add(j.cyl(5, 40), { id: 'body' })
  .add(j.box(20, 20, 4), { id: 'flange' })
  .add(j.cyl(2, 50).moved(j.tx.move(0, 0, -5)), { id: 'bore', op: 'cut' })`)).pkg);
  const side = Object.entries(f).find(([k, m]) => k.startsWith('body/') && m.kind === 'cylinder')[1];
  assert.equal(side.process, 'turned');
  assert.deepEqual(side.axis.map(Math.abs), [0, 1, 0], 'about jig Z, Candela Y');
  const end = Object.entries(f).find(([k, m]) => k.startsWith('body/') && m.kind === 'plane')?.[1];
  if (end) assert.equal(end.process, 'faced');
  const bore = Object.entries(f).find(([k, m]) => k.startsWith('bore/') && m.kind === 'cylinder')[1];
  assert.equal(bore.process, 'ground');
  const flats = Object.entries(f).filter(([k, m]) => k.startsWith('flange/') && m.kind === 'plane').map(([, m]) => m.process);
  assert.ok(flats.length && flats.every((p) => p === 'milled' || p === 'faced'), JSON.stringify(flats));
});

test('a pattern copy\'s faces name the copied feature, its type and process, and the copy', async () => {
  const f = faces((await pkgOf(`return j.part('wheel').material(j.material('steel'))
  .extrude(j.sketch('s', { on: j.plane.XY }).circle('c', 30).profiles(), mm(4), { id: 'disc' })
  .extrude(j.sketch('t', { on: j.plane.offset(j.plane.XY, 4) }).circle('k', 3, { at: [20, 0] }).profiles(), mm(6), { id: 'knob' })
  .pattern(j.feat('knob'), j.pattern.circular(j.axis.Z, { count: 3 }), { id: 'knobs' })`)).pkg);
  const copies = Object.entries(f).filter(([k]) => /^knobs\[\d+\]\//.test(k));
  assert.ok(copies.length > 0, Object.keys(f).join(', '));
  for (const [k, m] of copies) {
    const orig = f[k.replace(/^knobs\[\d+\]\//, '')];
    assert.ok(orig, k);
    assert.equal(m.feature, 'knob'); assert.equal(m.featureType, 'extrude'); assert.match(m.copy, /^knobs\[\d+\]$/);
    assert.equal(m.process, orig.process, k);
  }
});
