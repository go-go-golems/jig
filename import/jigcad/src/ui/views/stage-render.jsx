import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { loadCandela } from '../../render/host.js';
import { saveOrCopy } from '../save.js';

const formats = {
  'HD landscape': [1280, 720], 'Full HD landscape': [1920, 1080],
  'Full HD portrait': [1080, 1920], Square: [1080, 1080],
};

export function StageRender({ host, job, close }) {
  const dialog = useRef(null), sheet = useRef(null), active = useRef(null);
  const [format, setFormat] = useState('HD landscape');
  const [width, setWidth] = useState(1280), [height, setHeight] = useState(720);
  const [fit, setFit] = useState(true), [zoom, setZoom] = useState(1);
  const [row, setRow] = useState(null), [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const study = job.study, busy = progress != null;
  const valid = [width, height].every(n => Number.isInteger(n) && n >= 32 && n <= 4096);
  const settings = { width, height, fit, zoom, row };
  useLayoutEffect(() => {
    dialog.current.showModal();
    return () => active.current?.abort();
  }, []);
  useLayoutEffect(() => {
    if (valid) job.draw(sheet.current, settings);
  }, [width, height, fit, zoom, row, job]);
  function choose(name) {
    setFormat(name);
    if (formats[name]) {
      setWidth(formats[name][0]);
      setHeight(formats[name][1]);
    }
  }
  async function png() {
    try {
      const blob = await new Promise(resolve => sheet.current.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('PNG encoding failed');
      await saveOrCopy(host, job.name + '-stage.png', new Uint8Array(await blob.arrayBuffer()), '', 'image/png');
    } catch (e) { setError(e.message); }
  }
  async function movie() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setProgress(0);
    setError('');
    let writer;
    try {
      const { VideoWriter, videoSupport } = await loadCandela();
      const fps = 24, support = await videoSupport(width, height, fps);
      const container = support.mp4 ? 'mp4' : 'webm';
      if (!support[container]) throw Error('This browser has no video encoder for these dimensions.');
      writer = await VideoWriter.create({ container, width, height, fps });
      const output = document.createElement('canvas');
      const count = Math.max(2, Math.round(study.seconds * fps));
      for (let i = 0; i < count; i++) {
        controller.signal.throwIfAborted();
        const sample = Math.round(i * study.last / (study.cyclic ? count : count - 1));
        job.draw(output, { ...settings, row: sample });
        await writer.add(output);
        setProgress(Math.round((i + 1) / count * 100));
        if (i % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      const data = await writer.finish();
      controller.signal.throwIfAborted();
      await saveOrCopy(host, job.name + '-stage.' + container, data, '', 'video/' + container);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      writer?.close();
      active.current = null;
      setProgress(null);
    }
  }
  return <dialog class="stage-render" ref={dialog} aria-label="Render CAD Stage" onCancel={close}>
    <header><b>Render CAD Stage</b><button class="btn sm" onClick={close}>Close</button></header>
    <fieldset disabled={busy}>
      <label>Format <select aria-label="Format" value={format} onChange={e => choose(e.currentTarget.value)}>
        {[...Object.keys(formats), 'Custom'].map(f => <option key={f}>{f}</option>)}
      </select></label>
      <label>Width <input type="number" min="32" max="4096" value={width}
        onInput={e => { setFormat('Custom'); setWidth(+e.currentTarget.value); }} /></label>
      <label>Height <input type="number" min="32" max="4096" value={height}
        onInput={e => { setFormat('Custom'); setHeight(+e.currentTarget.value); }} /></label>
      <label>Framing <select aria-label="Framing" value={fit ? 'fit' : 'stage'} onChange={e => setFit(e.currentTarget.value === 'fit')}>
        <option value="fit">{study ? 'Fit whole study' : 'Fit model'}</option><option value="stage">Stage camera</option>
      </select></label>
      <label>Zoom <input type="range" min="0.25" max="3" step="0.05" value={zoom}
        onInput={e => setZoom(+e.currentTarget.value)} /></label>
    </fieldset>
    <div class="render-camera-preview"><canvas ref={sheet} aria-label="Render camera preview" hidden={!valid} /></div>
    {study && <label>Study frame <input type="range" min="0" max={study.rows.length - 1}
      value={study.rows.indexOf(row ?? study.currentRow())} disabled={busy}
      onInput={e => setRow(study.rows[+e.currentTarget.value])} /></label>}
    <footer>
      <button class="btn sm" disabled={!valid || busy} onClick={png}>Save PNG</button>
      {study && <button class="btn sm" disabled={!valid || busy || width % 2 || height % 2 || !study.complete}
        onClick={movie}>Render video</button>}
      {busy && <><output>{progress}%</output><button class="btn sm" onClick={() => active.current?.abort()}>Cancel render</button></>}
      {!valid ? 'Choose dimensions from 32 to 4096 pixels.' : study && (!study.complete
        ? 'The study contains unreachable samples.' : (width % 2 || height % 2) ? 'Video dimensions must be even.' : '')}
      {error && <span role="alert">{error}</span>}
    </footer>
  </dialog>;
}
