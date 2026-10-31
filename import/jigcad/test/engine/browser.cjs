// Headless Chromium check: dist/worker.js loads OpenCascade from occt/replicad_single.wasm.gz and compiles a script.
// Usage: (cd dist && python3 -m http.server 8765) & node test/engine/browser.cjs [port]
const { chromium } = require('playwright');
const port = process.argv[2] ?? '8765';
const SCRIPT = `
const base = j.sketch('base', { on: j.plane.XY }).rect('r', 60, 40, { center: true })
return j.print('caddy', { parts: [j.part('caddy')
  .extrude(base.profiles(), mm(30), { id: 'body' })
  .fillet(j.feat('body').sideFaces().edges('|Z'), mm(5), { id: 'corners' })
  .shell(j.feat('body').endFace(), mm(2), { id: 'shell' })
  .hole([j.pt(0, 0, 2)], j.hole.clearance('M3'), { id: 'drain' })] })`;
const fs = require('fs'), path = require('path');
const BOX = fs.readFileSync(path.join(__dirname, 'scripts/02-open-box.js'), 'utf8');
const HOLES = fs.readFileSync(path.join(__dirname, 'scripts/05-hole-grid.js'), 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await p.goto(`http://localhost:${port}/index.html`);
  const r = await p.evaluate(([script, BOX, HOLES]) => new Promise(res => {
    const w = new Worker('./worker.js', { type: 'module' });
    const pending = new Map(); let id = 0;
    const rpc = msg => new Promise(ok => { const i = ++id; pending.set(i, ok); w.postMessage({ id: i, ...msg }); });
    w.onmessage = e => { const ok = pending.get(e.data.id); pending.delete(e.data.id); ok(e.data); };
    w.onerror = e => res({ error: e.message });
    (async () => {
      const t0 = performance.now();
      const init = await rpc({ op: 'init' });
      const t1 = performance.now();
      const c = await rpc({ op: 'compile', files: { 'script.js': script }, entry: 'script.js' });
      const t2 = performance.now();
      const c2 = await rpc({ op: 'compile', files: { 'script.js': script.replace('mm(2), { id', 'mm(2.5), { id') }, entry: 'script.js' });
      const t3 = performance.now();
      const why = await rpc({ op: 'call', method: 'why', args: ["j.feat('body').endFace()"] });
      const stl = await rpc({ op: 'export', format: 'stl' });
      const tmf = await rpc({ op: 'export', format: '3mf' });
      const step = await rpc({ op: 'export', format: 'step' });
      const P = c.program;
      const timing = {};
      for (const [name, code] of [['box', BOX], ['holes40', HOLES]]) {
        let t = performance.now(); const a = await rpc({ op: 'compile', files: { 'script.js': code } });
        timing[name + 'First'] = Math.round(performance.now() - t);
        t = performance.now(); await rpc({ op: 'compile', files: { 'script.js': code.replace('mm(5)', 'mm(6)').replace("wall: mm(2)", "wall: mm(2.5)") } });
        timing[name + 'Edit'] = Math.round(performance.now() - t);
        t = performance.now(); await rpc({ op: 'compile', files: { 'script.js': code } });
        timing[name + 'Cached'] = Math.round(performance.now() - t);
        timing[name + 'Ok'] = a.program.ok;
      }
      res({ init: init.ok, initMs: Math.round(t1 - t0), compileMs: Math.round(t2 - t1), recompileMs: Math.round(t3 - t2), ok: P.ok, kind: P.kind,
        volume: P.metrics.volume.value, faces: P.bodies[0].faces.length, tris: P.bodies[0].mesh.indices.length / 3, triFace: P.bodies[0].mesh.triFace.length,
        edges: P.bodies[0].edges.length, typed: P.bodies[0].mesh.positions instanceof Float32Array, orient: P.print.orientation.caddy.dir,
        cachedOnRecompile: c2.program.trace.filter(t => t.cached === true).map(t => t.pass), why: why.value.resolved,
        stlBytes: stl.data.byteLength, tmfBytes: tmf.data.byteLength, stepChars: step.data.length, diagnostics: P.diagnostics.map(d => d.kind), timing });
    })().catch(e => res({ error: e.message }));
  }), [SCRIPT, BOX, HOLES]);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
  process.exit(r.ok && r.init ? 0 : 1);
})();
