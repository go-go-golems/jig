import { CAMERAS_FILE, namedEntries } from '../../render/shot-files.js';
import { RenderStudios } from './render-studios.jsx';
import { RenderWorkArea } from './render-work-area.jsx';
import { isWorkArea, outputFrames, outputRow, reachableWorkArea, STAGE_FPS } from '../../render/work-area.js';
import { maskSequence } from '../../render/mask-sequence.js';
import { nativeStageJob } from '../../render/native-stage-job.js';
import { ShotTimeline } from './shot-timeline.jsx';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { onTheme } from '../../stage/theme.js';
import { loadCandela } from '../../render/host.js';
import { createStagePBR } from '../../render/stage-pbr.js';
import { shotAt } from '../../render/shot.js';
import { componentPalette, componentLegend } from '../../stage/component-mask.js';
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
  const count = study ? outputFrames(study) : 1;
  const [first, setFirst] = useState(0), [last, setLast] = useState(count - 1);
  const rangeOK = isWorkArea(first, last, count);
  const reachable = rangeOK && reachableWorkArea(study,first,last);
  const [gap, setGap] = useState('');
  const [studio, setStudio] = useState(null);
  const [nativeSPP, setNativeSPP] = useState(64);
  const nativeSPPOK = Number.isSafeInteger(nativeSPP) && nativeSPP > 0 && nativeSPP <= 2147483647;
  const valid = [width, height].every(n => Number.isInteger(n) && n >= 32 && n <= 4096);
  const [shotError, setShotError] = useState(study?.shotError);
  const [shotKeys, setShotKeys] = useState(study?.shot ?? []);
  const [mode, setMode] = useState('CAD lines'), [mix, setMix] = useState(1);
  const [edgeAlpha, setEdgeAlpha] = useState(0.8), [spp, setSpp] = useState(4);
  const [layout, setLayout] = useState('preset');
  const components = job.program?.assembly?.components ?? [];
  const [inset, setInset] = useState(components[0]?.id ?? '');
  const [mask, setMask] = useState(false);
  const palette = useMemo(() => componentPalette(job.program), [job.program]);
  const outputName = job.name + (mask ? '-component-ids' : '-stage');
  const [playFrame, setPlayFrame] = useState(null);
  const [ready, setReady] = useState(false);
  const pbr = useRef(null), queue = useRef(Promise.resolve());
  const settings = { width, height, fit, zoom, row };

  function styleAt(sample) {
    if (mode === 'Preset animation') {
      const seconds = (sample ?? study.currentRow()) * study.seconds / study.last;
      if (shotError) throw Error(shotError);
      return shotAt(shotKeys, seconds);
    }
    if (mode === 'PBR') return { surface: 1, edges: 0, annotations: 0 };
    if (mode === 'PBR + CAD edges') return { surface: mix, edges: edgeAlpha, annotations: 1 };
    return null;
  }
  let cameraNames = [];
  try { cameraNames = Object.keys(namedEntries(host.files,CAMERAS_FILE)); } catch { /* Stage camera menu reports malformed records. */ }
  function settingsAt(sample) {
    const style = styleAt(sample);
    const fraction = study ? (sample ?? study.currentRow()) / study.last : 0;
    return { ...settings, row: sample, style, fraction, componentMask: mask ? palette : null,
      layout: layout === 'preset' ? undefined : layout === 'detail' ? { inset } : layout.startsWith('camera:') ? {camera:layout.slice(7)} : layout };
  }
  function renderFrame(target, sample, signal) {
    const frame = settingsAt(sample);
    if (mask || !frame.style?.surface) return job.draw(target, frame);
    const run = async () => {
      signal.throwIfAborted();
      if (!pbr.current) pbr.current = await createStagePBR(host);
      signal.throwIfAborted();
      await job.draw(target, frame, params => pbr.current.render({ ...params, time: frame.fraction * (study?.seconds ?? 0), spp, signal, studio }));
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
  }, [width, height, fit, zoom, row, job, mode, mask, mix, edgeAlpha, spp, layout, inset, shotKeys, shotError, studio]);
  // Wait for each rendered preview, including an asynchronous beauty pass,
  // before advancing. Slow hardware displays every selected frame in order.
  useLayoutEffect(() => {
    if (playFrame == null) return;
    if (busy || error || !valid || !rangeOK || playFrame < first || playFrame > last) {
      setPlayFrame(null);
      return;
    }
    if (!ready) return;
    const timer = setTimeout(() => {
      if (playFrame === last || document.hidden) { setPlayFrame(null); return; }
      const next = playFrame + 1;
      setPlayFrame(next);
      setRow(outputRow(study,next));
    }, 1000 / STAGE_FPS);
    return () => clearTimeout(timer);
  }, [playFrame,ready,busy,error,valid,rangeOK,first,last]);
  function scrub(sample) {
    setPlayFrame(null);
    if (!study.complete && !study.rows.includes(sample)) {
      setGap('Study sample ' + sample + ' is unreachable. Holding the current pose.');
      return;
    }
    setGap('');
    setRow(sample);
  }
  function play() {
    if (playFrame != null) { setPlayFrame(null); return; }
    setRow(outputRow(study,first));
    setPlayFrame(first);
  }
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
      await saveOrCopy(host, outputName + '.png', new Uint8Array(await blob.arrayBuffer()), '', 'image/png');
    } catch (e) { setError(e.message); }
  }
  async function legend() {
    await saveOrCopy(host, outputName + '.json', JSON.stringify(componentLegend(palette), null, 2) + '\n', '', 'application/json');
  }
  async function movie(output = 'video') {
    if (active.current || !reachable) return;
    setPlayFrame(null);
    const controller = new AbortController();
    active.current = controller;
    setProgress(0);
    setError('');
    let writer;
    try {
      if (output === 'mask-sequence') {
        const data = await maskSequence({ study, first, last, palette, renderFrame,
          signal: controller.signal, onProgress: setProgress });
        controller.signal.throwIfAborted();
        await saveOrCopy(host, outputName + '-' + first + '-' + last + '.zip', data, '', 'application/zip');
        return;
      }
      if (output === 'native') {
        const data = await nativeStageJob({ host, job, settingsAt, first, last, studio, spp: nativeSPP,
          signal: controller.signal, onProgress: setProgress });
        controller.signal.throwIfAborted();
        await saveOrCopy(host, outputName + '-' + first + '-' + last + '.zip', data, '', 'application/zip');
        return;
      }
      const { VideoWriter, videoSupport } = await loadCandela();
      const fps = STAGE_FPS, support = await videoSupport(width, height, fps);
      const container = support.mp4 ? 'mp4' : 'webm';
      if (!support[container]) throw Error('This browser has no video encoder for these dimensions.');
      writer = await VideoWriter.create({ container, width, height, fps });
      const movieCanvas = document.createElement('canvas');
      for (let i = first; i <= last; i++) {
        controller.signal.throwIfAborted();
        const sample = outputRow(study, i);
        await renderFrame(movieCanvas, sample, controller.signal);
        await writer.add(movieCanvas);
        setProgress(Math.round((i - first + 1) / (last - first + 1) * 100));
        if (i % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      const data = await writer.finish();
      controller.signal.throwIfAborted();
      await saveOrCopy(host, outputName + '.' + container, data, '', 'video/' + container);
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
      {job.supportsBeauty && <label>Output <select aria-label="Render output" value={mask ? 'mask' : 'image'}
        onChange={e => setMask(e.currentTarget.value === 'mask')}>
        <option value="image">Rendered image</option><option value="mask">Component ID mask</option>
      </select></label>}
      {job.supportsBeauty && <label>Style <select aria-label="Render style" value={mode} onChange={e => setMode(e.currentTarget.value)}>
        {['CAD lines', 'PBR', 'PBR + CAD edges', ...(study ? ['Preset animation'] : [])].map(m => <option key={m}>{m}</option>)}
      </select></label>}
      {job.supportsBeauty && <label>Composition <select value={layout} aria-label="Composition" onChange={e => setLayout(e.currentTarget.value)}>
        <option value="preset">As authored</option>{cameraNames.map(name=><option key={name} value={'camera:'+name}>{name}</option>)}<option value="stage">Single camera</option>
        {study && <option value="turntable">Turntable</option>}<option value="front-side">Front and side</option>
        {components.length > 0 && <option value="detail">Detail inset</option>}
      </select></label>}
      {layout === 'detail' && <label>Detail part <select value={inset} aria-label="Detail part" onChange={e => setInset(e.currentTarget.value)}>
        {components.map(c => <option key={c.id}>{c.id}</option>)}
      </select></label>}
      {!mask && mode === 'PBR + CAD edges' && <>
        <label>Surface blend <input type="range" min="0" max="1" step="0.05" value={mix}
          onInput={e => setMix(+e.currentTarget.value)} /></label>
        <label>Edge opacity <input type="range" min="0" max="1" step="0.05" value={edgeAlpha}
          onInput={e => setEdgeAlpha(+e.currentTarget.value)} /></label>
      </>}
      {!mask && mode !== 'CAD lines' && <label>Samples per pixel <select aria-label="Samples per pixel" value={spp} onChange={e => setSpp(+e.currentTarget.value)}>
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
      {job.supportsBeauty && !mask && <label>Spark SPP <input type="number" min="1" max="2147483647" value={nativeSPP}
        onInput={e => setNativeSPP(e.currentTarget.valueAsNumber)} /></label>}
      {job.supportsBeauty && <RenderStudios host={host} onStudio={setStudio} />}
      {study && <RenderWorkArea first={first} last={last} count={count} setFirst={setFirst} setLast={setLast}
        valid={rangeOK} preview={frame => scrub(outputRow(study, frame))} />}
    </fieldset>
    {study && job.supportsBeauty && <ShotTimeline host={host} study={study} keys={shotKeys} components={components} row={row} seek={scrub}
      disabled={busy} preview={keys=>{setShotError(null); setShotKeys(keys); setMode('Preset animation');}} />}
    <div class="render-camera-preview"><canvas ref={sheet} aria-label="Render camera preview" hidden={!valid} /></div>
    {study && <label>Study frame <input type="range" min="0" max={study.rows.length - 1}
      value={study.rows.indexOf(row ?? study.currentRow())} disabled={busy}
      onInput={e => scrub(study.rows[+e.currentTarget.value])} /></label>}
    {study && <button class="btn sm" disabled={busy || !rangeOK || !valid || !reachable || !!error}
      onClick={play}>{playFrame == null ? 'Play work area' : 'Pause preview'}</button>}
    <footer>
      {mask && <button class="btn sm" disabled={busy} onClick={legend}>Save ID legend</button>}
      <button class="btn sm" disabled={!valid || !ready || busy} onClick={png}>Save PNG</button>
      {study && <button class="btn sm" disabled={!valid || !ready || busy || width % 2 || height % 2 || !reachable}
        onClick={() => movie()}>{mask ? 'Render preview video' : 'Render video'}</button>}
      {mask && study && <button class="btn sm" disabled={!valid || !ready || busy || !reachable}
        onClick={() => movie('mask-sequence')}>Save mask sequence</button>}
      {job.supportsBeauty && !mask && <button class="btn sm" disabled={!valid || !nativeSPPOK || busy || !rangeOK ||
        (study && !reachable) || (last > first && (width % 2 || height % 2))}
        onClick={() => movie('native')}>Export Spark job</button>}
      {mask && <span>PNG preserves exact IDs. Compressed video is for visual review.</span>}
      {busy && <><output>{progress}%</output><button class="btn sm" onClick={() => active.current?.abort()}>Cancel render</button></>}
      {!valid ? 'Choose dimensions from 32 to 4096 pixels.' : study && (rangeOK && !reachable
        ? 'The selected work area contains unreachable samples.' : (width % 2 || height % 2) ? 'Video dimensions must be even.' : '')}
      {valid && !ready && !error && <span role="status">Rendering preview…</span>}
      {gap && <span role="status">{gap}</span>}
      {error && <span role="alert">{error}</span>}
    </footer>
  </dialog>;
}
