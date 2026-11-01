// look() for the evaluation harness (JIG-006 §3.5). Node has no canvas, so the sheet is drawn by the workbench itself
// in headless Chrome: start Chrome with a DevTools port, open the app (served by `jigcad serve`), and for each look()
// copy the Node host's preset, files and overrides into the page's jigHost, compile there and return the page's
// host.renderView(…). The DevTools protocol is spoken over Node's built-in WebSocket; no packages.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/snap/bin/chromium'];

/** The first Chrome binary that exists ($CHROME first). */
export function findChrome() {
  const bin = CANDIDATES.find(p => p && existsSync(p));
  if (!bin) throw new Error('no Chrome found: set $CHROME');
  return bin;
}

/** Read Chrome's stderr until it prints its DevTools URL; → the browser's ws URL. */
function devtoolsURL(proc, ms = 20000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not open a DevTools port in ${ms / 1000} s: ${buf.slice(-400)}`)), ms);
    proc.stderr.on('data', d => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}): ${buf.slice(-400)}`)); });
  });
}

/** A minimal DevTools client: send(method, params, sessionId) → result; events go to on(method, fn). */
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const waiting = new Map(), handlers = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}, sessionId) {
        const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
        return new Promise((res, rej) => { waiting.set(msg.id, { res, rej, method }); ws.send(JSON.stringify(msg)); });
      },
      on(method, fn) { handlers.set(method, fn); },
      close() { try { ws.close(); } catch { /* closed */ } },
    });
    ws.onerror = e => reject(new Error('DevTools socket: ' + (e.message || 'error')));
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && waiting.has(m.id)) {
        const w = waiting.get(m.id); waiting.delete(m.id);
        if (m.error) w.rej(new Error(`${w.method}: ${m.error.message}`)); else w.res(m.result);
      } else if (m.method && handlers.has(m.method)) handlers.get(m.method)(m.params, m.sessionId);
    };
  });
}

// Runs in the page: wait for the workbench, then make its host match the Node host and draw.
const PAGE_READY = `(async () => {
  for (let i = 0; i < 300 && !(globalThis.jigHost && globalThis.jigHost.engine); i++) await new Promise(r => setTimeout(r, 100));
  if (!globalThis.jigHost) throw new Error('no jigHost on the page');
  await jigHost.engine.ready;
  return jigHost.engine.kind || 'ready';
})()`;
const pageRender = a => `(async (a) => {
  const h = globalThis.jigHost;
  if (a.presetId && (!h.preset || h.preset.id !== a.presetId)) { if (!(await h.loadPreset(a.presetId))) throw new Error('no preset ' + a.presetId); }
  for (const p of [...h.files.keys()]) if (!(p in a.files) && typeof h.deleteFile === 'function') h.deleteFile(p);
  for (const [p, t] of Object.entries(a.files)) if (h.files.get(p) !== t) { if (h.files.has(p)) h.setFile(p, t); else h.addFile(p, t); }
  h.resetOverrides();
  for (const [k, v] of Object.entries(a.overrides || {})) h.setOverride(k, v);
  await h.compileNow();                         // setOverride schedules a compile that would supersede a plain compile()
  return await h.renderView({ view: a.view, width: a.width, height: a.height, overlays: a.overlays });
})(${JSON.stringify(a)})`;

/**
 * Start Chrome on the workbench at `base`. → { render({ presetId, files, overrides, view, width, height, overlays }),
 * close(), renders, ms }. render resolves to host.renderView's { mimeType, data, width, height, view }.
 */
export async function startChromeLook({ base = 'http://127.0.0.1:8787/', chrome = findChrome(), log = () => {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jigcad-look-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--window-size=1400,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cleanup = () => { try { proc.kill(); } catch { /* gone */ } try { rmSync(dir, { recursive: true, force: true }); } catch { /* busy */ } };
  try {
    const cdp = await connect(await devtoolsURL(proc));
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => cdp.send(method, params, sessionId);
    const evaluate = async (expression, timeout = 60000) => {
      const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
      return r.result.value;
    };
    await page('Page.enable');
    await page('Runtime.enable');
    const t0 = performance.now();
    await page('Page.navigate', { url: base });
    const kind = await evaluate(PAGE_READY, 60000);
    log(`look: Chrome ${chrome} on ${base} (${kind}) in ${Math.round(performance.now() - t0)} ms`);
    const stats = { renders: 0, ms: 0 };
    return {
      stats,
      async render(a) {
        const t = performance.now();
        const shot = await evaluate(pageRender(a));
        stats.renders++; stats.ms += performance.now() - t;
        return shot;
      },
      close() { cdp.close(); cleanup(); },
    };
  } catch (e) { cleanup(); throw e; }
}
