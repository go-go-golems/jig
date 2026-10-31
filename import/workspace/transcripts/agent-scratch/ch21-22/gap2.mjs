import { prog, K } from './h.mjs';
const I = await import('/home/claude/jigcad/src/engine/inspect.js');
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
import { readFileSync } from 'node:fs';
// build the pre-fix meshGap: the same function without the edge-crossing step
let code = readFileSync('/home/claude/jigcad/src/engine/inspect.js', 'utf8');
const start = code.indexOf('export function meshGap'), end = code.indexOf('const edgeKey');
let fn = code.slice(start, end).replace('export function meshGap', 'function meshGapOld').replace(/if \(best > 1e-9 && best <= maxD && \(cross\(A, B\) \|\| cross\(B, A\)\)\) best = 0;/, '');
const ptStart = code.indexOf('function pointTri'), ptEnd = code.indexOf('// Overhang/support');
const V = K.V;
const old = new Function('V', fn + code.slice(ptStart, ptEnd) + '; return meshGapOld;')(V);
const src = `const g = j.lib.gear.spur({ module: mm(1), teeth: 24, width: mm(4) }).hole([[0, 0]], j.hole.simple(mm(5.3)), { id: 'bore' })
    const b = j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
      .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
      .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })
    return j.assembly('a').add('b', b, { ground: true }).add('g', g, { at: j.tx.move(0, 0, 3.2) }).interference()`;
const pr = await prog(src);
const [A, B] = pr.kernelBodies().map(c => I.meshTris(M.meshBody(c.body), c.transform));
console.log('old (vertex-only) meshGap', old(A, B, 1.8), 'new', I.meshGap(A, B, 1.8));
// bore polygon: gear bore vertex ring radius
const ring = new Set(); for (const t of B) for (const p of [t.a, t.b, t.c]) { const r = Math.hypot(p[0], p[1]); if (r < 2.7) ring.add(p[2].toFixed(3)); }
const rs = []; for (const t of B) for (const p of [t.a, t.b, t.c]) { const r = Math.hypot(p[0], p[1]); if (r < 2.7 && Math.abs(p[2] - 3.2) < 1e-4) rs.push(Math.atan2(p[1], p[0])); }
const uniq = [...new Set(rs.map(a => a.toFixed(5)))].length;
console.log('bore ring z levels', [...ring], 'bore segments', uniq, 'bore inscribed apothem', 2.65 * Math.cos(Math.PI / uniq));
