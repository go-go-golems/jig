// 05-scene-stats.ts [IDs…] — compile presets in Node and print what the GPU receives: objects, triangles, mesh
// definitions, buffer sizes (objects, lights, top-level BVH, scene data head/tail, uniforms), WGSL lines.
// Run from the repo root: npx tsx <this file> K-01 K-09
import { build } from '../../../../../../src/engine/candela';
import { loadCatalogFromDisk } from '../../../../../../src/content/node';

const ids = process.argv.slice(2);
const kb = (n: number) => (n / 1024).toFixed(1) + ' KiB';
for (const p of loadCatalogFromDisk().presets.filter(p => !ids.length || ids.includes(p.id))) {
  const r = await build(p.files);
  if (!r.ok) { console.log(p.id, 'build failed'); continue; }
  const c = r.compiled, s = c.stats, P = c.pack({ time: 0 });
  console.log(`${p.id}  ${p.title}`);
  console.log(`  objects ${s.objects}  lights ${s.lights}  materials ${s.materials}  meshes ${s.meshes}  triangles ${s.triangles}  params ${s.params}  WGSL lines ${s.lines}`);
  console.log(`  buffers: U ${kb(P.U.byteLength)}  objs ${kb(P.O.byteLength)}  lits ${kb(P.LI.byteLength)}  bvh ${kb(P.BV.byteLength)}  sd head ${kb(P.SDs.byteLength)}  sd tail ${kb(P.SDd.byteLength)}`);
}
