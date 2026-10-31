// expr.js · expression strings with units and parameter names (README §4.2).
// 'wall * 2 + 1 mm', 'w / 2 - wall - boss_d / 2', 'min(a, b)', 'sqrt(x)', 'sin(30°)', '1/4 in + 2 mm', '1.24 g/cm^3'.
// Parse once to an AST; deps(ast) lists free names; evaluate(ast, scope) → Quantity | number, dimension-checked.
import { Quantity, DimensionError, UNIT_TABLE, toQuantity, mm, deg, rad, DEFAULT_CTX, fmtNum, describe } from './units.js';

export class ExprError extends Error {
  constructor(message, { column = null, text = '', kind = 'expr.syntax' } = {}) {
    super(column != null ? `${message} (column ${column} in '${text}')` : message);
    this.name = 'ExprError'; this.column = column; this.text = text; this.kind = kind; this.reason = message;
  }
}

const FUNCS = new Set(['min', 'max', 'abs', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'floor', 'ceil', 'round', 'clamp', 'hypot', 'pow', 'lerp']);
const CONSTS = { pi: Math.PI, π: Math.PI };
const SUPERS = '⁻⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUPER_MAP = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

function tokenize(text) {
  const toks = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    const col = i + 1;
    const num = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (num && !(/[eE]/.test(num[1]) && /[A-Za-z]/.test(text[i + num[1].length] ?? ''))) {
      toks.push({ t: 'num', v: Number(num[1]), col }); i += num[1].length; continue;
    }
    if (num) { // '2e' followed by letters: take the digits only
      const m2 = /^\d+\.?\d*/.exec(text.slice(i));
      toks.push({ t: 'num', v: Number(m2[0]), col }); i += m2[0].length; continue;
    }
    const id = /^[A-Za-z_µπ$][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*/.exec(text.slice(i));
    if (id) { toks.push({ t: 'id', v: id[0], col }); i += id[0].length; continue; }
    if (ch === '°') { toks.push({ t: 'id', v: '°', col }); i++; continue; }
    if (SUPERS.includes(ch)) {
      let j = i; while (j < n && SUPERS.includes(text[j])) j++;
      toks.push({ t: 'sup', v: Number(text.slice(i, j).split('').map(c => SUPER_MAP[c]).join('')), col }); i = j; continue;
    }
    const op = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '^': '^', '(': '(', ')': ')', ',': ',' }[ch];
    if (op) { toks.push({ t: 'op', v: op, col }); i++; continue; }
    throw new ExprError(`unexpected '${ch}'`, { column: col, text });
  }
  toks.push({ t: 'end', col: n + 1 });
  return toks;
}

const isUnitName = name => Object.prototype.hasOwnProperty.call(UNIT_TABLE, name);
const cache = new Map();

export function parseExpr(text) {
  if (typeof text !== 'string') throw new ExprError(`expected an expression string, got ${typeof text}`);
  const hit = cache.get(text);
  if (hit) return hit;
  const toks = tokenize(text);
  let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const fail = (msg, tok = peek()) => { throw new ExprError(msg, { column: tok.col, text }); };
  const expectOp = v => { const t = next(); if (t.t !== 'op' || t.v !== v) fail(`expected '${v}'`, t); return t; };

  function unitSuffix() {
    // a unit term after a number: name (^n | ²)? ((/|*) name (^n)?)*  — continues only through known unit names
    let parts = [];
    const one = () => {
      const t = next();
      if (!isUnitName(t.v)) fail(`unknown unit '${t.v}'`, t);
      let s = t.v;
      if (peek().t === 'op' && peek().v === '^' && toks[p + 1]?.t === 'num') { next(); s += '^' + next().v; }
      else if (peek().t === 'op' && peek().v === '^' && toks[p + 1]?.t === 'op' && toks[p + 1].v === '-' && toks[p + 2]?.t === 'num') { next(); next(); s += '^-' + next().v; }
      else if (peek().t === 'sup') s += '^' + next().v;
      parts.push(s);
    };
    one();
    while (peek().t === 'op' && (peek().v === '/' || peek().v === '*') && toks[p + 1]?.t === 'id' && isUnitName(toks[p + 1].v)) {
      parts.push(next().v === '/' ? '/' : '*'); one();
    }
    return parts.join('');
  }
  function primary() {
    const t = peek();
    if (t.t === 'num') {
      next();
      if (peek().t === 'id' && !(toks[p + 1]?.t === 'op' && toks[p + 1].v === '(')) {
        const unit = unitSuffix();
        return { t: 'qty', v: t.v, unit, col: t.col };
      }
      return { t: 'num', v: t.v, col: t.col };
    }
    if (t.t === 'id') {
      next();
      if (peek().t === 'op' && peek().v === '(') {
        if (!FUNCS.has(t.v)) fail(`unknown function '${t.v}'`, t);
        next();
        const args = [];
        if (!(peek().t === 'op' && peek().v === ')')) {
          args.push(add());
          while (peek().t === 'op' && peek().v === ',') { next(); args.push(add()); }
        }
        expectOp(')');
        return { t: 'call', name: t.v, args, col: t.col };
      }
      return { t: 'name', name: t.v, col: t.col };
    }
    if (t.t === 'op' && t.v === '(') { next(); const e = add(); expectOp(')'); return { t: 'paren', a: e, col: t.col }; }
    if (t.t === 'end') fail('unexpected end of expression');
    fail(`unexpected '${t.v}'`);
  }
  function power() {
    const base = primary();
    if (peek().t === 'op' && peek().v === '^') { const t = next(); return { t: 'bin', op: '^', a: base, b: unary(), col: t.col }; }
    if (peek().t === 'sup') { const t = next(); return { t: 'bin', op: '^', a: base, b: { t: 'num', v: t.v, col: t.col }, col: t.col }; }
    return base;
  }
  function unary() {
    if (peek().t === 'op' && (peek().v === '-' || peek().v === '+')) {
      const t = next(); const a = unary();
      return t.v === '-' ? { t: 'neg', a, col: t.col } : a;
    }
    return power();
  }
  const pureNumeric = n => n.t === 'num' || (n.t === 'bin' && (n.op === '*' || n.op === '/') && pureNumeric(n.a) && pureNumeric(n.b)) || (n.t === 'neg' && pureNumeric(n.a));
  function mul() {
    let a = unary();
    while (peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const t = next();
      const b = unary();
      if (b.t === 'qty' && pureNumeric(a)) {
        // '1/4 in' reads as (1/4) in: a unit after a pure numeric chain applies to the whole chain
        a = { t: 'unitapply', a: { t: 'bin', op: t.v, a, b: { t: 'num', v: b.v, col: b.col }, col: t.col }, unit: b.unit, col: b.col };
      } else a = { t: 'bin', op: t.v, a, b, col: t.col };
    }
    return a;
  }
  function add() {
    let a = mul();
    while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const t = next();
      a = { t: 'bin', op: t.v, a, b: mul(), col: t.col };
    }
    return a;
  }
  const ast = add();
  if (peek().t !== 'end') fail(`unexpected '${peek().v}'`);
  const root = Object.freeze({ t: 'root', a: ast, src: text });
  cache.set(text, root);
  return root;
}

const astOf = x => (typeof x === 'string' ? parseExpr(x) : x?.kind === 'expr' ? x.ast : x);

export function deps(x) {
  const ast = astOf(x), out = new Set();
  const walk = n => {
    if (!n) return;
    switch (n.t) {
      case 'root': case 'paren': case 'neg': case 'unitapply': walk(n.a); break;
      case 'bin': walk(n.a); walk(n.b); break;
      case 'call': n.args.forEach(walk); break;
      case 'name': if (!isUnitName(n.name) && !(n.name in CONSTS)) out.add(n.name); break;
    }
  };
  walk(ast);
  return [...out].sort();
}

function lookup(scope, name) {
  if (!scope) return undefined;
  if (typeof scope === 'function') return scope(name);
  if (scope instanceof Map) return scope.get(name);
  return Object.prototype.hasOwnProperty.call(scope, name) ? scope[name] : undefined;
}

const isQ = x => x instanceof Quantity;
function arith(op, a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    switch (op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '^': return Math.pow(a, b); }
  }
  if (op === '^') {
    const e = isQ(b) ? dimlessValue(b, '^') : b;
    return toQuantity(a).pow(e);
  }
  const A = toQuantity(a);
  switch (op) {
    case '+': return A.add(b);
    case '-': return A.sub(b);
    case '*': return typeof b === 'number' ? A.mul(b) : A.mul(toQuantity(b));
    case '/': return typeof b === 'number' ? A.div(b) : A.div(toQuantity(b));
  }
  throw new Error('bad op ' + op);
}
function dimlessValue(x, what) {
  if (typeof x === 'number') return x;
  const r = x.resolve(DEFAULT_CTX);
  if (Object.keys(r.dims).length) throw new DimensionError(`${what} needs a number, got ${describe(r)}`);
  return r.v;
}
const angleRad = (x, what) => {
  if (typeof x === 'number') return x * Math.PI / 180;   // bare numbers in an angle slot are degrees
  const r = x.resolve(DEFAULT_CTX), d = r.dims;
  if (Object.keys(d).length === 0) return r.v * Math.PI / 180;
  if (Object.keys(d).length === 1 && d.angle === 1) return r.v;
  throw new DimensionError(`${what} takes an angle, got ${describe(r)}`);
};
function minmax(args, f) {
  if (args.every(x => typeof x === 'number')) return f(...args);
  return args.map(toQuantity).reduce((a, b) => (f === Math.min ? a.min(b) : a.max(b)));
}
const unitWise = (x, f) => (typeof x === 'number' ? f(x) : (() => { const r = toQuantity(x).resolve(DEFAULT_CTX); return new Quantity(f(r.v), r.d, r.u); })());

function call(name, args, node, text) {
  const need = k => { if (args.length !== k) throw new ExprError(`${name} takes ${k} argument${k > 1 ? 's' : ''}`, { column: node.col, text }); };
  switch (name) {
    case 'min': return minmax(args, Math.min);
    case 'max': return minmax(args, Math.max);
    case 'abs': need(1); return typeof args[0] === 'number' ? Math.abs(args[0]) : args[0].abs();
    case 'sqrt': need(1); return typeof args[0] === 'number' ? Math.sqrt(args[0]) : args[0].sqrt();
    case 'pow': need(2); return arith('^', args[0], args[1]);
    case 'hypot': return sqrtOf(args.map(a => (typeof a === 'number' ? a * a : toQuantity(a).mul(toQuantity(a)))).reduce((a, b) => arith('+', a, b)));
    case 'sin': need(1); return Math.sin(angleRad(args[0], 'sin'));
    case 'cos': need(1); return Math.cos(angleRad(args[0], 'cos'));
    case 'tan': need(1); return Math.tan(angleRad(args[0], 'tan'));
    case 'asin': need(1); return rad(Math.asin(dimlessValue(args[0], 'asin'))).to('deg');
    case 'acos': need(1); return rad(Math.acos(dimlessValue(args[0], 'acos'))).to('deg');
    case 'atan': need(1); return rad(Math.atan(dimlessValue(args[0], 'atan'))).to('deg');
    case 'atan2': {
      need(2);
      const [y, x] = args;
      if (typeof y === 'number' && typeof x === 'number') return rad(Math.atan2(y, x)).to('deg');
      const Y = toQuantity(y).resolve(DEFAULT_CTX), X = toQuantity(x).resolve(DEFAULT_CTX);
      if (JSON.stringify(Y.dims) !== JSON.stringify(X.dims)) throw new DimensionError(`atan2: ${describe(Y)} vs ${describe(X)}`);
      return rad(Math.atan2(Y.v, X.v)).to('deg');
    }
    case 'floor': need(1); return unitWise(args[0], Math.floor);
    case 'ceil': need(1); return unitWise(args[0], Math.ceil);
    case 'round': need(1); return unitWise(args[0], Math.round);
    case 'clamp': need(3); return minmax([minmax([args[0], args[1]], Math.max), args[2]], Math.min);
    case 'lerp': need(3); return arith('+', args[0], arith('*', arith('-', args[1], args[0]), args[2]));
  }
  throw new ExprError(`unknown function '${name}'`, { column: node.col, text });
}
function sqrtOf(x) { return typeof x === 'number' ? Math.sqrt(x) : x.sqrt(); }

export function evaluate(x, scope = {}) {
  const ast = astOf(x);
  const text = ast.src ?? '';
  const ev = n => {
    switch (n.t) {
      case 'root': case 'paren': return ev(n.a);
      case 'num': return n.v;
      case 'qty': return Quantity.of(n.v, n.unit);
      case 'unitapply': { const v = ev(n.a); return Quantity.of(typeof v === 'number' ? v : dimlessValue(v, 'unit'), n.unit); }
      case 'neg': { const v = ev(n.a); return typeof v === 'number' ? -v : v.neg(); }
      case 'name': {
        const v = lookup(scope, n.name);
        if (v !== undefined) {
          if (typeof v === 'string') return evaluate(parseExpr(v), scope);
          if (v && v.kind === 'expr') return v.evaluate(scope);
          return v;
        }
        if (n.name in CONSTS) return CONSTS[n.name];
        if (isUnitName(n.name)) return Quantity.of(1, n.name);
        throw new ExprError(`unknown name '${n.name}'`, { column: n.col, text, kind: 'param.unknown' });
      }
      case 'bin': {
        const a = ev(n.a), b = ev(n.b);
        try { return arith(n.op, a, b); }
        catch (e) {
          if (e instanceof DimensionError && e.column == null) { e.column = n.col; e.text = text; e.message = `'${text}': ${e.message}`; }
          throw e;
        }
      }
      case 'call': {
        const args = n.args.map(ev);
        try { return call(n.name, args, n, text); }
        catch (e) {
          if (e instanceof DimensionError && e.column == null) { e.column = n.col; e.text = text; e.message = `'${text}': ${e.message}`; }
          throw e;
        }
      }
    }
    throw new ExprError(`bad node ${n.t}`);
  };
  return ev(ast);
}

// Pretty-print for why() strings: '−' and '·', optional substitution of names by values.
export function printExpr(x, subst = null) {
  const ast = astOf(x);
  const prec = n => (n.t === 'bin' ? { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }[n.op] : 4);
  const pr = n => {
    switch (n.t) {
      case 'root': return pr(n.a);
      case 'paren': return `(${pr(n.a)})`;
      case 'num': return fmtNum(n.v);
      case 'qty': return `${fmtNum(n.v)} ${n.unit}`;
      case 'unitapply': return `${pr(n.a)} ${n.unit}`;
      case 'neg': return `−${pr(n.a)}`;
      case 'name': {
        if (subst) { const v = subst(n.name); if (v !== undefined) return String(v); }
        return n.name;
      }
      case 'call': return `${n.name}(${n.args.map(pr).join(', ')})`;
      case 'bin': {
        const l = prec(n.a) < prec(n) ? `(${pr(n.a)})` : pr(n.a);
        const r = prec(n.b) <= prec(n) && n.op !== '+' && n.op !== '*' ? `(${pr(n.b)})` : pr(n.b);
        const sym = { '+': ' + ', '-': ' − ', '*': '·', '/': ' / ', '^': '^' }[n.op];
        return l + sym + r;
      }
    }
    return '?';
  };
  return pr(ast);
}

export class Expr {
  constructor(text) {
    this.kind = 'expr';
    this.text = text;
    this.ast = parseExpr(text);
    this.deps = Object.freeze(deps(this.ast));
    Object.freeze(this);
  }
  evaluate(scope = {}) { return evaluate(this.ast, scope); }
  toString() { return this.text; }
  toJSON() { return { expr: this.text, deps: this.deps }; }
}
export function expr(text) { return text instanceof Expr ? text : new Expr(String(text)); }
export const isExprString = x => typeof x === 'string';
export function ref(name) { return new Expr(name); }
