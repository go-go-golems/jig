import { compile } from './h.mjs';
const out = async (lab, s) => { const p = await compile('return ' + s); console.log(lab, p.bodies[0]?.volume?.toFixed(6), JSON.stringify(Object.values(p.decisions).filter(d=>0)), p.diagnostics.map(d => d.kind + ': ' + d.message + ' · ' + d.fix).join(' / ')); return p; };
const box = r => `j.part('t').extrude(j.region.rect(60, 40, { r: ${r} }), mm(30), { id: 'body' })`;
for (const [r, t] of [[5, 2], [1, 2], [0, 2]]) await out(`shell r=${r} t=${t}`, box(r) + `.shell(j.feat('body').endFace(), mm(${t}), { id: 'shell' })`);
await out('shell out t=2 r=0', box(0) + `.shell(j.feat('body').endFace(), mm(2), { id: 'shell', direction: 'out' })`);
await out('draft 5', `j.part('d').extrude(j.region.rect(20, 20), mm(10), { id: 'body' }).draft(j.feat('body').sideFaces(), deg(5), { id: 'dr' })`);
await out('draft cyl 5', `j.part('d').extrude(j.region.circle(10), mm(10), { id: 'body' }).draft(j.feat('body').sideFaces(), deg(5), { id: 'dr' })`);
