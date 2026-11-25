// Display-only machining sections. Body coordinates and section offsets are in local mm.
// One retained half-space, dot(unit normal, point) <= offset, follows each selected occurrence.
import earcut from '../../vendor/earcut/earcut.js';
import { V, boxOfPoints } from './math.js';

const cache = new WeakMap();

export function shotGeometry(program, { isolate, section } = {}) {
  if (!program || (!isolate && !section)) return program;
  const key = JSON.stringify([isolate, section]);
  const previous = cache.get(program.bodies);
  let bodies = previous?.key === key ? previous.bodies : null;
  if (!bodies) {
    const selected = isolate && new Set(isolate);
    const cut = new Set(section?.components);
    const normal = section && V.norm(section.normal);
    bodies = program.bodies.filter(b => !selected || selected.has(b.part))
      .map(b => cut.has(b.part) && b.mesh ? sectionBody(b, normal, section.offset) : b)
      .filter(Boolean);
    cache.set(program.bodies, { key, bodies });
  }
  return { ...program, bodies };
}

const triple = (array, index) => [array[index], array[index + 1], array[index + 2]];
function crossing(a, b) {
  const t = a.d / (a.d - b.d);
  return { p: V.lerp(a.p, b.p, t), n: V.norm(V.lerp(a.n, b.n, t)), d: 0 };
}

// Cut the real sampled CAD edges as well as the surface triangles. An edge
// may leave and re-enter the retained region multiple times.
function cutEdges(source, distance) {
  const kept = [];
  for (const edge of source) {
    let line = [];
    const finish = () => {
      if (line.length >= 6) kept.push({ ...edge, index: kept.length, points: Float32Array.from(line) });
      line = [];
    };
    for (let i = 0; i + 5 < edge.points.length; i += 3) {
      const a = triple(edge.points, i), b = triple(edge.points, i + 3);
      const da = distance(a), db = distance(b);
      if (da > 0 && db > 0) continue;
      const cut = (da > 0) !== (db > 0) && V.lerp(a, b, da / (da - db));
      if (!line.length) line.push(...(da > 0 ? cut : a));
      line.push(...(db > 0 ? cut : b));
      if (db > 0) finish();
    }
    finish();
  }
  return kept;
}

function contains(ring, point) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [xx, yy] = ring[j];
    if ((y > point[1]) !== (yy > point[1]) &&
        point[0] < (xx - x) * (point[1] - y) / (yy - y) + x) inside = !inside;
  }
  return inside;
}

// Each triangle's retained polygon contributes its on-plane edges. Shared
// edges cancel, including edges of existing faces coincident with the plane.
function capRings(segments, normal) {
  const remaining = new Set(segments);
  const incident = new Map();
  for (const segment of remaining) for (const node of [segment.a, segment.b]) {
    if (!incident.has(node)) incident.set(node, []);
    incident.get(node).push(segment);
  }
  const u = V.norm(V.cross(Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], normal));
  const v = V.cross(normal, u);
  const rings = [];
  while (remaining.size) {
    const first = remaining.values().next().value.a;
    let node = first;
    const points = [];
    do {
      points.push(node.p);
      const edge = incident.get(node).find(item => remaining.has(item));
      if (!edge) throw new Error('Section boundary is open. Choose a plane through a closed solid.');
      remaining.delete(edge);
      node = edge.a === node ? edge.b : edge.a;
    } while (node !== first);
    if (points.length < 3) continue;
    const xy = points.map(p => [V.dot(u, p), V.dot(v, p)]);
    const area = Math.abs(xy.reduce((sum, [x, y], i) => {
      const next = xy[(i + 1) % xy.length];
      return sum + x * next[1] - y * next[0];
    }, 0)) / 2;
    rings.push({ points, xy, area, depth: 0, parent: null });
  }
  rings.sort((a, b) => b.area - a.area);
  for (let i = 1; i < rings.length; i++) {
    const ring = rings[i];
    for (let j = i - 1; j >= 0; j--) {
      if (!contains(rings[j].xy, ring.xy[0])) continue;
      ring.parent = rings[j]; ring.depth = rings[j].depth + 1;
      break;
    }
  }
  return rings;
}

function sectionBody(body, normal, offset) {
  const source = body.mesh;
  const box = body.bbox ?? boxOfPoints(source.positions);
  const eps = Math.max(1e-8, 1e-7 * V.len(V.sub(box[1], box[0])));
  const distance = p => {
    const d = V.dot(p, normal) - offset;
    return Math.abs(d) < eps ? 0 : d;
  };
  const nodes = [];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < source.positions.length; i += 3) {
    const p = triple(source.positions, i), d = distance(p);
    nodes.push({ p, d, n: triple(source.normals, i) });
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  if (hi <= 0) return body;
  if (lo >= 0) return null;

  const positions = [], normals = [], indices = [], triFace = [];
  const vertices = new Map(), planeNodes = new Map(), boundary = new Map();
  function vertex(node) {
    if (!vertices.has(node)) {
      vertices.set(node, positions.length / 3);
      positions.push(...node.p); normals.push(...node.n);
    }
    return vertices.get(node);
  }
  function planeNode(p) {
    const key = p.map(x => Math.round(x / eps)).join(',');
    if (!planeNodes.has(key)) planeNodes.set(key, { id: planeNodes.size, p });
    return planeNodes.get(key);
  }
  function triangle(a, b, c, face) {
    if (V.len(V.cross(V.sub(b.p, a.p), V.sub(c.p, a.p))) <= eps * eps) return;
    indices.push(vertex(a), vertex(b), vertex(c)); triFace.push(face);
  }
  for (let t = 0; t < source.indices.length; t += 3) {
    const input = [nodes[source.indices[t]], nodes[source.indices[t + 1]], nodes[source.indices[t + 2]]];
    const face = source.triFace[t / 3], poly = [];
    for (let i = 0; i < 3; i++) {
      const a = input[i], b = input[(i + 1) % 3];
      if (a.d <= 0) poly.push(a);
      if (a.d * b.d < 0) poly.push(crossing(a, b));
    }
    if (poly.length < 3) continue;
    for (let i = 1; i + 1 < poly.length; i++) triangle(poly[0], poly[i], poly[i + 1], face);
    for (let i = 0; i < poly.length; i++) {
      const start = poly[i], end = poly[(i + 1) % poly.length];
      if (start.d || end.d) continue;
      const a = planeNode(start.p), b = planeNode(end.p);
      if (a === b) continue;
      const key = a.id < b.id ? a.id + '/' + b.id : b.id + '/' + a.id;
      if (boundary.has(key)) boundary.delete(key);
      else boundary.set(key, { a, b, face });
    }
  }
  const edges = cutEdges(body.edges ?? [], distance);
  const cap = body.faces.length;
  const rings = capRings(boundary.values(), normal);
  let capArea = 0, moment = [0, 0, 0];
  for (const outer of rings) {
    if (outer.depth % 2) continue;
    const group = [outer, ...rings.filter(r => r.parent === outer)];
    const xy = [], points = [], holes = [];
    for (const ring of group) {
      if (points.length) holes.push(points.length);
      capArea += ring === outer ? ring.area : -ring.area;
      for (let i = 0; i < ring.points.length; i++) {
        points.push({ p: ring.points[i], n: normal });
        xy.push(...ring.xy[i]);
      }
    }
    const tris = earcut(xy, holes);
    for (let i = 0; i < tris.length; i += 3) {
      const a = points[tris[i]], b = points[tris[i + 1]], c = points[tris[i + 2]];
      triangle(a, b, c, cap);
      const area = V.len(V.cross(V.sub(b.p, a.p), V.sub(c.p, a.p))) / 2;
      moment = V.add(moment, V.mul(V.add(V.add(a.p, b.p), c.p), area / 3));
    }
  }
  for (const { a, b, face } of boundary.values()) edges.push({
    index: edges.length, name: '@section/edge', kind: 'line', faces: [face, cap],
    points: Float32Array.from([...a.p, ...b.p]),
  });
  const mesh = { positions: Float32Array.from(positions), normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices), triFace: Uint32Array.from(triFace) };
  const faces = [...body.faces, { index: cap, name: '@section/cap', kind: 'plane',
    area: capArea, center: capArea ? V.mul(moment, 1 / capArea) : box[0], normal }];
  return { ...body, mesh, edges, faces, sectionCapFace: cap, bbox: boxOfPoints(mesh.positions) };
}
