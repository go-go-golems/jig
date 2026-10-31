import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { loadOC, getOC } = await import('/home/claude/jigcad/src/engine/oc.js');
const t0 = performance.now();
const oc = await loadOC();
console.log('loadOC ms', (performance.now() - t0).toFixed(0), '__loadMs', oc.__loadMs.toFixed(0));
const mem = oc.wasmMemory;
console.log('shared?', mem.buffer instanceof SharedArrayBuffer, 'bytes after init', mem.buffer.byteLength, (mem.buffer.byteLength/2**20).toFixed(1)+' MiB');
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const scripts = {
  box: "return j.part('p').extrude(j.region.rect(20, 10), mm(5), { id: 'b' })",
  die: `const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod.union(rod.moved(j.tx.rotate(j.axis.X, deg(90)))).union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die').add(cube.intersect(ball).subtract(rods), { id: 'body' })`,
};
for (const [k, s] of Object.entries(scripts)) {
  const t = performance.now();
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': s } });
  console.log(k, 'ms', (performance.now() - t).toFixed(0), 'ok', r.ok, 'mem MiB', (getOC().wasmMemory.buffer.byteLength/2**20).toFixed(1), r.program.summary.volume);
}
// presets
import fs from 'node:fs';
for (const id of ['M-07-spur-gear-pair', 'M-06-threaded-jar', 'D-10-gridfinity-bin']) {
  const dir = '/home/claude/jigcad/content/presets/' + id;
  const files = {}; for (const f of fs.readdirSync(dir)) if (f !== 'meta.json') files[f] = fs.readFileSync(dir + '/' + f, 'utf8');
  const t = performance.now();
  const r = await W.handle({ id: 2, op: 'compile', entry: 'script.js', files });
  console.log(id, 'ms', (performance.now() - t).toFixed(0), 'ok', r.ok, 'mem MiB', (getOC().wasmMemory.buffer.byteLength/2**20).toFixed(1));
}
