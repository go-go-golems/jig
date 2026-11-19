// From the kernel's surface triangulation to quadratic tetrahedra.
//
// The engine hands over each body's display triangulation with the face every triangle came from (mesh.js
// triFace, a face index whose persistent name the job carries). The faces of a B-rep are meshed one by one, so a
// vertex on an edge appears once per face: weld() merges them into one closed surface, keeping each triangle's face
// as its marker. TetGen meshes the volume that surface bounds (a PLC: -p) to a quality bound (-q) and a largest
// volume (-a); its boundary triangles keep their markers, so every boundary triangle of the tetrahedral mesh still
// knows its face's name. quadratic() adds a node at the middle of every edge (straight edges: the surface is the
// triangulation's, within its deflection of the true one).

import { EDGES } from './tet10.js';

// Merge coincident vertices (within tol) and drop degenerate triangles. → { points, tris, marks }
export function weld({ positions, indices, triFace }, tol = 1e-6) {
  const n = positions.length / 3, map = new Int32Array(n), keyOf = new Map(), pts = [];
  const q = (v) => Math.round(v / tol);
  for (let i = 0; i < n; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    // a vertex can sit next to a cell boundary: look in the neighbouring cells too
    const kx = q(x), ky = q(y), kz = q(z);
    let hit = -1;
    for (let dx = -1; dx <= 1 && hit < 0; dx++) for (let dy = -1; dy <= 1 && hit < 0; dy++) for (let dz = -1; dz <= 1 && hit < 0; dz++) {
      const k = `${kx + dx},${ky + dy},${kz + dz}`, j = keyOf.get(k);
      if (j != null && Math.abs(pts[3 * j] - x) <= tol && Math.abs(pts[3 * j + 1] - y) <= tol && Math.abs(pts[3 * j + 2] - z) <= tol) hit = j;
    }
    if (hit < 0) { hit = pts.length / 3; pts.push(x, y, z); keyOf.set(`${kx},${ky},${kz}`, hit); }
    map[i] = hit;
  }
  const tris = [], marks = [];
  for (let t = 0; t < indices.length / 3; t++) {
    const a = map[indices[3 * t]], b = map[indices[3 * t + 1]], c = map[indices[3 * t + 2]];
    if (a === b || b === c || c === a) continue;
    tris.push(a, b, c); marks.push(triFace[t]);
  }
  return { points: Float64Array.from(pts), tris: Int32Array.from(tris), marks: Int32Array.from(marks) };
}

// Is the surface closed and manifold? → { open: edges used once, over: edges used more than twice }
export function closure(tris) {
  const use = new Map();
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = tris[t + k], b = tris[t + (k + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
    use.set(key, (use.get(key) ?? 0) + 1);
  }
  let open = 0, over = 0;
  for (const c of use.values()) { if (c === 1) open++; else if (c > 2) over++; }
  return { open, over, edges: use.size };
}

// TetGen's .smesh (a PLC: nodes, facets with boundary markers, no holes, no regions). Markers are face index + 1
// (TetGen reserves 0 for "no marker").
export function toSmesh({ points, tris, marks }) {
  const n = points.length / 3, m = tris.length / 3, out = [`${n} 3 0 0`];
  for (let i = 0; i < n; i++) out.push(`${i} ${points[3 * i]} ${points[3 * i + 1]} ${points[3 * i + 2]}`);
  out.push(`${m} 1`);
  for (let t = 0; t < m; t++) out.push(`3 ${tris[3 * t]} ${tris[3 * t + 1]} ${tris[3 * t + 2]} ${marks[t] + 1}`);
  out.push('0', '0', '');
  return out.join('\n');
}

// TetGen's switches for a quality mesh no coarser than `size` (the longest edge of a regular tetrahedron):
// -p a PLC, -q radius–edge ratio 1.414 and dihedral angles of at least 12°, -a the largest volume, -z indices
// from 0, -Q quiet. (-Y would keep the boundary triangles as given; without it TetGen may split them to meet the
// quality bound, and the pieces keep their markers.)
export function switches(size, o = {}) {
  const vmax = size ** 3 / (6 * Math.SQRT2);
  return `-pq${o.ratio ?? 1.414}/${o.dihedral ?? 12}a${vmax.toPrecision(6)}zQ${o.extra ?? ''}`;
}

// Read TetGen's .node / .ele / .face output (indices from 0 with -z).
export function readTetgen({ node, ele, face }) {
  const lines = (t) => t.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean).map((l) => l.split(/\s+/).map(Number));
  const N = lines(node), E = lines(ele), F = lines(face);
  const nn = N[0][0], ne = E[0][0], nf = F[0][0], markers = F[0][1] === 1;
  const points = new Float64Array(3 * nn);
  for (let i = 1; i <= nn; i++) { const r = N[i]; points.set([r[1], r[2], r[3]], 3 * r[0]); }
  const tets = new Int32Array(4 * ne);
  for (let i = 1; i <= ne; i++) { const r = E[i]; tets.set([r[1], r[2], r[3], r[4]], 4 * (i - 1)); }
  const faces = new Int32Array(3 * nf), fmarks = new Int32Array(nf);
  for (let i = 1; i <= nf; i++) { const r = F[i]; faces.set([r[1], r[2], r[3]], 3 * (i - 1)); fmarks[i - 1] = markers ? r[4] - 1 : -1; }
  return { points, tets, faces, fmarks };
}

const vol6 = (P, a, b, c, d) => {
  const ax = P[3 * b] - P[3 * a], ay = P[3 * b + 1] - P[3 * a + 1], az = P[3 * b + 2] - P[3 * a + 2];
  const bx = P[3 * c] - P[3 * a], by = P[3 * c + 1] - P[3 * a + 1], bz = P[3 * c + 2] - P[3 * a + 2];
  const cx = P[3 * d] - P[3 * a], cy = P[3 * d + 1] - P[3 * a + 1], cz = P[3 * d + 2] - P[3 * a + 2];
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
};

// Linear tetrahedra → C3D10. Every tetrahedron is turned to positive volume (CalculiX's corner order), every edge
// gets one middle node, and every boundary triangle becomes a 6-node face (corners, then the middles of 1–2, 2–3,
// 3–1) oriented outward, with the tetrahedron it bounds. → { nodes, tets (10 per), faces (6 per), fmarks, ftet, ncorner }
export function quadratic({ points, tets, faces, fmarks }) {
  const nc = points.length / 3, ne = tets.length / 4;
  const T = Int32Array.from(tets);
  for (let e = 0; e < ne; e++) {
    const o = 4 * e;
    if (vol6(points, T[o], T[o + 1], T[o + 2], T[o + 3]) < 0) { const t = T[o + 1]; T[o + 1] = T[o + 2]; T[o + 2] = t; }
  }
  const mid = new Map(), extra = [];
  const midOf = (a, b) => {
    const key = a < b ? a * nc + b : b * nc + a;
    let m = mid.get(key);
    if (m == null) {
      m = nc + extra.length / 3; mid.set(key, m);
      extra.push((points[3 * a] + points[3 * b]) / 2, (points[3 * a + 1] + points[3 * b + 1]) / 2, (points[3 * a + 2] + points[3 * b + 2]) / 2);
    }
    return m;
  };
  const tets10 = new Int32Array(10 * ne);
  const faceKey = (a, b, c) => [a, b, c].sort((x, y) => x - y).join(',');
  const owner = new Map();   // sorted corner triple → [tet, opposite corner]
  for (let e = 0; e < ne; e++) {
    const c = [T[4 * e], T[4 * e + 1], T[4 * e + 2], T[4 * e + 3]];
    tets10.set(c, 10 * e);
    EDGES.forEach(([i, k], m) => { tets10[10 * e + 4 + m] = midOf(c[i], c[k]); });
    for (let k = 0; k < 4; k++) { const f = c.filter((_, i) => i !== k); owner.set(faceKey(...f), [e, c[k]]); }
  }
  const nodes = new Float64Array(points.length + extra.length);
  nodes.set(points); nodes.set(extra, points.length);
  const nf = faces.length / 3, faces6 = new Int32Array(6 * nf), ftet = new Int32Array(nf);
  for (let f = 0; f < nf; f++) {
    let [a, b, c] = [faces[3 * f], faces[3 * f + 1], faces[3 * f + 2]];
    const own = owner.get(faceKey(a, b, c));
    if (!own) throw new Error(`boundary triangle ${a}, ${b}, ${c} bounds no tetrahedron`);
    // outward: the opposite corner lies behind the face
    if (vol6(nodes, a, b, c, own[1]) > 0) [b, c] = [c, b];
    faces6.set([a, b, c, midOf(a, b), midOf(b, c), midOf(c, a)], 6 * f);
    ftet[f] = own[0];
  }
  return { nodes, tets: tets10, faces: faces6, fmarks: Int32Array.from(fmarks), ftet, ncorner: nc };
}

// element volumes, the mesh's own measure
export function volumes(nodes, tets10) {
  const ne = tets10.length / 10, v = new Float64Array(ne);
  for (let e = 0; e < ne; e++) v[e] = vol6(nodes, tets10[10 * e], tets10[10 * e + 1], tets10[10 * e + 2], tets10[10 * e + 3]) / 6;
  return v;
}
