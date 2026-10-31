import { prog, compile, K } from './h.mjs';
const I = await import('/home/claude/jigcad/src/engine/inspect.js');
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const src = (r, extra = '') => `const g = j.lib.gear.spur({ module: mm(1), teeth: 24, width: mm(4) }).hole([[0, 0]], j.hole.simple(mm(5.3)), { id: 'bore' })
    const b = j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
      .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
      ${r ? `.fillet(j.feat('peg').edges().where(e => e.concave), mm(${r}), { id: 'root' })` : ''}
    return j.assembly('a').add('b', b, { ground: true }).add('g', g, { at: j.tx.move(0, 0, 3.2) }).interference(${extra})`;
for (const [r, extra] of [[0, ''], [1, ''], [1, '{ exact: true }']]) {
  const t0 = performance.now();
  const p = await compile(src(r, extra));
  console.log(`r=${r} ${extra}`, (performance.now() - t0).toFixed(0), 'ms', p.decisions.filter(d => d.kind === 'gap').map(d => d.chose + ' · ' + d.reason), p.diagnostics.map(d => d.level + ' ' + d.kind + ': ' + d.message + ' · fix: ' + d.fix), p.trace.filter(t => t.pass === 'interference').map(t => t.note + ' ' + t.ms.toFixed(0) + ' ms'));
}
// vertex-only distance, by hand
function pointTri(p, t) { const V = K.V;
  const ab = V.sub(t.b, t.a), ac = V.sub(t.c, t.a), ap = V.sub(p, t.a);
  const d1 = V.dot(ab, ap), d2 = V.dot(ac, ap); if (d1 <= 0 && d2 <= 0) return V.len(ap);
  const bp = V.sub(p, t.b), d3 = V.dot(ab, bp), d4 = V.dot(ac, bp); if (d3 >= 0 && d4 <= d3) return V.len(bp);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return V.len(V.sub(p, V.add(t.a, V.mul(ab, d1 / (d1 - d3)))));
  const cp = V.sub(p, t.c), d5 = V.dot(ab, cp), d6 = V.dot(ac, cp); if (d6 >= 0 && d5 <= d6) return V.len(cp);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return V.len(V.sub(p, V.add(t.a, V.mul(ac, d2 / (d2 - d6)))));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return V.len(V.sub(p, V.add(t.b, V.mul(V.sub(t.c, t.b), w)))); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return V.len(V.sub(p, V.add(t.a, V.add(V.mul(ab, v), V.mul(ac, w)))));
}
const pr = await prog(src(1));
const comp = pr.kernelBodies();
console.log(comp.map(c => c.part + '/' + c.body.id + ' T=' + Array.from(c.transform).slice(12, 15)));
const [A, B] = comp.map(c => I.meshTris(M.meshBody(c.body), c.transform));
console.log('triangles', A.length, B.length);
const near = (t, box) => [t.a, t.b, t.c].some(p => p.every((x, i) => x >= box[0][i] && x <= box[1][i]));
const box = [[-4, -4, 2.5], [4, 4, 5]];
const As = A.filter(t => near(t, box)), Bs = B.filter(t => near(t, box));
let best = Infinity, arg = null;
for (const [P, T, lab] of [[As, B, 'peg vertex → gear tri'], [Bs, A, 'gear vertex → peg tri']]) for (const t of P) for (const p of [t.a, t.b, t.c]) for (const s of T) { const d = pointTri(p, s); if (d < best) { best = d; arg = [lab, p.map(x => +x.toFixed(4))]; } }
console.log('vertex-only min distance', best.toFixed(5), arg);
console.log('meshGap now', I.meshGap(A, B, 1.8));
// fillet torus at z = 3.2
const zr = z => 3.5 - Math.sqrt(1 - (z - 4) ** 2);
console.log('torus radius at z=3.2', zr(3.2), 'bore radius 2.65', 'top of overlap z', 4 - Math.sqrt(1 - 0.85 ** 2));
// torus vertex rows
const rows = new Map(); for (const t of A) for (const p of [t.a, t.b, t.c]) { const rr = Math.hypot(p[0], p[1]); if (p[2] > 3 && p[2] < 4.01 && rr < 3.6 && rr > 2.49) rows.set(p[2].toFixed(4), rr.toFixed(4)); }
console.log('peg mesh rows (z: r)', [...rows].sort().map(x => x.join(':')).join('  '));
