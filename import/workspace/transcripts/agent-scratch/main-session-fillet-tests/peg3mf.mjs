// 3MF export: each face keeps its own vertices, so face-boundary edges are not shared (3MF Core 4.1 requires it)
import { compile, exp } from './h.mjs';
const { unzip } = await import('/home/claude/jigcad/src/engine/io.js');
await compile(`return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' }).extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' }).fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })`);
const t = await exp('3mf', {});
const model = new TextDecoder().decode(unzip(new Uint8Array(t.data)).find(f => f.name === '3D/3dmodel.model').data);
const ts = [...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].map(x => [+x[1], +x[2], +x[3]]);
const uses = new Map(); for (const v of ts) for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], key = a < b ? a + ',' + b : b + ',' + a; uses.set(key, (uses.get(key) || 0) + 1); }
const verts = [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map(x => x.slice(1).join());
console.log('vertices', verts.length, 'distinct positions', new Set(verts).size, 'edges used by one triangle only', [...uses.values()].filter(n => n === 1).length);
