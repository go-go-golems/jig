// j.inspect.* (README §4.12): analyses on parts, Programs or Shapes.
import * as K from './kernel.js';
import { compile } from './program.js';
import { mm, gram } from './units.js';
import { material, sectionLoops, loopsProps, meshTris, orientationScore, asPrinted, mobility, snap, gearMesh, MATERIALS } from './inspect.js';
import { frameOf } from './adapt.js';
import { parseDirName } from './print.js';

const progOf = t => t?.data && t.P ? t : compile(t, { mesh: true });
const mmv = x => x == null ? null : typeof x === 'number' ? x : x.value;
export const inspectApi = {
  mass(target, o = {}) {
    const P = progOf(target);
    const mat = material(o.material ?? P.P.parts[0]?.part?.meta?.material ?? 'PLA');
    const vol = P.data.metrics.volume.value, area = P.data.metrics.area.value, bb = P.data.metrics.bbox.value;
    let v = vol, parts = null;
    if (o.walls != null || o.infill != null) { const a = asPrinted(vol, area, bb[2], bb[0] * bb[1], { walls: o.walls ?? 3, infill: o.infill ?? 0.15 }); v = a.volume; parts = a.parts; }
    const massG = v * mat.density / 1000;
    return { volume: mm(v).mul(mm(1)).mul(mm(1)), mass: gram(massG), filamentLength: mm(v / (Math.PI * 0.875 * 0.875)), cost: massG / 1000 * mat.cost, parts, material: mat.name };
  },
  bbox(target) { const P = progOf(target); const v = P.data.metrics.bbox.value; return { size: v.map(x => mm(x)), value: v }; },
  section(target, plane) {
    const P = progOf(target);
    const f = frameOf(plane) ?? { origin: [0, 0, 0], z: [0, 0, 1] };
    const loops = P.kernelBodies().flatMap(({ body }) => sectionLoops(body.shape, f.origin, f.z).loops);
    const p = loopsProps(loops);
    const ys = loops.flat().map(q => q[1]);
    const cTop = ys.length ? Math.max(...ys) - p.centroid[1] : 0, cBot = ys.length ? p.centroid[1] - Math.min(...ys) : 0;
    return { area: p.area, centroid: p.centroid, I: { xx: p.Ixx, yy: p.Iyy }, Z: { top: cTop ? p.Ixx / cTop : 0, bottom: cBot ? p.Ixx / cBot : 0 }, loops: loops.length, regions: p.regions, holes: p.holes };
  },
  overhang(target, o = {}) {
    const P = progOf(target); const dir = parseDirName(o.dir ?? '+Z'); const max = o.max != null ? mmv(o.max) : Math.PI / 4;
    let area = 0; const faces = [];
    for (const b of P.data.bodies) { const s = orientationScore(meshTris(b.mesh, b.transform, b.faces), dir, { maxAngle: max }); area += s.overhangArea; for (const i of s.overhangFaces) faces.push({ name: b.faces[i]?.name, area: b.faces[i]?.area }); }
    return { area, faces };
  },
  bedContact(target, o = {}) {
    const P = progOf(target); const dir = parseDirName(o.dir ?? '+Z');
    let area = 0; for (const b of P.data.bodies) area += orientationScore(meshTris(b.mesh, b.transform, b.faces), dir).bedContact;
    return { area };
  },
  distance(a, b) { const A = progOf(a), B = progOf(b); let d = Infinity; for (const x of A.kernelBodies()) for (const y of B.kernelBodies()) d = Math.min(d, K.distance(x.body.shape, y.body.shape).value); return mm(d); },
  mobility, snap, gearMesh,
  materials: () => Object.keys(MATERIALS),
};
