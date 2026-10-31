// Body: one solid with persistent face names (genealogy), lazy topology and geometry caches.
// Naming: carryNames() pushes names through a maker's Modified/Generated/IsDeleted history (README §4.4).
import { getOC } from './oc.js';
import * as K from './kernel.js';

const V = K.V;
let liveBodies = new Set();
let bodySeq = 0;

export class Body {
  // shape: TopoDS_Shape (a solid). names: array aligned with the faces in TopExp order.
  constructor(id, shape, names, meta = {}) {
    this.id = id; this.shape = shape; this.names = names; this.meta = meta;
    this.aliases = meta.aliases ?? names.map(() => null);
    this.uid = ++bodySeq; this.freed = false;
    this._faces = null; this._edges = null; this._verts = null; this._edgeFaces = null; this._fi = []; this._ei = [];
    liveBodies.add(this);
  }
  get faces() { return this._faces ??= K.subShapes(this.shape, 'FACE'); }
  get edges() { return this._edges ??= K.subShapes(this.shape, 'EDGE'); }
  get vertices() { return this._verts ??= K.subShapes(this.shape, 'VERTEX'); }
  get nFaces() { return this.faces.list.length; }
  faceInfo(i) { return this._fi[i] ??= K.faceInfo(this.faces.list[i]); }
  edgeInfo(i) { return this._ei[i] ??= K.edgeInfo(this.edges.list[i]); }
  // For each edge: indices of the faces using it (1 for seams on one face listed twice → [i, i]).
  get edgeFaces() {
    if (this._edgeFaces) return this._edgeFaces;
    const ef = this.edges.list.map(() => []);
    this.faces.list.forEach((f, fi) => K.explore(f, 'EDGE', e => {
      const ei = this.edges.indexOf(e);
      if (ei >= 0 && (ef[ei].length < 2)) ef[ei].push(fi);
    }));
    return this._edgeFaces = ef;
  }
  get edgeNames() {
    if (this._edgeNames) return this._edgeNames;
    const raw = this.edgeFaces.map(fs => edgeNameFrom(fs.map(i => this.names[i])));
    return this._edgeNames = uniquify(raw, i => this.edgeInfo(i).mid);
  }
  get vertexFaces() {
    if (this._vf) return this._vf;
    const vf = this.vertices.list.map(() => new Set());
    this.edges.list.forEach((e, ei) => K.explore(e, 'VERTEX', v => { const vi = this.vertices.indexOf(v); if (vi >= 0) for (const f of this.edgeFaces[ei]) vf[vi].add(f); }));
    return this._vf = vf.map(s => [...s]);
  }
  vertexPoint(i) { const oc = getOC(); const p = oc.BRep_Tool.Pnt(this.vertices.list[i]); const out = K.xyz(p); p.delete(); return out; }
  volume() { return this._vol ??= K.volumeProps(this.shape).volume; }
  bbox() { return this._bbox ??= K.bboxOf(this.shape); }
  // Euler–Poincaré: V − E + F − (L − F) − 2(S − G) = 0 → solve for genus G
  topology() {
    if (this._topo) return this._topo;
    // degenerate edges (a sphere's poles, a cone's apex) are not edges of the solid's boundary graph: skip them
    const oc = getOC();
    const degenerate = e => { try { return !!oc.BRep_Tool.Degenerated(e); } catch { return false; } };
    const Vn = this.vertices.list.length, E = this.edges.list.filter(e => !degenerate(e)).length, F = this.faces.list.length;
    let L = 0; for (const f of this.faces.list) K.explore(f, 'WIRE', () => L++);
    let S = 0; K.explore(this.shape, 'SHELL', () => S++);
    const chi = Vn - E + F - (L - F);            // = 2(S − G)
    // G is solved from the same formula, so the check is that it comes out a whole number ≥ 0: the residual is
    // what is left against the nearest such genus, 0 for a valid solid
    const Gi = Math.max(0, Math.round(S - chi / 2));
    const residual = chi - 2 * (S - Gi);
    return this._topo = { V: Vn, E, F, L, S, G: residual ? S - chi / 2 : Gi, residual };
  }
  findFace(name) { return this.names.indexOf(name); }
  // forget a temporary wrapper without deleting the shape it borrows
  detach() { this._faces?.free(); this._edges?.free(); this._verts?.free(); this._faces = this._edges = this._verts = null; this.freed = true; liveBodies.delete(this); }
  free() {
    if (this.freed) return; this.freed = true; liveBodies.delete(this);
    this._faces?.free(); this._edges?.free(); this._verts?.free();
    try { this.shape.delete(); } catch {}
  }
}
export function nextBodyId(state) {
  let n = 1; const used = new Set(state.bodies.map(b => b.id));
  while (used.has('body' + n)) n++;
  return 'body' + n;
}

// Edge names from the names of their faces: caps (start/end) last, otherwise alphabetical.
const capRank = n => /\/(end|start|top|bottom)\b/.test(n) ? 1 : 0;
export function edgeNameFrom(names) {
  if (names.length === 1) return `${names[0]} (boundary)`;
  if (names.length === 2 && names[0] === names[1]) return `${names[0]} (seam)`;
  return [...names].sort((a, b) => capRank(a) - capRank(b) || (a < b ? -1 : a > b ? 1 : 0)).join(' ∩ ');
}
// Make names unique by appending #1, #2… ordered by a position key.
export function uniquify(names, posOf, sep = '#') {
  const groups = new Map();
  names.forEach((n, i) => { if (!groups.has(n)) groups.set(n, []); groups.get(n).push(i); });
  const out = names.slice();
  for (const [n, idx] of groups) if (idx.length > 1) {
    const keyed = idx.map(i => ({ i, p: posOf(i) })).sort((a, b) => cmpPos(a.p, b.p));
    keyed.forEach((k, j) => { out[k.i] = `${n}${sep}${j + 1}`; });
  }
  return out;
}
export const cmpPos = (a, b) => (K.r6(a[2]) - K.r6(b[2])) || (K.r6(a[1]) - K.r6(b[1])) || (K.r6(a[0]) - K.r6(b[0]));
export const letter = k => k < 26 ? String.fromCharCode(97 + k) : 'z' + (k - 25);

// History adaptor around any BRepBuilderAPI_MakeShape / BRepAlgoAPI builder.
export function historyOf(maker) {
  return {
    modified: s => { try { return K.listToArray(maker.Modified(s)); } catch { return []; } },
    generated: s => { try { return K.listToArray(maker.Generated(s)); } catch { return []; } },
    isDeleted: s => { try { return maker.IsDeleted(s); } catch { return false; } },
  };
}

// Name the faces of newShape. sources: [{ body }] whose faces carry names; explicit: [{ shape, name }]
// (names for faces the feature made itself, e.g. prism sides); genFrom: feature id used for faces generated
// from named edges (fillets, chamfers): `${genFrom}/face[${edgeName}]`.
export function carryNames(newShape, sources, hist, featId, explicit = [], opts = {}) {
  const nf = K.subShapes(newShape, 'FACE');
  const n = nf.list.length;
  const cand = Array.from({ length: n }, () => []);
  let order = 0;
  const push = (s, c) => { const j = nf.indexOf(s); if (j >= 0) cand[j].push({ ...c, order: order++ }); return j; };
  const splits = new Map();   // name → [new face idx]
  for (const { body } of sources) {
    body.faces.list.forEach((f, i) => {
      const name = body.names[i];
      const mods = hist ? hist.modified(f) : [];
      const faceMods = mods.filter(m => K.isType(m, 'FACE'));
      if (faceMods.length) {
        const js = [];
        for (const m of faceMods) { const j = push(m, { name, alias: body.aliases[i] }); if (j >= 0 && !js.includes(j)) js.push(j); }
        if (js.length > 1) splits.set(name, (splits.get(name) ?? []).concat(js));
      } else if (!hist || !hist.isDeleted(f)) push(f, { name, alias: body.aliases[i] });
      mods.forEach(m => m.delete());
    });
  }
  for (const e of explicit) push(e.shape, { name: e.name, explicit: true });
  const genFaces = [];
  if (opts.genFrom && hist) for (const { body } of sources) {
    const en = body.edgeNames;
    body.edges.list.forEach((e, i) => {
      for (const g of hist.generated(e)) { if (K.isType(g, 'FACE')) genFaces.push({ s: g, name: `${opts.genFrom}/face[${en[i]}]`, edge: en[i] }); else g.delete(); }
    });
    body.vertices.list.forEach((v, i) => {
      for (const g of hist.generated(v)) { if (K.isType(g, 'FACE')) genFaces.push({ s: g, name: `${opts.genFrom}/corner[${i}]` }); else g.delete(); }
    });
  }
  for (const g of genFaces) { push(g.s, { name: g.name, gen: true }); g.s.delete(); }
  // choose: explicit > carried (oldest first) > generated
  const names = new Array(n), aliases = new Array(n).fill(null);
  const pos = i => nf.list[i] ? K.faceCentre(nf.list[i]) : [0, 0, 0];
  let anon = 0;
  for (let j = 0; j < n; j++) {
    const c = cand[j];
    const pick = c.find(x => x.explicit) ?? c.find(x => !x.gen) ?? c[0];
    if (!pick) { names[j] = `${featId}/face#${++anon}`; continue; }
    names[j] = pick.name;
    const others = [...new Set(c.filter(x => x !== pick && !x.gen && x.name !== pick.name).map(x => x.name))];
    if (others.length || pick.alias) aliases[j] = [...(pick.alias ?? []), ...others];
  }
  // splits: one old face → several new faces: #a, #b in a deterministic order
  for (const [name, js] of splits) {
    const mine = [...new Set(js)].filter(j => names[j] === name);
    if (mine.length < 2) continue;
    mine.map(j => ({ j, p: pos(j) })).sort((a, b) => cmpPos(a.p, b.p)).forEach((x, k) => { names[x.j] = `${name}#${letter(k)}`; });
  }
  const uniq = uniquify(names, pos);
  nf.free();
  return { names: uniq, aliases };
}

// Garbage collection of bodies: free every live body not reachable from `keep` (an iterable of bodies).
export function sweepBodies(keep) {
  const k = new Set(keep);
  let freed = 0;
  for (const b of [...liveBodies]) if (!k.has(b)) { b.free(); freed++; }
  return freed;
}
export const liveBodyCount = () => liveBodies.size;
