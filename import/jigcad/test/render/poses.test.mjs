// Poses of a mechanism study (JIG-016 phase 4): the engine keeps every study's poses on the worker side, the CAD
// package carries them in Candela's frame (studies.<name>), and the bridge plays them back: asm.posesAt(study, x)
// and asm.animate(study, { duration }) as a scene's animation. The running example is preset F-06, the needle-bar
// drive, whose study 'cycle' turns the drive 'main' from 0° to 360° in 360 steps (its default drive is 30°).
//   node --test test/render/poses.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('../engine/loader.mjs', import.meta.url).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const W = await import('../../src/engine/worker.js');
const { compile: compileModel } = await import('../../src/engine/program.js');
const { cadPackage, encodeCadPackage, toCandelaMatrix } = await import('../../src/engine/cadpkg.js');
const C = await import('../../dist/candela.js');
const BRIDGE = readFileSync(join(ROOT, 'src/render/jig-candela.js'), 'utf8');
const F06 = readFileSync(join(ROOT, 'content/presets/F-06-slider-crank-mechanism/script.js'), 'utf8');

const near = (a, b, eps) => Math.abs(a - b) <= eps;
const maxDiff = (a, b) => Math.max(...Array.from(a, (v, i) => Math.abs(v - b[i])));
const b64f32 = (s) => { const u = Buffer.from(s, 'base64'); return new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); };
let program, text, pkg;

async function exportPackage(options = {}) {
  const e = await W.handle({ id: 2, op: 'export', format: 'candela', options });
  if (!e.ok) throw new Error(e.error.message);
  return e.data;
}
before(async () => {
  await W.handle({ id: 0, op: 'init' });
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': F06 }, options: {} });
  assert.ok(r.ok && r.program.ok, 'F-06 compiles');
  program = r.program;
  text = await exportPackage();
  pkg = JSON.parse(text);
});

// a look over a package: the bridge as Candela's library module 'jig-candela', the package as 'jig-program'
const look = (body) => `import { scene, light, hdri } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig-program';
const asm = jigScene(program);
${body}
export default scene().add(asm).add(light.env.hdri(hdri.studio()));`;
const filesOf = (src) => ({ 'jig-candela.js': BRIDGE, 'jig-program.js': 'export const program = __jigPackage;', 'scene.js': src });
const buildLook = (src, p = pkg) => C.build(filesOf(src), { scope: { __jigPackage: p } });
// posesAt through a real build: the scene's animation export is x ↦ posesAt(study, x)
async function posesAtOf(p = pkg, study = 'cycle') {
  const r = await buildLook(look(`export const animation = (x) => asm.posesAt('${study}', x);`), p);
  assert.ok(r.ok, r.error?.message);
  return r.animation;
}
const translation = (M) => [M[12], M[13], M[14]];
function orthonormal(M, eps) {
  const col = (c) => [M[c * 4], M[c * 4 + 1], M[c * 4 + 2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (!near(dot(col(a), col(b)), a === b ? 1 : 0, eps)) return false;
  const [x, y, z] = [col(0), col(1), col(2)], det = dot(x, [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]]);
  return near(det, 1, eps) && M[3] === 0 && M[7] === 0 && M[11] === 0 && M[15] === 1;
}

test('the engine keeps every study\'s poses on the worker side: every component, every reached row, in jig\'s frame', async () => {
  const prog = compileModel(await W.runScript(F06), { mesh: false });
  const st = prog.studyPoses('cycle');
  assert.equal(st.drive, 'main');
  assert.equal(st.unit, 'deg');
  assert.deepEqual([st.from, st.to], [0, 360]);
  assert.equal(st.x.length, 361, 'every row of 0…360° in 360 steps is reached');
  assert.deepEqual(Object.keys(st.T), ['frame', 'crank', 'rod', 'slider']);
  for (const A of Object.values(st.T)) { assert.ok(A instanceof Float64Array); assert.equal(A.length, 16 * 361); }
  // row 30 is the compiled pose (the drive's default of 30°): the rod where the program places it
  const k = st.x.findIndex((x) => near(x, 30, 1e-9));
  assert.equal(k, 30);
  const rod = prog.P.bodiesData.find((b) => b.id === 'rod/body1').transform;
  assert.ok(maxDiff(st.T.rod.subarray(16 * k, 16 * k + 16), rod) < 1e-9, 'row 30 = the compiled placement');
  assert.equal(prog.studyPoses('nope'), null);
  assert.deepEqual(Object.keys(prog.studyPoses()), ['cycle']);
});

test('ProgramData, what the page receives, carries no poses', () => {
  const st = program.assembly.studies.cycle;
  assert.equal(st.rows.length, 361);
  assert.ok(!('poses' in st) && !('T' in st));
  assert.ok(!/"poses":/.test(JSON.stringify(program)), 'no poses anywhere in the program data');
});

test('the package: studies.cycle with the drive, its unit, the row values and float32 poses of what moves', () => {
  const st = pkg.studies.cycle;
  assert.equal(st.drive, 'main');
  assert.equal(st.unit, 'deg');
  assert.deepEqual([st.from, st.to], [0, 360]);
  assert.equal(st.x.length, 361);
  assert.ok(near(st.x[30], 30, 1e-9) && near(st.x[360], 360, 1e-9));
  // the frame is the ground: it sits at its placement in every row, so the study leaves it out
  assert.deepEqual(Object.keys(st.poses).sort(), ['crank', 'rod', 'slider']);
  for (const [id, s] of Object.entries(st.poses)) {
    const P = b64f32(s);
    assert.equal(P.length, 16 * 361, id);
    // row 30, in Candela's frame, is the component's placement in the package (the compile at 30°)
    const placed = pkg.components.find((c) => c.id === id).transform;
    assert.ok(maxDiff(P.subarray(16 * 30, 16 * 31), placed) < 1e-7, `${id}: ${maxDiff(P.subarray(16 * 30, 16 * 31), placed)}`);
  }
});

test('cadPackage in memory: typed arrays, the studies option, and base64 of the same bytes', async () => {
  const prog = compileModel(await W.runScript(F06), {});
  const p = cadPackage(prog, { quality: 'preview' });
  const rod = p.studies.cycle.poses.rod;
  assert.ok(rod instanceof Float32Array);
  assert.equal(rod.length, 16 * 361);
  const T = prog.studyPoses('cycle').T.rod;
  assert.ok(maxDiff(rod.subarray(16 * 45, 16 * 46), toCandelaMatrix(T.subarray(16 * 45, 16 * 46))) < 1e-7, 'converted by C·T·C⁻¹, then float32');
  const again = JSON.parse(encodeCadPackage(p));
  assert.deepEqual(Array.from(b64f32(again.studies.cycle.poses.rod)), Array.from(rod));
  assert.deepEqual(again.studies.cycle.x, p.studies.cycle.x);
  assert.deepEqual(cadPackage(prog, { quality: 'preview', studies: false }).studies, {});
  assert.deepEqual(Object.keys(cadPackage(prog, { quality: 'preview', studies: ['cycle'] }).studies), ['cycle']);
  assert.throws(() => cadPackage(prog, { quality: 'preview', studies: 'cycel' }), /no study 'cycel'; studies: cycle/);
});

test('posesAt(cycle, 30) is the rod of a plain compile at the default drive of 30°', async () => {
  const at = await posesAtOf();
  const P = at(30);
  assert.deepEqual(Object.keys(P).sort(), ['crank', 'rod', 'slider']);
  for (const id of ['crank', 'rod', 'slider']) {
    assert.equal(P[id].length, 16);
    const placed = pkg.components.find((c) => c.id === id).transform;
    assert.ok(maxDiff(P[id], placed) < 1e-6, `${id}: ${maxDiff(P[id], placed)}`);
  }
  // a Candela quantity is read in the drive's unit (u.deg(30) is 30°, not its 0.52 rad)
  const q = await buildLook(look(`import { u } from 'candela';\nexport const animation = (x) => asm.posesAt('cycle', u.deg(x));`));
  assert.ok(q.ok, q.error?.message);
  assert.deepEqual(q.animation(30), P);
});

test('between rows: 30.5° lies between rows 30 and 31, the rotation stays orthonormal, and it is the solved pose', async () => {
  const at = await posesAtOf(), a = at(30).rod, b = at(31).rod, m = at(30.5).rod;
  assert.ok(maxDiff(a, b) > 1e-4, 'the rod moves between rows');
  for (let k = 0; k < 3; k++) assert.ok(near(m[12 + k], (a[12 + k] + b[12 + k]) / 2, 1e-12), 'positions interpolate linearly');
  assert.ok(orthonormal(m, 1e-9), JSON.stringify(m));
  for (const id of ['crank', 'slider']) assert.ok(orthonormal(at(30.25)[id], 1e-9), id);
  // against the mechanism solved at 30.5° (a what-if compile): the error is the chord's between 1° rows, under a
  // micrometre in position and 2·10⁻⁵ in the rotation's entries (about a thousandth of a degree)
  const r = await W.handle({ id: 5, op: 'compile', files: { 'script.js': F06 }, options: { override: { main: '30.5 deg' }, keep: false } });
  assert.ok(r.ok && r.program.ok);
  const solved = toCandelaMatrix(r.program.bodies.find((x) => x.id === 'rod/body1').transform);
  assert.ok(maxDiff(translation(m), translation(solved)) < 1e-6, `position: ${maxDiff(translation(m), translation(solved))} m`);
  assert.ok(maxDiff(m.slice(0, 11), solved.slice(0, 11)) < 2e-5, `rotation: ${maxDiff(m.slice(0, 11), solved.slice(0, 11))}`);
});

test('a whole turn wraps: 390° and −330° are 30°, and 360° closes on 0°', async () => {
  const at = await posesAtOf(), p30 = at(30);
  for (const x of [390, -330, 750]) for (const id of Object.keys(p30)) assert.ok(maxDiff(at(x)[id], p30[id]) < 1e-9, `${x}° ${id}`);
  assert.ok(maxDiff(at(360).rod, at(0).rod) < 1e-6, 'the crank turned once: the same pose');
  assert.ok(orthonormal(at(359.5).rod, 1e-9));
});

// a synthetic package: one triangle per component, and a prismatic study of 0…10 mm in 2 steps that moves c0 along x
function stroke() {
  const tri = { positions: new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]), triFace: new Uint32Array([0]), faces: [{ id: 'f/end', meta: { kind: 'plane' } }] };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], at = (x) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
  return { format: 'jig-cad-package', version: 1, bounds: [[-1, -1, -1], [1, 1, 1]], views: {},
    components: ['c0', 'c1'].map((id) => ({ id, parent: null, transform: I, look: {} })),
    bodies: ['c0', 'c1'].map((id) => ({ id: `${id}/body1`, component: id, transform: I, ...tri })),
    studies: { stroke: { drive: 'ram', unit: 'mm', from: 0, to: 10, x: [0, 5, 10], poses: { c0: new Float32Array([...at(0), ...at(0.005), ...at(0.01)]) } } } };
}

test('a study that is not a whole turn holds its first and last rows outside its range', async () => {
  const at = await posesAtOf(stroke(), 'stroke');
  assert.ok(near(at(2.5).c0[12], 0.0025, 1e-9));
  assert.ok(near(at(15).c0[12], 0.01, 1e-9), 'past the end: the last row');
  assert.ok(near(at(-3).c0[12], 0, 1e-9), 'before the start: the first row');
  assert.deepEqual(Object.keys(at(4)), ['c0'], 'only what the study moves');
  const r = await buildLook(look(`console.log(JSON.stringify(asm.studies()));`), stroke());
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(JSON.parse(r.logs[0]), [{ name: 'stroke', drive: 'ram', unit: 'mm', from: 0, to: 10, rows: 3, wraps: false, components: ['c0'] }]);
});

test('asm.studies() of F-06: the cycle, its drive, unit and range; a whole turn wraps', async () => {
  const r = await buildLook(look(`console.log(JSON.stringify(asm.studies()));`));
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(JSON.parse(r.logs[0]), [{ name: 'cycle', drive: 'main', unit: 'deg', from: 0, to: 360, rows: 361, wraps: true, components: ['crank', 'rod', 'slider'] }]);
});

test('Candela plays the study: animate(cycle, { duration: 2 }) names only real nodes, and the packed rod is posesAt at 15°', async () => {
  const src = look(`export const animation = asm.animate('cycle', { duration: 2 });`);
  const r = await buildLook(src);
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.diags.filter((d) => d.code === 'W170' || d.severity === 'error'), [], 'every pose id names a node');
  const at = await posesAtOf();
  // one turn in 2 s: t = 1/12 s is 15°
  const t = 1 / 12, want = at(15).rod;
  assert.ok(maxDiff(r.animation(t).rod, want) < 1e-12);
  // the session candela-rt and the page run: seek, then pack with the scene's animation as the poses
  const s = new C.SceneSession();
  assert.ok((await s.build(filesOf(src), { scope: { __jigPackage: pkg } })).ok);
  s.seek(t);
  const P = s.pack(), O = P.O;
  let seen = 0;
  for (let k = 0; k < P.nObjs; k++) {
    const b = k * 24, obj = s.compiled.objects[O[b + 21] | 0];
    if (obj?.def?.name !== 'rod/body1') continue;
    seen++;
    const Mi = Array.from(O.subarray(b + 4, b + 16));                              // row-major 3×4 world → object
    for (const q of [[0, 0, 0], [0.01, 0, 0], [0, 0.02, 0], [0, 0, 0.03]]) {
      const w = [0, 1, 2].map((i) => want[i] * q[0] + want[4 + i] * q[1] + want[8 + i] * q[2] + want[12 + i]);
      const back = [0, 1, 2].map((i) => Mi[i * 4] * w[0] + Mi[i * 4 + 1] * w[1] + Mi[i * 4 + 2] * w[2] + Mi[i * 4 + 3]);
      assert.ok(maxDiff(back, q) < 1e-6, `${JSON.stringify(q)} → ${JSON.stringify(back)}`);
    }
  }
  assert.equal(seen, 1);
  // and it moved: the packed objects at 0 s (0°) and at 1/12 s differ
  s.seek(0);
  assert.notEqual(C.digestBytes(s.pack().O), C.digestBytes(O));
});

test('animate(…, { from, to }) maps the duration onto part of the range', async () => {
  const r = await buildLook(look(`export const animation = asm.animate('cycle', { duration: 1, from: 90, to: 180 });`));
  assert.ok(r.ok, r.error?.message);
  const at = await posesAtOf();
  assert.ok(maxDiff(r.animation(0).rod, at(90).rod) < 1e-12);
  assert.ok(maxDiff(r.animation(0.5).rod, at(135).rod) < 1e-12);
});

test('poses read from JSON (base64, a file or candela-rt) and from typed arrays (the page) are the same', async () => {
  const prog = compileModel(await W.runScript(F06), {});
  const typed = cadPackage(prog, { quality: 'preview' });
  const fromTyped = await posesAtOf(typed), fromJson = await posesAtOf(JSON.parse(encodeCadPackage(typed)));
  for (const x of [0, 30, 30.5, 123.4]) assert.deepEqual(fromTyped(x), fromJson(x));
});

test('an unknown study is an error that names the real ones', async () => {
  const r = await buildLook(look(`const p = asm.posesAt('cycel', 30);`));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /posesAt\('cycel'\): no study 'cycel'; did you mean 'cycle'\?/);
  const a = await buildLook(look(`export const animation = asm.animate('cylce', { duration: 2 });`));
  assert.match(a.error.message, /animate\('cylce'\): no study 'cylce'; did you mean 'cycle'\?/);
  const d = await buildLook(look(`export const animation = asm.animate('cycle', {});`));
  assert.match(d.error.message, /the duration is in seconds, more than 0/);
  const x = await buildLook(look(`const p = asm.posesAt('cycle', 'thirty');`));
  assert.match(x.error.message, /x is a value of the drive main, in deg/);
  const none = await buildLook(look(`const p = asm.posesAt('cycle', 0);`), { ...pkg, studies: {} });
  assert.match(none.error.message, /the package has no studies/);
});

// F-06's head inside a machine, rotated and moved: rigid (its own solve, its study under 'head/cycle') and flexible
// (its study carried into the machine's solve)
const MACHINE = (flexible) => F06.replace(/return head\s*$/, `const base = j.part('base').extrude(j.sketch('b', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).profiles(), mm(5), { id: 'body' })
return j.assembly('machine').add('base', base, { ground: true })
  .add('head', head, { at: j.tx.rotate(j.axis.Z, deg(30)).then(j.tx.move(100, 20, 0)), flexible: ${flexible} })`);
for (const flexible of [false, true]) {
  test(`a ${flexible ? 'flexible' : 'rigid'} subassembly's study: poses by assembly path, placed in the machine`, async () => {
    const r = await W.handle({ id: 6, op: 'compile', files: { 'script.js': MACHINE(flexible) }, options: {} });
    assert.ok(r.ok && r.program.ok, JSON.stringify(r.program?.diagnostics?.filter((d) => d.level === 'error')));
    const p = JSON.parse(await exportPackage({ quality: 'preview' }));
    const st = p.studies['head/cycle'];
    assert.ok(st, Object.keys(p.studies).join(', '));
    assert.equal(st.drive, flexible ? 'head/main' : 'main', 'the drive as the study\'s record names it');
    assert.equal(st.x.length, 361);
    assert.deepEqual(Object.keys(st.poses).sort(), ['head/crank', 'head/rod', 'head/slider']);
    // row 30 is where the machine's compile placed each of them (the head at its default 30°)
    for (const [id, s] of Object.entries(st.poses)) {
      const placed = p.components.find((c) => c.id === id).transform;
      assert.ok(maxDiff(b64f32(s).subarray(16 * 30, 16 * 31), placed) < 1e-7, id);
    }
    // a build with the study as the animation finds every node
    const b = await buildLook(look(`export const animation = asm.animate('head/cycle', { duration: 2 });`), p);
    assert.ok(b.ok, b.error?.message);
    assert.deepEqual(b.diags.filter((d) => d.code === 'W170'), []);
  });
}
