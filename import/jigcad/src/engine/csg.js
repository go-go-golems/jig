// CSG Shape values (README §3 Shape, §4.6 primitives): j.box j.cyl j.sphere j.cone j.torus, OpenSCAD style.
// Lazy trees; build() makes a named solid. Volumes are exact (B-rep) and computed on demand.
import * as K from './kernel.js';
import * as S from './shapes.js';
import { booleanOp, namedFromRoles, tmpBody, transformNamed } from './ops.js';
import { mm } from './units.js';

const num = (x, len) => typeof x === 'number' ? x : len ? len(x) : (x?.value ?? Number(x));
export const matOf = t => t == null ? K.IDENTITY : Array.isArray(t) && t.length === 16 ? t : t.m ? Array.from(t.m) : t.toArray ? t.toArray() : t.matrix ? Array.from(t.matrix) : K.IDENTITY;

export class Shape {
  constructor(node) { this.node = node; Object.freeze(this); }
  get isShape() { return true; }
  get kind() { return 'shape'; }
  union(o) { return new Shape({ op: 'union', a: this, b: o }); }
  subtract(o) { return new Shape({ op: 'subtract', a: this, b: o }); }
  intersect(o) { return new Shape({ op: 'intersect', a: this, b: o }); }
  moved(tx) { return new Shape({ op: 'moved', a: this, m: matOf(tx) }); }
  translate(x, y, z) { return this.moved(K.matTranslate(x, y ?? 0, z ?? 0)); }
  // exact volume (mm³) as a Quantity
  volume() {
    const n = this.build();
    try { return mm(n.reduce((s, x) => s + K.volumeProps(x.shape).volume, 0)).mul(mm(1)).mul(mm(1)); }
    finally { n.forEach(x => x.shape.delete()); }
  }
  bbox() { const n = this.build(); try { return K.bboxUnion(n.map(x => K.bboxOf(x.shape))); } finally { n.forEach(x => x.shape.delete()); } }
  toString() { return csgText(this.node); }
  // → [{ shape, names, aliases }] (solids); names are relative (no feature prefix): 'top', 'box1.top', …
  build(len, counter = { n: {} }) {
    const leaves = countLeaves(this.node);
    return buildNode(this.node, len, counter, leaves === 1);
  }
}
function countLeaves(n) { return ['union', 'subtract', 'intersect'].includes(n.op) ? countLeaves(n.a.node) + countLeaves(n.b.node) : n.op === 'moved' ? countLeaves(n.a.node) : 1; }
function buildNode(n, len, counter, single) {
  switch (n.op) {
    case 'moved': return buildNode(n.a.node, len, counter, single).map(x => { const t = transformNamed(x, n.m); x.shape.delete(); return t; });
    case 'union': case 'subtract': case 'intersect': {
      const A = buildNode(n.a.node, len, counter, false), B = buildNode(n.b.node, len, counter, false);
      const op = n.op === 'union' ? 'fuse' : n.op === 'subtract' ? 'cut' : 'common';
      const out = [];
      if (op === 'fuse') {
        let acc = A[0];
        for (const t of [...A.slice(1), ...B]) { const b = tmpBody(acc); const r = booleanOp('fuse', b, [t], 'csg'); release(b); acc = r[0] ?? acc; if (r.length > 1) out.push(...r.slice(1)); }
        out.unshift(acc);
      } else for (const a of A) { const b = tmpBody(a); out.push(...booleanOp(op, b, B, 'csg')); release(b); }
      return out;
    }
    default: {
      const k = n.op; counter.n[k] = (counter.n[k] ?? 0) + 1;
      const prefix = single ? '' : `${k}${counter.n[k]}.`;
      const a = n.args.map(x => num(x, len));
      const o = n.opts ?? {};
      const made = k === 'box' ? S.box(a[0], a[1], a[2], { center: o.center })
        : k === 'cyl' ? S.cylinder(a[0], a[1], { center: o.center })
        : k === 'sphere' ? S.sphere(a[0]) : k === 'cone' ? S.cone(a[0], a[1], a[2]) : S.torus(a[0], a[1]);
      const named = namedFromRoles(made.shape, made.roles, '@');
      named.names = named.names.map(x => prefix + x.slice(2));
      if (k === 'cone' && o.center) { const t = transformNamed(named, K.matTranslate(0, 0, -a[2] / 2)); named.shape.delete(); return [t]; }
      return [named];
    }
  }
}
function release(b) { b.detach(); }
function csgText(n) {
  if (n.op === 'moved') return `${csgText(n.a.node)}.moved(…)`;
  if (['union', 'subtract', 'intersect'].includes(n.op)) return `${csgText(n.a.node)}.${n.op}(${csgText(n.b.node)})`;
  return `j.${n.op}(${n.args.map(a => typeof a === 'number' ? a : String(a)).join(', ')})`;
}
export const box = (w, d, h, opts) => new Shape({ op: 'box', args: [w, d, h], opts });
export const cyl = (r, h, opts) => new Shape({ op: 'cyl', args: [r, h], opts });
export const sphere = r => new Shape({ op: 'sphere', args: [r] });
export const cone = (r1, r2, h, opts) => new Shape({ op: 'cone', args: [r1, r2, h], opts });
export const torus = (R, r) => new Shape({ op: 'torus', args: [R, r] });
// A Shape wrapping an existing named solid (results of custom features). Owns nothing until built.
export class Concrete extends Shape {}
