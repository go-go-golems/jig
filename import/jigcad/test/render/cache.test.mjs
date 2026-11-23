// Caching between compiles (JIG-016): the worker keeps each body's render tessellation while the feature cache keeps
// the body, and gives every package body content keys; the bridge keeps its mesh definitions (and their BVHs) by
// those keys across packages, so a rebuild after an edit builds only what the edit changed. The running example is
// preset F-06, the needle-bar drive: lengthening the rod changes the rod alone.
//   node --test test/render/cache.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('../engine/loader.mjs', import.meta.url).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const W = await import('../../src/engine/worker.js');
const { cadStats } = await import('../../src/engine/cadpkg.js');
const C = await import('../../dist/candela.js');
const BRIDGE = readFileSync(join(ROOT, 'src/render/jig-candela.js'), 'utf8');
const F06 = readFileSync(join(ROOT, 'content/presets/F-06-slider-crank-mechanism/script.js'), 'utf8');
const LONGER = F06.replace('r = 15.5, L = 60', 'r = 15.5, L = 62');
const ZINC = LONGER.replace('return head', "return head.finish('rod', { finish: 'zinc' })");

before(async () => { await W.handle({ id: 0, op: 'init' }); });

// compile and export, as the Render view does after an edit: → the package as the page parses it
async function packageOf(src) {
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': src }, options: {} });
  assert.ok(r.ok && r.program.ok, r.error?.message);
  const e = await W.handle({ id: 2, op: 'export', format: 'candela', options: { quality: 'render', studies: false } });
  assert.ok(e.ok, e.error?.message);
  return JSON.parse(e.data);
}
const LOOK = `import { scene, light, hdri } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig-program';
export default scene().add(jigScene(program)).add(light.env.hdri(hdri.studio()));`;
async function build(pkg) {
  const files = { 'jig-candela.js': BRIDGE, 'jig-program.js': 'export const program = __jigPackage;', 'scene.js': LOOK };
  const r = await C.build(files, { scope: { __jigPackage: pkg } });
  assert.ok(r.ok, r.error?.message);
  return r;
}
const defsOf = (r) => Object.fromEntries(r.compiled.objects.filter((o) => o.def).map((o) => [o.def.name, o.def]));
const stats = () => ({ ...globalThis.__jigCandelaStats });
const delta = (a, b) => ({ created: b.created - a.created, derived: b.derived - a.derived, reused: b.reused - a.reused });
const byId = (pkg) => Object.fromEntries(pkg.bodies.map((b) => [b.id, b]));

test('the worker meshes again only the body an edit changed, and keys every body by its content', async () => {
  const a = await packageOf(F06);
  const s0 = { ...cadStats };
  const again = await packageOf(F06);
  assert.deepEqual({ meshed: cadStats.meshed - s0.meshed, reused: cadStats.reused - s0.reused }, { meshed: 0, reused: 4 }, 'the same script: nothing meshed');
  const s1 = { ...cadStats };
  const b = await packageOf(LONGER);
  assert.deepEqual({ meshed: cadStats.meshed - s1.meshed, reused: cadStats.reused - s1.reused }, { meshed: 1, reused: 3 }, 'a longer rod: the rod alone');
  const A = byId(a), B = byId(b), A2 = byId(again);
  for (const id of Object.keys(A)) {
    assert.match(A[id].key, /^d[0-9a-f]{16}$/);
    assert.match(A[id].meshKey, /^m[0-9a-f]{16}$/);
    assert.equal(A2[id].key, A[id].key, `${id}: the same body, the same key`);
  }
  for (const id of ['frame/body1', 'crank/body1', 'slider/body1']) assert.equal(B[id].key, A[id].key, id);
  assert.notEqual(B['rod/body1'].key, A['rod/body1'].key);
  assert.notEqual(B['rod/body1'].meshKey, A['rod/body1'].meshKey);
});

test('a finish changes the key of the bodies it reaches, not their meshKey', async () => {
  const b = byId(await packageOf(LONGER)), z = byId(await packageOf(ZINC));
  assert.notEqual(z['rod/body1'].key, b['rod/body1'].key, 'the face meta is part of the definition');
  assert.equal(z['rod/body1'].meshKey, b['rod/body1'].meshKey, 'the same triangles');
  for (const id of ['frame/body1', 'crank/body1', 'slider/body1']) assert.equal(z[id].key, b[id].key, id);
});

test('the bridge reuses an unchanged body\'s definition across packages and builds a new one for a changed body', async () => {
  const r1 = await build(await packageOf(F06));
  const s = stats();
  const r2 = await build(await packageOf(LONGER));
  assert.deepEqual(delta(s, stats()), { created: 1, derived: 0, reused: 3 });
  const d1 = defsOf(r1), d2 = defsOf(r2);
  for (const id of ['frame/body1', 'crank/body1', 'slider/body1']) assert.equal(d2[id], d1[id], `${id}: the same definition object`);
  assert.notEqual(d2['rod/body1'], d1['rod/body1'], 'the rod changed: a new definition');
  assert.ok(d2['rod/body1'].count > 0);
});

test('a finish-only edit: a new definition for the affected body alone, sharing the triangles and the BVH', async () => {
  const r1 = await build(await packageOf(LONGER));
  const s = stats();
  const r2 = await build(await packageOf(ZINC));
  assert.deepEqual(delta(s, stats()), { created: 0, derived: 1, reused: 3 });
  const d1 = defsOf(r1), d2 = defsOf(r2), rod1 = d1['rod/body1'], rod2 = d2['rod/body1'];
  for (const id of ['frame/body1', 'crank/body1', 'slider/body1']) assert.equal(d2[id], d1[id], id);
  assert.notEqual(rod2, rod1);
  assert.equal(rod2.tris, rod1.tris, 'the same triangles');
  assert.ok(rod1._blas, 'the first build made the BVH');
  assert.equal(rod2._blas, rod1._blas, 'no new BVH');
  assert.equal(rod2.name, 'rod/body1');
  assert.deepEqual(rod2.faces.map((f) => f.id), rod1.faces.map((f) => f.id));
  assert.ok(rod2.faces.every((f) => f.meta.finish === 'zinc'), 'the new face meta');
  assert.ok(rod1.faces.every((f) => f.meta.finish === undefined), 'the earlier definition is untouched');
  // the same scene built from scratch (no keys: every body from its arrays) is the same on the GPU
  const fresh = await packageOf(ZINC);
  for (const b of fresh.bodies) { delete b.key; delete b.meshKey; }
  const r3 = await build(fresh), digest = (r) => C.digestBytes(r.compiled.pack({}).O);
  assert.equal(digest(r2), digest(r3), 'the packed objects');
  const mats = (r) => r.compiled.objects.filter((o) => o.def).map((o) => o.faceMats);
  assert.deepEqual(mats(r2), mats(r3), 'the face materials');
  assert.notDeepEqual(mats(r1), mats(r2), 'zinc is another material');
});

// one triangle per component, as a hand-made package: no content keys
function synthetic(n) {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const tri = { positions: new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]), triFace: new Uint32Array([0]), faces: [{ id: 'f/end', meta: { kind: 'plane' } }] };
  return { format: 'jig-cad-package', version: 1, bounds: [[-1, -1, -1], [1, 1, 1]], views: {},
    components: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, parent: null, transform: I, look: {} })),
    bodies: Array.from({ length: n }, (_, i) => ({ id: `c${i}/body1`, component: `c${i}`, transform: I, ...tri })) };
}

test('a package without keys keeps one definition per body object', async () => {
  const p = synthetic(2);
  const r1 = await build(p), s = stats(), r2 = await build(p);
  assert.deepEqual(delta(s, stats()), { created: 0, derived: 0, reused: 2 });
  assert.equal(defsOf(r2)['c0/body1'], defsOf(r1)['c0/body1']);
  const s2 = stats(), r3 = await build(synthetic(2));
  assert.deepEqual(delta(s2, stats()), { created: 2, derived: 0, reused: 0 });
  assert.notEqual(defsOf(r3)['c0/body1'], defsOf(r1)['c0/body1']);
});

test('the cache is bounded by its triangle budget, least recently used first, never the build in progress', async () => {
  const cache = globalThis.__jigCandelaCache, budget = cache.budget;
  const rodOf = (L) => F06.replace('r = 15.5, L = 60', `r = 15.5, L = ${L}`);
  const keys = (p) => p.bodies.map((x) => x.key);
  try {
    const a = await packageOf(F06), b = await packageOf(rodOf(64)), c = await packageOf(rodOf(66));
    await build(a); await build(b);
    // room for this build and one more rod: of the older definitions, the most recently used one stays (b's rod)
    const tris = (p, id) => p.bodies.filter((x) => !id || x.id === id).reduce((n, x) => n + Buffer.from(x.triFace, 'base64').length / 4, 0);
    cache.budget = tris(c) + tris(b, 'rod/body1');
    const s = stats();
    await build(c);    // a new rod; the rest reused
    assert.ok(stats().evicted - s.evicted >= 1, 'definitions of earlier builds went');
    assert.deepEqual([...cache.defs.keys()].sort(), [...new Set([...keys(c), ...keys(b)])].sort(), "what is left: this build's and the last one's");
    assert.ok(cache.triangles <= cache.budget);
    assert.equal(globalThis.__jigCandelaStats.defs, cache.defs.size);
    // nothing to spare: only this build's stay, even past the budget
    cache.budget = 1;
    const rb = await build(b);
    assert.deepEqual([...cache.defs.keys()].sort(), [...keys(b)].sort());
    assert.equal(cache.triangles, Object.values(defsOf(rb)).reduce((n, d) => n + d.count, 0));
    // the evicted rod of the first package is built again when that package comes back
    const s2 = stats();
    await build(a);
    assert.deepEqual(delta(s2, stats()), { created: 1, derived: 0, reused: 3 });
  } finally { cache.budget = budget; }
});
