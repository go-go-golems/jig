// main.jsx — boot: the presets, docs and reference are in window.CANDELA_DATA. Pick the preset (the link's #id,
// then this browser's last one), build, start the clock.
import { Host, store } from './host.js';
import { App } from './ui/app.jsx';
import { captureWorkbench } from './ui/capture.js';
import { saveFile } from './ui/common.jsx';
import { zipStore } from '../src/output.js';

const D = window.CANDELA_DATA;
const host = new Host({ presets: D.presets, docs: D.docs, reference: D.reference });
window.workbench = host;      // for the curious, in the console
host.captureWorkbench = (maxW) => captureWorkbench(host, maxW);
const MIME = n => (/\.png$/.test(n) ? 'image/png' : /\.zip$/.test(n) ? 'application/zip' : /\.exr$/.test(n) ? 'image/x-exr' : 'application/octet-stream');
// inside claude.ai a page may save only some file types (.exr is not one): those files travel in a .zip
const SAVABLE = /\.(png|jpe?g|webp|gif|zip|json|txt|md|csv|html|svg|pdf)$/i;
host.saveFiles = async files => {
  let list = (files || []).slice();
  if (window.claude) {
    const other = list.filter(f => !SAVABLE.test(f.name));
    if (other.length) list = list.filter(f => SAVABLE.test(f.name)).concat([{ name: other[0].name.replace(/\.[^.]+$/, '') + (other.length > 1 ? '-files' : '') + '.' + other[0].name.split('.').pop() + '.zip', data: zipStore(other) }]);
  }
  let ok = true; for (const f of list) ok = (await saveFile(host, f.name, new Blob([f.data], { type: MIME(f.name) }))) && ok; return ok;
};
const fromHash = (location.hash || '').replace(/^#/, '');
const first = (fromHash && host.presetById(fromHash) && fromHash) || store.get('preset', null) || D.presets[0].id;
host.loadPreset(host.presetById(first) ? first : D.presets[0].id);
host.start();
// poses from an animation engine in another frame or window: postMessage({ type: 'candela.poses', poses })
window.addEventListener('message', e => {
  const m = e.data; if (!m || typeof m !== 'object' || m.type !== 'candela.poses') return;
  try { host.setPoses(m.poses && typeof m.poses === 'object' ? m.poses : null); } catch (x) { host.toast('poses: ' + x.message, true); }
});
window.addEventListener('hashchange', () => { const id = location.hash.replace(/^#/, ''); if (id && host.presetById(id) && host.preset.id !== id) host.loadPreset(id); });
ReactDOM.createRoot(document.getElementById('root')).render(<App host={host} />);
