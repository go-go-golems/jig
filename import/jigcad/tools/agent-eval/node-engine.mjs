// The engine client the Host expects (src/host/engine.js: ready, request(op, args), compute, initMs), built on the
// worker module's handle() in this process instead of a Web Worker. One engine per process: the worker module keeps
// one current Program.
export async function createNodeEngine({ compute } = {}) {
  const W = await import('../../src/engine/worker.js');
  let seq = 0;
  const engine = { kind: 'node', version: null, compute: null, initMs: null, note: '' };
  engine.ready = W.handle({ id: ++seq, op: 'init', options: compute === 'js' ? { compute: 'js' } : {} }).then(r => {
    if (!r.ok) throw new Error(`engine init failed: ${r.error?.message}`);
    Object.assign(engine, { version: r.version ?? null, compute: r.compute ?? null, initMs: r.ms ?? null });
  });
  engine.request = async (op, args = {}) => {
    await engine.ready;
    const r = await W.handle({ id: ++seq, op, ...args });
    if (!r.ok) throw Object.assign(new Error(r.error?.message || `${op} failed`), r.error || {});
    const { id, ok, ...rest } = r;
    return rest;
  };
  engine.terminate = () => {};
  return engine;
}
