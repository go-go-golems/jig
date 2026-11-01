// JIG-012: check the agent's frame sandbox in a separate headless Chrome (temporary profile) on jigcad serve.
//   node 01-browser-sandbox-check.mjs [base]
// Starts the sandbox through window.jigSandbox, runs steps the agent would run, and probes the isolation:
// no network (fetch refused by the frame's CSP), no storage (opaque origin), no parent page.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.argv[2] || 'http://127.0.0.1:8787/';
const dir = mkdtempSync(join(tmpdir(), 'jig-sb-'));
const proc = spawn('/usr/bin/google-chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const url = await new Promise((res, rej) => { let b = ''; proc.stderr.on('data', d => { b += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(b); if (m) res(m[1]); }); setTimeout(() => rej(new Error(b)), 20000); });
const ws = new WebSocket(url); await new Promise(r => ws.onopen = r);
let id = 0; const wait = new Map(); const consoleLines = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } else if (m.method === 'Runtime.consoleAPICalled') consoleLines.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (m, p) => send(m, p, sessionId);
const ev = async x => { const r = await page('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true, timeout: 120000 }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
try {
  await page('Runtime.enable'); await page('Page.enable');
  await page('Page.navigate', { url: base });
  await ev(`(async () => { for (let i = 0; i < 300 && !(window.jigHost && window.jigHost.engine); i++) await new Promise(r => setTimeout(r, 100)); await jigHost.engine.ready; await jigHost.compileNow?.(); return jigHost.engine.kind; })()`);
  // the agent panel's module loads when the Agent tab opens (tabs activate on pointer events)
  for (let i = 0; i < 100 && !(await ev(`!!window.jigSandbox || [...document.querySelectorAll('[role=tab]')].some(b => b.textContent.trim().startsWith('Agent'))`)); i++) await new Promise(r => setTimeout(r, 100));
  if (!(await ev('!!window.jigSandbox'))) {
    const r = await ev(`(() => { const b = [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.trim().startsWith('Agent')).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await ev(`(async () => { for (let i = 0; i < 100 && !window.jigSandbox; i++) await new Promise(r => setTimeout(r, 100)); return !!window.jigSandbox; })()`);
  }
  const t0 = Date.now();
  console.log('start:', JSON.stringify(await ev('jigSandbox.start()')), `${Date.now() - t0} ms (first start includes fetching the bytes)`);
  const steps = {
    'j in scope': "return String(j.fit.hole(mm(6), 'press'))",
    'check() live program': "const r = await check(); return { ok: r.ok, volume: r.metrics.volume, planes: (await r.program.faces('%plane')).length }",
    'sync files.read': "return files.read('script.js').split('\\n').length",
    'program.summary (page state)': "return program.summary().name",
    'fetch refused': `try { await fetch('${base}api/sample/models'); return 'FETCHED (bad)'; } catch (e) { return 'refused: ' + e.message; }`,
    'WebSocket refused': `return await new Promise(r => { self.addEventListener('securitypolicyviolation', e => r('refused by CSP: ' + e.violatedDirective), { once: true }); try { const w = new WebSocket('ws://127.0.0.1:8787/'); w.onopen = () => r('opened (bad)'); } catch (e) { r('refused: ' + e.name); } setTimeout(() => r('no violation event within 2 s'), 2000); })`,
    'importScripts refused': `try { importScripts('${base}app.js'); return 'loaded (bad)'; } catch (e) { return 'refused: ' + e.name; }`,
    'no localStorage': "return typeof localStorage",
    'no document': "return typeof document",
    'indexedDB refused': "try { indexedDB.open('x'); return 'opened (bad)'; } catch (e) { return 'refused: ' + e.name; }",
    'origin': "return self.origin",
    'parent unreachable': "return typeof parent",
  };
  for (const [name, code] of Object.entries(steps)) {
    const r = await ev(`jigSandbox.run(${JSON.stringify(code)}).then(r => r.text)`);
    console.log(`${name}: ${r.replace(/\n/g, ' | ')}`);
  }
  const loop = await ev(`jigSandbox.run('while (true) {}', { timeoutMs: 2000 }).then(r => r.text)`);
  console.log('runaway loop:', loop);
  const t1 = Date.now();
  console.log('after restart:', await ev(`jigSandbox.run('return 1 + 1').then(r => r.text)`), `${Date.now() - t1} ms (includes the new engine)`);
  
} finally { ws.close(); proc.kill(); setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 500); }
