// The lockstitch head against the converter that rendered it before jig had a CAD package (JIG-016).
//
// Candela's preset K-09 was made by candela:tools/lockstitch/convert.py from meshes only. Per part:
//   - it fitted each cylinder's and cone's axis from the mesh (cyl_axis: the null vector of NᵀN over the vertex
//     normals, then a Kasa circle fit of the vertices across it);
//   - the largest such face of a LATHE part set the part's one lathe axis;
//   - round faces coaxial with it were 'turned', flat faces across it 'faced' (FACED parts only), the rest 'polished'.
// jig's package (export('candela'), src/engine/cadpkg.js) has the exact names and axes from the B-rep. It infers a
// process from the feature that made a face (inferProcess, design doc §6.4). This test compiles all 27 part scripts
// through the worker, exports each package and compares it face by face with what the converter made:
//   1. names, kinds and face order;
//   2. jig's exact axes against the converter's per-face fits, and against the lathe axis it gave turned and faced faces;
//   3. processes, with every disagreement in a named class with its reason;
//   4. a summary (t.diagnostic).
// Two jig gaps found here are `todo` tests at the end.
//
// Fixtures in test/render/fixtures/lockstitch/:
//   - scripts.json: each part's jig script, from the lockstitch project's animation/cad;
//   - expected.json: convert.py's result per face, made by gen-expected.py (its header says how to rerun it).
// Both are in Candela's frame (m, +Y up: p' = 0.001·(x, z, −y)), as the package is.
//   node --test test/render/lockstitch.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register(new URL('../engine/loader.mjs', import.meta.url).href);

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/lockstitch');
const SCRIPTS = JSON.parse(readFileSync(join(FIX, 'scripts.json'), 'utf8'));
const EXPECTED = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8')).parts;
const W = await import('../../src/engine/worker.js');

// The scripts set no material, and jig infers a process only on a metal part. Each part gets the material the
// converter gave it (its MATERIAL table), or the nearest one jig knows. Any metal infers the same processes.
const JIG_MATERIAL = { steel: 'steel', stainless: 'stainless', aluminium: 'aluminium', bronze: 'bronze',
  'cast-iron': 'steel', 'bearing-steel': 'steel', chrome: 'steel', nickel: 'steel',     // metals jig does not list
  rubber: 'TPU-95A' };                                                                   // the belt: a polymer, no process

// ---- vectors, in metres ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / len(a));
const DEG = 180 / Math.PI;
/** the angle between two axes, ignoring their sign, in degrees */
const axisAngle = (a, b) => Math.atan2(len(cross(unit(a), unit(b))), Math.abs(dot(unit(a), unit(b)))) * DEG;
/** how far line (c, b) passes from line (o, a) where the face is: at p (the face's centroid) projected onto (o, a) */
function distAtFace(o, a, c, b, p) {
  a = unit(a); b = unit(b);
  const q = add(o, mul(a, dot(sub(p, o), a)));
  return len(cross(sub(q, c), b));
}
const f32 = (s) => { const u = Buffer.from(s, 'base64'); return new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); };
const u32 = (s) => { const u = Buffer.from(s, 'base64'); return new Uint32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); };

// ---- the tolerances ----
// A cylinder's fit is exact: OCCT's vertex normals are the surface's, all square to the axis, so NᵀN's null vector is
// the axis to float32 rounding (~1e-7 rad), and the vertices lie on the circle to float32 rounding of millimetre
// coordinates below 200 (~1e-5 mm). The fixture rounds axes to 1e-6 and points to 1e-7 m: at most ~1.4e-6 rad, and
// 0.1 µm plus 1.4e-6 × a 200 mm lever ≈ 0.4 µm at the face. The tolerances leave headroom above that and nothing
// more: a real disagreement in geometry is far larger than a micrometre.
const FIT_ANGLE = 0.01;       // degrees
const FIT_DIST = 1e-6;        // metres
// The lathe axis convert.py wrote is rounded to 3 decimals per component (≤ 0.04°) and its centre to 0.1 mm (≤ 0.09
// mm in 3D); a face up to 200 mm along the axis from that centre adds ≤ 0.14 mm, 0.23 mm in all. (convert.py itself
// accepted a face as coaxial within 5.7° and 0.3 mm.)
const LATHE_ANGLE = 0.1;      // degrees
const LATHE_DIST = 0.25e-3;   // metres
// cones: convert.py fits them as cylinders. NᵀN of a cone of half-angle α (surface to axis) has eigenvalue sin²α
// along the axis and cos²α/2 across it, so its smallest-eigenvalue direction is the axis only when tan²α < 1/2,
// α < 35.26°. Steeper cones are fitted with a radial direction, 90° off. Shallower ones are fitted with the axis, but
// the cross terms cos α sin α (r̂âᵀ + âr̂ᵀ) cancel only for vertices spread evenly round the cone, which a
// tessellation's seam and apex rows are not: the needle's taper and point come out about 0.7° off.
const CONE_FLIP = Math.atan(Math.SQRT1_2) * DEG;
const CONE_ANGLE = 1;         // degrees, a shallow cone's fit
const CONE_DIST = 0.05e-3;    // metres, at the face

// ---- compile every part and export its package ----
const J = {};   // part → { pkg, graph, bodies: Map(body id → { body, faces: [{ id, meta, centroid, normals }] }) }
let compileMs = 0;
before(async () => {
  await W.handle({ id: 0, op: 'init' });
  const t0 = Date.now();
  for (const [name, src0] of Object.entries(SCRIPTS)) {
    const mat = JIG_MATERIAL[EXPECTED[name].material.material];
    assert.ok(mat, `${name}: no jig material for '${EXPECTED[name].material.material}'`);
    const src = src0.replace(/return p\s*$/, `return p.material(j.material('${mat}'))`);
    assert.notEqual(src, src0, `${name}: the script ends in 'return p'`);
    const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': src }, options: {} });
    assert.ok(r.ok, `${name}: ${r.error?.message}`);
    const errors = r.program.diagnostics.filter((d) => d.level === 'error');
    assert.equal(errors.length, 0, `${name}: ${errors.map((d) => d.message).join('; ')}`);
    const e = await W.handle({ id: 2, op: 'export', format: 'candela', options: {} });
    assert.ok(e.ok, `${name}: ${e.error?.message}`);
    const pkg = JSON.parse(e.data);
    J[name] = { pkg, graph: r.program.graph, bodies: new Map(pkg.bodies.map((b) => [b.id, { body: b, faces: facesOf(b) }])) };
  }
  compileMs = Date.now() - t0;
});

/** a body's faces with what the mesh adds: the centroid of each face's vertices, and its vertex normals */
function facesOf(b) {
  const P = f32(b.positions), N = f32(b.normals), I = u32(b.indices), TF = u32(b.triFace);
  const verts = b.faces.map(() => new Set());
  for (let t = 0; t < TF.length; t++) for (let k = 0; k < 3; k++) verts[TF[t]].add(I[t * 3 + k]);
  return b.faces.map((f, i) => {
    const vs = [...verts[i]], p = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], n = (v) => [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
    const centroid = mul(vs.map(p).reduce(add, [0, 0, 0]), 1 / Math.max(1, vs.length));
    return { id: f.id, meta: f.meta, centroid, normals: vs.map(n) };
  });
}
/** |n·a| over a face's vertex normals: a surface of revolution about a has one value, sin α (0 for a cylinder) */
function sinRange(face, a) {
  a = unit(a);
  const s = face.normals.map((n) => Math.abs(dot(unit(n), a)));
  return { min: Math.min(...s), max: Math.max(...s), mean: s.reduce((x, y) => x + y, 0) / s.length };
}

/** every face convert.py saw, with jig's record of it: [{ part, P (its expected part), body, x (expected), j }] */
function pairs() {
  const out = [];
  for (const [part, P] of Object.entries(EXPECTED)) for (const b of P.bodies) {
    const jb = J[part].bodies.get(b.id);
    const byId = new Map((jb?.faces ?? []).map((f) => [f.id, f]));
    for (const x of b.faces) out.push({ part, P, body: b.id, x, j: byId.get(x.n) ?? null });
  }
  return out;
}
const label = (e) => `${e.part} ${e.x.n}`;
const SUMMARY = {};

test('every part compiles and exports a package, at the origin, one component per part', () => {
  assert.equal(Object.keys(J).length, 27);
  for (const [name, { pkg }] of Object.entries(J)) {
    assert.deepEqual(pkg.components.map((c) => c.id), [name]);
    for (const b of pkg.bodies) assert.deepEqual(b.transform, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], `${b.id} is placed where its mesh is`);
  }
});

test('1. names: every face convert.py saw is in jig\'s package, under the same name, kind, body and order', () => {
  const missing = [], kinds = [], extra = [], order = [];
  for (const [part, P] of Object.entries(EXPECTED)) {
    const ids = P.bodies.map((b) => b.id), jids = [...J[part].bodies.keys()];
    assert.deepEqual(jids, ids, `${part}: bodies`);
    for (const b of P.bodies) {
      const jf = J[part].bodies.get(b.id).faces, jnames = jf.map((f) => f.id), names = b.faces.map((f) => f.n);
      for (const x of b.faces) {
        const j = jf.find((f) => f.id === x.n);
        if (!j) {
          // a renamed face: one whose name is not in jig's package; a candidate is a jig name convert.py did not see
          missing.push(`${part} ${x.n} (jig has ${jnames.filter((n) => !names.includes(n)).slice(0, 3).join(', ') || 'no other name'})`);
        } else if (j.meta.kind !== x.k) kinds.push(`${part} ${x.n}: ${x.k} → ${j.meta.kind}`);
      }
      for (const n of jnames) if (!names.includes(n)) extra.push(`${part} ${n}`);
      if (jnames.join('\n') !== names.join('\n')) order.push(`${part} ${b.id}`);
    }
  }
  const n = pairs().length;
  SUMMARY.names = { faces: n, missing: missing.length, extra: extra.length, kindChanged: kinds.length, reordered: order.length };
  assert.deepEqual(missing, [], 'faces convert.py saw that jig no longer names so');
  assert.deepEqual(extra, [], 'faces jig makes that convert.py did not see');
  assert.deepEqual(kinds, [], 'faces whose surface kind changed');
  assert.deepEqual(order, [], 'bodies whose faces come in another order (triFace indices would not carry over)');
  assert.equal(n, 1124);
});

test('2a. axes: jig\'s exact axis of every cylinder and cone against convert.py\'s fit of that face', (t) => {
  const stats = { cylinder: { n: 0, angle: 0, dist: 0, radius: 0 }, coneShallow: { n: 0, angle: 0, dist: 0 }, coneSteep: { n: 0, minAngle: 90 } };
  const bad = [];
  for (const e of pairs()) {
    const { x, j } = e;
    if (!x.fit || !j) continue;
    const m = j.meta, a = m.axis, o = m.axisOrigin;
    assert.ok(a && o, `${label(e)}: jig gives a ${m.kind} its axis`);
    // jig's axis is the face's own: every vertex normal makes one angle with it (to float32 normals)
    const s = sinRange(j, a);
    assert.ok(s.max - s.min < 1e-5, `${label(e)}: |n·a| spans ${s.min}..${s.max} about jig's axis`);
    const angle = axisAngle(a, x.fit.a), dist = distAtFace(o, a, x.fit.c, x.fit.a, j.centroid);
    if (m.kind === 'cylinder') {
      const S = stats.cylinder, dr = Math.abs(m.radius - x.fit.r);
      S.n++; S.angle = Math.max(S.angle, angle); S.dist = Math.max(S.dist, dist); S.radius = Math.max(S.radius, dr);
      if (angle > FIT_ANGLE || dist > FIT_DIST || dr > FIT_DIST) bad.push(`${label(e)}: ${angle.toFixed(4)}°, ${(dist * 1e3).toFixed(4)} mm, Δr ${(dr * 1e3).toFixed(4)} mm`);
      continue;
    }
    // a cone: which side of 35.26° its half-angle is (from jig's normals: |n·a| = sin of the normal's tilt = sin α)
    const alpha = Math.asin(Math.min(1, s.mean)) * DEG;
    if (alpha > CONE_FLIP) {
      // documented: convert.py's fit returns a direction across the axis
      stats.coneSteep.n++; stats.coneSteep.minAngle = Math.min(stats.coneSteep.minAngle, angle);
      if (angle < 89) bad.push(`${label(e)}: a ${alpha.toFixed(1)}° cone fitted ${angle.toFixed(2)}° off, expected ~90°`);
    } else {
      const S = stats.coneShallow;
      S.n++; S.angle = Math.max(S.angle, angle); S.dist = Math.max(S.dist, dist);
      if (angle > CONE_ANGLE || dist > CONE_DIST) bad.push(`${label(e)}: a ${alpha.toFixed(1)}° cone fitted ${angle.toFixed(3)}° and ${(dist * 1e3).toFixed(3)} mm off`);
      // which axis is the face's: about the fitted one the normals do not make one angle
      const sf = sinRange(j, x.fit.a);
      S.fitSpread = Math.max(S.fitSpread ?? 0, sf.max - sf.min);
      if (sf.max - sf.min < 1e-3) bad.push(`${label(e)}: the face's normals fit convert.py's axis as well as jig's`);
    }
  }
  SUMMARY.fits = stats;
  t.diagnostic(`cylinders ${stats.cylinder.n}: max ${stats.cylinder.angle.toExponential(2)}°, ${(stats.cylinder.dist * 1e3).toExponential(2)} mm at the face, Δr ${(stats.cylinder.radius * 1e3).toExponential(2)} mm`);
  t.diagnostic(`cones under ${CONE_FLIP.toFixed(2)}° ${stats.coneShallow.n}: max ${stats.coneShallow.angle.toFixed(3)}°, ${(stats.coneShallow.dist * 1e3).toFixed(4)} mm (|n·a| spans ${stats.coneShallow.fitSpread?.toFixed(4)} about the fit, < 1e-5 about jig's axis); steeper ${stats.coneSteep.n}: fitted ≥ ${stats.coneSteep.minAngle.toFixed(2)}° off (documented)`);
  assert.deepEqual(bad, []);
  assert.equal(stats.cylinder.n, 108);
  assert.deepEqual([stats.coneShallow.n, stats.coneSteep.n], [2, 4], 'the needle\'s taper and point; the hand wheel\'s chamfers and the tension discs');
});

// convert.py's lathe axis of a body is the fit of its largest fitted face. When that face is a steep cone (2a), the
// lathe axis is a direction across the part's real axis. In the lockstitch that is the tension unit: its dished disc
// (108 mm²) is larger than its boss (100 mm²), so K-09 grooves disc1 about a vertical axis (the fit's radial
// direction; the unit's axis is jig's Y, front to back) and turns or faces nothing else on the part.
const halfAngle = (j) => Math.asin(Math.min(1, sinRange(j, j.meta.axis).mean)) * DEG;
test('2b. axes: the lathe axis convert.py gave its turned and faced faces is jig\'s axis of each face', (t) => {
  const S = { turned: { n: 0, angle: 0, dist: 0 }, faced: { n: 0, angle: 0 }, wrongAxis: [] }, bad = [];
  for (const [part, P] of Object.entries(EXPECTED)) for (const b of P.bodies) {
    const jf = new Map(J[part].bodies.get(b.id).faces.map((f) => [f.id, f]));
    const main = b.faces.filter((f) => f.fit).reduce((m, f) => (!m || f.area > m.area ? f : m), null);
    const steep = P.lathe && main?.k === 'cone' && halfAngle(jf.get(main.n)) > CONE_FLIP;
    for (const x of b.faces) {
      if (!x.a) continue;
      const j = jf.get(x.n), e = { part, x };
      if (steep) {
        // documented: the lathe axis is the steep cone's fit, square to the face's real axis
        const angle = axisAngle(j.meta.axis ?? j.meta.normal, x.a);
        S.wrongAxis.push(`${label(e)} ${x.p} ${angle.toFixed(1)}° off`);
        if (angle < 89) bad.push(`${label(e)}: a lathe axis from a steep cone, expected ~90° off, is ${angle.toFixed(2)}°`);
      } else if (x.p === 'turned') {
        // the face's own axis line (jig's), against the part's lathe axis line (convert.py's)
        const angle = axisAngle(j.meta.axis, x.a), dist = distAtFace(j.meta.axisOrigin, j.meta.axis, x.c, x.a, j.centroid);
        S.turned.n++; S.turned.angle = Math.max(S.turned.angle, angle); S.turned.dist = Math.max(S.turned.dist, dist);
        if (angle > LATHE_ANGLE || dist > LATHE_DIST) bad.push(`${label(e)} turned: ${angle.toFixed(3)}°, ${(dist * 1e3).toFixed(3)} mm`);
      } else {
        // a faced plane's axis is its normal; its rings' centre is on the lathe axis, not at the face's centroid
        assert.equal(x.p, 'faced');
        assert.equal(j.meta.kind, 'plane', label(e));
        const angle = axisAngle(j.meta.normal, x.a);
        S.faced.n++; S.faced.angle = Math.max(S.faced.angle, angle);
        if (angle > LATHE_ANGLE) bad.push(`${label(e)} faced: ${angle.toFixed(3)}°`);
      }
    }
  }
  SUMMARY.lathe = S;
  t.diagnostic(`turned ${S.turned.n}: max ${S.turned.angle.toExponential(2)}°, ${(S.turned.dist * 1e3).toFixed(4)} mm at the face; faced ${S.faced.n}: max ${S.faced.angle.toExponential(2)}°`);
  t.diagnostic(`a lathe axis from a steep cone's fit (documented): ${S.wrongAxis.join('; ')}`);
  assert.deepEqual(bad, []);
  assert.deepEqual(S.wrongAxis, ['tension disc1/side turned 90.0° off']);
  assert.deepEqual([S.turned.n + 1, S.faced.n], [45, 153], 'convert.py\'s own count: turned faces 45 (one of them the tension disc), faced 153');
});

// ---- 3. processes ----
// The mapping: convert.py says turned, faced or polished; jig turned, faced, ground, milled or nothing.
//   turned   = jig turned or ground: grooves round the face's own axis. A bore is ground in jig; convert.py, which
//              sees normals and not which side the metal is, calls bores and bosses alike turned.
//   faced    = jig faced.
//   polished = jig nothing: neither gives the face a process (convert.py: no grooves, roughness 0.3; jig: the
//              material's default).
// Anything else is a disagreement, and each falls in one class below (the first that matches), with its reason.
const AGREE = { turned: ['turned', 'ground'], faced: ['faced'], polished: ['none'] };
const isCopy = (m) => /\[\d+\]$/.test(m.feature);
const CLASSES = [
  { id: 'add-no-rule', count: 123, example: 'crank hub/side',
    reason: 'inferProcess has no rule for .add() (a primitive unioned or cut in: j.cyl, j.cone, j.box). Such a face is a ' +
      'cylinder or plane whose exact axis jig knows, but it gets no process. convert.py turned it, or faced it, as coaxial ' +
      'with the part\'s lathe axis (todo test below).',
    match: (e, jp) => jp === 'none' && e.j.meta.featureType === 'add' && (e.x.p === 'turned' || e.x.p === 'faced') },
  { id: 'pattern-copy', count: 4, example: 'handwheel spokes[1]/spoke/end',
    reason: 'a pattern copy\'s faces are named "spokes[1]/spoke/…", and the package takes "spokes[1]" as their feature. The ' +
      'graph has no such feature, so featureType is null and nothing is inferred, while the original spoke\'s faces are ' +
      'milled. convert.py faced the ends across the lathe axis (todo test below).',
    match: (e, jp) => jp === 'none' && isCopy(e.j.meta) && e.x.p === 'faced' },
  { id: 'extrude-side-milled', count: 3, example: 'crank web/side[circle]#1',
    reason: 'an extrude\'s outer round side is milled in jig (peripheral milling, about its axis). convert.py turned it, ' +
      'being coaxial with the part\'s lathe axis.',
    match: (e, jp) => e.x.p === 'turned' && jp === 'milled' && e.j.meta.featureType === 'extrude' },
  { id: 'extrude-end-milled', count: 65, example: 'handwheel rim/start',
    reason: 'an extrude\'s end, or a flat side across the axis, is milled in jig (a face mill about its normal). ' +
      'convert.py faced it, because it is across the lathe axis of a FACED part.',
    match: (e, jp) => e.x.p === 'faced' && jp === 'milled' && e.j.meta.featureType === 'extrude' },
  { id: 'not-a-lathe-part', count: 85, example: 'nbLink link/side[rect.left]',
    reason: 'jig infers a process for every metal part from its features (extrude faces milled, an inner loop ground). ' +
      'convert.py grooved only the parts in its LATHE list, and gave links, levers and castings an isotropic finish.',
    match: (e, jp) => !e.P.lathe && e.x.p === 'polished' && (jp === 'milled' || jp === 'ground') },
  { id: 'gear-flank', count: 312, example: 'hookGear gear/face#1',
    reason: 'a twisted extrude\'s tooth flanks are B-splines, and jig mills them by the extrude rule (§6.4\'s "hobbed" is ' +
      'for j.lib.gear, not a script\'s own gear). convert.py fits only cylinders and cones, so it left them polished.',
    match: (e, jp) => e.P.lathe && e.x.p === 'polished' && jp === 'milled' && e.j.meta.kind === 'bspline' },
  { id: 'off-the-lathe-axis', count: 246, example: 'crank web/start',
    reason: 'on a lathe part, convert.py grooved only faces round its one lathe axis, and ends across it on FACED parts; ' +
      'it polished the rest. jig mills an extrude\'s or chamfer\'s faces wherever they are: the crank\'s web, an off-axis ' +
      'pin bore, the ends of a part not in FACED, a chamfer cone the fit got 90° wrong.',
    match: (e, jp) => e.P.lathe && e.x.p === 'polished' && (jp === 'milled' || jp === 'ground') },
];

test('3. processes: where jig and convert.py agree, and every disagreement in a class with its reason', (t) => {
  const tally = { agreeProcess: 0, agreeNeither: 0 }, byClass = Object.fromEntries(CLASSES.map((c) => [c.id, []])), unexplained = [];
  const combos = {};
  for (const e of pairs()) {
    const jp = e.j.meta.process ?? 'none';
    combos[`${e.x.p}→${jp}`] = (combos[`${e.x.p}→${jp}`] ?? 0) + 1;
    if (AGREE[e.x.p].includes(jp)) { tally[jp === 'none' ? 'agreeNeither' : 'agreeProcess']++; continue; }
    const c = CLASSES.find((k) => k.match(e, jp));
    if (c) byClass[c.id].push(label(e));
    else unexplained.push(`${label(e)}: convert.py ${e.x.p}, jig ${jp} (${e.j.meta.featureType} ${e.j.meta.kind})`);
  }
  SUMMARY.process = { ...tally, combos, classes: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])) };
  t.diagnostic(`agree: ${tally.agreeProcess} on a process (turned = turned/ground), ${tally.agreeNeither} on none (polished = no process)`);
  for (const c of CLASSES) t.diagnostic(`${c.id}: ${byClass[c.id].length}, e.g. ${byClass[c.id][0]}`);
  t.diagnostic(`convert.py → jig: ${Object.entries(combos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  assert.deepEqual(unexplained, [], 'a disagreement no class explains');
  for (const c of CLASSES) {
    assert.equal(byClass[c.id].length, c.count, `${c.id}: ${c.reason}`);
    assert.ok(byClass[c.id].includes(c.example), `${c.id}: the example ${c.example} is in the class`);
  }
  assert.deepEqual([tally.agreeProcess, tally.agreeNeither], [3, 283]);
});

test('4. summary', (t) => {
  const s = SUMMARY, dis = s.process ? Object.values(s.process.classes).reduce((a, b) => a + b, 0) : null;
  t.diagnostic(`compiled and exported 27 parts in ${compileMs} ms`);
  if (s.names) t.diagnostic(`faces compared: ${s.names.faces}; names missing ${s.names.missing}, extra ${s.names.extra}, kind changed ${s.names.kindChanged}, reordered ${s.names.reordered}`);
  if (s.fits) t.diagnostic(`per-face fits: ${s.fits.cylinder.n} cylinders within ${s.fits.cylinder.angle.toExponential(1)}° / ${(s.fits.cylinder.dist * 1e3).toExponential(1)} mm; ${s.fits.coneShallow.n} shallow cones within ${s.fits.coneShallow.angle.toFixed(2)}° / ${(s.fits.coneShallow.dist * 1e3).toFixed(3)} mm; ${s.fits.coneSteep.n} steep cones fitted across the axis`);
  if (s.lathe) t.diagnostic(`lathe axis: ${s.lathe.turned.n} turned faces within ${s.lathe.turned.angle.toExponential(1)}° / ${(s.lathe.turned.dist * 1e3).toFixed(4)} mm, ${s.lathe.faced.n} faced within ${s.lathe.faced.angle.toExponential(1)}°, ${s.lathe.wrongAxis.length} on a lathe axis fitted to a steep cone`);
  if (s.process) t.diagnostic(`processes: ${s.process.agreeProcess} agree on a process, ${s.process.agreeNeither} on none, ${dis} disagree: ${Object.entries(s.process.classes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  assert.ok(compileMs < 60_000, `compiling took ${compileMs} ms`);
});

// ---- jig gaps the comparison shows: the tests say what jig should do, and are todo until it does ----
test('a cylinder or cone that .add() brings into a metal part gets a process about its axis', { todo: 'inferProcess (cadpkg.js) has no case for featureType "add": j.cyl and j.cone sides added to a metal part get no process' }, () => {
  const none = [];
  for (const [part, { bodies }] of Object.entries(J)) {
    if (EXPECTED[part].material.material === 'rubber') continue;
    for (const { faces } of bodies.values()) for (const f of faces) {
      if (f.meta.featureType === 'add' && ['cylinder', 'cone'].includes(f.meta.kind) && !f.meta.process) none.push(`${part} ${f.id}`);
    }
  }
  assert.equal(none.length, 0, `${none.length} round faces from .add() have no process, e.g. ${none.slice(0, 4).join(', ')}`);
});

test('a pattern copy\'s faces carry the patterned feature\'s type and process', { todo: 'cadpkg.js featureOf takes "spokes[1]" from "spokes[1]/spoke/end" (features.js names copies `${id}[${k}]/${name}`), which is no feature in the graph' }, () => {
  const hw = [...J.handwheel.bodies.values()].flatMap((b) => b.faces), byId = new Map(hw.map((f) => [f.id, f.meta]));
  const features = new Set(J.handwheel.graph.nodes.map((n) => n.id));
  const copies = hw.filter((f) => /^spokes\[\d+\]\//.test(f.id));
  assert.equal(copies.length, 8);
  for (const f of copies) {
    assert.ok(features.has(f.meta.feature), `${f.id}: feature '${f.meta.feature}' is not in the graph (${[...features].join(', ')})`);
    const orig = byId.get(f.id.replace(/^spokes\[\d+\]\//, ''));
    assert.ok(orig, f.id);
    assert.equal(f.meta.featureType, orig.featureType, `${f.id}: featureType`);
    assert.equal(f.meta.process, orig.process, `${f.id}: process`);
  }
});
