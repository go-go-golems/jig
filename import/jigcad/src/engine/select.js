// Selectors (README §4.4): lazy, immutable query values resolved at L4 against named bodies.
// Resolution returns { kind, items: [{ body, index, name }], chain: [strings], fragile, notes }.
import { closest } from './guard.js';
import * as K from './kernel.js';

const V = K.V;
const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const TOL = 1e-6;

export class Selector {
  constructor(kind, root, steps = []) { this.kind = kind; this.root = root; this.steps = steps; Object.freeze(this); }
  _with(step, kind = this.kind) { return new Selector(kind, this.root, [...this.steps, step]); }
  of(target) { return this._with({ op: 'of', target }); }
  where(pred) { return this._with({ op: 'where', pred }); }
  type(t) { return this._with({ op: 'type', t }); }
  radius(r) { return this._with({ op: 'radius', r }); }
  near(pt) { return this._with({ op: 'near', pt }); }
  adjacent(sel) { return this._with({ op: 'adjacent', sel }); }
  tangentChain() { return this._with({ op: 'tangentChain' }); }
  loop() { return this._with({ op: 'loop' }); }
  largest() { return this._with({ op: 'largest' }); }
  smallest() { return this._with({ op: 'smallest' }); }
  sortBy(fn) { return this._with({ op: 'sortBy', fn }); }
  first() { return this._with({ op: 'nthSorted', i: 0, label: 'first' }); }
  last() { return this._with({ op: 'nthSorted', i: -1, label: 'last' }); }
  nth(i) { return this._with({ op: 'nth', i }); }
  and(o) { return this._with({ op: 'and', sel: toSel(o, this.kind) }); }
  or(o) { return this._with({ op: 'or', sel: toSel(o, this.kind) }); }
  minus(o) { return this._with({ op: 'minus', sel: toSel(o, this.kind) }); }
  not() { return this._with({ op: 'not' }); }
  faces(q) { return this._with({ op: 'nav', to: 'faces', q }, 'faces'); }
  edges(q) { return this._with({ op: 'nav', to: 'edges', q }, 'edges'); }
  vertices(q) { return this._with({ op: 'nav', to: 'vertices', q }, 'vertices'); }
  body() { return this._with({ op: 'nav', to: 'bodies' }, 'bodies'); }
  created(featId) { return this._with({ op: 'created', featId }); }
  modified(featId) { return this._with({ op: 'modified', featId }); }
  bed() { return this._with({ op: 'bed' }); }
  query(q) { return this._with({ op: 'query', q }); }   // filter the current set with the query mini-language
  expect(n) { return this._with({ op: 'expect', n }); }
  toString() { return selText(this); }
  get isSelector() { return true; }
}
const toSel = (o, kind) => o instanceof Selector ? o : o?.toSelector ? o.toSelector(kind) : new Selector(kind, { type: 'query', q: String(o), kind });

export const sel = {
  faces: q => new Selector('faces', { type: 'query', q, kind: 'faces' }),
  edges: q => new Selector('edges', { type: 'query', q, kind: 'edges' }),
  vertices: q => new Selector('vertices', { type: 'query', q, kind: 'vertices' }),
  bodies: q => new Selector('bodies', { type: 'query', q, kind: 'bodies' }),
  names: (kind, names) => new Selector(kind, { type: 'names', names }),
};

// FeatureRef: j.feat(id)
export class FeatureRef {
  constructor(id) { this.id = id; Object.freeze(this); }
  faces(q) { const s = new Selector('faces', { type: 'feat', id: this.id, what: 'faces' }); return q ? s.query(q) : s; }
  edges(q) { const s = new Selector('edges', { type: 'feat', id: this.id, what: 'edges' }); return q ? s.query(q) : s; }
  body() { return new Selector('bodies', { type: 'feat', id: this.id, what: 'body' }); }
  endFace() { return new Selector('faces', { type: 'feat', id: this.id, what: 'end' }); }
  startFace() { return new Selector('faces', { type: 'feat', id: this.id, what: 'start' }); }
  sideFaces() { return new Selector('faces', { type: 'feat', id: this.id, what: 'side' }); }
  sideFace(src) { return new Selector('faces', { type: 'feat', id: this.id, what: 'sideFace', arg: src }); }
  holes() { return new Selector('faces', { type: 'feat', id: this.id, what: 'faces' }); }
  bores() { return new Selector('faces', { type: 'feat', id: this.id, what: 'bores' }); }
  capFaces() { return new Selector('faces', { type: 'feat', id: this.id, what: 'caps' }); }
  toSelector(kind = 'faces') { return kind === 'edges' ? this.edges() : kind === 'bodies' ? this.body() : this.faces(); }
  toString() { return `j.feat('${this.id}')`; }
  get isFeatureRef() { return true; }
}
export const feat = id => new FeatureRef(id);
export const on = (comp, s) => new Selector(s.kind, { type: 'on', comp, sel: s });

function selText(s) {
  const r = s.root;
  let t = r.type === 'query' ? `j.sel.${r.kind}(${r.q ? `'${r.q}'` : ''})`
    : r.type === 'feat' ? `j.feat('${r.id}')${{ faces: '.faces()', edges: '.edges()', body: '.body()', end: '.endFace()', start: '.startFace()', side: '.sideFaces()', sideFace: `.sideFace('${r.arg}')`, bores: '.bores()', caps: '.capFaces()' }[r.what]}`
    : r.type === 'on' ? `j.on('${r.comp}', ${selText(r.sel)})` : `names(${r.names.length})`;
  for (const st of s.steps) {
    const a = st.op === 'where' || st.op === 'sortBy' ? (st.pred ?? st.fn).toString().replace(/\s+/g, ' ')
      : st.op === 'and' || st.op === 'or' || st.op === 'minus' || st.op === 'adjacent' ? selText(st.sel)
      : st.op === 'of' ? (st.target instanceof Selector || st.target?.isFeatureRef ? String(st.target) : `'${st.target}'`)
      : st.op === 'nav' ? (st.q ? `'${st.q}'` : '') : st.op === 'nthSorted' ? '' : st.op === 'radius' ? fmtQ(st.r) : st.op === 'near' ? JSON.stringify(ptArr(st.pt)) : st.op === 'expect' ? JSON.stringify(st.n)
      : st.op === 'nth' ? st.i : st.op === 'type' ? `'${st.t}'` : st.op === 'query' ? `'${st.q}'` : st.featId ? `'${st.featId}'` : '';
    t += `.${st.op === 'nav' ? st.to === 'bodies' ? 'body' : st.to : st.op === 'nthSorted' ? st.label : st.op}(${a})`;
    if (st.op === 'query' && s.root.type === 'feat' && st === s.steps[0]) t = t.replace(`.${s.root.what === 'edges' ? 'edges' : 'faces'}().query(`, `.${s.root.what === 'edges' ? 'edges' : 'faces'}(`);
  }
  return t;
}
const fmtQ = x => typeof x === 'number' ? String(x) : x?.toString?.() ?? String(x);
export const ptArr = p => Array.isArray(p) ? [p[0], p[1], p[2] ?? 0] : p?.toArray ? p.toArray() : [p.x ?? 0, p.y ?? 0, p.z ?? 0];

// ── query mini-language ──────────────────────────────────────────────────────
function parseDir(t) {
  const m = /^([+-]?)([XYZ])$/i.exec(t);
  if (m) return V.mul(AXES[m[2].toUpperCase()], m[1] === '-' ? -1 : 1);
  const v = /^([+-]?)\(([^)]*)\)$/.exec(t);
  if (v) { const a = v[2].split(',').map(Number); return V.mul(V.unit(a), v[1] === '-' ? -1 : 1); }
  throw new Error(`selector: bad direction '${t}'`);
}
export function parseQuery(q) {
  const toks = String(q).replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
  // re-join vector literals like ( 1 , 0 , 0 ) following an operator
  const t2 = [];
  for (let i = 0; i < toks.length; i++) {
    if (/^[+\-|#<>]$/.test(toks[i]) && toks[i + 1] === '(') { let j = i + 2, s = ''; while (toks[j] !== ')') s += toks[j++]; t2.push(toks[i] + '(' + s + ')'); i = j; }
    else if (/^[+\-|#<>]$/.test(toks[i]) && toks[i + 1]) { t2.push(toks[i] + toks[++i]); }
    else t2.push(toks[i]);
  }
  let pos = 0;
  const peek = () => t2[pos], next = () => t2[pos++];
  function orE() { let l = andE(); while (peek()?.toLowerCase() === 'or') { next(); l = { op: 'or', l, r: andE() }; } return l; }
  function andE() { let l = notE(); while (peek()?.toLowerCase() === 'and') { next(); l = { op: 'and', l, r: notE() }; } return l; }
  function notE() { if (peek()?.toLowerCase() === 'not') { next(); return { op: 'not', e: notE() }; } return atom(); }
  function atom() {
    const t = next();
    if (t === '(') { const e = orE(); next(); return e; }
    if (!t) throw new Error(`selector: unexpected end of '${q}'`);
    if (t[0] === '%') {
      const k = t.slice(1).toLowerCase();
      if (!KINDS.includes(k)) { const near = closest(k, KINDS, 2); throw new Error(`selector: unknown kind '${t}' in '${q}'.${near.length ? ` Did you mean ${near.map(n => '%' + n).join(' or ')}?` : ''} Kinds: %plane %cylinder %cone %sphere %torus %bspline (faces), %line %circle %arc %ellipse (edges)`); }
      return { op: 'type', t: k };
    }
    if ('+-|#<>'.includes(t[0])) return { op: t[0], dir: parseDir(t[0] === '+' || t[0] === '-' ? t : t.slice(1)) };
    throw new Error(`selector: unknown token '${t}' in '${q}'. A query is made of %plane %cylinder %line %circle (kind), +Z -Z (normal points along), |Z (parallel), #Z (perpendicular), >Z <Z (farthest, nearest along), any axis or (x,y,z), joined with and, or, not; a face name such as 'body/end' or a pattern 'shell/*' also works`);
  }
  const e = orE();
  if (pos < t2.length) throw new Error(`selector: unexpected '${t2[pos]}' in '${q}'`);
  return e;
}

// Geometry of a candidate for predicates
function geomOf(c, kind) {
  if (kind === 'faces') return c.body.faceInfo(c.index);
  if (kind === 'edges') return c.body.edgeInfo(c.index);
  if (kind === 'vertices') { const p = c.body.vertexPoint(c.index); return { kind: 'vertex', center: p }; }
  return { kind: 'body', center: K.volumeProps(c.body.shape).center };
}
function evalQuery(ast, cands, kind) {
  const all = cands;
  const rec = a => {
    switch (a.op) {
      case 'or': { const l = rec(a.l), r = rec(a.r); return union(l, r); }
      case 'and': { const l = new Set(rec(a.r)); return rec(a.l).filter(c => l.has(c)); }
      case 'not': { const e = new Set(rec(a.e)); return all.filter(c => !e.has(c)); }
      case 'type': return all.filter(c => typeMatch(geomOf(c, kind), a.t));
      case '+': return all.filter(c => { const g = geomOf(c, kind); return g.kind === 'plane' && V.dot(g.normal, a.dir) > 1 - TOL; });
      case '-': return all.filter(c => { const g = geomOf(c, kind); return g.kind === 'plane' && V.dot(g.normal, a.dir) > 1 - TOL; });
      case '|': return all.filter(c => { const g = geomOf(c, kind); return parallel(g, a.dir, kind); });
      case '#': return all.filter(c => { const g = geomOf(c, kind); return perpendicular(g, a.dir, kind); });
      case '>': case '<': {
        if (!all.length) return [];
        const s = a.op === '>' ? 1 : -1;
        const vals = all.map(c => s * V.dot(geomOf(c, kind).center, a.dir));
        const m = Math.max(...vals); const span = Math.max(1, Math.abs(m)) * 1e-7;
        return all.filter((c, i) => vals[i] >= m - span);
      }
    }
    return [];
  };
  return rec(ast);
}
const union = (a, b) => { const s = new Set(a); return [...a, ...b.filter(x => !s.has(x))]; };
// the kinds a %kind query can name (typeMatch); anything else is an error, not an empty match
const KINDS = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bspline', 'spline', 'line', 'circle', 'arc', 'ellipse', 'bezier', 'other'];
function typeMatch(g, t) {
  if (t === 'line') return g.kind === 'line';
  if (t === 'circle') return g.kind === 'circle';
  if (t === 'arc') return g.kind === 'circle' && !g.closed;
  if (t === 'plane') return g.kind === 'plane';
  if (t === 'cylinder') return g.kind === 'cylinder';
  if (t === 'cone') return g.kind === 'cone';
  if (t === 'sphere') return g.kind === 'sphere';
  if (t === 'torus') return g.kind === 'torus';
  if (t === 'bspline' || t === 'spline') return g.kind === 'bspline';
  return g.kind === t;
}
function parallel(g, d, kind) {
  if (kind === 'edges') return (g.kind === 'line' && Math.abs(V.dot(g.dir, d)) > 1 - TOL);
  if (g.kind === 'plane') return Math.abs(V.dot(g.normal, d)) > 1 - TOL;
  return false;
}
function perpendicular(g, d, kind) {
  if (kind === 'edges') return (g.kind === 'line' && Math.abs(V.dot(g.dir, d)) < TOL) || ((g.kind === 'circle' || g.kind === 'ellipse') && g.axis && Math.abs(V.dot(g.axis.dir, d)) > 1 - TOL);
  if (g.kind === 'plane') return Math.abs(V.dot(g.normal, d)) < TOL;
  if (g.kind === 'cylinder') return Math.abs(V.dot(g.axis.dir, d)) > 1 - TOL;
  return false;
}

// ── resolution ───────────────────────────────────────────────────────────────
// env: { bodies: [Body], part?: name, components?: { id: { bodies } }, bedDir?, featureIds?: Set,
//        props(c, kind) → object for lambdas, len(x) → mm, point(x) → [x,y,z] }
export function resolve(s, env) {
  const chain = [];
  const notes = [];
  let fragile = false;
  const key = c => `${c.body.uid}:${c.index}`;
  const listAll = (kind, bodies = env.bodies) => {
    const out = [];
    for (const b of bodies) {
      if (kind === 'bodies') { out.push({ body: b, index: 0, name: b.id }); continue; }
      const n = kind === 'faces' ? b.nFaces : kind === 'edges' ? b.edges.list.length : b.vertices.list.length;
      const names = kind === 'faces' ? b.names : kind === 'edges' ? b.edgeNames : null;
      for (let i = 0; i < n; i++) out.push({ body: b, index: i, name: names ? names[i] : `${b.id}/v${i}` });
    }
    return out;
  };
  const dedupe = arr => { const seen = new Set(); return arr.filter(c => { const k = key(c); if (seen.has(k)) return false; seen.add(k); return true; }); };

  // root
  let kind = s.root.type === 'on' ? s.root.sel.kind : rootKindOf(s);
  let cur;
  const r = s.root;
  if (r.type === 'on') {
    const comp = env.components?.[r.comp];
    if (!comp) throw Object.assign(new Error(`j.on: no component '${r.comp}'`), { kind: 'ref.lost' });
    const sub = resolve(r.sel, { ...env, bodies: comp.bodies, components: comp.components });
    cur = sub.items; kind = sub.kind; chain.push(`on ${r.comp}: ${sub.items.length}`); fragile ||= sub.fragile;
  } else if (r.type === 'names') {
    cur = listAll(kind).filter(c => r.names.includes(c.name));
  } else if (r.type === 'feat') {
    if (env.featureIds && !env.featureIds.has(r.id)) notes.push({ kind: 'ref.lost', message: `no feature '${r.id}' before this point` });
    const id = r.id;
    const own = n => n.startsWith(id + '/');
    const base = n => n.replace(/#[a-z0-9]+$/g, '');
    const nameOf = c => c.name;
    const aliasesOf = c => c.body.aliases?.[c.index] ?? [];
    const match = (pred) => listAll('faces').filter(c => pred(base(nameOf(c))) || aliasesOf(c).some(a => pred(base(a))));
    const srcMatch = (n, arg) => { const m = /\/side\[(.*)\]$/.exec(n); if (!m) return false; const src = m[1]; return src === arg || src.endsWith('.' + arg); };
    switch (r.what) {
      case 'faces': cur = match(own); break;
      case 'edges': { const fs = new Set(match(own).map(key)); cur = listAll('edges').filter(c => c.body.edgeFaces[c.index].some(fi => fs.has(`${c.body.uid}:${fi}`))); kind = 'edges'; break; }
      case 'end': case 'start': {
        cur = match(n => n.startsWith(`${id}/${r.what}`));
        if (!cur.length) {
          // full revolves and lofts without caps: the feature's planar face farthest along +Z (end) or −Z (start)
          const planar = match(own).filter(c => c.body.faceInfo(c.index).kind === 'plane');
          if (planar.length) { cur = evalQuery(parseQuery(r.what === 'end' ? '>Z' : '<Z'), planar, 'faces'); notes.push({ kind: 'ref.note', message: `${id} has no ${r.what} cap; used its ${r.what === 'end' ? 'highest' : 'lowest'} planar face` }); }
        }
        break;
      }
      case 'caps': cur = match(n => n.startsWith(id + '/start') || n.startsWith(id + '/end')); break;
      case 'side': cur = match(n => n.startsWith(id + '/side[')); break;
      case 'sideFace': cur = match(n => n.startsWith(id + '/side[') && srcMatch(n, r.arg)); break;
      case 'bores': cur = match(n => n.startsWith(id + '/bore')); break;
      case 'body': { const bs = new Set(match(own).map(c => c.body)); cur = [...bs].map(b => ({ body: b, index: 0, name: b.id })); kind = 'bodies'; break; }
    }
    chain.push(`${selText(new Selector(kind, r))} → ${cur.length} by genealogy`);
  } else {
    cur = listAll(kind);
    if (r.q) { const before = cur.length; cur = evalQuery(parseQuery(r.q), cur, kind); chain.push(`'${r.q}' → ${cur.length} of ${before}`); }
    else chain.push(`all ${kind} → ${cur.length}`);
  }

  // steps
  for (const st of s.steps) {
    const before = cur.length;
    switch (st.op) {
      case 'of': {
        const t = st.target;
        if (t instanceof Selector || t?.isFeatureRef) {
          const sub = resolve(t instanceof Selector ? t : t.faces(), env); fragile ||= sub.fragile;
          if (sub.kind === 'bodies') { const bs = new Set(sub.items.map(c => c.body)); cur = cur.filter(c => bs.has(c.body)); }
          else if (sub.kind === 'faces' && kind === 'edges') { const fs = new Set(sub.items.map(key)); cur = cur.filter(c => c.body.edgeFaces[c.index].some(fi => fs.has(`${c.body.uid}:${fi}`))); }
          else if (sub.kind === kind) { const ks = new Set(sub.items.map(key)); cur = cur.filter(c => ks.has(key(c))); }
        } else if (typeof t === 'string') {
          if (env.components?.[t]) { const bs = new Set(env.components[t].bodies); cur = cur.filter(c => bs.has(c.body)); }
          else if (t === env.part || !t) { /* whole part */ }
          else if (env.bodies.some(b => b.id === t)) cur = cur.filter(c => c.body.id === t);
          else { cur = cur.filter(c => c.name.startsWith(t + '/') || c.name.includes(' ' + t + '/') || c.name.includes('[' + t + '/')); }
        }
        break;
      }
      case 'where': cur = cur.filter(c => truthy(st.pred(env.props(c, kind), env.lambdaCtx))); break;
      case 'type': cur = cur.filter(c => typeMatch(geomOf(c, kind), st.t)); break;
      case 'radius': { const rv = env.len(st.r); cur = cur.filter(c => { const g = geomOf(c, kind); return g.axis && Math.abs(g.axis.radius - rv) < 1e-6; }); break; }
      case 'near': {
        const p = env.point(st.pt);
        const d = cur.map(c => V.dist(geomOf(c, kind).center ?? geomOf(c, kind).mid, p));
        const m = Math.min(...d); cur = cur.filter((c, i) => d[i] <= m + 1e-6);
        break;
      }
      case 'adjacent': {
        const sub = resolve(st.sel, env);
        const target = new Set(sub.items.map(key));
        if (kind === 'faces' && sub.kind === 'faces') cur = cur.filter(c => c.body.edgeFaces.some(fs => fs.includes(c.index) && fs.some(fi => fi !== c.index && target.has(`${c.body.uid}:${fi}`))));
        else if (kind === 'edges' && sub.kind === 'faces') cur = cur.filter(c => c.body.edgeFaces[c.index].some(fi => target.has(`${c.body.uid}:${fi}`)));
        break;
      }
      case 'tangentChain': cur = tangentChain(cur, env); break;
      case 'loop': {
        // all edges of the face wires that contain the selected edges
        const out = [];
        for (const c of cur) {
          const b = c.body; const e = b.edges.list[c.index];
          for (const fi of b.edgeFaces[c.index]) {
            K.explore(b.faces.list[fi], 'WIRE', w => {
              const ids = []; let has = false;
              K.explore(w, 'EDGE', x => { const ei = b.edges.indexOf(x); if (ei >= 0) { ids.push(ei); if (ei === c.index) has = true; } });
              if (has) for (const ei of ids) out.push({ body: b, index: ei, name: b.edgeNames[ei] });
            });
            void e;
            break;
          }
        }
        cur = dedupe(out);
        break;
      }
      case 'largest': case 'smallest': {
        const m = c => { const g = geomOf(c, kind); return g.area ?? g.length ?? (kind === 'bodies' ? c.body.volume() : 0); };
        const vals = cur.map(m); const best = st.op === 'largest' ? Math.max(...vals) : Math.min(...vals);
        cur = cur.filter((c, i) => Math.abs(vals[i] - best) <= Math.abs(best) * 1e-9 + 1e-9).slice(0, 1);
        break;
      }
      case 'sortBy': { const vals = new Map(cur.map(c => [c, num(st.fn(env.props(c, kind), env.lambdaCtx))])); cur = [...cur].sort((a, b) => vals.get(a) - vals.get(b)); break; }
      case 'nthSorted': { const i = st.i < 0 ? cur.length + st.i : st.i; cur = cur[i] ? [cur[i]] : []; break; }
      case 'nth': fragile = true; cur = cur[st.i] ? [cur[st.i]] : []; notes.push({ kind: 'ref.fragile', message: `nth(${st.i}) depends on face order` }); break;
      case 'and': { const o = new Set(resolve(st.sel, env).items.map(key)); cur = cur.filter(c => o.has(key(c))); break; }
      case 'or': { const o = resolve(st.sel, env); cur = dedupe([...cur, ...o.items]); break; }
      case 'minus': { const o = new Set(resolve(st.sel, env).items.map(key)); cur = cur.filter(c => !o.has(key(c))); break; }
      case 'not': { const ks = new Set(cur.map(key)); cur = listAll(kind).filter(c => !ks.has(key(c))); break; }
      case 'nav': {
        const to = st.to;
        if (to === 'bodies') cur = dedupe(cur.map(c => ({ body: c.body, index: 0, name: c.body.id })));
        else if (kind === 'faces' && to === 'edges') cur = dedupe(cur.flatMap(c => c.body.edgeFaces.map((fs, ei) => fs.includes(c.index) ? { body: c.body, index: ei, name: c.body.edgeNames[ei] } : null).filter(Boolean)));
        else if (kind === 'edges' && to === 'faces') cur = dedupe(cur.flatMap(c => c.body.edgeFaces[c.index].map(fi => ({ body: c.body, index: fi, name: c.body.names[fi] }))));
        else if (kind === 'bodies') cur = listAll(to, [...new Set(cur.map(c => c.body))]);
        else if (to === 'vertices') {
          const out = [];
          for (const c of cur) { const faces = kind === 'faces' ? [c.index] : c.body.edgeFaces[c.index]; c.body.vertexFaces.forEach((fs, vi) => { if (kind === 'faces' ? fs.includes(c.index) : faces.every(f => fs.includes(f))) out.push({ body: c.body, index: vi, name: `${c.body.id}/v${vi}` }); }); }
          cur = dedupe(out);
        }
        kind = to;
        if (st.q) cur = evalQuery(parseQuery(st.q), cur, kind);
        break;
      }
      case 'query': cur = evalQuery(parseQuery(st.q), cur, kind); break;
      case 'created': cur = cur.filter(c => c.name.startsWith(st.featId + '/')); break;
      case 'modified': cur = cur.filter(c => !c.name.startsWith(st.featId + '/')); break;
      case 'bed': {
        const d = env.bedDir ?? [0, 0, 1];
        const bodies = [...new Set(cur.map(c => c.body))];
        const minz = Math.min(...bodies.map(b => { const bb = b.bbox(); return Math.min(...[0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => V.dot([bb[i][0], bb[j][1], bb[k][2]], d))))); }));
        cur = cur.filter(c => { const g = geomOf(c, kind); return kind === 'faces' ? g.kind === 'plane' && V.dot(g.normal, d) < -1 + TOL && Math.abs(V.dot(g.center, d) - minz) < 1e-6 : Math.abs(V.dot(g.center ?? g.mid, d) - minz) < 1e-6; });
        break;
      }
      case 'expect': {
        const n = st.n; const ok = Array.isArray(n) ? cur.length >= n[0] && cur.length <= n[1] : cur.length === n;
        if (!ok) notes.push({ kind: 'ref.expect', level: 'error', message: `resolved to ${cur.length} ${kind}; expected ${Array.isArray(n) ? n.join('–') : n}`, count: cur.length, expected: n });
        break;
      }
    }
    if (st.op !== 'expect') chain.push(`${st.op === 'nav' ? st.to : st.op === 'nthSorted' ? st.label : st.op} → ${cur.length}${before !== cur.length ? ` (of ${before})` : ''}`);
  }
  return { kind, items: cur, chain, fragile, notes };
}
function rootKindOf(s) {
  const r = s.root;
  if (r.type === 'feat') return { edges: 'edges', body: 'bodies' }[r.what] ?? 'faces';
  return r.kind ?? 'faces';
}
const truthy = v => v?.valueOf ? !!v.valueOf() : !!v;
const num = v => typeof v === 'number' ? v : v?.value ?? Number(v);

function tangentChain(cur, env) {
  // grow edge sets across vertices where the neighbouring edge continues tangentially
  const out = [...cur];
  const seen = new Set(cur.map(c => `${c.body.uid}:${c.index}`));
  for (let k = 0; k < out.length; k++) {
    const c = out[k]; const b = c.body;
    const g = b.edgeInfo(c.index);
    for (let ei = 0; ei < b.edges.list.length; ei++) {
      const id = `${b.uid}:${ei}`; if (seen.has(id)) continue;
      const h = b.edgeInfo(ei);
      const share = [g.a, g.b].some(p => [h.a, h.b].some(q => V.dist(p, q) < 1e-6));
      if (!share) continue;
      const tg = g.dir ?? null, th = h.dir ?? null;
      if ((tg && th && Math.abs(V.dot(tg, th)) > 1 - 1e-6) || g.kind === 'circle' || h.kind === 'circle') { seen.add(id); out.push({ body: b, index: ei, name: b.edgeNames[ei] }); }
    }
  }
  return out;
}
