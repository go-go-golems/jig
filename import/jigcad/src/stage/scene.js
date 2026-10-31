// scene.js: what a ProgramData puts on the sheet. Bodies become instances (a mesh in world coordinates with its
// triangle normals, welded edge adjacency and its B-rep edge polylines), placed by their own transforms or, with the
// Bed overlay on a print job, by the plate items' transforms, plates side by side. Everything derived from a mesh is
// cached per mesh object, so a redraw only projects.
import { V, transformPoints, boxOfPoints, emptyBox, growBox, boxOk, applyM, IDENTITY, translateM, mulM } from './math.js';

const topoCache = new WeakMap();      // mesh → { weld, edges, triN }

// weld vertices by position (OpenCascade repeats a vertex for every face it bounds), then list mesh edges with the
// two triangles that share them (t1 = −1 on an open boundary), and each triangle's outward normal
export function meshTopology(mesh) {
  let t = topoCache.get(mesh);
  if (t) return t;
  const P = mesh.positions, I = mesh.indices, n = P.length / 3, nt = (I.length / 3) | 0, Nv = mesh.normals;
  const b = boxOfPoints(P), diag = boxOk(b) ? V.len(V.sub(b[1], b[0])) : 1, q = Math.max(1e-9, diag * 1e-6);
  const weld = new Int32Array(n), keys = new Map();
  let nw = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.round(P[3 * i] / q) + ',' + Math.round(P[3 * i + 1] / q) + ',' + Math.round(P[3 * i + 2] / q);
    let w = keys.get(k);
    if (w === undefined) { w = nw++; keys.set(k, w); }
    weld[i] = w;
  }
  const triN = new Float32Array(nt * 3);
  for (let f = 0; f < nt; f++) {
    const a = I[3 * f] * 3, bb = I[3 * f + 1] * 3, c = I[3 * f + 2] * 3;
    const ux = P[bb] - P[a], uy = P[bb + 1] - P[a + 1], uz = P[bb + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (Nv && Nv.length === P.length) {        // trust the vertex normals for which side is out
      const sx = Nv[a] + Nv[bb] + Nv[c], sy = Nv[a + 1] + Nv[bb + 1] + Nv[c + 1], sz = Nv[a + 2] + Nv[bb + 2] + Nv[c + 2];
      if (nx * sx + ny * sy + nz * sz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    }
    triN[3 * f] = nx; triN[3 * f + 1] = ny; triN[3 * f + 2] = nz;
  }
  const emap = new Map(), ea = [], eb = [], t0 = [], t1 = [];
  for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) {
    const i = I[3 * f + k], j = I[3 * f + (k + 1) % 3], wi = weld[i], wj = weld[j];
    if (wi === wj) continue;
    const key = wi < wj ? wi * nw + wj : wj * nw + wi;
    const e = emap.get(key);
    if (e === undefined) { emap.set(key, ea.length); ea.push(i); eb.push(j); t0.push(f); t1.push(-1); }
    else if (t1[e] < 0) t1[e] = f;
  }
  t = { weld, nw, triN, ea: Int32Array.from(ea), eb: Int32Array.from(eb), t0: Int32Array.from(t0), t1: Int32Array.from(t1) };
  topoCache.set(mesh, t);
  return t;
}

// how smoothly each pair of B-rep faces meets: the smallest cosine between the two faces' vertex normals at the mesh
// vertices they share (OpenCascade gives each face its own copy of a boundary vertex, with that face's normal).
// key: lo * 2^20 + hi over face indices; cached on the topology
export const pairKey = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
export function facePairDots(mesh) {
  const t = meshTopology(mesh);
  if (t.pairDot) return t.pairDot;
  const TF = mesh.triFace, Nv = mesh.normals, I = mesh.indices, m = new Map();
  if (TF && Nv && Nv.length === mesh.positions.length) {
    for (let e = 0; e < t.ea.length; e++) {
      const t0 = t.t0[e], t1 = t.t1[e];
      if (t1 < 0) continue;
      const f0 = TF[t0], f1 = TF[t1];
      if (f0 === f1) continue;
      const key = pairKey(f0, f1);
      for (const v0 of [t.ea[e], t.eb[e]]) {
        const w = t.weld[v0];
        let v1 = -1;
        for (let k = 0; k < 3; k++) { const v = I[3 * t1 + k]; if (t.weld[v] === w) v1 = v; }
        if (v1 < 0 || v1 === v0) continue;
        const ax = Nv[3 * v0], ay = Nv[3 * v0 + 1], az = Nv[3 * v0 + 2], bx = Nv[3 * v1], by = Nv[3 * v1 + 1], bz = Nv[3 * v1 + 2];
        const d = (ax * bx + ay * by + az * bz) / ((Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)) || 1);
        const prev = m.get(key);
        if (prev === undefined || d < prev) m.set(key, d);
      }
    }
  }
  t.pairDot = m;
  return m;
}

// signed volume by the divergence theorem (mm³)
export function meshVolume(mesh) {
  const P = mesh.positions, I = mesh.indices; let v = 0;
  for (let f = 0; f < I.length; f += 3) {
    const a = I[f] * 3, b = I[f + 1] * 3, c = I[f + 2] * 3;
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return Math.abs(v / 6);
}

const instCache = new WeakMap();      // body → Map(transform key → world data)
function worldData(body, M) {
  let m = instCache.get(body); if (!m) instCache.set(body, m = new Map());
  const key = M ? M.map(x => +x.toFixed(6)).join(',') : 'I';
  let d = m.get(key);
  if (d) return d;
  const mesh = body.mesh, topo = meshTopology(mesh);
  const P = transformPoints(M, mesh.positions);
  const N = new Float32Array(topo.triN.length);
  for (let i = 0; i < N.length; i += 3) {
    const n = M ? [M[0] * topo.triN[i] + M[4] * topo.triN[i + 1] + M[8] * topo.triN[i + 2], M[1] * topo.triN[i] + M[5] * topo.triN[i + 1] + M[9] * topo.triN[i + 2], M[2] * topo.triN[i] + M[6] * topo.triN[i + 1] + M[10] * topo.triN[i + 2]] : [topo.triN[i], topo.triN[i + 1], topo.triN[i + 2]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; N[i] = n[0] / l; N[i + 1] = n[1] / l; N[i + 2] = n[2] / l;
  }
  const E = (body.edges || []).map(e => transformPoints(M, e.points instanceof Float32Array ? e.points : Float32Array.from(e.points || [])));
  d = { P, N, E, box: exactBox(body, M) || boxOfPoints(P), topo };
  m.set(key, d);
  if (m.size > 24) m.delete(m.keys().next().value);
  return d;
}

// the body's B-rep box (exact, where the mesh's falls short of a curved face) in the world, when its transform only
// permutes, flips and moves the axes; null otherwise (the mesh's box is used)
function exactBox(body, M) {
  const b = body.bbox;
  if (!Array.isArray(b) || b.length !== 2 || !b[0] || !b[1] || ![...b[0], ...b[1]].every(Number.isFinite)) return null;
  if (M) for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) { const v = Math.abs(M[i]); if (v > 1e-9 && Math.abs(v - 1) > 1e-9) return null; }
  const out = emptyBox();
  for (let c = 0; c < 8; c++) growBox(out, applyM(M, [b[c & 1][0], b[(c >> 1) & 1][1], b[(c >> 2) & 1][2]]));
  return out;
}

const hasMesh = b => b && b.mesh && b.mesh.positions && b.mesh.positions.length >= 9 && b.mesh.indices && b.mesh.indices.length >= 3;

// the bed's placement: corner origin ([0, bx] × [0, by]) unless the plate items sit around the origin
function bedFrame(print, items) {
  const [bx, by, bz] = print.printer && print.printer.bed || [250, 210, 220];
  const b = emptyBox();
  for (const it of items) if (it.box) { growBox(b, it.box[0]); growBox(b, it.box[1]); }
  const centred = boxOk(b) && (b[0][0] < -0.5 || b[0][1] < -0.5);
  return centred ? { x0: -bx / 2, y0: -by / 2, x1: bx / 2, y1: by / 2, h: bz } : { x0: 0, y0: 0, x1: bx, y1: by, h: bz };
}

// sceneOf(program, { bed, bedBox, plates }) → { instances, faceBase, faceCount, box, fitBox (what the camera fits), floorZ, bed, volume }
export function sceneOf(program, o = {}) {
  const bodies = (program && program.bodies || []).filter(hasMesh);
  const byId = new Map(bodies.map((b, i) => [b.id, i]));
  const print = program && program.print;
  const plates = print && print.plates && print.plates.length ? (o.plates ? print.plates.slice(0, o.plates) : print.plates) : null;
  const instances = [];
  let bed = null;
  if (o.bed && print && plates) {
    // plate items, plates laid side by side along X with a quarter of a bed between them
    const raw = [];
    for (const pl of plates) for (const it of pl.items || []) {
      const bi = byId.get(it.body);
      if (bi === undefined) continue;
      const M = it.transform || bodies[bi].transform || IDENTITY;
      raw.push({ pl, bi, M, box: worldData(bodies[bi], M).box });
    }
    bed = bedFrame(print, raw);
    const gap = (bed.x1 - bed.x0) * 1.25;
    bed.plates = plates.map((pl, k) => ({ index: pl.index ?? k + 1, ox: k * gap }));
    for (const r of raw) {
      const k = plates.indexOf(r.pl), M = k ? mulM(translateM(k * gap, 0, 0), r.M) : r.M;
      instances.push({ body: bodies[r.bi], bi: r.bi, M, plate: plates[k].index ?? k + 1 });
    }
    bed.printer = print.printer || null;
  } else {
    bodies.forEach((b, bi) => instances.push({ body: b, bi, M: b.transform || null, plate: null }));
  }
  let base = 0;
  const box = emptyBox();
  const all = (program && program.bodies) || [];
  for (const inst of instances) {
    inst.pi = all.indexOf(inst.body);           // the body's index in program.bodies (the host's selections use it)
    Object.assign(inst, worldData(inst.body, inst.M));
    inst.base = base; base += Math.max(inst.body.faces ? inst.body.faces.length : 0, maxFace(inst.body) + 1);
    growBox(box, inst.box[0]); growBox(box, inst.box[1]);
  }
  const faceInst = new Int32Array(base);
  instances.forEach((inst, k) => { for (let f = inst.base; f < (instances[k + 1] ? instances[k + 1].base : base); f++) faceInst[f] = k; });
  // the camera fits the items with a margin around them (a fifth of their size, at least 15 mm), so a small part
  // reads at its own size; the bed is drawn around it and may run off the sheet. Without items, the bed.
  let fitBox = null;
  if (bed && o.bedBox !== false) {
    const last = bed.plates[bed.plates.length - 1].ox;
    if (boxOk(box)) {
      // the margin stops at the bed's edge (and its band), so items that fill the bed fit the bed
      const m = Math.max(15, 0.2 * Math.max(box[1][0] - box[0][0], box[1][1] - box[0][1]));
      const band = Math.min(10, Math.max(3, (bed.x1 - bed.x0) * 0.025)), bx1 = bed.x1 + last;
      const lo = (v, edge) => Math.min(v, Math.max(v - m, edge - band)), hi = (v, edge) => Math.max(v, Math.min(v + m, edge + band));
      fitBox = [[lo(box[0][0], bed.x0), lo(box[0][1], bed.y0), 0], [hi(box[1][0], bx1), hi(box[1][1], bed.y1), Math.max(box[1][2], 0)]];
    }
    growBox(box, [bed.x0, bed.y0, 0]); growBox(box, [bed.x1 + last, bed.y1, 0]);
    if (!fitBox) fitBox = box;
  }
  // sketches with no bodies still need a box: their plane points
  if (!boxOk(box) && program && program.sketches) for (const sk of program.sketches) for (const p of sketchPoints(sk)) growBox(box, p);
  const floorZ = bed ? 0 : boxOk(box) ? box[0][2] : 0;
  return { program, instances, faceInst, faceCount: base, box, fitBox: fitBox || box, floorZ, bed, bodies };
}
function maxFace(body) {
  const tf = body.mesh.triFace; let m = -1;
  if (tf) for (let i = 0; i < tf.length; i++) if (tf[i] > m) m = tf[i];
  return m;
}

// a sketch's entity points in the world (for boxes and fitting)
export function sketchToWorld(sk) {
  const pl = sk.plane || {}, o = pl.origin || [0, 0, 0], x = pl.x || [1, 0, 0], y = pl.y || [0, 1, 0];
  return (p) => [o[0] + x[0] * p[0] + y[0] * p[1], o[1] + x[1] * p[0] + y[1] * p[1], o[2] + x[2] * p[0] + y[2] * p[1]];
}
export function sketch2DPoints(sk) {
  const out = [];
  for (const e of sk.entities || []) {
    for (const k of ['p', 'a', 'b', 'c']) if (Array.isArray(e[k])) out.push(e[k]);
    if (Array.isArray(e.pts)) for (const p of e.pts) out.push(p);
    if ((e.kind === 'circle' || e.kind === 'arc') && e.c && e.r) { out.push([e.c[0] - e.r, e.c[1] - e.r]); out.push([e.c[0] + e.r, e.c[1] + e.r]); }
  }
  for (const pr of sk.profiles || []) for (const l of pr.loops || []) for (const p of l) out.push(p);
  return out;
}
export function sketchPoints(sk) { const w = sketchToWorld(sk); return sketch2DPoints(sk).map(w); }

// summary facts for the title block
export function sceneFacts(scene) {
  const b = scene.box, size = boxOk(b) ? V.sub(b[1], b[0]) : null;
  let volume = null;
  const p = scene.program;
  if (p && p.metrics && p.metrics.volume && isFinite(p.metrics.volume.value)) volume = p.metrics.volume.value;
  else if (p && p.summary && isFinite(p.summary.volume)) volume = p.summary.volume;
  else if (scene.bodies.length) volume = scene.bodies.reduce((s, bd) => s + meshVolume(bd.mesh), 0);
  const faces = scene.bodies.reduce((s, bd) => s + (bd.faces ? bd.faces.length : 0), 0);
  const edges = scene.bodies.reduce((s, bd) => s + (bd.edges ? bd.edges.filter(e => !isSeam(e)).length : 0), 0);
  const tris = scene.bodies.reduce((s, bd) => s + bd.mesh.indices.length / 3, 0);
  return { size, volume, faces, edges, tris, bodies: scene.bodies.length };
}
export const isSeam = e => e.faces && e.faces.length === 2 && e.faces[0] === e.faces[1];

// the world box of one body instance's face (for labels and normals)
export function faceCentre(inst, f) {
  const face = inst.body.faces && inst.body.faces[f];
  if (face && face.center) return applyM(inst.M, face.center);
  return null;
}

// a selection or overlay ref's body is the body's id or its index in program.bodies (the host keeps the index)
export const sameBody = (inst, b) => b == null || inst.body.id === b || inst.pi === b;
