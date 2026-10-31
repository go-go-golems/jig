import { prog, compile, getOC, K } from './h.mjs';
const O = await import('/home/claude/jigcad/src/engine/ops.js');
const pr = await prog(`return j.part('m').extrude(j.region.rect(50, 30), mm(4), { id: 'plate' })`);
const { body } = pr.kernelBodies()[0];
const idx = body.edges.list.map((e, i) => i).filter(i => { const ei = body.edgeInfo(i); return ei.kind === 'line' && Math.abs(Math.abs(ei.dir[2]) - 1) < 1e-9; });
console.log('vertical edges', idx.map(i => body.edgeNames[i]));
const ok = r => { try { const o = O.fillet(body, idx, r, 'f'); o.shape.delete(); return true; } catch (e) { return false; } };
let lo = 0, hi = 20;
for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; const g = ok(mid); console.log(k + 1, mid.toFixed(5), g ? 'ok' : 'fails'); if (g) lo = mid; else hi = mid; }
console.log('lo', lo, 'hi', hi);
for (const r of [14.9, 14.99, 14.999, 15, 15.001]) console.log(r, ok(r));
const p = await compile(`return j.part('m').extrude(j.region.rect(50, 30), mm(4), { id: 'plate' }).fillet(j.feat('plate').sideFaces().edges('|Z'), mm(20), { id: 'round' })`);
console.log(p.diagnostics.map(d => d.kind + ': ' + d.message + ' · fix: ' + d.fix));
