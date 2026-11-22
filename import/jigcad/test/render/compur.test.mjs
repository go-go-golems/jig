// The Compur example (JIG-016 §6.6, outside engines): preset M-11, the Synchro-Compur 0-MXV leaf shutter, rendered
// by Candela and moved by poses from the shutter's own planar dynamics, not by a jig study. tools/compur-poses.mjs
// ran one 1/125 release of the Compur project's simulation and baked it into the preset's compur-poses.look.js; the
// preset's look.js imports it as the scene's animation. Here: the preset compiles and exports, the look builds in
// Candela with the files the Render view sends (render/host.js build()), and the poses are the simulation's planar
// motion lifted about jig's Z through each part's jig joint, in the package's frame, composed with the placement.
//   node --test test/render/compur.test.mjs        (the cold compile of 29 parts takes about 20 s)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('../engine/loader.mjs', import.meta.url).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(ROOT, 'content/presets/M-11-synchro-compur');
const W = await import('../../src/engine/worker.js');
const { toCandelaMatrix } = await import('../../src/engine/cadpkg.js');
const C = await import('../../dist/candela.js');
const BAKED = await import(pathToFileURL(join(DIR, 'compur-poses.look.js')).href);
const BRIDGE = readFileSync(join(ROOT, 'src/render/jig-candela.js'), 'utf8');
const PRESET = Object.fromEntries(readdirSync(DIR).filter((f) => f !== 'meta.json').map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));
const LOOK_MARK = '// materials: the Render view adds lines here';   // render/host.js
const isLookFile = (path) => path === 'look.js' || /\.look\.js$/.test(path);

const MOVING = ['ring', 'blade1', 'blade2', 'blade3', 'blade4', 'blade5', 'cam', 'retard', 'segment', 'weight', 'w1', 'w2', 'star',
  'carrier', 'latch', 'release', 'pallet'];
const STATIC = ['housing', 'tube', 'base', 'bladePlate', 'bridge', 'escPlates', 'speedCam', 'speedRing', 'cover', 'iris', 'pinion', 'cockingRing'];
const D = BAKED.default, deg = Math.PI / 180;
const maxDiff = (a, b) => Math.max(...Array.from(a, (v, i) => Math.abs(v - b[i])));
const mul = (a, b) => Array.from({ length: 16 }, (_, k) => { const j = k >> 2, i = k & 3; return a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3]; });
/** jig's frame: a turn th about the axis through (cx, cy) parallel to Z, then a move (dx, dy), mm, column-major */
const planar = (c, th, dx = 0, dy = 0) => { const co = Math.cos(th), s = Math.sin(th);
  return [co, s, 0, 0, -s, co, 0, 0, 0, 0, 1, 0, c[0] + dx - (co * c[0] - s * c[1]), c[1] + dy - (s * c[0] + co * c[1]), 0, 1]; };
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let program, pkg, compileMs;
before(async () => {
  await W.handle({ id: 0, op: 'init' });
  const t0 = performance.now();
  // the workbench sends every file of the project; script.js runs, the rest is data (the look files are text)
  const r = await W.handle({ id: 1, op: 'compile', files: PRESET, entry: 'script.js', options: {} });
  compileMs = performance.now() - t0;
  assert.ok(r.ok, r.error?.message);
  program = r.program;
  const e = await W.handle({ id: 2, op: 'export', format: 'candela', options: { quality: 'render' } });
  assert.ok(e.ok, e.error?.message);
  pkg = JSON.parse(e.data);
});

// the Render view's build (render/host.js RenderHost.build): the bridge, the package, the look as scene.js and every
// other project file named *.look.js under its own name
function lookFiles(look = PRESET['look.js']) {
  const files = { 'jig-candela.js': BRIDGE, 'jig-program.js': 'export const program = __jigPackage;', 'scene.js': look };
  for (const [k, v] of Object.entries(PRESET)) if (k !== 'look.js' && isLookFile(k)) files[k] = v;
  return files;
}
const buildLook = (look) => C.build(lookFiles(look), { scope: { __jigPackage: pkg } });

test('M-11 compiles: an assembly of 29 parts, every one where the simulation draws it, with no errors', () => {
  assert.notEqual(program.ok, false);
  assert.deepEqual(program.diagnostics.filter((d) => d.level === 'error'), []);
  assert.equal(program.kind, 'assembly');
  const parts = [...new Set(program.bodies.map((b) => b.part))];
  assert.equal(parts.length, 29);
  assert.deepEqual([...MOVING, ...STATIC].filter((id) => !parts.includes(id)), [], 'every component the test names exists');
  const moved = program.bodies.filter((b) => b.transform && maxDiff(b.transform, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) > 1e-9);
  assert.deepEqual(moved.map((b) => b.id), [], 'the assembly places every part at the identity (design coordinates)');
  // the warnings are the generated sketches' remaining freedoms, not geometry problems
  for (const d of program.diagnostics.filter((x) => x.level === 'warning')) assert.equal(d.kind, 'sketch.underConstrained', d.message);
  if (process.env.VERBOSE) console.log(`compile ${compileMs.toFixed(0)} ms`);
});

test('the package: the comments\' materials as jig materials, coats where the drawing\'s colour says so', () => {
  assert.equal(pkg.format, 'jig-cad-package');
  assert.deepEqual(pkg.diagnostics, []);
  const look = Object.fromEntries(pkg.components.map((c) => [c.id, c.look.material]));
  assert.equal(look.housing, 'brass');
  assert.equal(look.w1, 'brass');
  assert.equal(look.blade1, 'steel');
  assert.equal(look.cover, 'aluminium');
  const faceOf = (id) => pkg.bodies.find((b) => b.component === id).faces[0].meta;
  assert.equal(faceOf('housing').finish, 'paint');
  assert.equal(faceOf('housing').color, '#3a3b3f', 'a painted part takes its display colour');
  assert.equal(faceOf('blade3').finish, 'black-oxide');
  assert.equal(faceOf('blade3').color, undefined, 'a blackened metal does not');
  assert.equal(faceOf('cover').finish, 'anodized-black');
  assert.equal(faceOf('segment').finish, undefined, 'bare brass');
  assert.equal(faceOf('segment').color, undefined);
});

test('the baked poses: what moves, at what rate, small enough to ship', () => {
  assert.deepEqual(Object.keys(D.components).sort(), [...MOVING].sort());
  for (const id of Object.keys(D.components)) assert.ok(pkg.components.some((c) => c.id === id), `${id} is a component`);
  assert.equal(D.info.speed, '1/125');
  assert.equal(D.info.simRate, 24000);
  assert.equal(D.info.slowMotion, 250);
  assert.equal(D.fps, D.info.simRate / D.info.slowMotion, 'samples per second of playback');
  assert.equal(D.frames, (D.info.toMs - D.info.fromMs) * D.info.simRate / 1000 + 1);
  assert.ok(Math.abs(D.duration - (D.lead + (D.frames - 1) / D.fps + D.tail)) < 1e-9, `${D.duration} s`);
  assert.equal(BAKED.frameAt(D.lead + 1), D.fps, 'a second of playback after the lead-in is fps samples');
  assert.equal(BAKED.frameAt(D.lead + (6 / 1000) * D.info.slowMotion), 6 * D.info.simRate / 1000, '6 ms of the simulation');
  for (const [id, m] of Object.entries(D.components)) for (const k of ['th', 'dx', 'dy']) {
    assert.ok(typeof m[k] === 'number' || m[k].length === D.frames, `${id}.${k}`);
  }
  assert.ok(PRESET['compur-poses.look.js'].length < 200e3, `${PRESET['compur-poses.look.js'].length} bytes`);
  // the blades open while the ring is open, about 9.5 ms through the blades for the nominal 8 ms
  const [a, b] = D.info.openMs;
  assert.ok(a > 2 && b - a > 8 && b - a < 11, JSON.stringify(D.info.openMs));
});

test('each part turns about its jig joint: the baked pivot is the joint\'s point, the axis jig\'s Z', () => {
  const joints = new Map(program.assembly.joints.map((j) => [j.id, j]));
  for (const [id, m] of Object.entries(D.components)) {
    if (id === 'release') { assert.ok(!joints.has(id), 'the outer release lever slides; it has no joint'); continue; }
    const j = joints.get(id);
    assert.ok(j, id);
    assert.equal(j.kind, 'revolute');
    assert.ok(Math.abs(Math.abs(j.axis[2]) - 1) < 1e-9, `${id}: axis ${j.axis}`);
    assert.ok(Math.hypot(j.at[0] - m.c[0], j.at[1] - m.c[1]) < 1e-3, `${id}: joint at ${j.at}, pivot ${m.c}`);
  }
});

test('the lift: a planar pose about jig Z, in the package\'s frame by C·M·C⁻¹, composed with the placement', () => {
  for (const x of [0, 70.5, 130.25]) {
    const P = BAKED.posesAtFrame(pkg, x), k = Math.floor(x), f = x - k;
    for (const [id, m] of Object.entries(D.components)) {
      const ch = (v) => (typeof v === 'number' ? v : v[k] + (v[k + 1] - v[k]) * f);
      const want = mul(toCandelaMatrix(planar(m.c, ch(m.th), ch(m.dx), ch(m.dy))), pkg.components.find((c) => c.id === id).transform);
      assert.ok(maxDiff(P[id], want) < 1e-12, `${id} at ${x}`);
    }
  }
  // by hand: the cam's pivot stays put, and a point 1 mm along jig +X from it turns anticlockwise seen from the
  // front (jig +Z, Candela +Y) by the cam's angle; jig (x, y, z) mm is 0.001·(x, z, −y) in the package
  const s8 = (8 * D.info.simRate) / 1000, m = D.components.cam, th = m.th[s8], M = BAKED.posesAtFrame(pkg, s8).cam;
  const apply = (p) => [0, 1, 2].map((i) => M[i] * p[0] + M[4 + i] * p[1] + M[8 + i] * p[2] + M[12 + i]);
  const cand = (p) => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];
  const z = 12.5, piv = [m.c[0], m.c[1], z];
  assert.ok(maxDiff(apply(cand(piv)), cand(piv)) < 1e-12);
  assert.ok(maxDiff(apply(cand([piv[0] + 1, piv[1], z])), cand([piv[0] + Math.cos(th), piv[1] + Math.sin(th), z])) < 1e-12);
  assert.ok(Math.abs(th - m.th[0]) > 0.5, `the cam has run by 8 ms: ${th}`);
});

test('the rest frame: the shutter cocked before the release is the assembly\'s placement, but for the cocked parts', () => {
  const P = BAKED.animate(pkg)(0), placed = (id) => pkg.components.find((c) => c.id === id).transform;
  // shut and at the design pose: the ring, the blades, the retard lever and inertia weight, the release levers
  for (const id of ['ring', 'blade1', 'blade2', 'blade3', 'blade4', 'blade5', 'retard', 'weight', 'latch', 'release']) {
    assert.ok(maxDiff(P[id], placed(id)) < 1e-6, `${id}: ${maxDiff(P[id], placed(id))}`);
  }
  // cocked, the dynamics' own start: the cam 3° back from its opening lug (+, anticlockwise), the pallet control
  // lever held out 14° by the speed cam (1/30 and faster), the gear segment waiting on the speed cam's 1/125 step
  // (15.227° of the retard lever's swing), and the train turned with it 90:6, 64:6, 60:6
  // (the angles are baked to 10⁻⁵ rad)
  const ang = { cam: 3 * deg, carrier: -14 * deg, segment: 15.227 * deg };
  for (const [id, a] of Object.entries(ang)) {
    const want = mul(toCandelaMatrix(planar(D.components[id].c, a)), placed(id));
    assert.ok(maxDiff(P[id], want) < 1e-5, `${id}: ${maxDiff(P[id], want)}`);
  }
  // the train, from the simulation's own angles (the baked ones are less whole turns: the star starts 68 turns on)
  const s0 = D.info.startDeg, th0 = (id) => D.components[id].th[0];
  assert.ok(Math.abs(s0.w1 + (90 / 6) * s0.segment) < 0.01, `w1 ${s0.w1}°`);
  assert.ok(Math.abs(s0.w2 + (64 / 6) * s0.w1) < 0.01, `w2 ${s0.w2}°`);
  assert.ok(Math.abs(s0.star + (60 / 6) * s0.w2) < 0.01, `star ${s0.star}°`);
  for (const id of ['w1', 'w2', 'star']) assert.ok(Math.abs(wrapPi(th0(id) - s0[id] * deg)) < 1e-4, id);
  // the pallet rides on its control lever: turned with it about the lever's pivot
  const pal = mul(toCandelaMatrix(planar(D.components.carrier.c, -14 * deg)), placed('pallet'));
  assert.ok(maxDiff(P.pallet, pal) < 1e-5, `pallet: ${maxDiff(P.pallet, pal)}`);
  assert.equal(D.info.startDeg.cam, 3);
});

test('the look builds in Candela with the files the Render view sends: an animation of 6.5 s over real nodes', async () => {
  const r = await buildLook();
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.diags.filter((d) => d.severity === 'error' || d.code === 'W170'), [], JSON.stringify(r.diags));
  const a = r.compiled.animation;
  assert.equal(typeof a, 'function');
  assert.equal(a.duration, 6.5, 'the timeline the Render view plays');
  assert.equal(a.study, undefined, 'not a study: the Render view does not look for a drive');
  assert.deepEqual(Object.keys(a(0)).sort(), [...MOVING].sort());
  assert.ok(maxDiff(a(2).blade1, BAKED.animate(pkg)(2).blade1) < 1e-12, 'the same poses as the module run here');
  // a shader the GPU compiles in seconds: the look gives the faces of a part one tool-mark centre (Candela compiles
  // each material's centre into the shader; with a centre per face this package makes 540 of them, 0.5 MB of WGSL)
  assert.ok(r.compiled.materials.length < 80, `${r.compiled.materials.length} materials`);
  assert.ok(r.compiled.shared.length < 150e3, `${r.compiled.shared.length} bytes of shader`);
  // the look keeps the Render view's marker and the chain's end, so a material from the library still lands
  const lines = PRESET['look.js'].split('\n'), at = lines.findIndex((l) => l.trim() === LOOK_MARK);
  assert.ok(at > 0 && lines.slice(at + 1).some((l) => l.trim() === ';'));
  const end = at + 1 + lines.slice(at + 1).findIndex((l) => l.trim() === ';');
  lines.splice(end, 0, `  .meta("blade1", { material: "brass" })`);
  const m = await buildLook(lines.join('\n'));
  assert.ok(m.ok, m.error?.message);
  // and the cutaway leaves the front out
  const cut = await buildLook(PRESET['look.js'].replace('const CUTAWAY = false', 'const CUTAWAY = true'));
  assert.ok(cut.ok, cut.error?.message);
  const names = (res) => new Set(res.compiled.objects.filter((o) => o.def).map((o) => o.def.name.split('/')[0]));
  assert.ok(names(r).has('cover') && !names(cut).has('cover') && !names(cut).has('speedRing') && names(cut).has('cam'));
});

test('Candela packs the release: blades and ring move between two times, the frame and plates do not', async () => {
  const s = new C.SceneSession();
  const b = await s.build(lookFiles(), { scope: { __jigPackage: pkg } });
  assert.ok(b.ok, b.error?.message);
  const packed = (t) => {
    s.seek(t);
    const P = s.pack(), out = {};
    for (let k = 0; k < P.nObjs; k++) {
      const o = k * 24, name = s.compiled.objects[P.O[o + 21] | 0]?.def?.name;
      if (name) out[name] = Array.from(P.O.subarray(o + 4, o + 16));   // world → object, row-major 3×4
    }
    return out;
  };
  // 0.25 s: at rest, cocked; 2 s: 6 ms after the release was pressed, the ring and blades open
  const A = packed(0.25), Bp = packed(2);
  const body = (id) => pkg.bodies.find((x) => x.component === id).id;
  for (const id of ['ring', 'blade1', 'blade4', 'cam']) assert.ok(maxDiff(A[body(id)], Bp[body(id)]) > 1e-3, `${id} moves`);
  for (const id of STATIC) for (const x of pkg.bodies.filter((y) => y.component === id)) assert.deepEqual(A[x.id], Bp[x.id], `${x.id} stays`);
  // the packed blade is the pose: world points of the blade map back to its own coordinates
  const want = BAKED.animate(pkg)(2).blade1, Mi = Bp[body('blade1')];
  for (const q of [[0, 0, 0], [0.01, 0, 0], [0, 0.01, 0], [0, 0, 0.02]]) {
    const w = [0, 1, 2].map((i) => want[i] * q[0] + want[4 + i] * q[1] + want[8 + i] * q[2] + want[12 + i]);
    const back = [0, 1, 2].map((i) => Mi[i * 4] * w[0] + Mi[i * 4 + 1] * w[1] + Mi[i * 4 + 2] * w[2] + Mi[i * 4 + 3]);
    assert.ok(maxDiff(back, q) < 1e-6, `${JSON.stringify(q)} → ${JSON.stringify(back)}`);
  }
});

test('meta.json lists the preset on the shelf with the Mechanisms', () => {
  const meta = JSON.parse(readFileSync(join(DIR, 'meta.json'), 'utf8'));
  assert.equal(meta.id, 'M-11');
  assert.equal(meta.group, 'Mechanisms');
  assert.ok(statSync(join(DIR, 'script.js')).size > 0);
});
