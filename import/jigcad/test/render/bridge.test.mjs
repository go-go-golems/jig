// The jig → Candela bridge (JIG-016): jig's CAD package (src/engine/cadpkg.js, export('candela')) read by Candela's
// own build through src/render/jig-candela.js, on the real engine (OpenCascade in Node) and the vendored Candela
// (dist/candela.js, from `make web`). The running example is preset F-06, the needle-bar drive.
//   node --test test/render/bridge.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('../engine/loader.mjs', import.meta.url).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const W = await import('../../src/engine/worker.js');
const { encodeCadPackage, toCandelaMatrix } = await import('../../src/engine/cadpkg.js');
const C = await import('../../dist/candela.js');
const BRIDGE = readFileSync(join(ROOT, 'src/render/jig-candela.js'), 'utf8');
const F06 = readFileSync(join(ROOT, 'content/presets/F-06-slider-crank-mechanism/script.js'), 'utf8');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const nearV = (a, b, eps) => a.length === b.length && a.every((x, i) => near(x, b[i], eps));
let text, pkg;

before(async () => {
  await W.handle({ id: 0, op: 'init' });
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': F06 }, options: {} });
  assert.ok(r.ok && r.program.ok, 'F-06 compiles');
  const e = await W.handle({ id: 2, op: 'export', format: 'candela', options: {} });
  assert.ok(e.ok, e.error?.message);
  text = e.data;
  pkg = JSON.parse(text);
});

// a look file over the open program's package, as the Render view writes it
const look = (body) => `import { scene, light, camera, hdri, finish, material } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig-program';
${body}`;
const DEFAULT_LOOK = look(`const asm = jigScene(program);
export default scene().add(asm).add(light.env.hdri(hdri.studio()));`);
async function buildLook(src, p = pkg) {
  const files = { 'jig-candela.js': BRIDGE, 'jig-program.js': 'export const program = __jigPackage;', 'scene.js': src };
  return C.build(files, { scope: { __jigPackage: p } });
}
const meshObjects = (r) => r.compiled.objects.map((o, i) => ({ o, i })).filter(({ o }) => o.def);

test('the package: format, frame, components and their placements', () => {
  assert.equal(pkg.format, 'jig-cad-package');
  assert.equal(pkg.version, 1);
  assert.deepEqual(pkg.components.map((c) => c.id), ['frame', 'crank', 'rod', 'slider']);
  // the rod sits at (3.87, −43.17, 6) mm in jig at the drive's default 30°: (x, z, −y) / 1000 in Candela
  const rod = pkg.components.find((c) => c.id === 'rod');
  assert.ok(nearV(rod.transform.slice(12, 15), [0.003875, 0.006, 0.04317208], 1e-7), JSON.stringify(rod.transform.slice(12, 15)));
  assert.equal(rod.material, 'steel');
  assert.deepEqual(rod.look, { material: 'steel' });
  assert.deepEqual(pkg.components.find((c) => c.id === 'frame').look, {}, 'a part without a material has no look');
});

test('the crank-pin bore of the rod: a ground cylinder with its axis and radius in metres', () => {
  const body = pkg.bodies.find((b) => b.id === 'rod/body1');
  assert.equal(body.faces.length, 8);
  const bore = body.faces.find((f) => f.id === 'body/side[s.big]');
  assert.equal(bore.meta.kind, 'cylinder');
  assert.equal(bore.meta.feature, 'body');
  assert.equal(bore.meta.featureType, 'extrude');
  assert.equal(bore.meta.process, 'ground', 'an inner loop of an extrude is a bore');
  assert.ok(nearV(bore.meta.axis.map(Math.abs), [0, 1, 0], 1e-12), 'jig axis (0, 0, ±1) → Candela (0, ±1, 0)');
  assert.ok(near(bore.meta.radius, 0.003, 1e-12));
  // the outer sides are milled along the extrude direction; the ends are faced by a mill about their normal
  assert.equal(body.faces.find((f) => f.id === 'body/side[s.r.top]').meta.process, 'milled');
  assert.ok(body.faces.find((f) => f.id === 'body/side[s.r.top]').meta.direction);
  assert.ok(body.faces.find((f) => f.id === 'body/end').meta.axis);
});

test('the frame conversion: C·T·C⁻¹ keeps rotations orthonormal and maps jig +Z to Candela +Y', () => {
  const rz90 = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1];   // 90° about jig Z, at (10, 20, 30) mm
  const M = toCandelaMatrix(rz90);
  assert.ok(nearV(M.slice(12, 15), [0.01, 0.03, -0.02], 1e-12));
  // a rotation about jig Z is a rotation about Candela Y: the Y column stays (0, 1, 0)
  assert.ok(nearV(M.slice(4, 7), [0, 1, 0], 1e-12));
});

test('Candela builds the package through the bridge: one mesh per body, groups by component id', async () => {
  const r = await buildLook(DEFAULT_LOOK);
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.diags.filter((d) => d.severity === 'error'), []);
  assert.deepEqual(meshObjects(r).map(({ o }) => o.def.name), ['frame/body1', 'crank/body1', 'rod/body1', 'slider/body1']);
  for (const id of ['frame', 'crank', 'rod', 'slider']) assert.ok(r.compiled.poseIds.has(id), `pose id ${id}`);
});

test('each body lands at its jig placement (the bridge decomposes the transform exactly)', async () => {
  const r = await buildLook(DEFAULT_LOOK);
  const P = r.compiled.pack({}), O = P.O;
  for (let k = 0; k < P.nObjs; k++) {
    const b = k * 24, oi = O[b + 21] | 0, obj = r.compiled.objects[oi];
    if (!obj.def) continue;
    const want = pkg.bodies.find((x) => x.id === obj.def.name).transform;          // column-major object → world
    const Mi = Array.from(O.subarray(b + 4, b + 16));                              // row-major 3×4 world → object
    // apply Mi to the world image of a few local points: it must give the points back
    for (const p of [[0, 0, 0], [0.01, 0, 0], [0, 0.02, 0], [0, 0, 0.03]]) {
      const w = [0, 1, 2].map((r) => want[r] * p[0] + want[4 + r] * p[1] + want[8 + r] * p[2] + want[12 + r]);
      const back = [0, 1, 2].map((r) => Mi[r * 4] * w[0] + Mi[r * 4 + 1] * w[1] + Mi[r * 4 + 2] * w[2] + Mi[r * 4 + 3]);
      assert.ok(nearV(back, p, 1e-6), `${obj.def.name}: ${JSON.stringify(p)} → ${JSON.stringify(back)}`);
    }
  }
});

test('materials join by name: component#face globs and whole components override autoFinish', async () => {
  const r = await buildLook(look(`const asm = jigScene(program)
  .face(['rod#body/side[s.big]', 'rod#body/side[s.small]'], finish.ground({ metal: 'bearing-steel' }))
  .material('crank', finish.blackOxide({ process: 'milled' }));
export default scene().add(asm).add(light.env.hdri(hdri.studio()));`));
  assert.ok(r.ok, r.error?.message);
  const byName = Object.fromEntries(meshObjects(r).map(({ o }) => [o.def.name, o]));
  const rod = byName['rod/body1'], faceIndex = (o, id) => o.def.faces.findIndex((f) => f.id === id);
  const fm = (o, id) => o.faceMats[faceIndex(o, id)];
  // both pin bores: the same, explicit material; the other faces keep their own (autoFinish: milled steel)
  assert.equal(fm(rod, 'body/side[s.big]'), fm(rod, 'body/side[s.small]'));
  for (const side of ['body/side[s.r.top]', 'body/side[s.r.left]', 'body/start']) assert.notEqual(fm(rod, 'body/side[s.big]'), fm(rod, side), side);
  // a glob matches by name: 'body/side[s.*]' is every side face the sketch made, the outline's too
  assert.equal(r.compiled.objects.length, 4, 'four bodies, no ground');
  // the crank: one material on every face
  assert.equal(new Set(byName['crank/body1'].faceMats).size, 1);
  assert.ok(byName['crank/body1'].faceMats[0] >= 0);
});

test('an address that names nothing is an error that suggests real names', async () => {
  const r = await buildLook(look(`const asm = jigScene(program).face('rod#body/side[s.bigg]', finish.ground());
export default scene().add(asm);`));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /no face matches; did you mean .*rod#body\/side\[s\.big\]/);
  const m = await buildLook(look(`const asm = jigScene(program).material('crnak', finish.ground());
export default scene().add(asm);`));
  assert.match(m.error.message, /no component; components: frame, crank, rod, slider/);
});

test('jigScene refuses anything but a CAD package', async () => {
  const r = await buildLook(DEFAULT_LOOK, { format: 'candela-scene-package', version: 0 });
  assert.equal(r.ok, false);
  assert.match(r.error.message, /expected a jig-cad-package/);
});

test('the same program from typed arrays (the page) and from JSON (a file, candela-rt): identical GPU data', async () => {
  const fromJson = await buildLook(DEFAULT_LOOK, JSON.parse(text));
  const fromJson2 = await buildLook(DEFAULT_LOOK, JSON.parse(text));
  assert.equal(fromJson.compiled.shared, fromJson2.compiled.shared);
  const typed = JSON.parse(text);
  const dec = (s, T) => { const u = Buffer.from(s, 'base64'); return new T(u.buffer, u.byteOffset, u.byteLength / T.BYTES_PER_ELEMENT); };
  for (const b of typed.bodies) { b.positions = dec(b.positions, Float32Array); b.normals = dec(b.normals, Float32Array); b.indices = dec(b.indices, Uint32Array); b.triFace = dec(b.triFace, Uint32Array); }
  const fromTyped = await buildLook(DEFAULT_LOOK, typed);
  assert.equal(fromTyped.compiled.shared, fromJson.compiled.shared, 'the program (irHash input) is the same');
  const digest = (r) => C.digestBytes(r.compiled.pack({}).O);
  assert.equal(digest(fromTyped), digest(fromJson), 'the packed objects are the same');
});

test('encodeCadPackage round-trips typed arrays exactly', () => {
  const body = pkg.bodies[2];
  const u = Buffer.from(body.positions, 'base64');
  const positions = new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength));
  const again = JSON.parse(encodeCadPackage({ ...pkg, bodies: [{ ...body, positions, normals: new Float32Array(0), indices: new Uint32Array(0), triFace: new Uint32Array(0) }] }));
  assert.equal(again.bodies[0].positions, body.positions);
});

test('a glob is by name: body/side[s.*] names every side face of sketch s, the outline sides as well', () => {
  const sides = pkg.bodies.find((b) => b.id === 'rod/body1').faces.filter((f) => /^body\/side\[s\./.test(f.id)).map((f) => f.id);
  assert.equal(sides.length, 6);
});

// one triangle as a CAD package body, placed by T (column-major, already in Candela's frame)
function synthetic(transforms) {
  const tri = { positions: new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]), triFace: new Uint32Array([0]), faces: [{ id: 'f/end', meta: { kind: 'plane' } }] };
  return { format: 'jig-cad-package', version: 1, bounds: [[-1, -1, -1], [1, 1, 1]], views: {},
    components: transforms.map((T, i) => ({ id: `c${i}`, parent: null, transform: T, look: {} })),
    bodies: transforms.map((T, i) => ({ id: `c${i}/body1`, component: `c${i}`, transform: T, ...tri })) };
}
function rotation(axis, a, t = [0, 0, 0]) {   // Rodrigues, column-major 4×4
  const l = Math.hypot(...axis), [x, y, z] = axis.map((v) => v / l), c = Math.cos(a), s = Math.sin(a), C1 = 1 - c;
  const R = [[c + x * x * C1, x * y * C1 - z * s, x * z * C1 + y * s], [y * x * C1 + z * s, c + y * y * C1, y * z * C1 - x * s], [z * x * C1 - y * s, z * y * C1 + x * s, c + z * z * C1]];
  return [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, t[0], t[1], t[2], 1];
}

test('placement is exact for general rotations and at the gimbal (90° about Y)', async () => {
  const Ts = [rotation([1, 2, 3], 0.7, [0.1, -0.2, 0.3]), rotation([0, 1, 0], Math.PI / 2, [0, 0.05, 0]), rotation([0, 1, 0], -Math.PI / 2), rotation([-3, 1, 0.5], 2.9)];
  const p = synthetic(Ts);
  const r = await buildLook(DEFAULT_LOOK, p);
  assert.ok(r.ok, r.error?.message);
  const P = r.compiled.pack({}), O = P.O;
  for (let k = 0; k < P.nObjs; k++) {
    const b = k * 24, obj = r.compiled.objects[O[b + 21] | 0];
    const want = p.bodies.find((x) => x.id === obj.def.name).transform, Mi = Array.from(O.subarray(b + 4, b + 16));
    for (const q of [[0.01, 0, 0], [0, 0.02, 0], [0, 0, 0.03]]) {
      const w = [0, 1, 2].map((i) => want[i] * q[0] + want[4 + i] * q[1] + want[8 + i] * q[2] + want[12 + i]);
      const back = [0, 1, 2].map((i) => Mi[i * 4] * w[0] + Mi[i * 4 + 1] * w[1] + Mi[i * 4 + 2] * w[2] + Mi[i * 4 + 3]);
      assert.ok(nearV(back, q, 1e-6), `${obj.def.name}: ${JSON.stringify(q)} → ${JSON.stringify(back)}`);
    }
  }
});

test('.meta() patches what autoFinish reads; a later .meta() beats an earlier explicit material', async () => {
  const r = await buildLook(look(`const asm = jigScene(program)
  .face(['rod#body/side[s.big]', 'rod#body/side[s.small]'], finish.ground({ metal: 'bearing-steel' }))
  .meta('rod#body/side[s.big]', { material: 'brass' })
  .meta('slider', { finish: 'paint', color: '#c8102e' });
export default scene().add(asm).add(light.env.hdri(hdri.studio()));`));
  assert.ok(r.ok, r.error?.message);
  const byName = Object.fromEntries(meshObjects(r).map(({ o }) => [o.def.name, o]));
  const rod = byName['rod/body1'], fm = (o, id) => o.faceMats[o.def.faces.findIndex((f) => f.id === id)];
  assert.ok(fm(rod, 'body/side[s.big]') >= 0 && fm(rod, 'body/side[s.small]') >= 0);
  assert.notEqual(fm(rod, 'body/side[s.big]'), fm(rod, 'body/side[s.small]'), 'the big bore became brass; the small one kept the explicit material');
  assert.equal(new Set(byName['slider/body1'].faceMats).size, 1, 'the whole slider painted');
  const bad = await buildLook(look(`const asm = jigScene(program).meta('rod#body/side[s.bgi]', { material: 'brass' });
export default scene().add(asm);`));
  assert.match(bad.error.message, /meta\("rod#body\/side\[s\.bgi\]"\): no face matches; did you mean .*rod#body\/side\[s\.big\]/);
});
