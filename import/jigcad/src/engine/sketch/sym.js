// sym.js · constraint equations as data (design doc JIG-001, D6 / Phase 4b).
// An equation's residual is an expression DAG over the sketch's parameter vector x. From one expression we derive
//   · a JS closure (codegen, same operation order as the hand-written closures it replaced) for the JS solver, and
//   · a linear tape for jig-compute, which evaluates residuals and exact reverse-mode Jacobians in Rust.
// Nodes are immutable: { op, a, b, v }. Numbers are lifted to constants. Helpers mirror geom2d.js.

export const OP = { c: 0, x: 1, add: 2, sub: 3, mul: 4, div: 5, neg: 6, sqrt: 7, sin: 8, cos: 9, atan2: 10, hypot: 11, nz: 12, wrapPi: 13, sweep: 14, sweepCCW: 15 };

class Node { constructor(op, a = null, b = null, v = 0) { this.op = op; this.a = a; this.b = b; this.v = v; } }
export const isNode = n => n instanceof Node;
const lift = v => (v instanceof Node ? v : new Node('c', null, null, +v));
export const K = v => new Node('c', null, null, +v);
export const X = i => new Node('x', null, null, i);
const bin = op => (a, b) => new Node(op, lift(a), lift(b));
const un = op => a => new Node(op, lift(a));
export const add = bin('add'), sub = bin('sub'), mul = bin('mul'), div = bin('div'), atan2 = bin('atan2'), hypot = bin('hypot');
export const neg = un('neg'), sqrt = un('sqrt'), sin = un('sin'), cos = un('cos'), wrapPi = un('wrapPi');
/** `x || 1e-300` (0 and NaN become 1e-300): the guard the closures used before dividing by a length */
export const nz = un('nz');
/** constraints.js sweep(a0, a1): ((a1 − a0) mod 2π), 2π when ≈ 0 */
export const sweep = bin('sweep');
/** geom2d.js sweepCCW(a0, a1): wrap2Pi(a1 − a0), 2π when ≈ 0 */
export const sweepCCW = bin('sweepCCW');

// 2D helpers over [Node, Node] pairs (geom2d.js shapes)
export const vsub = (p, q) => [sub(p[0], q[0]), sub(p[1], q[1])];
export const vdot = (p, q) => add(mul(p[0], q[0]), mul(p[1], q[1]));
export const vcross = (p, q) => sub(mul(p[0], q[1]), mul(p[1], q[0]));
export const vlen = p => hypot(p[0], p[1]);
export const polar = (c, r, a) => [add(c[0], mul(r, cos(a))), add(c[1], mul(r, sin(a)))];
export const vmid = (p, q) => [div(add(p[0], q[0]), 2), div(add(p[1], q[1]), 2)];
/** signed distance from p to the line a → b, positive on the left (constraints.js sdist) */
export const sdist = (p, a, b) => { const d = vsub(b, a); return div(vcross(d, vsub(p, a)), nz(vlen(d))); };

// ── JS closure by codegen ─────────────────────────────────────────────────────
const TAU = 2 * Math.PI;
const RT = {
  wrapPi: a => { let x = (a + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; },
  sweep: (a0, a1) => { const s = ((a1 - a0) % TAU + TAU) % TAU; return s < 1e-12 ? TAU : s; },
  sweepCCW: (a0, a1) => { let s = (a1 - a0) % TAU; if (s < 0) s += TAU; return s < 1e-12 ? TAU : s; },
};
const INFIX = { add: '+', sub: '-', mul: '*', div: '/' };
/** compile(node) → x => number. Shared subexpressions are evaluated once. */
export function compile(root) {
  const ids = new Map(), lines = [];
  const emit = n => {
    if (ids.has(n)) return ids.get(n);
    let e;
    switch (n.op) {
      case 'c': e = Number.isFinite(n.v) ? `(${n.v})` : (Number.isNaN(n.v) ? 'NaN' : (n.v > 0 ? 'Infinity' : '-Infinity')); ids.set(n, e); return e;
      case 'x': e = `x[${n.v}]`; ids.set(n, e); return e;
      case 'add': case 'sub': case 'mul': case 'div': e = `${emit(n.a)} ${INFIX[n.op]} ${emit(n.b)}`; break;
      case 'neg': e = `-${emit(n.a)}`; break;
      case 'sqrt': case 'sin': case 'cos': e = `Math.${n.op}(${emit(n.a)})`; break;
      case 'atan2': case 'hypot': e = `Math.${n.op}(${emit(n.a)}, ${emit(n.b)})`; break;
      case 'nz': e = `(${emit(n.a)} || 1e-300)`; break;
      case 'wrapPi': e = `R.wrapPi(${emit(n.a)})`; break;
      case 'sweep': case 'sweepCCW': e = `R.${n.op}(${emit(n.a)}, ${emit(n.b)})`; break;
      default: throw new Error(`sym: unknown op ${n.op}`);
    }
    const name = `t${lines.length}`;
    lines.push(`const ${name} = ${e};`);
    ids.set(n, name);
    return name;
  };
  const out = emit(root);
  // eslint-disable-next-line no-new-func
  return new Function('R', `return function residual(x) {\n${lines.join('\n')}\nreturn ${out};\n}`)(RT);
}

// ── tape for jig-compute ──────────────────────────────────────────────────────
// One tape holds many equations. Each equation is a contiguous run of instructions, 4 f64 each:
// [op, a, b, v] where a and b are instruction indices relative to the equation's start (−1 = none) and v is the
// constant or the parameter index. An equation's value is its last instruction. Layout sent to Rust:
//   ops: Float64Array(4 · T), starts: Uint32Array(E + 1) (instruction offsets; starts[E] = T)
export function buildTape(roots) {
  const ops = [], starts = [];
  for (const root of roots) {
    const base = ops.length / 4, local = new Map();
    starts.push(base);
    const emit = n => {
      if (local.has(n)) return local.get(n);
      const a = n.a ? emit(n.a) : -1, b = n.b ? emit(n.b) : -1;
      const k = ops.length / 4 - base;
      ops.push(OP[n.op], a, b, n.op === 'c' || n.op === 'x' ? n.v : 0);
      local.set(n, k);
      return k;
    };
    emit(root);
  }
  starts.push(ops.length / 4);
  return { ops: Float64Array.from(ops), starts: Uint32Array.from(starts), count: roots.length };
}

/** Evaluate a tape equation in JS (tests: the Rust interpreter must agree with this and with compile()). */
export function evalTape(tape, e, x) {
  const s = tape.starts[e], t = tape.starts[e + 1], v = new Float64Array(t - s), o = tape.ops;
  for (let k = 0; k < t - s; k++) {
    const i = (s + k) * 4, op = o[i], A = v[o[i + 1]], B = v[o[i + 2]];
    v[k] = op === 0 ? o[i + 3] : op === 1 ? x[o[i + 3]] : op === 2 ? A + B : op === 3 ? A - B : op === 4 ? A * B : op === 5 ? A / B
      : op === 6 ? -A : op === 7 ? Math.sqrt(A) : op === 8 ? Math.sin(A) : op === 9 ? Math.cos(A) : op === 10 ? Math.atan2(A, B)
      : op === 11 ? Math.hypot(A, B) : op === 12 ? (A || 1e-300) : op === 13 ? RT.wrapPi(A) : op === 14 ? RT.sweep(A, B) : RT.sweepCCW(A, B);
  }
  return v[t - s - 1];
}
