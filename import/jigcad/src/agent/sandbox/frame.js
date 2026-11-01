// The sandbox in the browser (JIG-012), after Kiln's construction: a hidden <iframe sandbox="allow-scripts"> made
// from srcdoc has an opaque origin (no cookies, no storage, no access to this page) and a Content-Security-Policy
// that refuses every connection. Its one script starts a dedicated worker from a blob: URL of dist/agent-worker.js's
// text and hands it the control port. The worker loads its engine from bytes this page fetched (it cannot fetch).
// The worker lives for the page session; a step that runs too long or is stopped removes the frame, which ends it.
import { createSandboxClient } from './client.js';
import { listen } from './ports.js';

export const FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:";
const BOOT = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><script>
addEventListener("message", function once(e) {
  if (e.source !== parent || !e.data || e.data.t !== "jig-boot" || !e.data.port) return;
  removeEventListener("message", once);
  var w = new Worker(URL.createObjectURL(new Blob([e.data.source], { type: "text/javascript" })), { name: "jig agent sandbox" });
  w.postMessage({ t: "port", port: e.data.port }, [e.data.port]);
});
</script>`;

// the bytes and the worker source, fetched once per page
let assets = null;
async function fetchAssets(base) {
  if (!assets) assets = (async () => {
    const url = p => new URL(p, base);
    const src = await fetch(url('./agent-worker.js'));
    if (!src.ok) throw new Error(`dist/agent-worker.js: HTTP ${src.status}`);
    const occt = await fetch(url('./occt/replicad_single.gz.wasm'));
    if (!occt.ok) throw new Error(`OpenCascade: HTTP ${occt.status}`);
    const occtBytes = new Uint8Array(await new Response(occt.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    let compute = null;
    try { const r = await fetch(url('./jig_compute.wasm')); if (r.ok) compute = new Uint8Array(await r.arrayBuffer()); } catch { /* JS compute */ }
    return { source: await src.text(), occt: occtBytes, compute };
  })().catch(e => { assets = null; throw e; });
  return assets;
}

export function createFrameSandbox({ base = typeof document !== 'undefined' ? document.baseURI : '' } = {}) {
  return createSandboxClient({
    kind: 'frame',
    boot: async () => {
      const a = await fetchAssets(base);
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.display = 'none';
      frame.srcdoc = BOOT;
      const ctl = new MessageChannel();
      const exits = [];
      const terminate = () => { frame.remove(); for (const f of exits.splice(0)) f(); };
      const ready = new Promise((resolve, reject) => {
        const stop = listen(ctl.port1, m => {
          if (m?.t === 'ready') { stop(); resolve({ ms: m.ms, compute: m.compute }); }
          else if (m?.t === 'failed') { stop(); reject(new Error(m.message)); }
        });
        setTimeout(() => reject(new Error('the sandbox did not start within 60 s')), 60000);
      });
      frame.addEventListener('load', () => {
        frame.contentWindow.postMessage({ t: 'jig-boot', source: a.source, port: ctl.port2 }, '*', [ctl.port2]);
        // copies: the page keeps its bytes for a restart
        ctl.port1.postMessage({ t: 'init', occt: a.occt.slice(), ...(a.compute ? { compute: a.compute.slice() } : { noCompute: true }) });
      }, { once: true });
      document.body.appendChild(frame);
      try { return { control: ctl.port1, channel: () => new MessageChannel(), terminate, onExit: f => exits.push(f), ready: await ready }; }
      catch (e) { terminate(); throw e; }
    },
  });
}
