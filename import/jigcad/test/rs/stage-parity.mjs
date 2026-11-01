// Stage parity: depth and id buffers, projected vertices and the whole line work (runs, hidden runs, pick segments,
// silhouette count), Rust frame against the JS reference, on real programs in four views. Exit 1 on a mismatch.
import { init, compilePreset } from './presets.mjs';
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
const { sceneOf } = await import('../../src/stage/scene.js');
const { viewCam } = await import('../../src/stage/camera.js');
const R = await import('../../src/stage/raster.js');
const { lineWork } = await import('../../src/stage/lines.js');
const RS = await import('../../src/engine/rs/index.js');
await init();
let pass = 0, fail = 0;
const check = (name, ok, d = '') => { if (ok) pass++; else { fail++; console.log(`FAIL ${name} ${d}`); } };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i] || (Number.isNaN(v) && Number.isNaN(b[i])));
// lw.runs[instance][edge] = [run, …], run = [x, y, …]; edges that were not drawn are holes
const edgeEq = (a, b) => (!a && !b) || (a && b && a.length === b.length && a.every((run, j) => same(run, b[j])));
const runsEq = (A, B) => A.length === B.length && A.every((inst, i) => inst.length === B[i].length && Array.from(inst, (e, j) => edgeEq(e, B[i][j])).every(Boolean));
function frame(sc, cam, k, W, H) {
  const buf = R.buffers({}, W, H);
  for (const inst of sc.instances) R.rasterInstance(buf, inst, R.projectInstance(inst, cam, k));
  const S = sc.instances.map(i => Float32Array.from(i._S));
  return { buf, lw: lineWork(sc, cam, buf, k), S, depth: Float32Array.from(buf.depth), id: Int32Array.from(buf.id), box: [buf.x0, buf.y0, buf.x1, buf.y1] };
}
for (const id of ['A-01', 'M-07', 'X-08', 'M-10', 'H-07']) {
  const prog = await compilePreset(id);
  for (const view of ['axo', 'front', 'side', 'plan']) {
    const W = 900, H = 600, k = 2, sc = sceneOf(prog), cam = viewCam({ name: view }, sc.box, W / k, H / k);
    const rs = frame(sc, cam, k, W, H);
    check(`${id}/${view} frame is Rust`, rs.buf.rust === true);
    const js = RS.withJs(() => frame(sceneOf(prog), cam, k, W, H));
    check(`${id}/${view} projected vertices`, rs.S.every((s, i) => same(s, js.S[i])));
    check(`${id}/${view} depth buffer`, same(rs.depth, js.depth));
    check(`${id}/${view} id buffer`, same(rs.id, js.id));
    check(`${id}/${view} dirty rectangle`, same(rs.box, js.box), `${rs.box} vs ${js.box}`);
    check(`${id}/${view} visible runs`, runsEq(rs.lw.runs, js.lw.runs));
    check(`${id}/${view} hidden runs`, runsEq(rs.lw.hidRuns, js.lw.hidRuns));
    check(`${id}/${view} pick segments`, same(rs.lw.segs, js.lw.segs) && same(rs.lw.who, js.lw.who), `${rs.lw.segs.length} vs ${js.lw.segs.length}`);
    check(`${id}/${view} silhouettes`, rs.lw.silCount === js.lw.silCount);
  }
  console.log(`${id}: 4 views`);
}
// a second frame on the same key reuses the Rust buffers and clears only the dirty rectangle
{
  const prog = await compilePreset('A-01'), key = {}, sc = sceneOf(prog), W = 400, H = 300;
  const cam1 = viewCam({ name: 'axo' }, sc.box, W, H), cam2 = viewCam({ name: 'plan' }, sc.box, W, H);
  let b = R.buffers(key, W, H); for (const inst of sc.instances) R.rasterInstance(b, inst, R.projectInstance(inst, cam1, 1));
  b = R.buffers(key, W, H); for (const inst of sc.instances) R.rasterInstance(b, inst, R.projectInstance(inst, cam2, 1));
  const again = Float32Array.from(b.depth);
  const fresh = R.buffers({}, W, H); for (const inst of sc.instances) R.rasterInstance(fresh, inst, R.projectInstance(inst, cam2, 1));
  check('reused frame equals a fresh one', same(again, Float32Array.from(fresh.depth)));
}
console.log(`\n${pass} stage checks passed, ${fail} failed · stage calls ${JSON.stringify({ raster: RS.counters.stageRaster, classify: RS.counters.stageClassify })}`);
process.exit(fail ? 1 : 0);
