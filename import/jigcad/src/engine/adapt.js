// Adapters from core values (Quantity, Point/Dir/Frame/Axis/Transform, Deferred datums, ProfileSets, Regions)
// to the kernel's plain forms: mm/rad numbers, [x, y, z] arrays, { origin, x, y, z } frames, 4×4 column-major arrays.
import * as K from './kernel.js';
import { coerce, isQuantity } from './units.js';

const V = K.V;
export const arr3 = p => p == null ? null : Array.isArray(p) ? [+p[0] || 0, +p[1] || 0, +(p[2] ?? 0) || 0]
  : p.toArray ? p.toArray().slice(0, 3) : [num(p.x), num(p.y), num(p.z ?? 0)];
const num = v => typeof v === 'number' ? v : v?.value ?? Number(v ?? 0);

// Dimensioned values in slots: numbers coerce as mm / degrees; strings are expressions over params.
export function makeCoercers(scope, printerCtx, fit) {
  const resolveQ = q => (q?.isSymbolic || q?.isLazy) && q.resolve ? q.resolve({ ...printerCtx, fit }) : q;
  const len = (x, ctx) => {
    if (x == null) return null;
    if (typeof x === 'number') return x;
    if (typeof x === 'function') return len(x(ctx ?? { p: scope, ...printerCtx }), ctx);
    if (isQuantity(x)) return resolveQ(x).value;
    if (x?.resolveSize) return x.resolveSize({ fit, scope, len: y => len(y) });
    const q = coerce(x, 'length', scope);
    return isQuantity(q) ? resolveQ(q).value : num(q);
  };
  const ang = x => {
    if (x == null) return null;
    if (typeof x === 'number') return x * Math.PI / 180;
    if (isQuantity(x)) return x.value;
    const q = coerce(x, 'angle', scope);
    return isQuantity(q) ? q.value : num(q) * Math.PI / 180;
  };
  const number = x => {
    if (x == null) return null;
    if (typeof x === 'number') return x;
    if (isQuantity(x)) return resolveQ(x).value;
    const q = coerce(x, 'any', scope);
    return isQuantity(q) ? q.value : num(q);
  };
  len.scope = scope;   // regions read params through it (j.region.text(j.ref('name')))
  return { len, ang, number };
}

// Text for labels: plain strings are the text itself; j.ref/j.expr values, literals and lambdas resolve over
// params (a number or quantity prints in its own words).
export function textValue(x, scope) {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (x.kind === 'literal') return String(x.value);
  if (typeof x === 'function') return textValue(x({ p: scope ?? {} }), scope);
  if (x.kind === 'expr' && typeof x.evaluate === 'function') {
    if (!scope) return x.text;
    const name = x.text.trim();
    // a bare name reads the param directly (a text param's value is text, not an expression)
    const v = /^[A-Za-z_][\w.]*$/.test(name) && name in scope ? scope[name] : x.evaluate(scope);
    return typeof v === 'string' ? v : v?.kind === 'literal' ? String(v.value) : isQuantity(v) ? v.toString() : typeof v === 'number' ? String(+v.toFixed(6)) : String(v);
  }
  if (isQuantity(x)) return x.toString();
  return String(x);
}

// Frames: core Frame ({ origin, x, y?, z } with Point/Dir members), plane data, or a plain frame.
export function frameOf(f) {
  if (!f) return null;
  if (f.toPlaneData) { const d = f.toPlaneData(); return orthoFrame(d.origin, d.x, d.normal, d.y); }
  if (Array.isArray(f.origin) && Array.isArray(f.z)) return orthoFrame(f.origin, f.x, f.z, f.y);
  if (f.origin && (f.z || f.normal)) return orthoFrame(arr3(f.origin), f.x ? arr3(f.x) : null, arr3(f.z ?? f.normal), f.y ? arr3(f.y) : null);
  return null;
}
export function orthoFrame(origin, x, z, y) {
  z = V.unit(z);
  if (!x || Math.abs(V.dot(V.unit(x), z)) > 1 - 1e-9) x = Math.abs(z[2]) > 0.999 ? [1, 0, 0] : V.unit(V.cross([0, 0, 1], z));
  x = V.unit(V.sub(x, V.mul(z, V.dot(x, z))));
  y = V.cross(z, x);
  return { origin: arr3(origin), x, y, z };
}
// The default sketch frame on a planar face: origin = projection of the world origin, x by the rule in KERNEL notes.
export function frameOnFace(center, normal) {
  const z = V.unit(normal);
  const x = Math.abs(z[2]) > 0.999 ? [1, 0, 0] : V.unit(V.cross([0, 0, 1], z));
  const o = V.mul(z, V.dot(center, z));
  return { origin: o, x, y: V.cross(z, x), z };
}
export function axisOf(a) {
  if (!a) return null;
  if (a.dir || a.direction) return { origin: arr3(a.origin ?? [0, 0, 0]), dir: V.unit(arr3(a.dir ?? a.direction)) };
  if (Array.isArray(a)) return { origin: [0, 0, 0], dir: V.unit(a) };
  if (a.z) return { origin: arr3(a.origin ?? [0, 0, 0]), dir: V.unit(arr3(a.z)) };
  return null;
}
export const matOf = t => t == null ? K.IDENTITY.slice() : Array.isArray(t) && t.length === 16 ? t.slice()
  : t.m ? Array.from(t.m) : t.toArray && t.toArray().length === 16 ? t.toArray() : t.matrix ? Array.from(typeof t.matrix === 'function' ? t.matrix() : t.matrix) : K.IDENTITY.slice();
export const isDeferred = d => d && typeof d === 'object' && d.kind === 'deferred';
export const isTransform = t => t && (t.m instanceof Float64Array || (t.constructor?.name === 'Transform'));

// Profiles from core sketches/regions → kernel Profile { frame, regions: [{ loops }] }.
// solvedProfiles: [{ segments: [[seg…]…], loops, area }] in sketch-plane coordinates.
export function profileFromSegments(frame, solvedProfiles, prefix = null) {
  const pre = s => prefix && s.src != null && !String(s.src).startsWith(prefix + '.') ? { ...s, src: `${prefix}.${s.src}` } : s;
  return { frame, regions: solvedProfiles.map(p => ({ loops: (p.segments ?? []).map(loop => loop.map(fixSeg).map(pre)), area: p.areaValue ?? p.area, id: p.id })) };
}
function fixSeg(s) {
  if (s.kind === 'arc' && s.a0 == null && s.a && s.b) {
    const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]), a1 = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]);
    return { ...s, a0, a1 };
  }
  return s;
}
