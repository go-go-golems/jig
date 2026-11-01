// Time the stage's frame passes on real programs (Node, no canvas): raster, line work, paper image.
// Usage: node test/rs/stage-bench.mjs [presetIds…]
import { init, compilePreset } from './presets.mjs';
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
const { sceneOf } = await import('../../src/stage/scene.js');
const { viewCam } = await import('../../src/stage/camera.js');
const R = await import('../../src/stage/raster.js');
const { lineWork } = await import('../../src/stage/lines.js');
const RS = await import('../../src/engine/rs/index.js');
await init();
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['M-10', 'M-07', 'X-08'];
const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const id of ids) {
  const prog = await compilePreset(id);
  const W = 2400, H = 1600, sc = sceneOf(prog), cam = viewCam({ name: 'axo' }, sc.box, W / 2, H / 2), k = 2;
  const ntri = sc.instances.reduce((n, i) => n + i.body.mesh.indices.length / 3, 0);
  const img = new Uint32Array(W * H);
  // as the app does: the same key every frame (buffers reused, only the dirty rectangle cleared)
  const measure = () => {
    const key = {}, tr = [], tl = [], tp = [];
    for (let rep = 0; rep < 9; rep++) {
      let t0 = performance.now();
      const buf = R.buffers(key, W, H);
      for (const inst of sc.instances) R.rasterInstance(buf, inst, R.projectInstance(inst, cam, k));
      tr.push(performance.now() - t0);
      t0 = performance.now(); lineWork(sc, cam, buf, k); tl.push(performance.now() - t0);
      t0 = performance.now(); R.paperImage(buf, img, 0xffffffff, [], k); tp.push(performance.now() - t0);
    }
    return [med(tr), med(tl), med(tp)];
  };
  const js = RS.withJs(measure), rs = measure();
  const f = ([a, b, c]) => `raster ${a.toFixed(1)} · lines ${b.toFixed(1)} · paper ${c.toFixed(1)} · total ${(a + b + c).toFixed(1)} ms`;
  console.log(`${id} ${ntri} tris ${W}×${H}\n  js   ${f(js)}\n  rust ${f(rs)}  (×${((js[0] + js[1]) / (rs[0] + rs[1])).toFixed(1)} raster + lines)`);
}
