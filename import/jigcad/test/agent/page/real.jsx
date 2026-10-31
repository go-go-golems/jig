// The agent panel on the shell's real Host (src/host/host.js) with its in-thread mock engine (#mock behaviour),
// driven by a scripted sample whose steps use the scope generically. Built by test/agent/render.mjs.
import './fixture.js';
import { render } from 'preact';
import tokens from '../../../guides/agent/tokens.css';
import { Host } from '../../../src/host/host.js';
import { AgentPanel } from '../../../src/agent/panel.jsx';

const theme = location.hash === '#dark' ? 'dark' : 'light';
const st = document.createElement('style');
st.textContent = tokens + '\nhtml, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 400 var(--fs-s)/1.45 var(--font-ui); }\n#tile { width: 518px; height: 848px; display: flex; flex-direction: column; }';
document.head.appendChild(st);
try { localStorage.clear(); localStorage.setItem('jigcad.v1.theme', JSON.stringify(theme)); } catch { /* no storage */ }

export const REAL_STEPS = [
  'return files.list();',
  'const r = await run();\nreturn { ok: r.ok, errors: r.errors, faces: r.summary && r.summary.faces };',
  "const top = await faces('>Z').catch(e => e.message);\nreturn Array.isArray(top) ? top.slice(0, 2).map(f => ({ name: f.name, area: f.area })) : top;",
  'try { return program.params().map(p => `${p.name} = ${p.text}`); } catch (e) { return e.message; }',
  "const v = await check(files.read('script.js').replace('wall: mm(2)', 'wall: mm(3)'));\nreturn { ok: v.ok, errors: v.errors.length, volume: v.metrics ? v.metrics.volume : null };",
  "try {\n  const top = await faces('>Z');\n  select(top.length ? top[0].name : null);\n  return selection();\n} catch (e) { return e.message; }",
  "let bbox; try { bbox = measure.bbox(); } catch (e) { bbox = e.message; }\nreturn { why: await why('>Z').catch(e => e.message), view: view.set({ name: 'front' }), bbox };",
];
const host = new Host({ forceMock: true });
window.__host = host;
window.__events = [];
for (const ev of ['focus', 'selection', 'view', 'toast']) host.on(ev, d => window.__events.push([ev, ev === 'selection' ? d && d.name : ev === 'focus' ? d.view : ev === 'view' ? d.name : d && d.text]));
const sample = async (messages, opts) => {
  window.__messages = messages;
  for (const code of REAL_STEPS) await opts.tools[0].execute({ code }, { signal: opts.signal });
  const text = 'Checked on the real host: [script.js:2](lab:open?file=script.js&line=2), [the top face](lab:face?name=body/end), [front](lab:view?name=front).';
  opts.onText({ text, delta: text });
  return { text };
};
host.loadPreset('A-01').then(() => {
  render(<AgentPanel host={host} sample={sample} />, document.getElementById('tile'));
  window.__ready = true;
});
