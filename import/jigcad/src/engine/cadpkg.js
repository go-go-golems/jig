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
//   cadPackage(prog, { quality: 'render' | 'preview' })  → the package, arrays as typed arrays (transferable)
//   encodeCadPackage(pkg)                               → JSON text, arrays as base64 (export('candela'))
import * as K from './kernel.js';
import { meshBody, faceMeta } from './mesh.js';

export const CAD_PACKAGE_FORMAT = 'jig-cad-package';
export const CAD_PACKAGE_VERSION = 1;

const S = 0.001;
const R = (v) => [v[0], v[2], -v[1]];
const pt = (p) => R(p).map((x) => x * S);
const C = [S, 0, 0, 0, 0, 0, -S, 0, 0, S, 0, 0, 0, 0, 0, 1];          // column-major
const Ci = [1 / S, 0, 0, 0, 0, 0, 1 / S, 0, 0, -1 / S, 0, 0, 0, 0, 0, 1];
function mul4(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
/** a jig transform (column-major, mm) in Candela's frame */
export const toCandelaMatrix = (T) => mul4(mul4(C, Array.from(T)), Ci).map(clean);
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
export function appearanceOf(mat, color) {
  const name = mat?.name ?? (typeof mat === 'string' ? mat : null);
  if (!name) return color ? { color } : {};
  const a = APPEARANCE[name] ?? { material: String(name).toLowerCase() };
  const { metal, ...meta } = a;
  // a metal's look comes from the metal; jig's display colour is the drawing's, not the part's
  if (!metal && color) meta.color = color;
  return { meta, metal: !!metal };
}

// the feature that made a face: its id is the persistent name's first segment ('body/side[s.big]' → 'body')
const featureOf = (name) => String(name).replace(/#[a-z0-9]+$/, '').split('/')[0];

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
function faceRecords(body, m, partName, appearance, types, multi) {
  const faces = faceMeta(body);
  const byName = new Map(faces.map((f) => [f.name, f]));
  return faces.map((f) => {
    const fid = featureOf(f.name), featureType = types.get(multi ? `${partName}:${fid}` : fid) ?? types.get(fid) ?? null;
    const meta = { kind: f.kind, feature: fid, featureType };
    if (f.normal) meta.normal = R(f.normal);
    if (f.center) meta.center = pt(f.center);
    if (f.axis) { meta.axis = R(f.axis.dir); meta.axisOrigin = pt(f.axis.origin); meta.radius = f.axis.radius * S; }
    if (appearance.metal) {
      const end = byName.get(`${fid}/end`) ?? byName.get(`${fid}/start`);
      const ctx = { concave: f.axis && (f.kind === 'cylinder' || f.kind === 'cone') ? concave(m, f.index, f.axis) : false, direction: end?.normal ?? null };
      const p = inferProcess(featureType, f, ctx);
      if (p.process) meta.process = p.process;
      if (p.axis) meta.axis = R(p.axis);
      if (p.center) meta.center = pt(p.center);
      if (p.direction) meta.direction = R(p.direction);
    }
    return { id: f.name, meta };
  });
}

function boxCorners(bb) { return [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => [bb[i][0], bb[j][1], bb[k][2]]))); }
function grow(B, p) { for (let a = 0; a < 3; a++) { B[0][a] = Math.min(B[0][a], p[a]); B[1][a] = Math.max(B[1][a], p[a]); } }

/**
 * The CAD package of a compiled program. quality 'render' tessellates at a finer angle than the stage (0.1 rad
 * instead of 0.3) so reflective bores do not show facets; 'preview' reuses the stage's meshes.
 */
export function cadPackage(prog, { quality = 'render' } = {}) {
  const P = prog.P, data = prog.data;
  if (!P?.parts) throw new Error('candela export: nothing compiled');
  const types = featureTypes(data.graph), multi = P.parts.length > 1;
  const placement = new Map((P.bodiesData ?? []).map((b) => [b.id, b.transform]));
  const components = new Map(), bodies = [];
  const W = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const p of P.parts) {
    const meta = p.part?.meta ?? {};
    const look = appearanceOf(meta.material, meta.color ?? null);
    for (const b of p.res.state.bodies) {
      const id = `${p.name}/${b.id}`;
      const T = placement.get(id) ?? K.IDENTITY;
      const m = meshBody(b, quality === 'render' ? { angular: 0.1, cache: false } : {});
      if (!components.has(p.name)) {
        components.set(p.name, { id: p.name, parent: p.name.includes('/') ? p.name.slice(0, p.name.lastIndexOf('/')) : null,
          transform: toCandelaMatrix(T), material: meta.material?.name ?? null, color: meta.color ?? null, look: look.meta ?? {} });
      }
      const n = m.positions.length / 3, pos = new Float32Array(m.positions.length), nrm = new Float32Array(m.normals.length);
      for (let v = 0; v < n; v++) {
        const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
        pos[v * 3] = x * S; pos[v * 3 + 1] = z * S; pos[v * 3 + 2] = -y * S;
        nrm[v * 3] = m.normals[v * 3]; nrm[v * 3 + 1] = m.normals[v * 3 + 2]; nrm[v * 3 + 2] = -m.normals[v * 3 + 1];
      }
      const bb = b.bbox();
      if (bb) for (const c of boxCorners(bb)) grow(W, pt(K.matApply(T, c)));
      bodies.push({ id, component: p.name, transform: toCandelaMatrix(T), positions: pos, normals: nrm,
        indices: Uint32Array.from(m.indices), triFace: Uint32Array.from(m.triFace), faces: faceRecords(b, m, p.name, look, types, multi) });
    }
  }
  return {
    format: CAD_PACKAGE_FORMAT, version: CAD_PACKAGE_VERSION,
    source: { name: data.name, kind: data.kind, hash: data.hash },
    frame: { units: 'm', up: '+y', fromJig: 'p = 0.001 * (x, z, -y)' },
    bounds: Number.isFinite(W[0][0]) ? W : null,
    components: [...components.values()], bodies, studies: {},
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
/** the package as JSON text: typed arrays as base64 of their little-endian bytes */
export function encodeCadPackage(pkg) {
  const bodies = pkg.bodies.map((b) => {
    const o = { ...b };
    for (const k of ARRAYS) o[k] = toB64(b[k]);
    return o;
  });
  return JSON.stringify({ ...pkg, bodies });
}
