import { compile } from './h.mjs';
const v = async s => { const p = await compile('return ' + s); return p; };
// fully rounded box: Steiner / Minkowski
for (const r of [1, 3, 5]) {
  const p = await v(`j.part('b').extrude(j.region.rect(40, 30), mm(20), { id: 'box' }).fillet(j.feat('box').edges(), mm(${r}), { id: 'round' })`);
  const a = 40-2*r, b = 30-2*r, c = 20-2*r;
  const st = a*b*c + 2*r*(a*b+b*c+a*c) + Math.PI*r*r*(a+b+c) + 4/3*Math.PI*r**3;
  const kinds = {}; p.bodies[0].faces.forEach(f => kinds[f.kind] = (kinds[f.kind]||0)+1);
  console.log('r', r, 'kernel', p.bodies[0].volume.toFixed(6), 'steiner', st.toFixed(6), 'diff', (p.bodies[0].volume - st).toExponential(3), JSON.stringify(kinds), p.bodies[0].topology, p.diagnostics.map(d=>d.message));
}
// area too: Steiner area S(r) = S + 2 M r + 4 pi r^2 where for box inner a b c: area of outer = 2(ab+bc+ca) + 2*pi*r*(a+b+c)... 
