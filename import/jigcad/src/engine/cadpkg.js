// cadpkg.js: the CAD package (JIG-016): a compiled program's bodies, faces and component structure as a renderer
// reads them. The package is in Candela's frame (metres, +Y up, the front toward +Z), converted here once:
//
//   jig (mm, +Z up)  →  Candela:  p′ = C·p,  C = 0.001·R,  R(x, y, z) = (x, z, −y)   (a rotation of −90° about X)
//   directions (normals, axes) by R alone, lengths ×0.001, body transforms conjugated: T′ = C·T·C⁻¹
//
// Every face carries what a renderer's finish needs: its persistent name (the id Candela's .face() and id passes
// use), its kind and axis, the feature that made it, and an inferred machining process for metal parts (revolved
// faces turned, bores ground, milled elsewhere; design doc §6.4). The bridge that turns a package into a Candela
// scene is src/render/jig-candela.js; Candela reads the same package in the browser and in candela-rt.
//
//   cadPackage(prog, { quality: 'render' | 'preview', studies })  → the package, arrays as typed arrays (transferable)
//   encodeCadPackage(pkg)                                        → JSON text, arrays as base64 (export('candela'))
//
// Every body carries content keys, key and meshKey (keysOf), so a renderer that keeps mesh definitions between
// packages (the bridge does) builds again only the bodies an edit changed; the render tessellation of a body the
// feature cache kept is not redone either (meshOf).
//
// An assembly's studies come with their poses (studies.<name>: drive, unit, x, and per component a float32 4×4 per
// row, in Candela's frame), so a Candela scene plays a study back with the bridge's posesAt() and animate().
import * as K from './kernel.js';
import { meshBody, faceMeta } from './mesh.js';
import { selectInPart } from './compile.js';
import { finishTargets } from './assembly.js';
import { hashStr } from './hash.js';
import { S, R, pt, toCandelaMatrix } from '../render/frame.js';

export const CAD_PACKAGE_FORMAT = 'jig-cad-package';
export const CAD_PACKAGE_VERSION = 1;

// the frame change (metres, Y up) is src/render/frame.js, shared with the page
export { toCandelaMatrix };
export const toCandela = { point: pt, dir: R, length: (l) => l * S, matrix: toCandelaMatrix };

// jig's engineering materials → Candela's appearance vocabulary (finish.ts: METAL_F0, POLYMERS). Polymers Candela
// does not list render as a generic plastic (or rubber) in the part's colour.
const APPEARANCE = {
  steel: { material: 'steel', metal: true }, stainless: { material: 'stainless', metal: true }, aluminium: { material: 'aluminium', metal: true },
  brass: { material: 'brass', metal: true }, bronze: { material: 'bronze', metal: true }, copper: { material: 'copper', metal: true },
  PLA: { material: 'pla' }, ABS: { material: 'abs' },
  PETG: { material: 'petg', finish: 'plastic', roughness: 0.25 }, ASA: { material: 'asa', finish: 'plastic', roughness: 0.45 },
  PP: { material: 'pp', finish: 'plastic', roughness: 0.5 }, 'TPU-95A': { material: 'tpu', finish: 'rubber' },
  'PA-CF': { material: 'pa', color: '#2b2b2e', roughness: 0.6 }, 'resin-standard': { material: 'resin', finish: 'plastic', roughness: 0.3 },
};
export function appearanceOf(mat) {
  const name = mat?.name ?? (typeof mat === 'string' ? mat : null);
  if (!name) return { meta: {}, metal: false };
  const { metal, ...meta } = APPEARANCE[name] ?? { material: String(name).toLowerCase() };
  return { meta, metal: !!metal };
}
// coats whose colour is the part's colour: on a metal part only these take jig's display colour
const COATS = /^(paint|powder-coat|anodized)/;
/** a face's final colour: an explicit .finish({ color }) always; jig's display colour (.color()) for plastics,
 *  and for a metal only under a coat (paint, powder coat, anodizing): otherwise a metal looks like its metal */
function settleColor(meta, display, metal) {
  if (meta.color != null || display == null) return meta;
  if (!metal || COATS.test(meta.finish ?? '')) meta.color = display;
  return meta;
}

// .finish(sel, meta) and .color(sel, c) of a part, resolved to face names of the part's bodies (later entries win).
// A string is a persistent name or a * glob; anything else goes through the part's selector engine, as joint ends
// picked on geometry do. Selections are made per part, once, before the bodies are walked.
const globRe = (g) => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
function select(part, sel) {
  const bodies = part.res.state.bodies;
  if (sel == null || sel === '*') return bodies.flatMap((b) => b.names.map((n) => [b, n]));
  if (typeof sel === 'string') {
    const re = globRe(sel), hits = bodies.flatMap((b) => b.names.filter((n) => n === sel || n.replace(/#[a-z0-9]+$/, '') === sel || (sel.includes('*') && re.test(n))).map((n) => [b, n]));
    if (!hits.length) {
      const head = sel.split('/')[0], names = bodies.flatMap((b) => b.names), near = names.filter((n) => n.split('/')[0] === head);
      throw new Error(`no face named '${sel}'; names like ${(near.length ? near : names).slice(0, 4).map((n) => `'${n}'`).join(', ')}`);
    }
    return hits;
  }
  const r = selectInPart(part.res, sel);
  if (!r.items?.length) throw new Error(`${String(sel)} selects no face`);
  return r.items.filter((c) => bodies.includes(c.body)).map((c) => [c.body, c.name]);
}
// asm: the assembly's .finish() calls that name this component ({ comp, faces, meta }, every level's, prefixed:
// assembly.js), applied after the part's own, so the assembly's word wins; faces are selected in this part.
function partOverrides(part, diagnostics, asm = []) {
  const meta = part.part?.meta ?? {}, finishes = new Map(), colors = new Map();
  const key = (b, n) => `${b.id}\u0000${n}`;
  const each = (list, kind, sel, call, fn) => {
    for (const e of list ?? []) {
      let hits;
      try { hits = select(part, sel(e)); }
      catch (err) { diagnostics.push({ level: 'warning', kind, at: part.name, line: e.line ?? null, message: `${call(e)}: ${err.message}` }); continue; }
      for (const [b, n] of hits) fn(key(b, n), e);
    }
  };
  const merge = (k, e) => finishes.set(k, Object.assign(finishes.get(k) ?? {}, e.meta));
  const shown = (s) => (s == null ? '' : typeof s === 'string' ? `'${s}'` : String(s));
  each(meta.finishes, 'finish.unresolved', (e) => e.sel, (e) => `.finish(${shown(e.sel)})`, merge);
  each(asm, 'finish.unresolved', (e) => e.faces, (e) => `assembly .finish('${e.comp}'${e.faces == null ? '' : `, ${shown(e.faces)}`})`, merge);
  each(meta.colors, 'color.unresolved', (e) => e.sel, (e) => `.color(${shown(e.sel)})`, (k, e) => colors.set(k, e.color));
  return { finishes: (b, n) => finishes.get(key(b, n)), colors: (b, n) => colors.get(key(b, n)) };
}

// the feature that made a face: its id is the persistent name's first segment ('body/side[s.big]' → 'body')
const featureOf = (name) => String(name).replace(/#[a-z0-9]+$/, '').split('/')[0];
// a pattern or mirror copy is named <pattern>[k]/<the source's face name> (features.js), copies of copies alike:
// its feature is the source's, and its own faces carry the copy's prefix ('spokes[1]/' for 'spokes[1]/spoke/end')
function sourceOf(name) {
  const parts = String(name).replace(/#[a-z0-9]+$/, '').split('/');
  let i = 0;
  while (i < parts.length - 1 && /\[\d+\]$/.test(parts[i])) i++;
  return { fid: parts[i], prefix: parts.slice(0, i).join('/') + (i ? '/' : ''), copy: i ? parts.slice(0, i).join('/') : null };
}

/** cylinder or cone face i of a mesh: does its surface face its axis (a bore) rather than away (a boss)? */
function concave(m, i, axis) {
  const { triFace, indices, positions, normals } = m;
  for (let t = 0; t < triFace.length; t++) {
    if (triFace[t] !== i) continue;
    const a = indices[t * 3], p = [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]], n = [normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2]];
    const d = axis.dir, o = axis.origin, w = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], k = w[0] * d[0] + w[1] * d[1] + w[2] * d[2];
    const radial = [w[0] - k * d[0], w[1] - k * d[1], w[2] - k * d[2]];
    return radial[0] * n[0] + radial[1] * n[1] + radial[2] * n[2] < 0;
  }
  return false;
}

/**
 * The machining process of a face of a metal part, from the feature that made it and the face's geometry (in jig's
 * frame; the caller converts). A default, not a model of manufacturing: .finish() overrides it (design doc §6.4).
 */
export function inferProcess(featureType, f, ctx) {
  const ax = f.axis, plane = f.kind === 'plane', round = ['cylinder', 'cone', 'torus', 'sphere'].includes(f.kind);
  switch (featureType) {
    case 'revolve':
      if (round && ax) return { process: 'turned', axis: ax.dir, center: ax.origin };
      if (plane && f.normal) return { process: 'faced', axis: f.normal, center: f.center };
      return {};
    case 'hole':
      return round && ax ? { process: 'ground', axis: ax.dir, center: ax.origin } : { process: 'milled' };
    case 'extrude': case 'emboss': case 'rib':
      if (round && ax) return ctx.concave ? { process: 'ground', axis: ax.dir, center: ax.origin } : { process: 'milled', axis: ax.dir, center: ax.origin };
      if (plane && f.normal && ctx.direction) {
        const along = Math.abs(f.normal[0] * ctx.direction[0] + f.normal[1] * ctx.direction[1] + f.normal[2] * ctx.direction[2]) > 0.99;
        return along ? { process: 'milled', axis: f.normal, center: f.center } : { process: 'milled', direction: ctx.direction };
      }
      return { process: 'milled' };
    case 'add':
      // a primitive unioned or cut in (.add(j.cyl(…)), j.cone, j.box …): round faces as on a lathe about their own
      // axis (a bore ground), flat faces across a round face of the same primitive faced, other flats face-milled
      if (round && ax) return ctx.concave ? { process: 'ground', axis: ax.dir, center: ax.origin } : { process: 'turned', axis: ax.dir, center: ax.origin };
      if (plane && f.normal && ctx.lathe) return { process: 'faced', axis: ctx.lathe.dir, center: ctx.lathe.origin };
      if (plane && f.normal) return { process: 'milled', axis: f.normal, center: f.center };
      return { process: 'milled' };
    case 'fillet': case 'chamfer': case 'draft': case 'shell': case 'sweep': case 'loft':
      return { process: 'milled' };
    default:
      return {};
  }
}

const featureTypes = (graph) => {
  const m = new Map();
  for (const n of graph?.nodes ?? []) if (n.kind && n.kind !== 'sketch') m.set(n.id, n.kind);
  return m;
};

/** the body's faces as package face records: ids, meta (kind, axis, feature, process …) in Candela's frame */
function faceRecords(body, m, part, appearance, types, multi, ov) {
  const partName = part.name, display = part.part?.meta?.color ?? null;
  const faces = faceMeta(body);
  const byName = new Map(faces.map((f) => [f.name, f]));
  const typeOf = (id) => types.get(multi ? `${partName}:${id}` : id) ?? types.get(id) ?? null;
  // the round faces of each feature (copy by copy): a flat face across one of their axes is faced about it
  const rounds = new Map();
  for (const f of faces) {
    if (!f.axis || !['cylinder', 'cone'].includes(f.kind)) continue;
    const src = sourceOf(f.name), k = src.prefix + src.fid;
    if (!rounds.has(k)) rounds.set(k, []);
    rounds.get(k).push(f.axis);
  }
  const across = (k, n) => (rounds.get(k) ?? []).find((a) => Math.abs(a.dir[0] * n[0] + a.dir[1] * n[1] + a.dir[2] * n[2]) > 0.99) ?? null;
  return faces.map((f) => {
    const src = sourceOf(f.name), fid = src.fid, featureType = typeOf(fid);
    const meta = { kind: f.kind, feature: fid, featureType };
    if (src.copy) meta.copy = src.copy;
    if (f.normal) meta.normal = R(f.normal);
    if (f.center) meta.center = pt(f.center);
    if (f.axis) { meta.axis = R(f.axis.dir); meta.axisOrigin = pt(f.axis.origin); meta.radius = f.axis.radius * S; }
    if (appearance.metal) {
      const end = byName.get(`${src.prefix}${fid}/end`) ?? byName.get(`${src.prefix}${fid}/start`);
      const ctx = { concave: f.axis && (f.kind === 'cylinder' || f.kind === 'cone') ? concave(m, f.index, f.axis) : false, direction: end?.normal ?? null,
        lathe: f.kind === 'plane' && f.normal ? across(src.prefix + fid, f.normal) : null };
      const p = inferProcess(featureType, f, ctx);
      if (p.process) meta.process = p.process;
      if (p.axis) meta.axis = R(p.axis);
      if (p.center) meta.center = pt(p.center);
      if (p.direction) meta.direction = R(p.direction);
    }
    Object.assign(meta, ov.finishes(body, f.name) ?? {});
    settleColor(meta, ov.colors(body, f.name) ?? display, appearance.metal);
    return { id: f.name, meta };
  });
}

function boxCorners(bb) { return [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => [bb[i][0], bb[j][1], bb[k][2]]))); }
function grow(B, p) { for (let a = 0; a < 3; a++) { B[0][a] = Math.min(B[0][a], p[a]); B[1][a] = Math.max(B[1][a], p[a]); } }

// A study's poses as the package carries them: the drive values of the rows it reached (in the drive's unit, 'deg'
// or 'mm') and, per component, its transform at each of them in Candela's frame (float32, 16 per row, column-major).
// The engine keeps every study's poses on the worker side (assembly.js poseTrack); the package takes the ones `which`
// names (true: all, false: none, a name or a list). A component the study does not move, at its placement in every
// row, is left out: the bridge leaves it where the package puts it.
function studiesOf(prog, components, which) {   // components: id → its placement (jig's frame)
  const all = prog.studyPoses?.() ?? {};
  const names = which === false ? [] : which == null || which === true ? Object.keys(all) : [which].flat();
  for (const n of names) if (!all[n]) throw new Error(`candela export: no study '${n}'${Object.keys(all).length ? `; studies: ${Object.keys(all).join(', ')}` : ' (an assembly\'s .study() makes one)'}`);
  const out = {};
  for (const n of names) {
    const st = all[n], rows = st.x.length, poses = {};
    for (const [id, A] of Object.entries(st.T)) {
      const T = components.get(id);
      if (!T || !moves(A, T)) continue;
      const P = new Float32Array(16 * rows);
      for (let r = 0; r < rows; r++) P.set(toCandelaMatrix(A.subarray(16 * r, 16 * r + 16)), 16 * r);
      poses[id] = P;
    }
    out[n] = { drive: st.drive, unit: st.unit, from: st.from, to: st.to, x: Array.from(st.x), poses };
  }
  return out;
}
const moves = (A, T) => { for (let i = 0; i < A.length; i++) if (Math.abs(A[i] - T[i % 16]) > 1e-9) return true; return false; };

// ---- between compiles: the render tessellation per body, and a content key per package body ----
// A compile hands back the very Body objects of the features the feature cache kept (compile.js featureCache: a hit
// returns the cached state; gc() keeps their shapes), so a Body is the key of its render-quality tessellation, and an
// edit that leaves a part alone does not mesh it again. The cache is this module's, not the body's _mesh, which
// holds the stage's coarser mesh (meshBody's cache: false keeps it). A body the cache dropped comes back as a new
// object, is meshed again, and hashes the same.
const RENDER_MESHES = new WeakMap();   // Body → its mesh at render quality
const MESH_HASHES = new WeakMap();     // a mesh → the hash of its arrays
/** counters, for tests and measurements: bodies meshed at render quality, and meshes reused from an earlier export */
export const cadStats = { meshed: 0, reused: 0 };
function meshOf(b, quality) {
  if (quality !== 'render') return meshBody(b);   // the stage's own, cached on the body
  let m = RENDER_MESHES.get(b);
  if (m) { cadStats.reused++; return m; }
  m = meshBody(b, { angular: 0.1, cache: false });
  RENDER_MESHES.set(b, m); cadStats.meshed++;
  return m;
}
// a 64-bit content hash (two 32-bit lanes, FNV-1a and a multiply–xorshift) of typed arrays read as 32-bit words
function hashArrays(list) {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (const a of list) {
    const u = new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2);
    h1 = Math.imul(h1 ^ u.length, 16777619); h2 = Math.imul(h2 ^ u.length, 0x5bd1e995); h2 ^= h2 >>> 15;
    for (let i = 0; i < u.length; i++) {
      const w = u[i];
      h1 = Math.imul(h1 ^ w, 16777619);
      h2 = Math.imul(h2 ^ w, 0x5bd1e995); h2 ^= h2 >>> 15;
    }
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
// A package body's content keys, for a renderer's cache of mesh definitions (the bridge's): meshKey names its
// triangles and the ids of its faces (bodies with the same one have the same triangles and the same face order, so
// they can share a BVH); key names all that the bridge's mesh definition holds: that, its id, its component and the
// component's look, and every face's meta (a finish, a colour). A body whose key a renderer holds needs nothing new.
function keysOf(m, id, component, look, faces) {
  let mh = MESH_HASHES.get(m);
  if (!mh) { mh = hashArrays([m.positions, m.normals, m.indices, m.triFace]); MESH_HASHES.set(m, mh); }
  const meshKey = 'm' + hashStr(`${CAD_PACKAGE_VERSION}|${mh}|${faces.map((f) => f.id).join('\u0000')}`);
  return { key: 'd' + hashStr(`${meshKey}|${id}|${component}|${JSON.stringify(look)}|${JSON.stringify(faces)}`), meshKey };
}

/**
 * The CAD package of a compiled program. quality 'render' tessellates at a finer angle than the stage (0.1 rad
 * instead of 0.3) so reflective bores do not show facets; 'preview' reuses the stage's meshes. studies: which of an
 * assembly's studies carry their poses (true, the default: all; false: none; a name or a list of names).
 */
export function cadPackage(prog, { quality = 'render', studies = true } = {}) {
  const P = prog.P, data = prog.data;
  if (!P?.parts) throw new Error('candela export: nothing compiled');
  const types = featureTypes(data.graph), multi = P.parts.length > 1;
  const placement = new Map((P.bodiesData ?? []).map((b) => [b.id, b.transform]));
  const components = new Map(), jigPlace = new Map(), bodies = [], diagnostics = [];
  const W = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  const asmFinishes = P.finishes ?? [];   // an assembly's .finish() calls, every level's (assembly.js)
  for (const p of P.parts) {
    const meta = p.part?.meta ?? {};
    const look = appearanceOf(meta.material), ov = partOverrides(p, diagnostics, asmFinishes.filter((f) => finishTargets(f.comp, [p.name]).length));
    for (const b of p.res.state.bodies) {
      const id = `${p.name}/${b.id}`;
      const T = placement.get(id) ?? K.IDENTITY;
      const m = meshOf(b, quality);
      if (!components.has(p.name)) {
        components.set(p.name, { id: p.name, parent: p.name.includes('/') ? p.name.slice(0, p.name.lastIndexOf('/')) : null,
          transform: toCandelaMatrix(T), material: meta.material?.name ?? null, color: meta.color ?? null, look: look.meta ?? {} });
        jigPlace.set(p.name, T);
      }
      const n = m.positions.length / 3, pos = new Float32Array(m.positions.length), nrm = new Float32Array(m.normals.length);
      for (let v = 0; v < n; v++) {
        const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
        pos[v * 3] = x * S; pos[v * 3 + 1] = z * S; pos[v * 3 + 2] = -y * S;
        nrm[v * 3] = m.normals[v * 3]; nrm[v * 3 + 1] = m.normals[v * 3 + 2]; nrm[v * 3 + 2] = -m.normals[v * 3 + 1];
      }
      const bb = b.bbox();
      if (bb) for (const c of boxCorners(bb)) grow(W, pt(K.matApply(T, c)));
      const faces = faceRecords(b, m, p, look, types, multi, ov);
      bodies.push({ id, component: p.name, ...keysOf(m, id, p.name, look.meta ?? {}, faces), transform: toCandelaMatrix(T), positions: pos, normals: nrm,
        indices: Uint32Array.from(m.indices), triFace: Uint32Array.from(m.triFace), faces });
    }
  }
  return {
    format: CAD_PACKAGE_FORMAT, version: CAD_PACKAGE_VERSION,
    source: { name: data.name, kind: data.kind, hash: data.hash },
    frame: { units: 'm', up: '+y', fromJig: 'p = 0.001 * (x, z, -y)' },
    bounds: Number.isFinite(W[0][0]) ? W : null,
    components: [...components.values()], bodies, studies: studiesOf(prog, jigPlace, studies), diagnostics,
    views: { axo: { yaw: 38, pitch: 27 }, front: { yaw: 0, pitch: 0 }, side: { yaw: -90, pitch: 0 }, plan: { yaw: 0, pitch: 90 } },
  };
}

const ARRAYS = ['positions', 'normals', 'indices', 'triFace'];
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const toB64 = typeof Buffer !== 'undefined' ? b64 : (a) => {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
/** the package as JSON text: typed arrays (meshes, study poses) as base64 of their little-endian bytes */
export function encodeCadPackage(pkg) {
  const bodies = pkg.bodies.map((b) => {
    const o = { ...b };
    for (const k of ARRAYS) o[k] = toB64(b[k]);
    return o;
  });
  const studies = Object.fromEntries(Object.entries(pkg.studies ?? {}).map(([k, st]) => [k,
    { ...st, poses: Object.fromEntries(Object.entries(st.poses).map(([id, a]) => [id, typeof a === 'string' ? a : toB64(a)])) }]));
  return JSON.stringify({ ...pkg, bodies, studies });
}
