// compur-poses.mjs: poses for preset M-11 (the Synchro-Compur 0-MXV) from an outside engine, the shutter's own
// planar dynamics (the Compur project's web/sim.js on web/snap.js and web/compur.js), baked into a look module the
// Render view hands to Candela's build next to look.js (JIG-016 §6.6, "outside engines").
//
//   node tools/compur-poses.mjs <compur>/web [--speed 125] [--rate 24000] [--slow 250] [--to 20] [--out <file>]
//
// What it does:
//   1. runs one release as the project's tools/expose.mjs does: the shutter cocked, the cocking stroke kept out of
//      the run, the release pressed from 2 to 4 ms; at 1/125 (the model's default speed) by default;
//   2. samples it at a fixed rate of simulation time, from 0 to `to` ms (20: the cam is arrested at 13.7 ms, the
//      ring rests shut at 17.6 ms; the train then creeps by less than a degree a millisecond and is left there).
//      24 kHz, one sample every 42 µs, is a little finer than the workbench's own frames (every 50 µs): the blades
//      open in about 1 ms, and the cam and the star wheel turn up to 4 and 23 rad/ms between impacts, so a slower
//      rate shows in the poses between samples (at 12 kHz the cam is off by 4° between samples at its fastest).
//      At 250× slower that is 96 samples a second of playback, so 24, 32, 48 and 96 fps land on samples;
//   3. maps each simulated body to the jig component of the same name (the workbench's partMatrix): the blade ring,
//      the five blades, the main drive cam, the retard lever, the first gear segment, the inertia weight, the two
//      wheels and the star wheel of the train, the pallet control lever, the inner release lever, the outer release
//      lever and the cocking pinion; the pallet, which the simulation does not carry, rocks on its control lever
//      (compur.js palletAngle), and the cocking ring turns with the pinion 18:127 (the workbench's poseOf);
//   4. writes each component's planar motion relative to the simulation's reference state q = 0, the pose the CAD
//      is drawn in (cam at θ = 0 with its opening lug on the stud, ring and blades shut, the retard parts at their
//      design pose), as an angle about a pivot plus a displacement of the pivot, in design coordinates (mm, seen
//      from the front, z toward the subject), which are jig's coordinates: the preset places every part at the
//      identity. Components that never leave the reference state are left out.
//
// The baked module (compur-poses.look.js) lifts the planar motion to 3D about jig's Z, the optical axis, converts
// it to the CAD package's frame and composes it with the component's own placement:
//   jig:      x ↦ Rz(θ)·(x − c) + c + d                       (c the pivot, d its displacement, mm)
//   package:  P = C·M·C⁻¹ · T,  C = 0.001·R,  R(x, y, z) = (x, z, −y)   (cadpkg.js toCandelaMatrix)
// so a turn about jig +Z is a turn about Candela +Y, and a displacement (dx, dy) mm is 0.001·(dx, 0, −dy) m.
// Time: playback t (s) → simulation time t·1000/slow ms after a lead-in hold; `slow` = 250 by default, so the
// 1/125 s exposure (about 9.5 ms through the blades) plays in 2.4 s and the whole release in 5 s.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'content/presets/M-11-synchro-compur/compur-poses.look.js');

function args(argv) {
  const o = { speed: '125', rate: 24000, slow: 250, from: 0, to: 20, lead: 0.5, tail: 1, out: OUT, web: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o.web = a; continue; }
    const k = a.slice(2), v = argv[++i];
    o[k] = ['speed', 'out'].includes(k) ? v : +v;
  }
  if (!o.web) throw new Error('usage: node tools/compur-poses.mjs <compur>/web [--speed 125] [--rate 24000] [--slow 250] [--to 20] [--out file]');
  return o;
}

// the bodies of the simulation that are jig components of the same name (web/compur.js model(): parts). The
// preset's other components are the frame, which the simulation's 'plate' holds still: housing, tube, base,
// bladePlate, bridge, escPlates, speedCam, speedRing, cover and iris.
const SIM = ['ring', 'blade1', 'blade2', 'blade3', 'blade4', 'blade5', 'cam', 'retard', 'segment', 'weight',
  'w1', 'w2', 'star', 'carrier', 'latch', 'release', 'pinion'];

const rot = (a, p) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; };

/** run one release and sample it: { info, components: { id: { c, th, dx, dy } } } (arrays per sample) */
export async function bake(o) {
  const web = resolve(o.web), url = (f) => pathToFileURL(join(web, f)).href;
  for (const f of ['sim.js', 'snap.js', 'compur.js']) if (!existsSync(join(web, f))) throw new Error(`no ${f} in ${web}`);
  const { simulate } = await import(url('sim.js'));
  const { World } = await import(url('snap.js'));
  const CP = await import(url('compur.js'));
  const sp = CP.SPEEDS.find((s) => s.mark === String(o.speed));
  if (!sp) throw new Error(`no speed '${o.speed}'; speeds: ${CP.SPEEDS.map((s) => s.mark).join(', ')}`);
  // one release (tools/expose.mjs): no cocking stroke in the run, the release lever pressed from 2 to 4 ms
  const params = { speed: sp.mark, times: { cock: [1e6, 2e6, 3e6, 4e6], press: [2, 4, 0, 0], end: o.to + 1 }, every: 0.01 };
  const r = simulate(params);
  const w = new World(CP.model(params));          // the same model, for its kinematics (followers, pivots)
  const ix = new Map(r.parts.map((id, i) => [id, i]));
  for (const id of SIM) if (!ix.has(id)) throw new Error(`the simulation has no body '${id}'`);
  const ES = CP.DESIGN.mech.esc, Pv = ES.pallet.pivot;
  const zp = 18, zr = 127;                         // cocking pinion 517 and cocking ring 528 (web/cad.json meta.gearing)
  const n = Math.round(((o.to - o.from) * o.rate) / 1000) + 1, dt = 1000 / o.rate;
  const planar = new Map([...SIM, 'pallet', 'cockingRing'].map((id) => [id, []]));
  let i = 0;
  for (let k = 0; k < n; k++) {
    const t = o.from + k * dt;
    while (i < r.nF - 2 && r.t[i + 1] <= t) i++;
    const f = Math.min(1, Math.max(0, (t - r.t[i]) / (r.t[i + 1] - r.t[i])));
    // the workbench's poseAt: every coordinate interpolated, then the kinematics (followers from their sources)
    for (const p of w.parts) { const m = ix.get(p.id); p.q = r.q[i * r.nP + m] + (r.q[(i + 1) * r.nP + m] - r.q[i * r.nP + m]) * f; }
    w.kin();
    for (const id of SIM) { const p = w.part(id); planar.get(id).push({ th: p.th, t: p.t.slice() }); }
    // the pallet on its control lever, rocking about its arbor once per star tooth (the workbench's poseOf)
    const car = w.part('carrier'), a = CP.palletAngle(w.part('star').q, car.q), o0 = [Pv[0] - rot(a, Pv)[0], Pv[1] - rot(a, Pv)[1]];
    planar.get('pallet').push({ th: car.th + a, t: w.world(car, o0) });
    planar.get('cockingRing').push({ th: (-w.part('pinion').q * zp) / zr, t: [0, 0] });
  }
  const pivotOf = (id) => {
    if (id === 'pallet') return Pv.slice();
    if (id === 'cockingRing') return [0, 0];
    const p = w.part(id);
    return p.kind === 'revolute' ? p.c.slice() : [0, 0];
  };
  const components = {}, rest = {};
  for (const [id, rows] of planar) {
    const c = pivotOf(id);
    // a pose as an angle about the pivot and a displacement of the pivot: x ↦ R(θ)(x − c) + c + d, so d = t − c + R(θ)c
    const th = rows.map((x) => x.th), d = rows.map((x) => { const rc = rot(x.th, c); return [x.t[0] - c[0] + rc[0], x.t[1] - c[1] + rc[1]]; });
    if (th.every((v) => Math.abs(v) < 1e-9) && d.every((v) => Math.hypot(v[0], v[1]) < 1e-9)) continue;   // never leaves q = 0
    const turns = Math.round(th[0] / (2 * Math.PI));   // the same rotations, smaller numbers (the star starts 68 turns round)
    components[id] = { c, th: th.map((v) => v - turns * 2 * Math.PI), dx: d.map((v) => v[0]), dy: d.map((v) => v[1]) };
    rest[id] = +((th[0] * 180) / Math.PI).toFixed(4);
  }
  let open = null, shut = null;
  for (let m = 0; m < r.nF; m++) { const fr = CP.openFraction(r.q[m * r.nP + ix.get('ring')]); if (fr > 0.01) { open ??= r.t[m]; shut = r.t[m]; } }
  const info = {
    source: 'the Compur project: web/sim.js on snap.js, compur.js',
    speed: sp.mark === '1' ? '1 s' : `1/${sp.mark}`, nominalMs: +sp.t.toFixed(3), pressMs: [2, 4], openMs: [+open.toFixed(3), +shut.toFixed(3)],
    simRate: o.rate, slowMotion: o.slow, fromMs: o.from, toMs: o.to, frames: n,
    startDeg: rest,
  };
  return { info, components };
}

// ---- the module text ----
const num = (v, d) => { const x = +v.toFixed(d); return Object.is(x, -0) ? '0' : String(x); };
/** a channel: a number when it is the same in every sample, else an array wrapped at 80 columns */
function channel(name, a, d, indent) {
  const k = a.map((v) => num(v, d));
  if (k.every((v) => v === k[0])) return `${indent}${name}: ${k[0]},`;
  const lines = [`${indent}${name}: [`], pad = indent + '  ';
  let line = pad;
  for (const v of k) {
    if (line.length + v.length + 1 > 80) { lines.push(line.trimEnd()); line = pad; }
    line += v + ',';
  }
  lines.push(line, `${indent}],`);
  return lines.join('\n');
}

const RUNTIME = `
// ---- playback (runs in Candela's build: the look imports it) ----
// a channel at sample k + f: a number, or between two samples, linearly
const at = (v, k, f) => (typeof v === 'number' ? v
  : v[k] + (v[Math.min(k + 1, v.length - 1)] - v[k]) * f);
// x ↦ Rz(θ)(x − c) + c + d in jig (mm, Z the optical axis) in the package's
// frame: C·M·C⁻¹ with C = 0.001·R, R(x, y, z) = (x, z, −y). A turn about jig +Z
// is a turn about +Y there, and a move (dx, dy) mm is 0.001·(dx, 0, −dy) m.
function lift(c, th, dx, dy) {
  const co = Math.cos(th), s = Math.sin(th);
  const tx = c[0] + dx - (co * c[0] - s * c[1]);
  const ty = c[1] + dy - (s * c[0] + co * c[1]);
  return [co, 0, -s, 0, 0, 1, 0, 0, s, 0, co, 0, tx / 1000, 0, -ty / 1000, 1];
}
function mul(a, b) {   // column-major 4×4
  const o = new Array(16);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1]
      + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  }
  return o;
}
const isIdentity = (M) => !M
  || M.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-12);
const placements = (pkg) =>
  new Map((pkg?.components ?? []).map((c) => [c.id, c.transform]));

/** the sample a playback time t (s) shows (fractional): a hold, the release
 *  slowed down, a hold */
export const frameAt = (t) =>
  Math.min(D.frames - 1, Math.max(0, (t - D.lead) * D.fps));
/** every component that moves, at sample x, as the bridge's posesAt has them:
 *  { id: column-major 4×4, world, in the package's frame }: the motion composed
 *  with the package's placement of the component (pkg.components) */
export function posesAtFrame(pkg, x, rest = placements(pkg)) {
  const k = Math.min(D.frames - 2, Math.max(0, Math.floor(x)));
  const f = Math.min(1, Math.max(0, x - k)), out = {};
  for (const [id, m] of Object.entries(D.components)) {
    const M = lift(m.c, at(m.th, k, f), at(m.dx, k, f), at(m.dy, k, f));
    const T = rest.get(id);
    out[id] = isIdentity(T) ? M : mul(M, T);
  }
  return out;
}
/** t (s) → poses: export const animation = poses.animate(program) */
export function animate(pkg) {
  const rest = placements(pkg);
  const fn = (t) => posesAtFrame(pkg, frameAt(t), rest);
  fn.duration = D.duration;   // the Render view's timeline
  return fn;
}
export default { ...D, frameAt, posesAtFrame, animate };
`;

/** a field of the info object as code, an object's entries wrapped at 80 columns */
function field(k, v, indent) {
  const one = `${indent}${k}: ${JSON.stringify(v)},`;
  if (one.length <= 80 || !v || typeof v !== 'object' || Array.isArray(v)) return one;
  const lines = [`${indent}${k}: {`], pad = indent + '  ';
  let line = pad;
  for (const [a, x] of Object.entries(v)) {
    const e = `${/^[a-z]\w*$/i.test(a) ? a : JSON.stringify(a)}: ${JSON.stringify(x)},`;
    if (line.length + e.length + 1 > 80) { lines.push(line.trimEnd()); line = pad; }
    line += e + ' ';
  }
  lines.push(line.trimEnd(), `${indent}},`);
  return lines.join('\n');
}

/** comment lines wrapped at 80 columns */
const wrap = (text) => {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '//';
    for (const word of para.split(' ').filter(Boolean)) {
      if (line.length + 1 + word.length > 80) { out.push(line); line = '//'; }
      line += ' ' + word;
    }
    out.push(line);
  }
  return out.join('\n');
};

export function moduleText(b, o) {
  const fps = o.rate / o.slow, simS = (o.to - o.from) / 1000;
  const duration = +(o.lead + simS * o.slow + o.tail).toFixed(6);
  const head = `${wrap(`compur-poses.look.js: one release of the Synchro-Compur 0-MXV at ${b.info.speed}, from the shutter's own planar dynamics (the Compur project's web/sim.js), for the Render view. Generated by tools/compur-poses.mjs: do not edit, run it again. Candela's build runs this file (look.js imports it); jig's compile does not.

Sampled at ${o.rate} Hz of simulation time from ${o.from} to ${o.to} ms and slowed ${o.slow}×: ${fps} samples per second of playback, ${o.lead} s held before and ${o.tail} s after, ${duration} s in all. Per component: a pivot c (mm, jig's frame) and per sample an angle th (rad) about jig +Z and a displacement (dx, dy) of the pivot (mm); a number where it is the same in every sample. The motion is relative to the simulation's reference state q = 0, the pose the CAD is drawn in; startDeg is each angle when the run starts (the cam cocked, the gear segment at the speed cam's step, the pallet control lever held out).`)}
const D = {
  fps: ${fps}, duration: ${duration}, frames: ${b.info.frames}, lead: ${o.lead}, tail: ${o.tail},
  info: {
${Object.entries(b.info).map(([k, v]) => field(k, v, '    ')).join('\n')}
  },
  components: {`;
  const body = Object.entries(b.components).map(([id, m]) => [
    `    ${id}: {`,
    `      c: [${m.c.map((v) => num(v, 6)).join(', ')}],`,
    channel('th', m.th, 5, '      '),
    channel('dx', m.dx, 4, '      '),
    channel('dy', m.dy, 4, '      '),
    '    },',
  ].join('\n'));
  return [head, ...body, '  },', '};', RUNTIME].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const o = args(process.argv.slice(2));
  const t0 = performance.now(), b = await bake(o), text = moduleText(b, o);
  writeFileSync(o.out, text);
  console.log(`${o.out}: ${(text.length / 1024).toFixed(1)} KiB, ${b.info.frames} samples, ${Object.keys(b.components).length} components (${Object.keys(b.components).join(' ')}), ${(performance.now() - t0).toFixed(0)} ms`);
  console.log(JSON.stringify(b.info));
}
