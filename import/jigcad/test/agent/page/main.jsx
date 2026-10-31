// The render test page: the real AgentPanel against the mock host and a scripted sample.
// ?s=empty|thread|ask|off|trouble, #light or #dark. Built by test/agent/render.mjs.
import { render } from 'preact';
import tokens from '../../../guides/agent/tokens.css';
import { AgentPanel } from '../../../src/agent/panel.jsx';
import { createMockHost } from '../mock-host.js';
import { scriptedSample, troubleSample } from '../scripted.js';

const params = new URLSearchParams(location.search);
const scenario = params.get('s') || 'empty';
const theme = location.hash === '#dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
const st = document.createElement('style');
st.textContent = tokens + '\nhtml, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 400 var(--fs-s)/1.45 var(--font-ui); }\n#tile { width: 518px; height: 848px; display: flex; flex-direction: column; border-right: 1px solid var(--hair); }';
document.head.appendChild(st);

try { localStorage.clear(); } catch { /* no storage */ }
if (scenario === 'ask') {
  try { localStorage.setItem('jigcad.v1.agent.settings', JSON.stringify({ mode: 'ask', tier: 'complex', effort: 'high' })); } catch { /* no storage */ }
}

const host = createMockHost();
window.__host = host;
window.__calls = [];
const sample = scenario === 'off' ? null : scenario === 'trouble' ? troubleSample() : scriptedSample(window.__calls);

host.compile().then(() => {
  render(<AgentPanel host={host} sample={sample} />, document.getElementById('tile'));
  window.__ready = true;
});
