const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const port = process.argv[2] ?? '8799';
(async () => {
  const b = await chromium.launch(); const out = [];
  for (let k = 0; k < 3; k++) {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
    await p.goto(`http://localhost:${port}/index.html`);
    const r = await p.evaluate(() => new Promise(res => {
      const w = new Worker('./worker.js', { type: 'module' });
      const pending = new Map(); let id = 0;
      const rpc = msg => new Promise(ok => { const i = ++id; pending.set(i, ok); w.postMessage({ id: i, ...msg }); });
      w.onmessage = e => { const ok = pending.get(e.data.id); pending.delete(e.data.id); ok(e.data); };
      w.onerror = e => res({ error: e.message });
      (async () => {
        const t0 = performance.now();
        const init = await rpc({ op: 'init' });
        const t1 = performance.now();
        const c = await rpc({ op: 'compile', files: { 'script.js': "return j.part('p').extrude(j.region.rect(20, 10), mm(5), { id: 'b' })" }, entry: 'script.js' });
        const t2 = performance.now();
        const m = await rpc({ op: 'run', code: "return 1" });
        res({ initRpc: t1 - t0, initMs: init.ms, firstCompile: t2 - t1, ok: c.ok, vol: c.program?.summary?.volume, version: init.version });
        w.terminate();
      })();
    }));
    out.push(r); await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  console.log('chromium', b.version());
  await b.close();
})();
