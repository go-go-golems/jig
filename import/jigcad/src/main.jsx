// jig workbench: styles, fonts, the host, the app.
import { render } from 'preact';
import kiln from './ui/kiln.css';
import jig from './ui/jig.css';
import { Host } from './host/host.js';
import { store } from './host/store.js';
import { App } from './ui/app.jsx';

// Styles go in as constructed style sheets (CSSOM), which a strict style-src policy does not block.
function addStyles(...texts) {
  try {
    const sheets = texts.map(t => { const s = new CSSStyleSheet(); s.replaceSync(t); return s; });
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...sheets];
  } catch {
    for (const t of texts) { const el = document.createElement('style'); el.textContent = t; document.head.appendChild(el); }
  }
}
addStyles(kiln, jig);

// IBM Plex Mono belongs to the stage's canvas labels; the interface itself is Arial.
try {
  for (const w of [400, 500, 600, 700]) {
    const f = new FontFace('IBM Plex Mono', `url(./fonts/ibm-plex-mono-latin-${w}-normal.woff2)`, { weight: String(w), display: 'swap' });
    document.fonts.add(f);
    f.load().catch(() => {});
  }
} catch { /* FontFace unavailable: canvases fall back to the system monospace */ }

const host = new Host({ forceMock: location.hash === '#mock' });
globalThis.jigHost = host;           // for the console and the UI tests

render(<App host={host} />, document.getElementById('root'));

const presets = host.presets();
const first = store.get('preset');
const id = presets.some(p => p.id === first) ? first : presets[0]?.id;
if (id) host.loadPreset(id);
else host.loadScratch({ 'script.js': "return j.part('box')\n  .params({ w: mm(60), d: mm(40), h: mm(30) })\n  .extrude(j.sketch('base', { on: j.plane.XY }).rect('outline', 'w', 'd', { center: true }).profiles(), 'h', { id: 'body' })\n" }, { title: 'A first box', about: 'no presets were bundled, so here is a box' });
