// render.jsx — output: stills and frame sequences at a fixed size, sample count and seed, as PNG or as OpenEXR
// with the passes a compositor wants (beauty, albedo, N, Z, instance and face ids); jobs run one after another.
import React from 'react';
const { useState, useEffect } = React;
import { useHost, Seg, Tog } from './common';
import { Slider } from './slider';
import { store } from '../host';
import { videoSupport, videoBitrate } from '../../engine/video';

const SIZES = [['1920×1080', 1920, 1080], ['1280×720', 1280, 720], ['3840×2160', 3840, 2160], ['1080×1080', 1080, 1080], ['1080×1350', 1080, 1350], ['640×360', 640, 360]];
const DEF = { kind: 'still', size: '1920×1080', w: 1920, h: 1080, spp: 256, seed: 1, format: 'png', exposure: 'exposed', start: 0, end: 2, fps: 24, seedMode: 'per-frame', packaging: 'zip', timeMode: 'now', time: 0, autosave: true, quality: 'high', keyframe: 2 };
const FORMATS_STILL = [{ value: 'png', label: 'PNG' }, { value: 'exr', label: 'EXR passes' }, { value: 'both', label: 'Both' }];
const FORMATS_SEQ = FORMATS_STILL.concat([{ value: 'mp4', label: 'MP4', title: 'H.264 video' }, { value: 'webm', label: 'WebM', title: 'VP9 video' }]);
const isVideo = f => f === 'mp4' || f === 'webm';

export function RenderView({ host }) {
  useHost(host, 6);
  const [o, setO] = useState(() => Object.assign({}, DEF, store.get('render', {})));
  const set = (k, v?) => { const n = Object.assign({}, o, typeof k === 'object' ? k : { [k]: v }); setO(n); store.set('render', n); };
  const vp = host.vp, ok = !!(vp && vp.compiled);
  // which video formats this browser can encode (WebCodecs), checked once
  const [vs, setVs] = useState<any>(null);
  useEffect(() => { let live = true; videoSupport(1280, 720, 24).then(v => live && setVs(v)).catch(() => live && setVs({ mp4: null, webm: null })); return () => { live = false; }; }, []);
  const fmt = o.kind === 'still' && isVideo(o.format) ? 'png' : o.format, video = isVideo(fmt);
  const ew = video ? o.w - (o.w % 2) : o.w, eh = video ? o.h - (o.h % 2) : o.h;
  const frames = o.kind === 'sequence' ? Math.max(1, Math.round((o.end - o.start) * o.fps) + 1) : 1;
  const mp = (o.w * o.h / 1e6).toFixed(1);
  const save = j => host.saveFiles(j.files);
  const go = () => {
    try {
      const opts = { kind: o.kind, width: ew, height: eh, spp: o.spp, seed: o.seed, format: fmt, exposure: o.exposure, name: host.preset ? host.preset.id : 'candela', autosave: o.autosave };
      if (o.kind === 'sequence') Object.assign(opts, { start: o.start, end: o.end, fps: o.fps, seedMode: o.seedMode, packaging: o.packaging });
      if (video) Object.assign(opts, { quality: o.quality, keyframeInterval: o.keyframe });
      else opts.time = o.timeMode === 'now' ? host.time : o.time;
      host.render(opts);
    } catch (e) { host.toast(e.message, true); }
  };
  const q = host.queue.jobs;
  return <div className="tabbody col renderview">
    <div className="toolbar">
      <Seg small value={o.kind} options={[{ value: 'still', label: 'Still' }, { value: 'sequence', label: 'Sequence' }]} onChange={v => set('kind', v)} label="Render kind" />
      <Seg small value={fmt} options={o.kind === 'sequence' ? FORMATS_SEQ : FORMATS_STILL} onChange={v => set('format', v)} label="Format" />
      <span className="sp" />
      <button className="btn sm primary" disabled={!ok || (video && vs && !vs[fmt])} onClick={go} title="Add this render to the queue">{host.queue.running ? 'Add to queue' : 'Render'}</button>
    </div>
    <div className="scroll">
      <div className="block">
        <header><h2>Image</h2><span className="sub">{ew}×{eh} · {mp} MP · the camera's own framing{video && (ew !== o.w || eh !== o.h) ? ' · rounded to even for video' : ''}</span></header>
        <div className="row">{SIZES.map(([l, w, h]) => <button key={l} className={'btn sm' + (o.size === l ? ' on' : '')} onClick={() => set({ size: l, w, h })}>{l}</button>)}
          <button className={'btn sm' + (o.size === 'view' ? ' on' : '')} disabled={!ok} onClick={() => set({ size: 'view', w: vp.backend.w, h: vp.backend.h })} title="the viewport's current pixel size">viewport</button></div>
        <div className="row"><label className="lbl">width <input className="num" type="number" min="16" max="8192" value={o.w} onChange={e => set({ size: 'custom', w: Math.max(16, +e.target.value | 0) })} /></label>
          <label className="lbl">height <input className="num" type="number" min="16" max="8192" value={o.h} onChange={e => set({ size: 'custom', h: Math.max(16, +e.target.value | 0) })} /></label></div>
        <div className="kv2"><span>samples</span><Slider value={o.spp} min={4} max={8192} log step={1} def={256} digits={0} unit="spp" onChange={v => set('spp', Math.round(v))} label="Samples per pixel" /></div>
        <div className="row"><label className="lbl" title="the random sequence: the same seed, scene and settings give the same image">seed <input className="num" type="number" min="0" value={o.seed} onChange={e => set('seed', Math.max(0, +e.target.value | 0))} /></label>
          {o.kind === 'sequence' && <Seg small value={o.seedMode} options={[{ value: 'per-frame', label: 'seed + frame', title: 'noise changes each frame (reads as grain)' }, { value: 'fixed', label: 'same seed', title: 'the same noise pattern every frame' }]} onChange={v => set('seedMode', v)} label="Seed per frame" />}</div>
        {(fmt === 'exr' || fmt === 'both') && <div className="row"><span className="lbl">EXR beauty</span><Seg small value={o.exposure} options={[{ value: 'exposed', label: '× exposure', title: 'scene-linear, scaled by the camera exposure: mid-grey ≈ 0.18' }, { value: 'absolute', label: 'nits', title: 'absolute luminance, cd/m²' }]} onChange={v => set('exposure', v)} label="EXR beauty scale" />
          <span className="note">channels R G B A · albedo · N · Z · id.instance · id.face{window.claude ? ' — saved inside a .zip here' : ''}</span></div>}
      </div>
      {o.kind === 'still' ? <div className="block">
        <header><h2>Time</h2><span className="sub">poses, behaviours and fields of time are evaluated here</span></header>
        <div className="row"><Seg small value={o.timeMode} options={[{ value: 'now', label: `now (${host.time.toFixed(2)} s)` }, { value: 'at', label: 'at' }]} onChange={v => set('timeMode', v)} label="Render time" />
          {o.timeMode === 'at' && <label className="lbl"><input className="num" type="number" step="0.01" value={o.time} onChange={e => set('time', +e.target.value || 0)} /> s</label>}</div>
      </div> : <div className="block">
        <header><h2>Sequence</h2><span className="sub">{frames} frames · {(frames / o.fps).toFixed(2)} s</span></header>
        <div className="row"><label className="lbl">from <input className="num" type="number" step="0.1" value={o.start} onChange={e => set('start', +e.target.value || 0)} /> s</label>
          <label className="lbl">to <input className="num" type="number" step="0.1" value={o.end} onChange={e => set('end', Math.max(o.start, +e.target.value || 0))} /> s</label>
          <label className="lbl">fps <input className="num" type="number" min="1" max="240" value={o.fps} onChange={e => set('fps', Math.max(1, +e.target.value || 24))} /></label></div>
        {!video && <div className="row"><Seg small value={o.packaging} options={[{ value: 'zip', label: 'one .zip' }, { value: 'files', label: 'separate files' }]} onChange={v => set('packaging', v)} label="Packaging" />
          <span className="note">frames are numbered from 0001; exposure is metered on the first frame and held</span></div>}
        {video && <>
          <div className="row"><span className="lbl">quality</span><Seg small value={o.quality} options={[{ value: 'draft', label: 'draft' }, { value: 'standard', label: 'standard' }, { value: 'high', label: 'high' }, { value: 'max', label: 'max' }]} onChange={v => set('quality', v)} label="Video quality" />
            <span className="note">≈ {(videoBitrate(ew, eh, o.fps, o.quality) / 1e6).toFixed(1)} Mbit/s · ≈ {(videoBitrate(ew, eh, o.fps, o.quality) * frames / o.fps / 8 / 1048576).toFixed(1)} MB</span></div>
          <div className="row"><label className="lbl" title="a keyframe every this many seconds: shorter seeks faster, longer is smaller">keyframe every <input className="num" type="number" min="0.5" max="10" step="0.5" value={o.keyframe} onChange={e => set('keyframe', Math.max(0.5, +e.target.value || 2))} /> s</label>
            <span className="note">{vs == null ? 'checking the encoder…' : vs[fmt] ? `${fmt === 'mp4' ? 'H.264' : vs[fmt].startsWith('vp09') ? 'VP9' : 'VP8'} encoder available · exposure metered on the first frame and held` : `this browser cannot encode ${fmt === 'mp4' ? 'H.264' : 'VP9/VP8'}${vs.mp4 || vs.webm ? ` — try ${vs.mp4 ? 'MP4' : 'WebM'}` : ' — render PNG frames'}`}</span></div>
        </>}
        {vp && vp.compiled && vp.compiled.motionBlur && <p className="note">Motion blur: {vp.compiled.motionBlur.steps} steps across {(vp.compiled.motionBlur.interval * 1000).toFixed(1)} ms.</p>}
      </div>}
      <div className="block">
        <header><h2>Queue</h2><span className="sub">{q.length ? `${q.filter(j => j.status === 'done').length}/${q.length} done` : 'empty'}</span><span className="sp" />
          <Tog on={o.autosave} onClick={() => set('autosave', !o.autosave)} title="Save the files when a job finishes">save when done</Tog>
          {q.some(j => j.status !== 'queued' && j.status !== 'running') && <button className="btn sm" onClick={() => host.queue.clear()}>clear finished</button>}</header>
        {!q.length && <p className="note">Renders run one after another at their own size; the viewport shows the frame being rendered and the clock pauses until the queue is empty.</p>}
        {q.length > 0 && <table className="rt"><thead><tr><th>#</th><th>job</th><th>status</th><th></th></tr></thead><tbody>
          {q.slice().reverse().map(j => <tr key={j.id}><td>{j.id}</td><td>{j.kind} · {j.opts.width}×{j.opts.height} · {j.opts.spp} spp · {j.opts.format}{isVideo(j.opts.format) ? ` (${j.opts.quality || 'high'})` : ''}{j.kind === 'sequence' ? ` · ${j.opts.start}–${j.opts.end} s @ ${j.opts.fps}` : ''}</td>
            <td>{j.status === 'running' ? <span className="progress" title={j.note}><i style={{ width: Math.round(j.progress * 100) + '%' }} />{Math.round(j.progress * 100)}% {j.note}</span> : j.status === 'failed' ? <span className="bad" title={j.error}>failed: {j.error}</span> : j.status === 'done' ? `done in ${(j.ms / 1000).toFixed(1)} s` : j.status}</td>
            <td>{(j.status === 'running' || j.status === 'queued') && <button className="link" onClick={() => host.queue.cancel(j.id)}>cancel</button>}{j.status === 'done' && <button className="link" onClick={() => save(j)}>save {j.files.length > 1 ? `${j.files.length} files` : j.files[0].name}</button>}</td></tr>)}
        </tbody></table>}
      </div>
      <div className="block">
        <header><h2>From code</h2></header>
        <pre className="logs">{`workbench.render({ kind: 'still', width: 1920, height: 1080, spp: 512, seed: 7, format: 'exr' })
workbench.render({ kind: 'sequence', start: 0, end: 2, fps: 24, spp: 128, format: 'png' })
workbench.render({ kind: 'sequence', start: 0, end: 8, fps: 30, width: 1280, height: 720, spp: 64, format: 'mp4', quality: 'high' })
workbench.setPoses({ crank: { position: [0, 0.1, 0], quaternion: [0, 0, 0.38, 0.92] } })`}</pre>
      </div>
    </div>
  </div>;
}
