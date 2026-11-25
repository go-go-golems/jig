import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { onTheme } from '../../stage/theme.js';
import { loadCandela } from '../../render/host.js';
import { createStagePBR } from '../../render/stage-pbr.js';
import { shotAt } from '../../render/shot.js';
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
  const [mode, setMode] = useState('CAD lines'), [mix, setMix] = useState(1);
  const [edgeAlpha, setEdgeAlpha] = useState(0.8), [spp, setSpp] = useState(4);
  const [layout, setLayout] = useState('preset');
  const components = job.program?.assembly?.components ?? [];
  const [inset, setInset] = useState(components[0]?.id ?? '');
  const [ready, setReady] = useState(false);
  const pbr = useRef(null), queue = useRef(Promise.resolve());
  const settings = { width, height, fit, zoom, row };

  function styleAt(sample) {
    if (mode === 'Preset animation') {
      const seconds = (sample ?? study.currentRow()) * study.seconds / study.last;
      return shotAt(study.shot, seconds);
    }
    if (mode === 'PBR') return { surface: 1, edges: 0, annotations: 0 };
    if (mode === 'PBR + CAD edges') return { surface: mix, edges: edgeAlpha, annotations: 1 };
    return null;
  }
  function renderFrame(target, sample, signal) {
    const style = styleAt(sample);
    const fraction = study ? (sample ?? study.currentRow()) / study.last : 0;
    const frame = { ...settings, row: sample, style, fraction,
      layout: layout === 'preset' ? undefined : layout === 'detail' ? { inset } : layout };
    if (!style?.surface) return job.draw(target, frame);
    const run = async () => {
      signal.throwIfAborted();
      if (!pbr.current) pbr.current = await createStagePBR(host);
      signal.throwIfAborted();
      await job.draw(target, frame, params => pbr.current.render({ ...params, time: fraction * (study?.seconds ?? 0), spp, signal }));
    };
    const done = queue.current.then(run);
    queue.current = done.catch(() => {});
    return done;
  }

  useLayoutEffect(() => {
    dialog.current.showModal();
    return () => {
      active.current?.abort();
      queue.current.then(() => pbr.current?.dispose());
    };
  }, []);
  useLayoutEffect(() => {
    let current;
    const redraw = async () => {
      current?.abort();
      current = new AbortController();
      const { signal } = current;
      setReady(false);
      setError('');
      if (!valid) return;
      // Render offscreen; only publish the result if it still matches the controls.
      const target = document.createElement('canvas');
      try {
        await renderFrame(target, row, signal);
        signal.throwIfAborted();
        const canvas = sheet.current;
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(target, 0, 0);
        setReady(true);
      } catch (e) { if (!signal.aborted) setError(e.message); }
    };
    redraw();
    const unsubscribe = onTheme(redraw, sheet.current.ownerDocument);
    return () => { unsubscribe(); current?.abort(); };
  }, [width, height, fit, zoom, row, job, mode, mix, edgeAlpha, spp, layout, inset]);
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
        await renderFrame(output, sample, controller.signal);
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
      {job.supportsBeauty && <label>Style <select aria-label="Render style" value={mode} onChange={e => setMode(e.currentTarget.value)}>
        {['CAD lines', 'PBR', 'PBR + CAD edges', ...(study?.shot ? ['Preset animation'] : [])].map(m => <option key={m}>{m}</option>)}
      </select></label>}
      {job.supportsBeauty && <label>Composition <select value={layout} aria-label="Composition" onChange={e => setLayout(e.currentTarget.value)}>
        <option value="preset">As authored</option><option value="stage">Single camera</option>
        {study && <option value="turntable">Turntable</option>}<option value="front-side">Front and side</option>
        {components.length > 0 && <option value="detail">Detail inset</option>}
      </select></label>}
      {layout === 'detail' && <label>Detail part <select value={inset} aria-label="Detail part" onChange={e => setInset(e.currentTarget.value)}>
        {components.map(c => <option key={c.id}>{c.id}</option>)}
      </select></label>}
      {mode === 'PBR + CAD edges' && <>
        <label>Surface blend <input type="range" min="0" max="1" step="0.05" value={mix}
          onInput={e => setMix(+e.currentTarget.value)} /></label>
        <label>Edge opacity <input type="range" min="0" max="1" step="0.05" value={edgeAlpha}
          onInput={e => setEdgeAlpha(+e.currentTarget.value)} /></label>
      </>}
      {mode !== 'CAD lines' && <label>Samples per pixel <select value={spp} onChange={e => setSpp(+e.currentTarget.value)}>
        {[1,4,16,64].map(n => <option key={n}>{n}</option>)}
      </select></label>}
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
      <button class="btn sm" disabled={!valid || !ready || busy} onClick={png}>Save PNG</button>
      {study && <button class="btn sm" disabled={!valid || !ready || busy || width % 2 || height % 2 || !study.complete}
        onClick={movie}>Render video</button>}
      {busy && <><output>{progress}%</output><button class="btn sm" onClick={() => active.current?.abort()}>Cancel render</button></>}
      {!valid ? 'Choose dimensions from 32 to 4096 pixels.' : study && (!study.complete
        ? 'The study contains unreachable samples.' : (width % 2 || height % 2) ? 'Video dimensions must be even.' : '')}
      {valid && !ready && !error && <span role="status">Rendering preview…</span>}
      {error && <span role="alert">{error}</span>}
    </footer>
  </dialog>;
}
