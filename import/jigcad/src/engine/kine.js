// Compile a solved mechanism to a kine program (assembly spec v0.1, milestone M7; validated in the lockstitch book
// against a hand-written rig to 3e-13 mm).
//
// The spanning tree the solver placed becomes one kine skeleton: each tree joint is a skeleton joint
// at its parent-side port, turning or sliding along that port's z, and each body is a fixed child at the
// inverse of its own port. Every tree joint's value must then be a function of the input:
//   - the driven joint reads the input;
//   - a coupled joint is a derived expression of the joint it is coupled to;
//   - joints inside a closed loop come from a solve node: a planar four-bar becomes kine's own
//     solve.fourBar, a planar slider-crank becomes jig.sliderCrank (closed form), and any other loop
//     becomes jig.table, the loop solved over the cycle and interpolated, so the program stays a pure
//     function of the input.
// The output is source text (shown in the book, evaluated by the tests) plus the two jig ops.

import { frameOfMatrix } from './mechanism.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const mv = (R, p) => [0, 1, 2].map((i) => R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2]);
const tr = (R) => [0, 1, 2].map((i) => [R[0][i], R[1][i], R[2][i]]);
const cols = (x, y, z) => [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
// rotation matrix → unit quaternion [x, y, z, w]
function quat(R) {
  const t = R[0][0] + R[1][1] + R[2][2];
  let q;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; q = [(R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s, s / 4]; }
  else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; q = [s / 4, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s, (R[2][1] - R[1][2]) / s]; }
  else if (R[1][1] > R[2][2]) { const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; q = [(R[0][1] + R[1][0]) / s, s / 4, (R[1][2] + R[2][1]) / s, (R[0][2] - R[2][0]) / s]; }
  else { const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; q = [(R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, s / 4, (R[1][0] - R[0][1]) / s]; }
  const l = Math.hypot(...q); return q.map((v) => v / l);
}
// numbers come off a solved pose, so they carry its last-digit noise (15.5000000000029 for the drawn 15.5): a number
// within 1e-9 of a six-decimal value is that value; any other (π, 32.4928627980438) keeps full precision
const num = (x) => { const r = +x.toFixed(6); return Math.abs(x - r) <= 1e-9 * Math.max(1, Math.abs(x)) ? String(r === 0 ? 0 : r) : String(+x.toPrecision(15)); };
const vec = (v) => `[${v.map(num).join(', ')}]`;
const full = (v) => `[${v.map((x) => String(+x.toPrecision(15))).join(', ')}]`;   // table samples: no snapping
const ident = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');

// ---------------------------------------------------------------- the two ops a compiled program needs
export function jigOps(registry, T) {
  registry.register('jig.sliderCrank', { pure: true, foldable: true,
    infer(i) { if (Object.keys(i).join() !== 'crank') throw new Error('jig.sliderCrank reads crank'); return { rod: T.angle, x: T.length, closure: T.length }; },
    evaluate({ crank }, { a, L, e, branch }) {
      const Ax = a * Math.cos(crank), Ay = a * Math.sin(crank), dy = e - Ay, h = Math.sqrt(Math.max(0, L * L - dy * dy));
      const Bx = Ax + branch * h;
      return { rod: Math.atan2(dy, branch * h), x: Bx, closure: Math.abs(Math.hypot(Bx - Ax, dy) - L) };
    } });
  // a periodic table over the input, cubic Hermite between its samples
  registry.register('jig.table', { pure: true, foldable: true,
    infer(i, a) { if (Object.keys(i).join() !== 'x') throw new Error('jig.table reads x'); return { value: a.unit === 'length' ? T.length : T.angle }; },
    evaluate({ x }, { x0, period, values, wrap }) {
      const n = values.length, u = ((x - x0) / period * n % n + n) % n, k = Math.floor(u), t = u - k;
      const at = (m) => values[((m % n) + n) % n] + (m >= n ? wrap : m < 0 ? -wrap : 0);
      // cubic Hermite with fourth-order tangents (per sample step) from five neighbours
      const slope = (m) => (-at(m + 2) + 8 * at(m + 1) - 8 * at(m - 1) + at(m - 2)) / 12;
      const p1 = at(k), p2 = at(k + 1), m1 = slope(k), m2 = slope(k + 1), t2 = t * t, t3 = t2 * t;
      return { value: (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2 };
    } });
  // a coupling between an angle and a length (a rack on a pinion): factor · value + offset, in the given unit
  registry.register('jig.linear', { pure: true, foldable: true,
    infer(i, a) { if (Object.keys(i).join() !== 'value') throw new Error('jig.linear reads value'); return { value: a.unit === 'length' ? T.length : T.angle }; },
    evaluate({ value }, { factor, offset }) { return { value: factor * value + offset }; } });
  return registry;
}

// ---------------------------------------------------------------- the compiler
export function toKine(S, info = {}, o = {}) {
  const notes = [], r = { name: info.name || 'assembly' };
  if (!info.assembled) throw new Error('the assembly does not assemble');
  const input = o.input || [...S.drives.keys()][0];
  if (!input || !S.drives.has(input)) throw new Error('compile needs a driven joint as the input');
  if (S.mobility && S.mobility.left > 0) throw new Error(`${S.mobility.left} free motion(s) left after the drives: not a mechanism`);
  const inJ = S.jointById.get(input), inType = inJ.kind === 'slider' ? 'length' : 'angle';
  const bodies = S.bodies, ground = bodies.findIndex((b) => b.ground);
  const world = (P) => S.world(P);
  const vnow = (jn) => S.value(jn);   // the reference pose: wherever the solver is now
  // ---- the tree and the loops
  const edges = S.treeEdges, byChild = new Map(edges.map((e) => [e.child, e]));
  const pathUp = (bi) => { const out = []; while (byChild.has(bi)) { const e = byChild.get(bi); out.push(e); bi = e.parent; } return out; };
  const loopJoints = S.joints.filter((jn) => !S.tree.has(jn.id));
  const loops = loopJoints.map((lj) => {
    const pa = pathUp(lj.A.bi), pb = pathUp(lj.B.bi);
    const ida = new Set(pa.map((e) => e.id)), idb = new Set(pb.map((e) => e.id));
    const tree = [...pa.filter((e) => !idb.has(e.id)), ...pb.filter((e) => !ida.has(e.id))].map((e) => S.jointById.get(e.id));
    const bodySet = new Set([lj.A.bi, lj.B.bi]); for (const jn of tree) { bodySet.add(jn.A.bi); bodySet.add(jn.B.bi); }
    return { closing: lj, tree, joints: [...tree, lj], bodies: [...bodySet] };
  });
  // ---- value expressions for tree joints, in kine's expression language
  const ref = new Map([[input, 'theta']]);             // joint id → kine ref of its value
  const lines = [];                                    // builder lines
  const lit = (v, t) => `e.literal(${num(v)}, T.${t})`;
  const sc = (x, k) => (k === 1 ? x : `e.scale(${x}, ${num(k)})`);
  const plus = (x, k, t) => (Math.abs(k) < 1e-15 ? x : `e.add(${x}, ${lit(k, t)})`);
  const tOf = (jn) => (jn.kind === 'slider' ? 'length' : 'angle');
  const fixed = (jn) => jn.kind === 'rigid' || jn.kind === 'snap';
  for (const e of S.treeEdges) { const k = S.jointById.get(e.id).kind; if (!['revolute', 'slider', 'rigid', 'snap'].includes(k)) throw new Error(`joint ${e.id}: a ${k} joint in the tree has no kine skeleton joint here (revolute, slider and rigid do)`); }
  let progress = true;
  const pending = () => edges.filter((e) => !ref.has(e.id) && !fixed(S.jointById.get(e.id)));
  while (progress) {
    progress = false;
    // couplings: value(b) = ratio · value(a) + offset
    for (const c of S.couples) if (ref.has(c.a) && !ref.has(c.b)) {
      lines.push(`  // coupling ${c.id}: ${c.b} = ${num(c.ratio)} · ${c.a} + ${num(c.offset)}`);
      const ta = tOf(S.jointById.get(c.a)), tb = tOf(S.jointById.get(c.b));
      if (ta === tb) lines.push(`  .derive('${ident(c.b)}', e => ${plus(sc(`e.read('${ref.get(c.a)}')`, c.ratio), c.offset, tb)})`);
      else lines.push(`  .node('${ident(c.b)}', 'jig.linear', n => n.read('value', '${ref.get(c.a)}').attrs({ factor: ${num(c.ratio)}, offset: ${num(c.offset)}, unit: '${tb}' }))`);
      ref.set(c.b, `${ident(c.b)}.value`); progress = true;
    }
    for (const [li, L] of loops.entries()) {
      if (L.done) continue;
      const known = L.tree.filter((jn) => ref.has(jn.id));
      const need = L.tree.filter((jn) => !ref.has(jn.id) && !fixed(jn));
      if (!need.length) { L.done = true; continue; }
      const crankJ = L.joints.find((jn) => ref.has(jn.id) && (jn.A.bi === ground || jn.B.bi === ground));
      if (!crankJ || known.length !== 1) continue;
      const name = `loop${li + 1}`;
      const emitted = (o.closedForm !== false && emitLoop(L, crankJ, name)) || emitTable(L, crankJ, name);
      lines.push(...emitted.lines);
      for (const [id, expr] of emitted.values) { lines.push(`  .derive('${ident(id)}', e => ${expr})`); ref.set(id, `${ident(id)}.value`); }
      notes.push(emitted.note); L.done = true; progress = true;
    }
  }
  const missing = pending();
  if (missing.length) throw new Error(`no value for ${missing.map((e) => e.id).join(', ')}: a loop the compiler cannot reduce (shared between loops?)`);

  // planar loops in closed form; null when the loop is not one of the two shapes
  function emitLoop(L, crankJ, name) {
    const z = unit(world(crankJ.A).Z);
    const rev = L.joints.filter((jn) => jn.kind === 'revolute'), pri = L.joints.filter((jn) => jn.kind === 'slider');
    if (L.joints.length !== 4 || rev.some((jn) => Math.abs(Math.abs(dot(unit(world(jn.A).Z), z)) - 1) > 1e-9)) return null;
    const O = world(crankJ.A).P, proj = (p) => { const d = sub(p, O); return sub(d, mul(z, dot(d, z))); };
    const side = (jn, bi) => (jn.A.bi === bi ? 'A' : 'B');
    const crank = crankJ.A.bi === ground ? crankJ.B.bi : crankJ.A.bi;
    const at = (jn) => world(jn.A).P;
    const s = (jn) => Math.sign(dot(world(jn.A).Z, z));
    // abs angle of the crank in the loop's plane = σ·s·value + c, with σ = +1 when the crank is the joint's b side
    const sigC = crankJ.B.bi === crank ? 1 : -1;
    const others = L.joints.filter((jn) => jn !== crankJ);
    const touches = (jn, bi) => jn.A.bi === bi || jn.B.bi === bi;
    const Aj = others.find((jn) => touches(jn, crank));                    // crank → coupler
    const coupler = Aj.A.bi === crank ? Aj.B.bi : Aj.A.bi;
    const G2 = others.find((jn) => jn !== Aj && touches(jn, ground));       // the other ground joint
    if (!G2) return null;
    const rocker = G2.A.bi === ground ? G2.B.bi : G2.A.bi;
    const Bj = others.find((jn) => jn !== Aj && jn !== G2);                 // coupler → rocker
    void side;
    if (rev.length === 4 && Bj && touches(Bj, coupler) && touches(Bj, rocker)) {
      // four-bar: kine solve.fourBar in the frame x̂ = O→D
      const Dp = proj(world(G2.A).P), d = len(Dp), x = unit(Dp), y = cross(z, x);
      const p2 = (p) => { const q = proj(p); return [dot(q, x), dot(q, y)]; };
      const A = p2(at(Aj)), B = p2(at(Bj)), D2 = [d, 0];
      const a = Math.hypot(...A), b = Math.hypot(B[0] - A[0], B[1] - A[1]), c = Math.hypot(B[0] - d, B[1]);
      const u = [D2[0] - A[0], D2[1] - A[1]], branch = Math.sign(u[0] * (B[1] - A[1]) - u[1] * (B[0] - A[0])) || 1;
      const absNow = new Map([[ground, 0], [crank, Math.atan2(A[1], A[0])], [coupler, Math.atan2(B[1] - A[1], B[0] - A[0])], [rocker, Math.atan2(B[1], B[0] - d)]]);
      const c0 = absNow.get(crank) - sigC * s(crankJ) * vnow(crankJ);
      const absRef = new Map([[ground, null], [crank, `${name}Crank.value`], [coupler, `${name}.coupler`], [rocker, `${name}.rocker`]]);
      const out = [`  // ${name}: a planar four-bar (${L.joints.map((jn) => jn.id).join(', ')}), lengths read off the ports`,
        `  .derive('${name}Crank', e => ${plus(sc(`e.read('${ref.get(crankJ.id)}')`, sigC * s(crankJ)), wrap(c0), 'angle')})`,
        `  .node('${name}', 'solve.fourBar', n => n.read('crank', '${name}Crank.value').attrs({ a: ${num(a)}, b: ${num(b)}, c: ${num(c)}, d: ${num(d)}, branch: ${branch} }))`];
      return { lines: out, values: relValues(L, crankJ, absNow, absRef, s), note: `${name}: four-bar a ${a.toFixed(4)}, b ${b.toFixed(4)}, c ${c.toFixed(4)}, d ${d.toFixed(4)}, branch ${branch}` };
    }
    if (rev.length === 3 && pri.length === 1 && pri[0] === G2 && Bj && touches(Bj, coupler) && touches(Bj, rocker)) {
      // slider-crank: jig.sliderCrank in the frame x̂ = the guide's direction
      const g = unit(world(G2.A).Z), x = unit(sub(g, mul(z, dot(g, z)))), y = cross(z, x);
      const p2 = (p) => { const q = proj(p); return [dot(q, x), dot(q, y)]; };
      const A = p2(at(Aj)), B = p2(at(Bj));
      const a = Math.hypot(...A), Lr = Math.hypot(B[0] - A[0], B[1] - A[1]), e = B[1], branch = Math.sign(B[0] - A[0]) || 1;
      const absNow = new Map([[ground, 0], [crank, Math.atan2(A[1], A[0])], [coupler, Math.atan2(B[1] - A[1], B[0] - A[0])], [rocker, 0]]);
      const c0 = absNow.get(crank) - sigC * s(crankJ) * vnow(crankJ);
      const absRef = new Map([[ground, null], [crank, `${name}Crank.value`], [coupler, `${name}.rod`], [rocker, null]]);
      const out = [`  // ${name}: a planar slider-crank (${L.joints.map((jn) => jn.id).join(', ')})`,
        `  .derive('${name}Crank', e => ${plus(sc(`e.read('${ref.get(crankJ.id)}')`, sigC * s(crankJ)), wrap(c0), 'angle')})`,
        `  .node('${name}', 'jig.sliderCrank', n => n.read('crank', '${name}Crank.value').attrs({ a: ${num(a)}, L: ${num(Lr)}, e: ${num(e)}, branch: ${branch} }))`];
      const values = relValues(L, crankJ, absNow, absRef, s);
      if (S.tree.has(G2.id)) {   // the guide's own value, if it is a tree joint: slider position along x̂
        const sigma = G2.B.bi === rocker ? 1 : -1, k = sigma * dot(x, world(G2.A).Z), k0 = vnow(G2) - k * B[0];
        values.push([G2.id, plus(sc(`e.read('${name}.x')`, k), k0, 'length')]);
      }
      return { lines: out, values, note: `${name}: slider-crank a ${a.toFixed(4)}, L ${Lr.toFixed(4)}, e ${e.toFixed(4)}, branch ${branch}` };
    }
    return null;
  }
  // revolute values from absolute angles: v = s·(abs(b side) − abs(a side)) + k
  function relValues(L, crankJ, absNow, absRef, s) {
    const out = [];
    for (const jn of L.tree) {
      if (jn === crankJ || ref.has(jn.id) || jn.kind !== 'revolute') continue;
      const k = wrap(vnow(jn) - s(jn) * (absNow.get(jn.B.bi) - absNow.get(jn.A.bi)));
      const rb = absRef.get(jn.B.bi), ra = absRef.get(jn.A.bi);
      const diff = rb && ra ? `e.sub(e.read('${rb}'), e.read('${ra}'))` : rb ? `e.read('${rb}')` : ra ? `e.scale(e.read('${ra}'), -1)` : null;
      out.push([jn.id, diff ? plus(sc(diff, s(jn)), k, 'angle') : lit(vnow(jn), 'angle')]);
    }
    return out;
  }
  // any other loop: solve it over one turn of the input and bake each needed joint into a table
  function emitTable(L, crankJ, name) {
    const need = L.tree.filter((jn) => !ref.has(jn.id) && !fixed(jn));
    const n = o.samples || 720, period = inType === 'angle' ? 2 * Math.PI : (o.range || 10), x0 = inType === 'angle' ? 0 : 0;
    const home = S.pose, homeDrive = new Map(S.drives), tables = need.map(() => []);
    for (let i = 0; i < n; i++) {
      S.driveTo({ [input]: x0 + period * i / n });
      need.forEach((jn, k) => tables[k].push(vnow(jn)));
    }
    S.pose = home; S.drives = homeDrive; S.solve();
    const out = [`  // ${name}: a loop with no closed form here (${L.joints.map((jn) => jn.id).join(', ')}): baked at ${n} samples`];
    const values = need.map((jn, k) => {
      const t = tables[k], unwrapped = [t[0]];
      for (let i = 1; i < n; i++) unwrapped.push(unwrapped[i - 1] + (jn.kind === 'slider' ? t[i] - t[i - 1] : wrap(t[i] - t[i - 1])));
      const jump = jn.kind === 'slider' ? 0 : unwrapped[0] + wrap(t[0] - unwrapped[n - 1]) - unwrapped[n - 1];
      out.push(`  .node('${name}_${ident(jn.id)}', 'jig.table', n => n.read('x', '${ref.get(input) === 'theta' ? 'theta' : ref.get(input)}').attrs({ x0: ${num(x0)}, period: ${num(period)}, unit: '${tOf(jn)}', values: ${full(unwrapped)}, wrap: ${num(unwrapped[n - 1] - unwrapped[0] + (jn.kind === 'slider' ? unwrapped[1] - unwrapped[0] : wrap(unwrapped[0] - unwrapped[n - 1])))} }))`);
      void jump;
      return [jn.id, `e.read('${name}_${ident(jn.id)}.value')`];
    });
    return { lines: out, values, note: `${name}: table of ${need.length} joint(s) at ${n} samples` };
  }

  // ---- the skeleton: tree joints at their parent-side ports, bodies at the inverse of their own ports
  const sk = [], observe = [];
  const portFrame = (P) => ({ o: P.o, R: cols(P.x, P.y, P.z) });
  const jid = (id) => `j_${ident(id)}`, bid = (bi) => `b_${ident(bodies[bi].id)}`;
  const parentOf = (bi) => (bi === ground ? null : bid(bi));
  for (const e of edges) {
    const jn = S.jointById.get(e.id), Pp = e.childIsB ? jn.A : jn.B, Pc = e.childIsB ? jn.B : jn.A;
    const pf = portFrame(Pp), cf = portFrame(Pc), sign = e.childIsB ? 1 : -1;
    const par = parentOf(e.parent);
    const motion = jn.kind === 'revolute' ? `.revolute([0, 0, 1]).drive('${ref.get(jn.id)}')` : jn.kind === 'slider' ? `.prismatic([0, 0, 1]).drive('${ref.get(jn.id)}')` : '.fixed()';
    const drive = sign < 0 && !fixed(jn) ? (() => { const id = `${ident(jn.id)}_inv`; lines.push(`  .derive('${id}', e => e.scale(e.read('${ref.get(jn.id)}'), -1))`); return motion.replace(`'${ref.get(jn.id)}'`, `'${id}.value'`); })() : motion;
    // a joint's zero shifts its value; kine measures from the rest frame, so it is folded into the drive
    sk.push(`    .joint('${jid(jn.id)}', j => j${par ? `.parent('${par}')` : ''}.at(${vec(pf.o)}).orient(${vec(quat(pf.R))})${drive})`);
    const Rc = tr(cf.R), oc = mul(mv(Rc, cf.o), -1);
    sk.push(`    .joint('${bid(e.child)}', j => j.parent('${jid(jn.id)}').at(${vec(oc)}).orient(${vec(quat(Rc))}).fixed())`);
    observe.push(`asm/${bid(e.child)}.world`);
  }
  for (const [bi, b] of bodies.entries()) {
    if (bi === ground) continue;
    for (const [name, pm] of Object.entries(b.ports || {})) {
      if (!pm) continue;
      const p = frameOfMatrix(pm);
      sk.push(`    .joint('p_${ident(b.id)}_${ident(name)}', j => j.parent('${bid(bi)}').at(${vec(p.o)}).orient(${vec(quat(cols(p.x, p.y, p.z)))}).fixed())`);
      observe.push(`asm/p_${ident(b.id)}_${ident(name)}.world`);
    }
  }
  const source = [`// compiled from the assembly '${r.name}' (jig assemblies v0.1, M7); input: joint ${input}`,
    `return kine('${ident(r.name)}', b => b`,
    `  .input('theta', p => p.${inType}().initial(${num(S.drives.get(input))}))`,
    ...lines,
    `  .skeleton('asm', s => s`, ...sk, '  )', ')'].join('\n');
  return { source, observe, notes, input, bodies: bodies.map((b, i) => ({ id: b.id, ground: i === ground, frame: i === ground ? null : `asm/${bid(i)}.world` })) };
}

// a self-contained ES module: the program (a function of kine's { kine, E, T }), the two ops it may use, the
// frames to observe, and how to run it
export function kineModule(compiled) {
  return `// ${compiled.source.split('\n')[0].replace(/^\/\/ /, '')}
// Usage: import * as K from 'kine/core.mjs'; import program, { jigOps, observe } from './this-file.mjs';
//        const prog = K.compile(program(K).build(), { registry: jigOps(K.standardRegistry(), K.T), observe });
//        const frame = prog.instantiate().set('theta', angle).evaluate(); frame.get(observe[0]).p
export default function program({ kine, E, T }) {
${compiled.source.split('\n').slice(1).map((l) => '  ' + l).join('\n')}
}
export const jigOps = ${jigOps.toString()};
export const observe = ${JSON.stringify(compiled.observe, null, 1)};
// ${compiled.notes.join('\n// ')}
`;
}
