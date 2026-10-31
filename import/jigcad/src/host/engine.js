// The engine client: promise RPC to dist/worker.js over the protocol of BUILD.md §2.
// It probes the worker with `init`. Until the worker answers (or if it never speaks the protocol), requests go to
// the in-thread mock engine so the workbench runs; the moment `init` answers, `onChange('worker')` fires and the host
// recompiles with the real engine. `#mock` in the URL forces the mock.
import { createMockEngine } from './mock-engine.js';

const GRACE_MS = 12000;   // how long requests wait for the worker before the mock answers them

export function createEngine({ forceMock = false, onChange = () => {} } = {}) {
  const mock = createMockEngine();
  const pending = new Map();
  let seq = 0, worker = null, active = null, decide;
  const decided = new Promise(r => { decide = r; });
  const engine = { kind: 'probing', version: null, initMs: null, note: '' };

  const settle = (kind, note = '') => {
    const first = active == null;
    active = kind; engine.kind = kind; engine.note = note;
    decide();
    if (!first || kind === 'worker') onChange(kind, note);
  };
  const useMock = note => { if (active !== 'worker') settle('mock', note); };

  function post(op, args = {}, transfer = []) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, op });
      try { worker.postMessage({ id, op, ...args }, transfer); }
      catch (e) { pending.delete(id); reject(e); }
    });
  }

  if (forceMock || typeof Worker === 'undefined') {
    useMock(forceMock ? 'the mock engine was asked for (#mock)' : 'this page cannot start workers');
  } else {
    const t0 = performance.now();
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'jig engine' });
      worker.onmessage = e => {
        const msg = e.data;
        if (!msg || typeof msg !== 'object' || msg.id == null) {
          if (!active) useMock('dist/worker.js does not answer the protocol yet');
          return;
        }
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.ok) { const { id, ok, ...rest } = msg; p.resolve(rest); }
        else p.reject(Object.assign(new Error(msg.error?.message || `${p.op} failed`), msg.error || {}));
      };
      worker.onerror = e => {
        e.preventDefault?.();
        const message = e.message || 'the engine worker failed to load';
        for (const [id, p] of pending) { p.reject(new Error(message)); pending.delete(id); }
        if (active !== 'worker') useMock(message);
      };
      setTimeout(() => useMock(`the engine worker did not answer init within ${GRACE_MS / 1000} s`), GRACE_MS);
      post('init').then(r => {
        engine.version = r.version ?? null;
        engine.initMs = r.ms ?? performance.now() - t0;
        settle('worker');
      }, err => useMock(err.message));
    } catch (e) {
      useMock(e.message);
    }
  }

  engine.ready = decided;
  engine.request = async (op, args = {}, transfer = []) => {
    await decided;
    if (active === 'worker') return post(op, args, transfer);
    return mock.request(op, args);
  };
  engine.terminate = () => { worker?.terminate(); };
  return engine;
}
