import { useEffect, useState } from 'preact/hooks';
import { defaultLook } from '../../render/host.js';
import { inspectionStudio, projectStudio, readStudios, validateStudio, writeStudios } from '../../render/studios.js';
import { saveOrCopy } from '../save.js';

export function RenderStudios({ host, onStudio }) {
  const [, refresh] = useState(0);
  const [name, setName] = useState(''), [source, setSource] = useState('');
  const [ev, setEv] = useState(''), [modules, setModules] = useState({});
  const [error, setError] = useState('');
  const [template, setTemplate] = useState({ top: '#cbe4ff', bottom: '#243344', illuminance: 700,
    materialColor: '#b9c9d3', address: '' });
  const change = (key, value) => setTemplate({ ...template, [key]: value });
  useEffect(() => host.on('files', () => refresh(n => n + 1)), [host]);
  let library, parseError;
  try { library = readStudios(host.files); } catch (e) { parseError = e.message; }
  const active = library?.active || '';
  const selected = library?.entries.get(active) ?? projectStudio(host.files, defaultLook({ ground: false }));
  const signature = JSON.stringify(selected);
  function edit(studio, title) {
    setName(title); setSource(studio.source); setEv(studio.ev == null ? '' : String(studio.ev)); setModules(studio.modules);
  }
  useEffect(() => {
    edit(selected, active);
    onStudio(selected);
    setError('');
  }, [signature, active, host]);
  function save() {
    try {
      const key = name.trim();
      if (!key) throw Error('Choose a studio name.');
      if (key !== active && library.entries.has(key)) throw Error('A studio already uses this name.');
      const studio = validateStudio({ source, ev: ev.trim() === '' ? null : Number(ev), modules });
      const entries = new Map(library.entries).set(key, studio);
      writeStudios(host, entries, key);
    } catch (e) { setError(e.message); }
  }
  async function importFile(file) {
    if (!file) return;
    try {
      const record = JSON.parse(await file.text());
      if (record.format !== 'jig-render-studio/1' || typeof record.name !== 'string') throw Error('Unsupported render studio file.');
      edit(validateStudio(record.studio), record.name);
      setError('');
    } catch (e) { setError(e.message); }
  }
  return <details class="render-studios"><summary>Render studio{active ? ' · ' + active : ''}</summary>
    {parseError ? <p role="alert">{parseError}</p> : <div class="studio-fields">
      <label>Active studio <select aria-label="Active studio" value={active} onChange={e => writeStudios(host, library.entries, e.currentTarget.value)}>
        <option value="">Project look</option>
        {[...library.entries.keys()].map(key => <option value={key} key={key}>{key}</option>)}
      </select></label>
      <label>Studio name <input value={name} onInput={e => setName(e.currentTarget.value)} /></label>
      <label>Fixed EV <input type="number" step="any" placeholder="Scene exposure" value={ev} onInput={e => setEv(e.currentTarget.value)} /></label>
      <details class="studio-builder"><summary>Build an inspection look</summary>
        <label>Key light (lux) <input type="number" min="0" value={template.illuminance}
          onInput={e => change('illuminance', e.currentTarget.valueAsNumber)} /></label>
        <label>Background top <input type="color" value={template.top} onInput={e => change('top', e.currentTarget.value)} /></label>
        <label>Background bottom <input type="color" value={template.bottom} onInput={e => change('bottom', e.currentTarget.value)} /></label>
        <label>Material component <input placeholder="Occurrence ID, or *" value={template.address} onInput={e => change('address', e.currentTarget.value)} /></label>
        <label>Material color <input type="color" value={template.materialColor} onInput={e => change('materialColor', e.currentTarget.value)} /></label>
        <button class="btn sm" onClick={() => {
          try { setSource(inspectionStudio(template)); setModules({}); setError(''); } catch (e) { setError(e.message); }
        }}>Use generated scene</button>
      </details>
      <label class="studio-source">Candela scene (lights, materials and background) <textarea rows="8" value={source}
        onInput={e => setSource(e.currentTarget.value)} /></label>
      <button class="btn sm" onClick={save}>Save and apply studio</button>
      {active && <><button class="btn sm" onClick={() => {
        const entries = new Map(library.entries); entries.delete(active); writeStudios(host, entries, '');
      }}>Remove studio</button>
      <button class="btn sm" onClick={() => saveOrCopy(host, 'studio.json',
        JSON.stringify({ format: 'jig-render-studio/1', name: active, studio: selected }, null, 2), '', 'application/json')}>Export studio</button></>}
      <label>Import studio <input type="file" accept="application/json,.json"
        onChange={e => { const el = e.currentTarget; importFile(el.files[0]); el.value = ''; }} /></label>
      {error && <span role="alert">{error}</span>}
    </div>}
  </details>;
}
