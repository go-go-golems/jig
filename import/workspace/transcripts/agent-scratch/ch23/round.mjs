import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const src = r => `return j.part('block')
  .params({ r: mm(${r}) })
  .extrude(j.region.rect(20, 20), mm(10), { id: 'body' })
  .fillet(j.sel.edges(), 'r', { id: 'round' })`;
for (const r of [2, 1, 4.9, 5]) {
  const t = performance.now();
  const res = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': src(r) } });
  const ms = performance.now() - t;
  const P = res.program;
  const b = P.bodies[0];
  let vol = 0, ntri = 0;
  if (b) {
    const { positions: p, indices: ix } = b.mesh; ntri = ix.length / 3;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i]*3, c = ix[i+1]*3, d = ix[i+2]*3;
      const ax=p[a],ay=p[a+1],az=p[a+2],bx=p[c],by=p[c+1],bz=p[c+2],cx=p[d],cy=p[d+1],cz=p[d+2];
      vol += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6;
    }
  }
  console.log(`r=${r}: ok ${res.ok} ${ms.toFixed(0)} ms volume ${P.summary.volume} faces ${P.summary.faces} meshVol ${vol.toFixed(4)} tris ${ntri} verts ${b?.mesh.positions.length/3}`, P.diagnostics.map(d => `${d.kind}: ${d.message} ${d.fix ?? ''}`), b && JSON.stringify(b.topology));
  if (b) console.log('  kinds', JSON.stringify(b.faces.reduce((m, f) => (m[f.kind] = (m[f.kind] ?? 0) + 1, m), {})), b.faces.slice(0, 4).map(f => f.name), b.faces.filter(f=>f.kind==='sphere').slice(0,2).map(f=>f.name));
}
