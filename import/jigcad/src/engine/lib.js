// Library of printable hardware features (README §4.9): heat-set insert bosses, magnet pockets, dowels,
// cantilever snap hooks with a strain check, pin and living hinges, dovetails, printed threads (threads.js),
// involute gears (gears.js), simple screws/nuts as parts.
import * as K from './kernel.js';
import * as S from './shapes.js';
import { namedFromExplicit, transformNamed } from './ops.js';
import { combine } from './features.js';
import { METRIC } from './holes.js';
import { threadSpec, threadRadii, threadSolid, threadVolume, PROFILES } from './threads.js';
import { gear } from './gears.js';
import { snap as snapCheck, material } from './inspect.js';
import { part } from './part.js';
import { region, rectLoop } from './region.js';

const V = K.V;
const mmv = x => x == null ? null : typeof x === 'number' ? x : x.isSymbolic ? null : x.value ?? Number(x);

class LibFeature {
  constructor(label, spec, builder) { this.label = label; this.spec = spec; this._b = builder; Object.freeze(this); }
  get isLibFeature() { return true; }
  build(ctx, f, state) {
    const m = f.opts.at != null ? ctx.placement(f.opts.at, state) : K.IDENTITY;
    const out = this._b(ctx, f, state);
    const place = n => { const t = transformNamed(n, m); n.shape.delete(); return t; };
    if (out.steps) return { ...out, steps: out.steps.map(st => ({ ...st, solids: st.solids.map(place) })) };
    return { ...out, add: (out.add ?? []).map(place), cut: (out.cut ?? []).map(place) };
  }
  toString() { return `j.lib.${this.label}`; }
  toCanon(rec) { return `lib:${this.label}:${rec(this.spec)}`; }
}
// local solids: cylinder along +z from z0 to z1, named `${id}/${role}`
function cylinder(id, role, r, z0, z1) {
  const fr = { origin: [0, 0, z0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const [p] = S.prism({ frame: fr, regions: [{ loops: [[{ kind: 'circle', c: [0, 0], r, src: role }]] }] }, { id: '@', dist: z1 - z0 });
  p.explicit.forEach(e => { e.name = e.name.replace('@/side', `${id}/${role}`).replace('@/start', `${id}/${role}Bottom`).replace('@/end', `${id}/${role}Top`); e.name = e.name.replace(/\[(.*)\]$/, ''); });
  return namedFromExplicit(p.shape, p.explicit, id);
}
function boxSolid(id, role, w, d, h, at = [0, 0, 0]) {
  const fr = { origin: at, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const [p] = S.prism({ frame: fr, regions: [{ loops: [rectLoop([0, 0], w, d, 0, role)] }] }, { id: '@', dist: h });
  p.explicit.forEach(e => { e.name = e.name.replace('@/', `${id}/`); });
  return namedFromExplicit(p.shape, p.explicit, id);
}

function insert(size = 'M3x5.7', o = {}) {
  const m = /^(M[\d.]+)(?:x([\d.]+))?/i.exec(size); const t = METRIC[m?.[1]?.toUpperCase()] ?? METRIC.M3; const L = m?.[2] ? +m[2] : t.insertL;
  return {
    kind: 'insert', size, d: t.insert, length: L, toString: () => `j.lib.insert('${size}')`,
    boss: (bo = {}) => new LibFeature(`insert('${size}').boss`, { size, bo }, (ctx, f) => {
      const wall = ctx.len(bo.wall ?? 1.35), H = bo.height != null ? ctx.len(bo.height) : L + 2.3;
      const holeD = t.insert, depth = L + 1.0, D = holeD + 2 * wall;
      return { add: [cylinder(f.id, 'boss', D / 2, 0, H)], cut: [cylinder(f.id, 'bore', holeD / 2, H - depth, H + 0.01)],
        info: { hole: { d: holeD, depth }, boss: { d: D, height: H }, suggests: { modifier: `walls 4 within 2 mm of the hole` } }, note: `boss Ø ${D.toFixed(2)} × ${H} mm, hole Ø ${holeD} × ${depth.toFixed(1)} mm` };
    }),
  };
}
function magnet({ d = 6, h = 3 } = {}) {
  return new LibFeature(`magnet(${mmv(d)}×${mmv(h)})`, { d, h }, (ctx, f) => {
    const fit = ctx.fitCtx(); const cls = f.opts.fit ?? 'press';
    const D = ctx.len(d) + 2 * fit.classes[cls] + fit.holeComp(ctx.len(d)), H = ctx.len(h) + 0.2;
    ctx.useFit(cls);
    // into the surface, like dowel: from the placement point down its z (JIG-012)
    return { cut: [cylinder(f.id, 'pocket', D / 2, -H, 0.01)], info: { modelled: { pocket: `Ø${D.toFixed(2)} × ${H.toFixed(2)} mm` } }, note: `pocket Ø ${D.toFixed(2)} × ${H.toFixed(2)} mm (${cls})` };
  });
}
function dowel({ d = 3, l = 10, fit = 'press' } = {}) {
  return new LibFeature(`dowel(Ø${mmv(d)}×${mmv(l)})`, { d, l, fit }, (ctx, f) => {
    const fc = ctx.fitCtx(); const D = ctx.len(d) + 2 * fc.classes[fit] + fc.holeComp(ctx.len(d)), depth = ctx.len(l) / 2 + 0.5;
    ctx.useFit(fit);
    return { cut: [cylinder(f.id, 'bore', D / 2, -depth, 0.01)], info: { modelled: { hole: `Ø${D.toFixed(2)} × ${depth.toFixed(1)} mm` } }, note: `dowel hole Ø ${D.toFixed(2)} × ${depth.toFixed(1)} mm` };
  });
}
// Cantilever snap hook along the frame's z (root at z = 0, tip at length), thickness along x (centred), width
// along y (centred). The hook stands deflection proud of the beam (+x) with an insertion ramp at `angle` from
// the beam and a retention face at `retention` (90° = square, does not let go). Strain ε = 1.5·t·y / L².
function cantilever(o = {}) {
  const spec = { length: o.length ?? 12, thickness: o.thickness ?? 1.6, deflection: o.deflection ?? 1, material: o.material ?? 'PETG', width: o.width ?? 6, angle: o.angle ?? 30, retention: o.retention ?? 90 };
  const feature = new LibFeature('snap.cantilever', spec, (ctx, f) => {
    const L = ctx.len(spec.length), t = ctx.len(spec.thickness), y = ctx.len(spec.deflection), w = ctx.len(spec.width);
    const a = ctx.ang(spec.angle), ret = ctx.ang(spec.retention);
    const chk = snapCheck({ length: L, thickness: t, deflection: y, material: spec.material });
    if (!chk.ok) ctx.diag({ level: 'error', kind: 'print.snapStrain', message: `ε = ${(chk.strain * 100).toFixed(2)} % > ${(chk.allowable * 100).toFixed(1)} % allowable (${material(spec.material).name})`, fix: chk.fix });
    const land = Math.max(0.3, 0.25 * y), ramp = y / Math.tan(a), back = ret >= Math.PI / 2 - 1e-9 ? 0 : y / Math.tan(ret);
    const zTop = L - ramp, zR = zTop - land - back;
    if (!(zR > 0.5)) throw ctx.fail('feature.failed', `snap: the hook (${(L - zR).toFixed(2)} mm) does not fit on a ${L} mm beam`, 'use a longer beam, a steeper ramp angle or less deflection');
    const pts = [[-t / 2, 0], [t / 2, 0], [t / 2, zR], [t / 2 + y, zR + back], [t / 2 + y, zTop], [t / 2, L], [-t / 2, L]];
    const roles = ['root', 'face', 'retention', 'land', 'ramp', 'tip', 'back'];
    const loop = pts.map((p, i) => ({ kind: 'line', a: p, b: pts[(i + 1) % pts.length], src: roles[i] }));
    const fr = { origin: [0, -w / 2, 0], x: [1, 0, 0], y: [0, 0, 1], z: [0, 1, 0] };
    const [pr] = S.prism({ frame: fr, regions: [{ loops: [loop] }] }, { id: '@', dist: w });
    pr.explicit.forEach(e => { e.name = e.name.replace(/^@\/side\[(.*)\]$/, `${f.id}/$1`).replace('@/start', `${f.id}/side.r`).replace('@/end', `${f.id}/side.l`); });
    const hook = namedFromExplicit(pr.shape, pr.explicit, f.id);
    // insertion force (the hook face slides at the ramp angle, friction μ = 0.3)
    const mu = 0.3, E = material(spec.material).modulus * 1000, Pdef = w * t ** 3 * E * y / (4 * L ** 3);
    const insert = Pdef * (mu + Math.tan(a)) / (1 - mu * Math.tan(a));
    return { add: [hook], op: 'join', info: { strain: chk.strain, allowable: chk.allowable, ratio: chk.ratio, deflectionForce: +Pdef.toFixed(3), insertionForce: +insert.toFixed(3), retains: ret >= Math.PI / 2 - 1e-9 ? 'permanent' : 'separable' },
      note: `strain ${(chk.ratio * 100).toFixed(0)} % of allowable, insertion ≈ ${insert.toFixed(1)} N` };
  });
  return feature;
}
function screw(std = 'ISO 7380', size = 'M3x8') {
  const m = /^(M[\d.]+)x([\d.]+)/i.exec(size); const t = METRIC[m?.[1]?.toUpperCase()] ?? METRIC.M3; const L = m ? +m[2] : 8;
  return part(`screw ${size}`).add({ isLibFeature: true, label: `screw ${std} ${size}`, build: (ctx, f) => ({ add: [cylinder(f.id, 'head', t.d * 0.95, L, L + t.d * 0.55), cylinder(f.id, 'shank', t.d / 2, 0, L)], info: { std, size } }), toCanon: () => `screw:${std}:${size}` }, { id: 'screw' })
    .port('head', { origin: [0, 0, L], x: [1, 0, 0], z: [0, 0, 1] }).port('tip', { origin: [0, 0, 0], x: [1, 0, 0], z: [0, 0, -1] });
}
function nut(std = 'ISO 4032', size = 'M3') {
  const t = METRIC[String(size).toUpperCase()] ?? METRIC.M3;
  const R = t.af / Math.sqrt(3);
  const pts = Array.from({ length: 6 }, (_, i) => [R * Math.cos(i * Math.PI / 3), R * Math.sin(i * Math.PI / 3)]);
  return part(`nut ${size}`).extrude(region.polygon(pts).subtract(region.circle(t.d / 2)), t.nut, { id: 'nut' });
}
// Print-in-place pin hinge along the frame's z (0 → length). Leaf 'a' owns knuckles 1, 3, 5… and the pin; leaf
// 'b' owns knuckles 2, 4… bored to d + 2·clearance; knuckles are clearance apart along the axis. Each leaf first
// cuts room (radius R + clearance) for the other leaf's knuckles out of the bodies it is added to, so a lid
// and a box can carry the leaves. { plates: { width, thickness } } adds flat leaves along +x (a) and −x (b),
// flush with the knuckles' underside (y = −R), so the open hinge prints flat with the frame's +y up.
// leaf: 'both' builds both leaves at once as separate bodies of one part (a whole print-in-place hinge).
function hingePin(o = {}) {
  return new LibFeature(`hinge.pin(${o.knuckles ?? 5})`, { o }, (ctx, f) => {
    const n = o.knuckles ?? 5, L = ctx.len(o.length ?? 30), d = ctx.len(o.d ?? 3);
    const fit = ctx.fitCtx();
    const cls = typeof o.clearance === 'string' || o.clearance == null ? o.clearance ?? 'printInPlace' : null;
    const c = cls ? fit.classes[cls] : ctx.len(o.clearance);
    if (c == null) throw ctx.fail('feature.failed', `hinge: unknown fit class '${cls}'`);
    if (cls) ctx.useFit(cls);
    if (!Number.isInteger(n) || n < 2) throw ctx.fail('feature.failed', `hinge: knuckles must be a whole number ≥ 2 (got ${n})`);
    const wall = ctx.len(o.wall ?? 1.6), R = d / 2 + c + wall;
    const k = (L - (n - 1) * c) / n;
    if (!(k > 2 * c)) throw ctx.fail('feature.failed', `hinge: ${n} knuckles do not fit in ${L} mm with ${c} mm gaps`, `use fewer knuckles or a longer hinge`);
    const leaf = f.opts.leaf ?? 'a';
    if (!['a', 'b', 'both'].includes(leaf)) throw ctx.fail('feature.failed', `hinge: leaf must be 'a', 'b' or 'both' (got '${leaf}')`);
    const z0 = i => i * (k + c);
    const mine = (i, l) => (i % 2 === 0) === (l === 'a');
    const pw = o.plates ? ctx.len(o.plates.width ?? 15) : 0, pt = o.plates ? ctx.len(o.plates.thickness ?? 2) : 0;
    if (o.plates && !(pt > 0 && pt <= 2 * R)) throw ctx.fail('feature.failed', `hinge: plate thickness ${pt} mm must be in (0, ${(2 * R).toFixed(2)}] mm`);
    const plate = l => o.plates ? [boxSolid(f.id, `plate.${l}`, pw, pt, L, [(l === 'a' ? 1 : -1) * (c / 2 + pw / 2), -R + pt / 2, 0])] : [];
    // room for the other leaf's knuckles: R + c around the axis, c past their ends
    const room = l => Array.from({ length: n }, (_, i) => i).filter(i => !mine(i, l)).map(i => cylinder(f.id, `room${i + 1}`, R + c, Math.max(-0.01, z0(i) - c), Math.min(L + 0.01, z0(i) + k + c)));
    const knuckles = l => Array.from({ length: n }, (_, i) => i).filter(i => mine(i, l)).map(i => cylinder(f.id, `knuckle${i + 1}`, R, z0(i), z0(i) + k));
    const pin = () => [cylinder(f.id, 'pin', d / 2, 0, L)];
    const bores = () => Array.from({ length: n }, (_, i) => i).filter(i => !mine(i, 'a')).map(i => cylinder(f.id, `bore${i + 1}`, d / 2 + c, z0(i) - c / 2, z0(i) + k + c / 2));
    const leafSteps = l => l === 'a'
      ? [{ op: 'join', solids: plate('a') }, { op: 'cut', solids: room('a'), hints: { quiet: true } }, { op: 'join', solids: knuckles('a') }, { op: 'join', solids: pin(), hints: { quiet: true } }]
      : [{ op: 'join', solids: plate('b') }, { op: 'cut', solids: room('b'), hints: { quiet: true } }, { op: 'join', solids: knuckles('b') }, { op: 'cut', solids: bores() }];
    let steps, gap = null;
    if (leaf !== 'both') steps = leafSteps(leaf);
    else {
      // both leaves in one part: build each leaf on its own (the same steps on an empty state), then add both
      const quiet = { decide() {}, diag() {} };
      const build = l => {
        let st = { bodies: [] };
        for (const stp of leafSteps(l)) { if (!stp.solids.length || (stp.op === 'cut' && !st.bodies.length)) continue; st = { bodies: combine(st, stp.solids, stp.op, f.id, quiet, stp.hints ?? {}).bodies }; }
        return st.bodies.map(b => { b.detach(); return { shape: b.shape, names: b.names, aliases: b.aliases }; });
      };
      const A = build('a'), B = build('b');
      gap = Infinity;
      for (const x of A) for (const y of B) { const dd = K.distance(x.shape, y.shape); gap = Math.min(gap, dd.inner ? 0 : dd.value); }
      if (!(gap > c - 1e-6)) ctx.diag({ level: 'error', kind: 'asm.interference', message: `hinge leaves are ${gap.toFixed(3)} mm apart, under the ${c} mm clearance`, fix: 'use a smaller plate thickness or more clearance' });
      steps = [{ op: 'join', solids: A }, { op: 'join', solids: B }];
    }
    const odd = Math.ceil(n / 2), even = Math.floor(n / 2);
    return { steps, info: { leaf, gap: gap == null ? undefined : +gap.toFixed(6), knuckles: n, knuckleLength: +k.toFixed(4), outer: +(2 * R).toFixed(4), pin: d, bore: +(d + 2 * c).toFixed(4), clearance: c, fitClass: cls, plates: o.plates ? { width: pw, thickness: pt } : null },
      note: leaf === 'both' ? `${n} knuckles Ø${(2 * R).toFixed(2)} × ${k.toFixed(2)} mm, pin Ø${d}, gap ${c} mm, two leaves` : `leaf ${leaf}: ${leaf === 'a' ? odd : even} knuckles Ø${(2 * R).toFixed(2)} × ${k.toFixed(2)} mm, gap ${c} mm` };
  });
}
// Living hinge: a thin strip (length along the frame's x, gap along y, thickness along z) joining two leaves.
function hingeLiving(o = {}) {
  return new LibFeature('hinge.living', { o }, (ctx, f) => {
    const L = ctx.len(o.length ?? 30), t = ctx.len(o.thickness ?? 0.4), g = ctx.len(o.gap ?? 1), over = ctx.len(o.overlap ?? 2);
    const mat = material(o.material ?? 'PP');
    if (mat.allowableStrain < 0.05) ctx.diag({ level: 'warning', kind: 'print.layerStrength', message: `living hinges in ${mat.name} crack after a few flexes; PP or PETG last`, fix: "material: 'PP'" });
    return { add: [boxSolid(f.id, 'strip', L, g + 2 * over, t, [0, 0, 0])], op: 'join', info: { thickness: t, gap: g, bendRadius: g / 2, mustPrint: 'flat, first layers, lines across the hinge' }, note: `strip ${L} × ${g} × ${t} mm` };
  });
}
// Dovetail: a tail (op 'join', nominal) or a socket (op 'cut', grown by the fit gap per flank) on a face frame:
// narrow at the root (z = 0), wide at the tip (z = depth), running along the frame's y through the part.
function dovetail(o = {}) {
  return new LibFeature('dovetail', { o }, (ctx, f, state) => {
    const w = ctx.len(o.width ?? 20), dpt = ctx.len(o.depth ?? 6), ang = o.angle != null ? ctx.ang(o.angle) : 15 * Math.PI / 180;
    const cut = (f.opts.op ?? 'join') === 'cut';
    const fit = ctx.fitCtx(); const cls = o.fit ?? 'slide'; const gap = cut ? fit.classes[cls] : 0;
    if (cut) ctx.useFit(cls);
    const len = o.length != null ? ctx.len(o.length) : 1000;
    const hw = w / 2 + gap, tw = hw + dpt * Math.tan(ang);
    const zd = dpt + gap;
    // tail: narrow root on the face (z = 0), wide tip outside (z = depth); socket: the same shape cut inwards
    const s = cut ? -1 : 1;
    const pts = [[-hw, cut ? 0.01 : 0], [hw, cut ? 0.01 : 0], [tw + gap * Math.tan(ang), s * zd], [-tw - gap * Math.tan(ang), s * zd]];
    if (cut) pts.reverse();
    const fr = { origin: [0, -len / 2, 0], x: [1, 0, 0], y: [0, 0, 1], z: [0, 1, 0] };
    const loop = pts.map((p, i) => ({ kind: 'line', a: p, b: pts[(i + 1) % 4], src: ['root', 'flankR', 'tip', 'flankL'][i] }));
    const [pr] = S.prism({ frame: fr, regions: [{ loops: [loop.map(s => ({ ...s, a: [s.a[0], s.a[1]], b: [s.b[0], s.b[1]] }))] }] }, { id: '@', dist: len });
    pr.explicit.forEach(e => { e.name = e.name.replace('@/side', `${f.id}/side`).replace('@/start', `${f.id}/end`).replace('@/end', `${f.id}/end`); });
    const named = namedFromExplicit(pr.shape, pr.explicit, f.id);
    const info = { modelled: cut ? { socket: `${(2 * hw).toFixed(2)} × ${zd.toFixed(2)} mm at ${(ang * 180 / Math.PI).toFixed(0)}°`, gap: `${gap} mm per flank (${cls})` } : { tail: `${w} × ${dpt} mm at ${(ang * 180 / Math.PI).toFixed(0)}°` } };
    return cut ? { cut: [named], info } : { add: [named], op: 'join', info };
  });
}

// Printed threads: external adds a threaded rod along the frame's z from 0 to length; internal (or op 'cut')
// cuts a threaded hole, 0.5 mm past both ends unless { through: false } (then only past z = 0, the mouth).
function thread(spec, o = {}) {
  const t = threadSpec(spec);
  const profile = o.profile ?? t.profile ?? 'iso', starts = o.starts ?? 1;
  return new LibFeature(`thread('${t.label}')`, { spec: t, o: { ...o, profile, starts } }, (ctx, f) => {
    const internal = o.internal ?? f.opts.op === 'cut';
    const fit = ctx.fitCtx(); const cls = o.fit ?? 'slide';
    const gap = typeof cls === 'string' ? fit.classes[cls] : ctx.len(cls);
    if (gap == null) throw ctx.fail('feature.failed', `thread: unknown fit class '${cls}'`, `use one of ${Object.keys(fit.classes).join(', ')}`);
    if (typeof cls === 'string') ctx.useFit(cls);
    const R = threadRadii(t, { internal, profile, gap });
    const L = ctx.len(o.length ?? 10);
    const ext = internal ? 0.5 : 0;
    const core = o.core ?? true, bore = o.bore != null ? ctx.len(o.bore) / 2 : 0;
    if (internal && (!core || bore)) throw ctx.fail('feature.failed', 'thread: core and bore apply to external threads', 'an internal thread already cuts its own bore');
    const named = threadSolid({ rMajor: R.rMajor, rMinor: R.rMinor, pitch: R.pitch, length: L, profile, starts, hand: o.hand ?? 'right', id: f.id, extendStart: ext, extendEnd: internal && o.through !== false ? ext : 0, core, bore });
    const vol = threadVolume({ rMajor: R.rMajor, rMinor: R.rMinor, pitch: R.pitch, length: L, profile }) - (core ? Math.PI * bore * bore * L : Math.PI * R.rMinor ** 2 * L);
    const info = { thread: t.label, profile, profileNote: PROFILES[profile]?.angle, starts, lead: R.pitch * starts, hand: o.hand ?? 'right', internal, length: L, pitch: R.pitch,
      modelled: { major: +(2 * R.rMajor).toFixed(3), minor: +(2 * R.rMinor).toFixed(3), depth: +R.depth.toFixed(4) }, fit: { class: typeof cls === 'string' ? cls : null, gap },
      volumePerMm: +(vol / L).toFixed(4) };
    const what = `${t.label}${starts > 1 ? ` ${starts}-start` : ''}${profile !== 'iso' ? ` ${profile}` : ''}`;
    return internal ? { cut: [named], info, note: `internal ${what} × ${L} mm (Ø${(2 * R.rMajor).toFixed(2)} tool, ${typeof cls === 'string' ? cls : gap + ' mm'})` }
      : { add: [named], op: 'join', info, note: `external ${what} × ${L} mm (Ø${(2 * R.rMajor).toFixed(2)}, ${typeof cls === 'string' ? cls : gap + ' mm'})` };
  });
}
export const lib = {
  insert, magnet, dowel, screw, nut,
  washer: (std, size) => { const t = METRIC[String(size).toUpperCase()] ?? METRIC.M3; return part(`washer ${size}`).extrude(region.circle(t.d * 1.0).subtract(region.circle(t.d / 2 + 0.2)), t.d * 0.17, { id: 'washer' }); },
  pin: ({ d = 3, l = 10 } = {}) => part('pin').extrude(region.circle(typeof d === 'number' ? d / 2 : d.value / 2), l, { id: 'pin' }),
  snap: { cantilever, annular: () => { throw new Error('j.lib.snap.annular is not supported yet'); }, torsion: () => { throw new Error('j.lib.snap.torsion is not supported yet'); } },
  gear,
  hinge: { living: hingeLiving, pin: hingePin },
  dovetail,
  thread,
  bearing: () => { throw new Error('j.lib.bearing is not supported yet'); },
};
