import { compile, W, build, K, oc } from './base.mjs';
import { gzipSync } from 'node:zlib';
const dieSrc = `const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })`;
const r = await compile(dieSrc);
console.log('script bytes', Buffer.byteLength(dieSrc), 'tree only', Buffer.byteLength(dieSrc.split('\nreturn')[0]));
const b = r.program.bodies[0];
console.log('mesh tris', b.mesh.indices.length/3, 'verts', b.mesh.positions.length/3, 'deflection', b.deflection, 'vol', b.volume);
// mesh volume
const P = b.mesh.positions, I = b.mesh.indices; let v = 0;
for (let t = 0; t < I.length; t += 3) { const a = [P[I[t]*3],P[I[t]*3+1],P[I[t]*3+2]], bb=[P[I[t+1]*3],P[I[t+1]*3+1],P[I[t+1]*3+2]], c=[P[I[t+2]*3],P[I[t+2]*3+1],P[I[t+2]*3+2]];
 v += (a[0]*(bb[1]*c[2]-bb[2]*c[1]) - a[1]*(bb[0]*c[2]-bb[2]*c[0]) + a[2]*(bb[0]*c[1]-bb[1]*c[0]))/6; }
console.log('mesh volume', v, 'rel err', (v - b.volume)/b.volume);
for (const f of ['step','stl','3mf']) {
  const e = await W.handle({ id: 99, op: 'export', format: f });
  const d = e.data; const bytes = typeof d === 'string' ? Buffer.from(d) : Buffer.from(new Uint8Array(d));
  console.log(f, bytes.length, 'gz', gzipSync(bytes).length, e.report?.approximated);
}
const st = (await W.handle({ id: 98, op: 'export', format: 'step' })).data;
const ents = {}; for (const m of st.matchAll(/=\s*([A-Z_0-9]+)\s*\(/g)) ents[m[1]] = (ents[m[1]] ?? 0) + 1;
console.log(Object.entries(ents).sort((a,b)=>b[1]-a[1]).slice(0,40));
