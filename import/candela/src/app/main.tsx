// main.tsx — boot: the presets, docs and reference come from the bundled content catalog. Pick the preset (the link's #id,
// then this browser's last one), build, start the clock.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Host, store } from './host';
import { App } from './ui/app';
import { captureWorkbench } from './ui/capture';
import { saveFile } from './ui/common';
import { CANDELA_DATA } from '../content/browser';
import 'katex/dist/katex.min.css';
import './kiln.css';
import './skate.css';
import './candela.css';

const D = CANDELA_DATA;
const host = new Host({ presets: D.presets, docs: D.docs, reference: D.reference });
(window as any).workbench = host;      // for the curious, in the console
host.captureWorkbench = (maxW) => captureWorkbench(host, maxW);
const MIME = (n: string) => (/\.png$/.test(n) ? 'image/png' : /\.zip$/.test(n) ? 'application/zip' : /\.exr$/.test(n) ? 'image/x-exr' : 'application/octet-stream');
host.saveFiles = async (files: { name: string; data: Uint8Array | Blob | string }[]) => {
  let ok = true;
  for (const f of files || []) ok = (await saveFile(host, f.name, new Blob([f.data as BlobPart], { type: MIME(f.name) }))) && ok;
  return ok;
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
ReactDOM.createRoot(document.getElementById('root')!).render(<App host={host} />);
