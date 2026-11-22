// An assembly's .finish() (JIG-016): finishes named from outside the parts, by component id, as the CAD package
// carries them in each face's meta. The running example is preset F-06, the needle-bar drive; subassemblies use a
// small bar assembly.
//   node --test test/render/finishes.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('../engine/loader.mjs', import.meta.url).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const W = await import('../../src/engine/worker.js');
const F06 = readFileSync(join(ROOT, 'content/presets/F-06-slider-crank-mechanism/script.js'), 'utf8');

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
  const e = await W.handle({ id: 2, op: 'export', format: 'candela', options: { studies: false } });
  if (!e.ok) throw new Error(e.error.message);
  return { prog, pkg: JSON.parse(e.data) };
}
// component → face id → meta
const faces = (pkg) => {
  const out = {};
  for (const b of pkg.bodies) for (const f of b.faces) (out[b.component] ??= {})[f.id] = f.meta;
  return out;
};
// F-06 with more calls on the assembly (and, optionally, the rod part's own)
const drive = (calls, rodPart = '') => F06.replace("const rod = j.part('rod').material(steel)", `const rod = j.part('rod').material(steel)${rodPart}`).replace('return head', `return head${calls}`);

test('.finish(component, meta): every face of that component, and only of it', async () => {
  const f = faces((await pkgOf(drive(`.finish('slider', { finish: 'paint', color: '#7a1f1f' })`))).pkg);
  for (const m of Object.values(f.slider)) { assert.equal(m.finish, 'paint'); assert.equal(m.color, '#7a1f1f'); }
  assert.ok(Object.values(f.slider).every((m) => m.process === 'milled'), 'the inferred process stays');
  for (const c of ['frame', 'crank', 'rod']) assert.ok(Object.values(f[c]).every((m) => m.finish === undefined), c);
});

test('.finish(component, faces, meta): a name, a glob or a jig selector, resolved in the component\'s part', async () => {
  const f = faces((await pkgOf(drive(`
  .finish('rod', 'body/side[s.big]', { process: 'polished' })
  .finish('rod', 'body/side[s.r.*]', { roughness: 0.35 })
  .finish('crank', j.feat('body').endFace(), { finish: 'black-oxide' })`))).pkg);
  assert.equal(f.rod['body/side[s.big]'].process, 'polished');
  assert.equal(f.rod['body/side[s.small]'].process, 'ground', 'the other bore keeps its inferred process');
  assert.deepEqual(Object.entries(f.rod).filter(([, m]) => m.roughness === 0.35).map(([id]) => id).sort(),
    ['body/side[s.r.bottom]', 'body/side[s.r.left]', 'body/side[s.r.right]', 'body/side[s.r.top]']);
  assert.deepEqual(Object.entries(f.crank).filter(([, m]) => m.finish === 'black-oxide').map(([id]) => id), ['body/end']);
});

test('the assembly wins over the part, key by key, and later calls win', async () => {
  const f = faces((await pkgOf(drive(`
  .finish('rod', { finish: 'zinc', process: 'ground' })
  .finish('rod', 'body/end', { process: 'polished' })`, `.finish({ finish: 'black-oxide', roughness: 0.4 })`))).pkg);
  for (const m of Object.values(f.rod)) { assert.equal(m.finish, 'zinc'); assert.equal(m.roughness, 0.4, 'the part\'s roughness, which the assembly does not set'); }
  assert.equal(f.rod['body/end'].process, 'polished');
  assert.equal(f.rod['body/start'].process, 'ground');
});

test('a component the assembly does not have is a warning of the compile that names the one meant', async () => {
  const prog = await compile(drive(`.finish('slidr', { finish: 'paint' })`));
  assert.equal(prog.ok, true, 'a finish never fails the model');
  const d = prog.diagnostics.filter((x) => x.kind === 'finish.unresolved');
  assert.equal(d.length, 1);
  assert.equal(d[0].level, 'warning');
  assert.match(d[0].message, /\.finish\('slidr', …\): no component 'slidr'; did you mean 'slider'\?/);
  assert.match(d[0].fix, /frame, crank, rod, slider/);
  assert.ok(d[0].line > 40, `the line of the call: ${d[0].line}`);
  const far = (await compile(drive(`.finish('gearbox', { finish: 'paint' })`))).diagnostics.find((x) => x.kind === 'finish.unresolved');
  assert.match(far.message, /no component 'gearbox'; components: frame, crank, rod, slider/);
});

test('faces that name nothing in the component are a warning in the package, as a part\'s are', async () => {
  const { pkg } = await pkgOf(drive(`.finish('rod', 'body/nope', { process: 'polished' })`));
  assert.equal(pkg.diagnostics.length, 1);
  const d = pkg.diagnostics[0];
  assert.equal(d.kind, 'finish.unresolved');
  assert.equal(d.at, 'rod');
  assert.match(d.message, /assembly \.finish\('rod', 'body\/nope'\): no face named 'body\/nope'; names like 'body\/side\[s\./);
  assert.ok(d.line > 40);
});

test('an assembly .finish() checks its words where it is written', async () => {
  const bad = async (x) => {
    const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': drive(`.finish(${x})`) }, options: {} });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /\(script\.js:\d+:\d+\)/);
    return r.error.message;
  };
  assert.match(await bad(`'rod', { finsh: 'zinc' }`), /unknown key 'finsh'/);
  assert.match(await bad(`'rod', 'body/end', { process: 'lathed' }`), /process 'lathed' is not one of/);
  assert.match(await bad(`{ finish: 'paint' }`), /name the component first/);
  assert.match(await bad(`'rod'`), /\.finish\(\): give \{ finish, process, color, roughness \}, e\.g\. \.finish\('slider'/);
});

test('changing an assembly finish re-runs no feature', async () => {
  await compile(drive(`.finish('rod', { finish: 'black-oxide' })`));
  const p = await compile(drive(`.finish('rod', { finish: 'zinc' }).finish('slider', 'body/end', { process: 'polished' })`));
  const features = p.graph.nodes.filter((n) => n.kind === 'extrude');
  assert.deepEqual(features.map((n) => n.id), ['frame:plate', 'crank:body', 'rod:body', 'slider:body']);
  for (const n of features) assert.equal(n.cached, true, JSON.stringify(n));
});

// a small assembly of bars: 'inner' paints its b; top holds it as 'sub' (rigid or flexible)
const BARS = `const steel = j.material('steel')
const bar = (name) => j.part(name).material(steel)
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 10, { center: true }).profiles(), mm(4), { id: 'body' })
const inner = j.assembly('inner').add('a', bar('a'), { ground: true }).add('b', bar('b'), { at: j.tx.move(30, 0, 0) })
  .finish('b', { finish: 'paint', color: '#112233' }).finish('*', 'body/end', { process: 'polished' })
`;
const top = (flexible, calls = '') => `${BARS}return j.assembly('top').add('base', bar('base'), { ground: true })
  .add('sub', inner, { at: j.tx.move(0, 40, 0), flexible: ${flexible} })${calls}`;

for (const flexible of [false, true]) {
  test(`a ${flexible ? 'flexible' : 'rigid'} subassembly's finishes come out on its components, under its prefix`, async () => {
    const { prog, pkg } = await pkgOf(top(flexible));
    assert.deepEqual(pkg.components.map((c) => c.id), ['base', 'sub/a', 'sub/b']);
    assert.ok(!prog.diagnostics.some((d) => d.kind === 'asm.flexible' || d.kind === 'finish.unresolved'), JSON.stringify(prog.diagnostics.filter((d) => d.level !== 'info')));
    const f = faces(pkg);
    assert.ok(Object.values(f['sub/b']).every((m) => m.finish === 'paint' && m.color === '#112233'));
    assert.ok(Object.values(f['sub/a']).every((m) => m.finish === undefined));
    assert.equal(f['sub/a']['body/end'].process, 'polished', "its '*' is its own components'");
    assert.notEqual(f.base['body/end'].process, 'polished', "nor the parent's");
  });

  test(`the parent's finish wins over a ${flexible ? 'flexible' : 'rigid'} subassembly's; 'sub' and 'sub/*' name all of it`, async () => {
    const f = faces((await pkgOf(top(flexible, `
  .finish('sub/b', { finish: 'zinc' })
  .finish('sub', { roughness: 0.5 })
  .finish('sub/*', 'body/start', { process: 'ground' })`))).pkg);
    assert.ok(Object.values(f['sub/b']).every((m) => m.finish === 'zinc' && m.color === '#112233'), 'zinc over paint; the colour stays');
    for (const c of ['sub/a', 'sub/b']) {
      assert.ok(Object.values(f[c]).every((m) => m.roughness === 0.5), c);
      assert.equal(f[c]['body/start'].process, 'ground', c);
    }
    assert.ok(Object.values(f.base).every((m) => m.roughness === undefined), "'sub' is not a prefix of 'base'");
  });
}

test('nested: a rigid subassembly inside a flexible one keeps its finishes, prefixed twice', async () => {
  const src = `${BARS}const mid = j.assembly('mid').add('core', bar('core'), { ground: true }).add('sub', inner, { at: j.tx.move(0, 40, 0) })
  .finish('sub/a', { finish: 'black-oxide' })
return j.assembly('top').add('base', bar('base'), { ground: true }).add('mid', mid, { at: j.tx.move(0, 80, 0), flexible: true })
  .finish('mid/sub/b', { color: '#445566' })`;
  const { prog, pkg } = await pkgOf(src);
  assert.ok(!prog.diagnostics.some((d) => d.kind === 'finish.unresolved'), JSON.stringify(prog.diagnostics.filter((d) => d.level !== 'info')));
  const f = faces(pkg);
  assert.ok(Object.values(f['mid/sub/b']).every((m) => m.finish === 'paint' && m.color === '#445566'));
  assert.ok(Object.values(f['mid/sub/a']).every((m) => m.finish === 'black-oxide'));
  assert.equal(f['mid/sub/a']['body/end'].process, 'polished');
  assert.ok(Object.values(f['mid/core']).every((m) => m.finish === undefined));
});
