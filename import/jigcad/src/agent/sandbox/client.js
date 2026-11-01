// The page's sandbox client (JIG-012), shared by the browser frame (frame.js) and the Node worker (node.js).
// A sandbox is a long-lived worker with its own engine. Each eval gets its own MessageChannel: the page sends
// { t: 'eval', port } on the worker's control port, then { t: 'start', code, api, ctx, readOnly } on the eval port,
// answers { t: 'call', id, path, args } with { t: 'ret', id, ok, value | error, ctx? }, and ends at { t: 'done' }.
// A step that runs past its time, or that the person stops, ends the worker: nothing else interrupts a loop that
// never yields. The next eval starts a new one.
import { listen, closePort } from './ports.js';
import { bridge, ctxOf } from './serve.js';

export const SANDBOX_TIMEOUT_MS = 25000;

/**
 * boot() → { control, channel(), terminate(), onExit(fn) } and posts init; it resolves when the worker's engine is
 * ready ({ t: 'ready' }) with { ms, compute }. kind names the sandbox in notes ('frame', 'node').
 */
export function createSandboxClient({ kind, boot }) {
  let w = null, booting = null, gen = 0;
  const client = {
    kind,
    info: null,
    /** Start the worker and its engine (idempotent); → { ms, compute }. */
    start() {
      if (!booting) {
        const g = ++gen;
        booting = boot().then(x => {
          if (g !== gen) { x.terminate(); throw new Error('the sandbox was restarted while it started'); }
          w = x; client.info = x.ready;
          x.onExit?.(() => { if (w === x) { w = null; booting = null; } });
          return x.ready;
        }, e => { if (g === gen) booting = null; throw e; });
      }
      return booting;
    },
    /** End the worker; the next eval starts a new one. */
    restart() { gen++; const x = w; w = null; booting = null; client.info = null; if (x) x.terminate(); },
    close() { client.restart(); },
    /** → { ok, text, ms }; rejects with code 'cancelled' when signal aborts. */
    async eval({ code, api = [], ctx, readOnly = false, onCall, signal, timeoutMs = SANDBOX_TIMEOUT_MS }) {
      const t0 = Date.now();
      await client.start();
      const x = w;
      if (!x) throw new Error('the sandbox is not running');
      const { port1, port2 } = x.channel();
      return new Promise((resolve, reject) => {
        let done = false, timer = null, stop = null, onAbort = null;
        const end = (fn, v) => {
          if (done) return; done = true;
          clearTimeout(timer); stop?.(); closePort(port1);
          if (signal && onAbort) signal.removeEventListener('abort', onAbort);
          fn(v);
        };
        stop = listen(port1, async m => {
          if (done || !m || typeof m !== 'object') return;
          if (m.t === 'done') return end(resolve, { ok: m.ok === true, text: String(m.text ?? ''), ms: Date.now() - t0 });
          if (m.t !== 'call') return;
          let reply;
          try { const r = await onCall(String(m.path), Array.isArray(m.args) ? m.args : []); reply = { t: 'ret', id: m.id, ok: true, value: r?.value, ...(r?.ctx ? { ctx: r.ctx } : {}) }; }
          catch (e) { reply = { t: 'ret', id: m.id, ok: false, error: { name: String(e?.name || 'Error'), message: String(e?.message ?? e) } }; }
          if (done) return;
          try { port1.postMessage(reply); }
          catch (e) { port1.postMessage({ t: 'ret', id: m.id, ok: false, error: { name: 'DataCloneError', message: `${m.path}: its result cannot be sent to the sandbox (${e.message})` } }); }
        });
        timer = setTimeout(() => {
          end(resolve, { ok: false, text: `Error: eval timed out after ${Math.round(timeoutMs / 100) / 10} s; the sandbox restarted, so anything the step kept is gone`, ms: Date.now() - t0 });
          client.restart();
        }, timeoutMs);
        if (signal) {
          onAbort = () => { end(reject, Object.assign(new Error('stopped by the person'), { code: 'cancelled' })); client.restart(); };
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort, { once: true });
        }
        x.onExit?.(() => end(reject, new Error('the sandbox worker ended')));
        try {
          x.control.postMessage({ t: 'eval', port: port2 }, [port2]);
          port1.postMessage({ t: 'start', code: String(code), api, ctx, readOnly });
        } catch (e) { end(reject, e); }
      });
    },
  };
  return client;
}

/** Run one step's code in the sandbox against the page's workbench → { text, error, ms, images }. */
export async function runInSandbox(sandbox, host, code, { readOnly = false, signal, timeoutMs } = {}) {
  const images = [];
  const br = bridge(host, { readOnly, images });
  const r = await sandbox.eval({ code, api: br.paths, ctx: ctxOf(host), readOnly, onCall: br.call, signal, timeoutMs });
  return { text: r.text, error: !r.ok, ms: r.ms, images, value: undefined };
}
