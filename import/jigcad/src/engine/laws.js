// Laws (README §8): one suite, one runner. A law needs `justifies`. Kernel laws use real compiles.
import { compile } from './program.js';
import { part } from './part.js';
import { region } from './region.js';
import { rng } from './fit.js';
import * as csg from './csg.js';
import { sel } from './select.js';

export function law(name, gen, prop, o = {}) {
  if (!o.justifies) throw new Error(`law '${name}' has no 'justifies': state what it pays for, or make it a plain assertion`);
  return Object.freeze({ name, gen, prop, tier: o.tier ?? 'invariant', justifies: o.justifies, source: o.source ?? null, tolerance: o.tolerance ?? 1e-6 });
}
const rect = r => ({ w: 5 + r() * 60, d: 5 + r() * 40 });
export const gen = {
  rect: () => r => rect(r),
  length: (lo = 1, hi = 50) => r => lo + r() * (hi - lo),
  box: () => r => ({ ...rect(r), h: 2 + r() * 30 }),
};
const suite = [
  law('extrude.volume', r => ({ ...rect(r), h: 1 + r() * 40, rr: r() < 0.5 ? 0 : 1 + r() * 3 }), ({ w, d, h, rr }) => {
    const P = compile(part('law').extrude(region.rect(w, d, { r: rr || undefined }), h, { id: 'body' }), { mesh: false });
    const area = w * d - (rr ? (4 - Math.PI) * rr * rr : 0);
    return { ok: Math.abs(P.data.metrics.volume.value - area * h) <= 1e-6 * area * h, got: P.data.metrics.volume.value, want: area * h };
  }, { tier: 'oracle', justifies: 'kernel test; closed-form mass(h) for staging', source: 'Cavalieri' }),
  law('revolve.volume', r => ({ r0: 5 + r() * 30, w: 1 + r() * 8, h: 1 + r() * 20, deg: [90, 180, 360][Math.floor(r() * 3)] }), ({ r0, w, h, deg }) => {
    const sk = region.rect(w, h, { at: [r0 + w / 2, 0] }).on({ origin: [0, 0, 0], x: [1, 0, 0], z: [0, -1, 0] });
    const P = compile(part('law').revolve(sk, [0, 0, 1], deg, { id: 'rev' }), { mesh: false });
    const want = (deg * Math.PI / 180) * (r0 + w / 2) * w * h;
    return { ok: Math.abs(P.data.metrics.volume.value - want) <= 1e-6 * want, got: P.data.metrics.volume.value, want };
  }, { tier: 'oracle', justifies: 'kernel test of revolve', source: 'Pappus–Guldinus' }),
  law('brep.eulerPoincare', r => ({ ...rect(r), h: 5 + r() * 20, holes: Math.floor(r() * 3), fil: r() < 0.5 }), ({ w, d, h, holes, fil }) => {
    let p = part('law').extrude(region.rect(w + 20, d + 20), h, { id: 'body' });
    for (let i = 0; i < holes; i++) p = p.cut(region.circle(1.5, { at: [(i - (holes - 1) / 2) * 5, 0] }), { through: 'all' }, { id: `h${i}` });
    const P = compile(p, { mesh: false });
    const t = P.data.bodies[0].topology;
    return { ok: t.residual === 0 && t.G === holes, got: t };
  }, { justifies: 'catches an invalid solid after every boolean', source: 'Mäntylä 1988' }),
  law('compile.deterministic', r => ({ ...rect(r), h: 2 + r() * 10 }), ({ w, d, h }) => {
    const m = part('law').extrude(region.rect(w, d), h, { id: 'body' }).fillet(sel.edges('|Z'), 0.5, { id: 'soft' });
    const a = compile(m, { mesh: false }).data.hash, b = compile(m, { mesh: false }).data.hash;
    return { ok: a === b, got: [a, b] };
  }, { justifies: 'caching; reproducible search and science' }),
  law('shape.boolean', r => ({ a: 5 + r() * 20, b: 5 + r() * 20, off: r() * 10 }), ({ a, b, off }) => {
    const A = csg.box(a, a, a), B = csg.sphere(b / 2).moved([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, off, off, off, 1]);
    const vu = A.union(B).volume().value, vi = A.intersect(B).volume().value, va = A.volume().value, vb = B.volume().value;
    return { ok: Math.abs(vu - (va + vb - vi)) <= 1e-5 * (va + vb), got: vu, want: va + vb - vi };
  }, { tier: 'structural', justifies: 'n-ary boolean rewrite; inclusion–exclusion as a test oracle', source: 'Requicha 1980' }),
];
export const laws = {
  suite,
  for: model => suite,
  check: (list = suite, { n = 20, seed = 1, only } = {}) => {
    const out = [];
    for (const L of (list ?? suite).filter(l => !only || only.includes(l.name))) {
      const r = rng(seed); let ok = true, counter = null, ran = 0;
      for (let i = 0; i < n; i++) {
        const x = L.gen(r); ran++;
        let res; try { res = L.prop(x); } catch (e) { res = { ok: false, error: e.message }; }
        if (!res.ok) { ok = false; counter = { input: x, ...res }; break; }
      }
      out.push({ law: L.name, tier: L.tier, ok, n: ran, counterexample: counter, justifies: L.justifies, source: L.source });
    }
    return out;
  },
};
export function structure(sort, kind) { return suite.filter(l => l.tier === 'structural'); }
