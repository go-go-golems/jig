// The sandbox in Node (JIG-012): a worker_threads Worker that runs the same runner with its own engine, for the
// agent-eval harness and the tests. Node has no CSP; what matters here is that the step runs as it does in the
// browser: in its own engine, with j in scope, bridged to the host for workbench calls.
import { Worker, MessageChannel } from 'node:worker_threads';
import { createSandboxClient } from './client.js';
import { listen } from './ports.js';

export function createNodeSandbox({ compute } = {}) {
  return createSandboxClient({
    kind: 'node',
    boot: () => new Promise((resolve, reject) => {
      const ctl = new MessageChannel();
      const worker = new Worker(new URL('./node-worker.mjs', import.meta.url), { workerData: { port: ctl.port2 }, transferList: [ctl.port2] });
      const exits = [];
      worker.on('exit', () => { for (const f of exits) f(); });
      worker.on('error', e => reject(e));
      const stop = listen(ctl.port1, m => {
        if (m?.t === 'ready') { stop(); resolve({ control: ctl.port1, channel: () => new MessageChannel(), terminate: () => worker.terminate(), onExit: f => exits.push(f), ready: { ms: m.ms, compute: m.compute } }); }
        else if (m?.t === 'failed') { stop(); worker.terminate(); reject(new Error(m.message)); }
      });
      ctl.port1.postMessage({ t: 'init', ...(compute === 'js' ? { noCompute: true } : {}) });
    }),
  });
}
