// jig-candela.js: the bridge from jig to Candela (JIG-016, design doc §6.2), written as a Candela library module.
//
// It is not part of jig's own bundle: the Render view hands its source to Candela's build as the file
// 'jig-candela.js', next to the look file, so the same bytes run in the browser and in candela-rt's V8. It only
// imports 'candela' and reads a CAD package (src/engine/cadpkg.js: bodies, faces with persistent names, components,
// in Candela's frame). Arrays may be typed arrays (the page) or base64 strings (a package read from JSON).
//
//   import { jigScene } from 'jig-candela';
//   import { program } from 'jig-program';          // the open program's package (the Render view provides it)
//   const asm = jigScene(program, { autoFinish: true })
//     .face(['rod#body/side[s.big]', 'rod#body/side[s.small]'], finish.ground({ metal: 'bearing-steel' }))  // the pin bores
//     .material('crank', finish.blackOxide({ process: 'milled' }));             // every face of a component
//   export default scene().add(asm).camera(camera.thinLens().at(asm.view('axo').at).target(asm.center()));
//
// Addresses: 'comp' | 'comp#face' | '#face' (a single-part model), with * globs in either half, a list of them, or a
// predicate f({ component, id, meta }) such as f => f.meta.featureType === 'hole'. The node id of a
// component's group is its jig id ('sub/slider'), so poses and picks use jig's names. The result is immutable, like
// every Candela builder: .face() and .material() return a new group.
//
// Motion: an assembly's studies come in the package with a pose per row for every component they move.
//   asm.studies()                       → [{ name, drive, unit, from, to, rows, wraps, components }]
//   asm.posesAt('cycle', 30)            → { crank: [16 numbers], rod: […], slider: […] }   (x in the study's unit,
//                                           'deg' or 'mm', or a quantity: u.deg(30))
//   export const animation = asm.animate('cycle', { duration: 2 });     // one crank turn in 2 s
// Between rows, positions interpolate linearly and rotations by quaternion (the shorter arc, renormalised). Outside
// its range a study of whole turns of a revolute drive (0° to 360°) wraps; any other holds its first or last row.
// Poses are world matrices in the package's frame: they place each component where jigScene() puts the model, at the
// origin (a pose replaces the transforms above its node: a model moved as a whole would jump back).
import { scene, shape, mesh, finish } from 'candela';

const FORMAT = 'jig-cad-package';
const ARRAYS = { positions: Float32Array, normals: Float32Array, indices: Uint32Array, triFace: Uint32Array };

function decode(v, T) {
  if (typeof v !== 'string') return v;
  const s = atob(v), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new T(u.buffer);
}

// mesh definitions (and their BVHs) outlive one build: a page rebuilding the same package reuses them
const DEFS = (globalThis.__jigCandelaDefs ??= new WeakMap());

function defOf(body, comp) {
  let d = DEFS.get(body);
  if (d) return d;
  const A = {};
  for (const [k, T] of Object.entries(ARRAYS)) A[k] = decode(body[k], T);
  d = mesh.fromArrays({
    name: body.id, positions: A.positions, normals: A.normals, indices: A.indices, faceIds: A.triFace,
    faces: body.faces.map((f) => ({ id: f.id, meta: f.meta })),
    meta: Object.assign({ component: body.component }, comp.look || {}),
  });
  DEFS.set(body, d);
  return d;
}

// a rigid column-major 4×4 as Candela's placement: at(t), then rotations whose product is Rz·Ry·Rx
function place(node, M) {
  if (!M) return node;
  const r = (i, j) => M[j * 4 + i];
  const t = [M[12], M[13], M[14]];
  let x, y, z;
  const sy = -r(2, 0);
  if (Math.abs(sy) < 0.999999) { y = Math.asin(sy); x = Math.atan2(r(2, 1), r(2, 2)); z = Math.atan2(r(1, 0), r(0, 0)); }
  else { y = sy > 0 ? Math.PI / 2 : -Math.PI / 2; x = Math.atan2(-r(1, 2), r(1, 1)); z = 0; }
  let n = node;
  if (t[0] || t[1] || t[2]) n = n.at(t[0], t[1], t[2]);
  if (x) n = n.rotateX(x);
  if (y) n = n.rotateY(y);
  if (z) n = n.rotateZ(z);
  return n;
}

const isIdentity = (M) => !M || M.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-12);
function inv(M) {   // a rigid transform: Rᵀ, −Rᵀt
  const o = new Array(16).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[j * 4 + i] = M[i * 4 + j];
  for (let i = 0; i < 3; i++) o[12 + i] = -(o[i] * M[12] + o[4 + i] * M[13] + o[8 + i] * M[14]);
  o[15] = 1;
  return o;
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}

const globRe = (s) => new RegExp('^' + String(s).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const matcher = (s) => (s == null || s === '' || s === '*' ? () => true : s instanceof RegExp ? (x) => s.test(x) : String(s).includes('*') ? ((re) => (x) => re.test(x))(globRe(s)) : (x) => x === String(s));

/** an address 'comp#face', a list of them, or a predicate over { component, id, meta } → { comp, face | pred } */
function parse(sel) {
  if (typeof sel === 'function') return { comp: () => true, face: null, pred: sel };
  if (Array.isArray(sel)) {
    const ps = sel.map(parse);
    return { comp: (c) => ps.some((q) => q.comp(c)), face: null, pred: (f) => ps.some((q) => q.comp(f.component) && (q.pred ? q.pred(f) : q.face(f.id))) };
  }
  const s = String(sel), k = s.indexOf('#');
  if (k < 0) return { comp: matcher(s), face: () => true };
  return { comp: matcher(k === 0 ? '*' : s.slice(0, k)), face: matcher(s.slice(k + 1)) };
}

function didYouMean(word, list) {
  const d = (a, b) => { const m = a.length, n = b.length, D = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) D[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return D[m][n]; };
  return list.map((x) => [x, d(word, x)]).sort((a, b) => a[1] - b[1]).slice(0, 3).map((x) => x[0]);
}

// jig's stage views (camera.js: c = (cos p·sin y, −cos p·cos y, sin p) points from the model toward the viewer, in
// jig's axes) as perspective cameras in Candela's axes, framing the model's bounding sphere
const DEG = Math.PI / 180;
function viewOf(pkg, name, o = {}) {
  const v = (pkg.views || {})[name];
  if (!v) throw new Error(`jigScene().view('${name}'): views are ${Object.keys(pkg.views || {}).join(', ')}`);
  const yaw = v.yaw * DEG, pitch = v.pitch * DEG, cp = Math.cos(pitch);
  const cj = [cp * Math.sin(yaw), -cp * Math.cos(yaw), Math.sin(pitch)], c = [cj[0], cj[2], -cj[1]];
  const B = pkg.bounds || [[-0.05, -0.05, -0.05], [0.05, 0.05, 0.05]];
  const target = [0, 1, 2].map((a) => (B[0][a] + B[1][a]) / 2);
  const r = Math.hypot(B[1][0] - B[0][0], B[1][1] - B[0][1], B[1][2] - B[0][2]) / 2 || 0.05;
  const focal = o.focal || 0.1, sensor = 0.036, fov = 2 * Math.atan(sensor / 2 / focal);
  const d = (r * (o.margin || 1.1)) / Math.sin(fov / 2);
  // straight down (plan) needs a nudge: a camera looking along −Y with Y up has no horizon
  const cc = Math.abs(c[1]) > 0.9999 ? [0, c[1], 1e-4] : c;
  return { at: target.map((x, a) => x + cc[a] * d), target, focal, fov };
}

// ---- study poses: decoded on first use (base64 from a file, typed arrays from the page), kept per study ----
const POSES = (globalThis.__jigCandelaPoses ??= new WeakMap());
const TURN = 360;
/** does the study wrap outside its range: a revolute drive over a whole number of turns */
const wraps = (st) => { const span = Math.abs((st.to ?? 0) - (st.from ?? 0)); return st.unit === 'deg' && span > 1e-6 && Math.abs(span / TURN - Math.round(span / TURN)) < 1e-9; };
// a rotation matrix (column-major 4×4) as a unit quaternion [x, y, z, w] (Shepperd)
function quat(M, o) {
  const m00 = M[o], m10 = M[o + 1], m20 = M[o + 2], m01 = M[o + 4], m11 = M[o + 5], m21 = M[o + 6], m02 = M[o + 8], m12 = M[o + 9], m22 = M[o + 10];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / k, (m02 - m20) / k, (m10 - m01) / k, k / 4]; }
  else if (m00 > m11 && m00 > m22) { const k = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [k / 4, (m01 + m10) / k, (m02 + m20) / k, (m21 - m12) / k]; }
  else if (m11 > m22) { const k = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / k, k / 4, (m12 + m21) / k, (m02 - m20) / k]; }
  else { const k = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / k, (m12 + m21) / k, k / 4, (m10 - m01) / k]; }
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / l);
}
function decoded(st) {
  let d = POSES.get(st);
  if (d) return d;
  d = { x: Array.from(st.x || []), M: {}, Q: {} };
  for (const [id, a] of Object.entries(st.poses || {})) d.M[id] = decode(a, Float32Array);
  POSES.set(st, d);
  return d;
}
const quats = (d, id) => {
  if (d.Q[id]) return d.Q[id];
  const M = d.M[id], n = M.length / 16, Q = new Float64Array(4 * n);
  for (let r = 0; r < n; r++) Q.set(quat(M, 16 * r), 4 * r);
  return (d.Q[id] = Q);
};
/** the row before x and how far toward the next one: [i, f], x wrapped or clamped into the rows the study reached */
function segment(st, X, x) {
  const n = X.length;
  if (wraps(st)) {
    const lo = Math.min(st.from, st.to), span = Math.abs(st.to - st.from);
    if (x < lo || x > lo + span) x = lo + (((x - lo) % span) + span) % span;
  }
  if (n === 1) return [0, 0];
  const up = X[n - 1] >= X[0], a0 = up ? X[0] : X[n - 1], b0 = up ? X[n - 1] : X[0];
  x = Math.min(b0, Math.max(a0, x));
  let a = 0, b = n - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (up ? X[m] <= x : X[m] >= x) a = m; else b = m; }
  const f = X[b] === X[a] ? 0 : (x - X[a]) / (X[b] - X[a]);
  return [a, Math.min(1, Math.max(0, f))];
}
const poseRow = (M, r) => Array.from(M.subarray(16 * r, 16 * r + 16));
function between(d, id, i, f) {
  const M = d.M[id];
  if (f < 1e-9) return poseRow(M, i);
  if (f > 1 - 1e-9) return poseRow(M, i + 1);
  const Q = quats(d, id), a = 16 * i, b = a + 16;
  const qa = Q.subarray(4 * i, 4 * i + 4), qb = Q.subarray(4 * i + 4, 4 * i + 8);
  const s = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0 ? -1 : 1;
  let x = qa[0] + (s * qb[0] - qa[0]) * f, y = qa[1] + (s * qb[1] - qa[1]) * f, z = qa[2] + (s * qb[2] - qa[2]) * f, w = qa[3] + (s * qb[3] - qa[3]) * f;
  const l = Math.hypot(x, y, z, w) || 1;
  x /= l; y /= l; z /= l; w /= l;
  const t = [0, 1, 2].map((k) => M[a + 12 + k] + (M[b + 12 + k] - M[a + 12 + k]) * f);
  return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    t[0], t[1], t[2], 1];
}
// a drive value: a number in the study's unit, or a Candela quantity of the drive's kind (u.deg(30), u.mm(5)), whose
// own number is in radians or metres
function driveValue(s, x) {
  if (x && typeof x === 'object' && 'dim' in x) return s.unit === 'deg' && x.dim === 'angle' ? (x.v * 180) / Math.PI : s.unit === 'mm' && x.dim === 'length' ? x.v * 1000 : NaN;
  return typeof x === 'number' ? x : Number(x);
}
function studyOf(pkg, name, where) {
  const S = pkg.studies || {}, st = S[name];
  if (st) return st;
  const names = Object.keys(S);
  if (!names.length) throw new Error(`jigScene().${where}('${name}'): the package has no studies (an assembly's .study(name, { drive, from, to, steps }) makes one)`);
  throw new Error(`jigScene().${where}('${name}'): no study '${name}'; did you mean ${didYouMean(String(name), names).map((n) => `'${n}'`).join(', ')}?`);
}

function realize(st) {
  const comps = new Map(st.pkg.components.map((c) => [c.id, c]));
  const byComp = new Map();
  for (const b of st.pkg.bodies) {
    if (!byComp.has(b.component)) byComp.set(b.component, []);
    byComp.get(b.component).push(b);
  }
  const groups = [];
  for (const [cid, bodies] of byComp) {
    const comp = comps.get(cid) || { id: cid, transform: null, look: {} };
    const Tc = comp.transform || bodies[0].transform;
    const nodes = bodies.map((b) => {
      // each face's last word, in call order: an explicit material (.face/.material) or a metadata patch (.meta),
      // which autoFinish turns into a material (a later .meta() drops an earlier explicit material)
      const mats = new Map(), patches = new Map();
      for (const op of st.ops) {
        if (!op.comp(cid)) continue;
        for (const f of b.faces) {
          if (!(op.pred ? op.pred({ component: cid, id: f.id, meta: f.meta }) : op.face(f.id))) continue;
          if (op.patch) { patches.set(f.id, Object.assign(patches.get(f.id) || {}, op.patch)); mats.delete(f.id); }
          else mats.set(f.id, op.m);
        }
      }
      let n = shape.mesh(defOf(b, comp));
      const auto = st.o.autoFinish !== false;
      if (patches.size) n = n.autoFinish((meta, f) => (patches.has(f.id) ? finish.fromMetadata(Object.assign({}, meta, patches.get(f.id))) : auto ? finish.fromMetadata(meta) : null));
      else if (auto) n = n.autoFinish();
      const byMat = new Map();
      for (const [id, m] of mats) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(id); }
      for (const [m, ids] of byMat) n = n.face(ids, m);
      const rel = isIdentity(Tc) || isIdentity(b.transform) ? (isIdentity(b.transform) ? null : b.transform) : mul(inv(Tc), b.transform);
      return isIdentity(rel) ? n : place(n, rel);
    });
    groups.push(place(scene.group(nodes).id(cid), isIdentity(Tc) ? null : Tc));
  }
  return scene.group(groups).id(st.o.id || 'jig');
}

function jig(st) {
  let node = null;
  const api = {
    /** bind a material to faces: 'comp#face', 'comp#glob*', '#face', or a predicate f({ component, id, meta }) */
    face(sel, m) {
      const p = parse(sel), hits = api.faces(sel);
      if (!hits.length) {
        const names = st.pkg.bodies.flatMap((b) => b.faces.map((f) => `${b.component}#${f.id}`));
        throw new Error(`jigScene().face(${typeof sel === 'function' ? 'ƒ' : JSON.stringify(sel)}): no face matches; did you mean ${didYouMean(String(sel), names).join(', ')}?`);
      }
      return jig({ ...st, ops: st.ops.concat([{ ...p, m }]) });
    },
    /** patch the metadata faces are dressed from (autoFinish): { material, process, finish, color, roughness }.
     *  Unlike a material, it keeps what jig found (the axis a turned face's grooves run around). */
    meta(sel, patch) {
      if (!patch || typeof patch !== 'object') throw new Error(`jigScene().meta(${JSON.stringify(sel)}, patch): the patch is an object such as { material: 'brass' }`);
      if (!api.faces(sel).length) {
        const names = st.pkg.bodies.flatMap((b) => [b.component, ...b.faces.map((f) => `${b.component}#${f.id}`)]);
        throw new Error(`jigScene().meta(${typeof sel === 'function' ? 'ƒ' : JSON.stringify(sel)}): no face matches; did you mean ${didYouMean(String(sel), names).join(', ')}?`);
      }
      return jig({ ...st, ops: st.ops.concat([{ ...parse(sel), patch }]) });
    },
    /** a material for every face of the components an address names ('crank', 'sub/*') */
    material(comp, m) {
      if (!api.components(comp).length) throw new Error(`jigScene().material('${comp}'): no component; components: ${st.pkg.components.map((c) => c.id).join(', ')}`);
      return jig({ ...st, ops: st.ops.concat([{ comp: matcher(comp), face: () => true, m }]) });
    },
    /** the faces an address or predicate names: [{ component, body, id, meta }] */
    faces(sel) {
      const p = parse(sel), out = [];
      for (const b of st.pkg.bodies) {
        if (!p.comp(b.component)) continue;
        for (const f of b.faces) if (p.pred ? p.pred({ component: b.component, id: f.id, meta: f.meta }) : p.face(f.id)) out.push({ component: b.component, body: b.id, id: f.id, meta: f.meta });
      }
      return out;
    },
    components(sel = '*') { const t = matcher(sel); return st.pkg.components.filter((c) => t(c.id)).map((c) => c.id); },
    /** jig's named views (axo, front, side, plan) as a perspective camera: { at, target, focal, fov } */
    view(name = 'axo', o) { return viewOf(st.pkg, name, o); },
    center() { const B = st.pkg.bounds; return B ? [0, 1, 2].map((a) => (B[0][a] + B[1][a]) / 2) : [0, 0, 0]; },
    /** the package's studies: [{ name, drive, unit ('deg' | 'mm'), from, to, rows, wraps, components }] */
    studies() {
      return Object.entries(st.pkg.studies || {}).map(([name, s]) => ({ name, drive: s.drive, unit: s.unit, from: s.from ?? s.x[0], to: s.to ?? s.x[s.x.length - 1],
        rows: s.x.length, wraps: wraps(s), components: Object.keys(s.poses || {}) }));
    },
    /** every component the study moves, posed at drive value x (the study's unit): { id: 16-number column-major matrix } */
    posesAt(name, x) {
      const s = studyOf(st.pkg, name, 'posesAt'), v = driveValue(s, x);
      if (!Number.isFinite(v)) throw new Error(`jigScene().posesAt('${name}', ${x}): x is a value of the drive ${s.drive}, in ${s.unit}`);
      const d = decoded(s), out = {};
      if (!d.x.length) return out;
      const [i, f] = segment(s, d.x, v);
      for (const id of Object.keys(d.M)) out[id] = between(d, id, i, f);
      return out;
    },
    /** t (seconds) → poses: the drive from `from` to `to` (the study's range by default) in `duration` seconds, for
     *  export const animation = asm.animate('cycle', { duration: 2 }); past the end it wraps or holds as posesAt does */
    animate(name, o = {}) {
      const s = studyOf(st.pkg, name, 'animate'), duration = +o.duration;
      if (!(duration > 0)) throw new Error(`jigScene().animate('${name}', { duration }): the duration is in seconds, more than 0; got ${o.duration}`);
      const a = driveValue(s, o.from ?? s.from ?? s.x[0]), b = driveValue(s, o.to ?? s.to ?? s.x[s.x.length - 1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`jigScene().animate('${name}', { from, to }): values of the drive ${s.drive}, in ${s.unit}`);
      return (t) => api.posesAt(name, a + (b - a) * (t / duration));
    },
    bounds() { return st.pkg.bounds; },
    package: st.pkg,
  };
  // the group itself, for scene().add(…): Candela finds a builder by a symbol, which the realized group answers
  return new Proxy(api, {
    get(t, k) {
      if (typeof k === 'symbol' || !(k in t)) { node ??= realize(st); const v = node[k]; return typeof v === 'function' ? v.bind(node) : v; }
      return t[k];
    },
  });
}

/** a Candela group for a CAD package: one group per component (id = jig's component id), one mesh per body */
export function jigScene(pkg, o = {}) {
  if (!pkg || pkg.format !== FORMAT) throw new Error(`jigScene(package): expected a ${FORMAT} (jig's export('candela')), got ${pkg && pkg.format ? `'${pkg.format}'` : typeof pkg}`);
  if (pkg.version !== 1) throw new Error(`jigScene(package): version ${pkg.version} is newer than this bridge (1)`);
  return jig({ pkg, o, ops: [] });
}

export default jigScene;
