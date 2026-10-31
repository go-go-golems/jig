// Meshing and display data for bodies: triangle meshes with triFace, named edge polylines, face metadata.
import { getOC } from './oc.js';
import * as K from './kernel.js';

const V = K.V;

// Tessellate a body: linear deflection relative to size (~0.05 mm for a 60 mm part), angular 0.3 rad.
export function meshBody(body, { deflection, angular = 0.3 } = {}) {
  const oc = getOC();
  const bb = body.bbox();
  const size = bb ? V.dist(bb[0], bb[1]) : 100;
  const lin = deflection ?? Math.min(0.2, Math.max(0.05, size * 0.001));   // 0.05–0.2 mm: ≈ 0.07 mm for a 60 × 40 × 30 mm part
  const key = `${lin}|${angular}`;
  if (body._mesh?.key === key) return body._mesh.mesh;
  const m = meshRaw(body, lin, angular);
  body._mesh = { key, mesh: m };
  return m;
}
function meshRaw(body, lin, angular) {
  const oc = getOC();
  const raw = oc.ReplicadMeshExtractor.extract(body.shape, lin, angular, false);
  try {
    const buf = oc.wasmMemory.buffer;
    const f32 = new Float32Array(buf), u32 = new Uint32Array(buf), i32 = new Int32Array(buf);
    const sl = (heap, ptr, n) => heap.slice((ptr >>> 0) / 4, (ptr >>> 0) / 4 + n);
    const positions = sl(f32, raw.getVerticesPtr(), raw.getVerticesSize());
    const normals = sl(f32, raw.getNormalsPtr(), raw.getNormalsSize());
    const indices = sl(u32, raw.getTrianglesPtr(), raw.getTrianglesSize());
    const groups = sl(i32, raw.getFaceGroupsPtr(), raw.getFaceGroupsSize());
    const triFace = new Uint32Array(indices.length / 3);
    // groups are in TopExp face order (occurrences); map by shape hash to our face indices
    const faceByHash = new Map();
    body.faces.list.forEach((f, i) => { const h = K.hashOf(f); if (!faceByHash.has(h)) faceByHash.set(h, i); });
    let order = 0;
    for (let g = 0; g < groups.length; g += 3) {
      const start = groups[g], count = groups[g + 1], hash = groups[g + 2];
      let fi = faceByHash.get(hash);
      if (fi == null) fi = Math.min(order, body.nFaces - 1);
      for (let t = start / 3; t < (start + count) / 3; t++) triFace[t] = fi;
      order++;
    }
    return { positions, normals, indices, triFace, deflection: lin };
  } finally { raw.delete(); }
}

// Edge polylines from the triangulation (fast; call after meshBody), GCPnts as a fallback.
export function edgePolylines(body, { deflection = 0.05, angular = 0.3 } = {}) {
  const oc = getOC();
  const names = body.edgeNames;
  const byEdge = new Map();
  try {
    const raw = oc.ReplicadEdgeMeshExtractor.extract(body.shape, deflection, angular);
    try {
      const buf = oc.wasmMemory.buffer;
      const lines = new Float32Array(buf).slice((raw.getLinesPtr() >>> 0) / 4, (raw.getLinesPtr() >>> 0) / 4 + raw.getLinesSize());
      const groups = new Int32Array(buf).slice((raw.getEdgeGroupsPtr() >>> 0) / 4, (raw.getEdgeGroupsPtr() >>> 0) / 4 + raw.getEdgeGroupsSize());
      const idxByHash = new Map();
      body.edges.list.forEach((e, i) => { const h = K.hashOf(e); if (!idxByHash.has(h)) idxByHash.set(h, i); });
      for (let g = 0; g < groups.length; g += 3) {
        const start = groups[g], count = groups[g + 1], ei = idxByHash.get(groups[g + 2]);
        if (ei == null || byEdge.has(ei)) continue;
        const segs = lines.subarray(start * 3, (start + count) * 3);   // start/count count vertices (2 per segment)
        const nSeg = segs.length / 6;
        const pts = new Float32Array((nSeg + 1) * 3);
        for (let k = 0; k < nSeg; k++) { pts[k * 3] = segs[k * 6]; pts[k * 3 + 1] = segs[k * 6 + 1]; pts[k * 3 + 2] = segs[k * 6 + 2]; }
        if (nSeg) { pts[nSeg * 3] = segs[(nSeg - 1) * 6 + 3]; pts[nSeg * 3 + 1] = segs[(nSeg - 1) * 6 + 4]; pts[nSeg * 3 + 2] = segs[(nSeg - 1) * 6 + 5]; }
        byEdge.set(ei, pts);
      }
    } finally { raw.delete(); }
  } catch {}
  return body.edges.list.map((e, i) => {
    const info = body.edgeInfo(i);
    let points = byEdge.get(i);
    if (!points) { try { points = K.edgePolyline(e, Math.max(deflection, 0.02), angular); } catch { points = new Float32Array([...info.a, ...info.b]); } }
    return { index: i, name: names[i], kind: info.kind === 'line' || info.kind === 'circle' ? info.kind : 'other', points, faces: body.edgeFaces[i].slice() };
  });
}

export function faceMeta(body) {
  return body.names.map((name, i) => {
    const fi = body.faceInfo(i);
    const out = { index: i, name, kind: fi.kind, area: fi.area, center: fi.center };
    if (fi.normal) out.normal = fi.normal;
    if (fi.axis) out.axis = { origin: fi.axis.origin, dir: fi.axis.dir, radius: fi.axis.radius, ...(fi.axis.semiAngle != null ? { semiAngle: fi.axis.semiAngle } : {}) };
    if (body.aliases?.[i]) out.aliases = body.aliases[i];
    return out;
  });
}

// Plain body record for ProgramData (typed arrays are transferable).
export function bodyData(body, { part, transform = K.IDENTITY, color = null, mesh = true } = {}) {
  const m0 = mesh ? meshBody(body) : null;
  const m = m0 && { positions: m0.positions.slice(), normals: m0.normals.slice(), indices: m0.indices.slice(), triFace: m0.triFace.slice(), deflection: m0.deflection };
  body._edgesData ??= edgePolylines(body, { deflection: m0?.deflection ?? 0.05 });
  return {
    id: `${part}/${body.id}`, name: body.id, part, color, transform: Array.from(transform),
    mesh: m ? { positions: m.positions, normals: m.normals, indices: m.indices, triFace: m.triFace } : null,
    faces: faceMeta(body), edges: body._edgesData.map(e => ({ ...e, points: e.points.slice(), faces: e.faces.slice() })), bbox: body.bbox(),
    volume: body.volume(), topology: body.topology(), deflection: m?.deflection,
  };
}
