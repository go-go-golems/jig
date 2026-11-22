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
