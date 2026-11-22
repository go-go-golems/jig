// viewport.jsx — the render: a progressive path tracer on the GPU, framed like a drawing sheet. Drag to orbit,
// Shift- or right-drag to pan, wheel to zoom, click to select, Alt-click to meter a point.
import React from 'react';
import type { Host } from '../host';
const { useState, useEffect, useRef } = React;
import { useHost, Seg, Tog, Menu, saveFile } from './common';
import { Slider, fmt } from './slider';

const ENGINES = [{ value: 'scene', label: 'Scene', title: "the scene file's own engine" }, { value: 'preview', label: 'Preview', title: 'half resolution, 3 bounces, denoised' }, { value: 'realtime', label: 'Realtime', title: '5 bounces, denoised' }, { value: 'offline', label: 'Offline', title: '12 bounces, MIS, no denoiser' }];
const AOVS = [{ value: 'beauty', label: 'Beauty' }, { value: 'albedo', label: 'Albedo' }, { value: 'normal', label: 'Normal' }, { value: 'depth', label: 'Depth' }, { value: 'ids', label: 'IDs', title: 'a colour per instance and CAD face: the id pass that EXR output writes' }];
const TMS = [['', 'scene'], ['agx', 'AgX'], ['aces', 'ACES'], ['neutral', 'PBR Neutral'], ['filmic', 'Filmic'], ['reinhard', 'Reinhard'], ['linear', 'Linear (clip)']];

export function ViewportView({ host }: { host: Host }) {
  useHost(host, 6);
  const wrap = useRef<any>(null), [meter, setMeter] = useState<any>(null), [pickInfo, setPickInfo] = useState<any>(null), [dropOn, setDropOn] = useState(false);
  useEffect(() => {
    if (!host.canvas) { host.canvas = document.createElement('canvas'); host.canvas.className = 'vp-canvas'; }
    wrap.current.prepend(host.canvas);
    const vp = host.attachCanvas(host.canvas);
    // the backend may swap the canvas (WebGPU → WebGL2 fallback)
    const t = setInterval(() => { if (vp.canvas !== host.canvas) { host.canvas = vp.canvas; host.canvas.className = 'vp-canvas'; if (!wrap.current.contains(host.canvas)) wrap.current.prepend(host.canvas); } }, 500);
    const ro = new ResizeObserver(() => host.vp && host.vp.reset()); ro.observe(wrap.current);
    return () => { clearInterval(t); ro.disconnect(); if (host.canvas && host.canvas.parentElement === wrap.current) host.canvas.remove(); };
  }, [host]);
  // pointer: orbit, pan, zoom, pick, meter
  const down = e => {
    if (e.button > 2) return;
    const pan = e.shiftKey || e.button === 1 || e.button === 2;
    const x0 = e.clientX, y0 = e.clientY; let lx = x0, ly = y0, moved = false;
    const r = wrap.current.getBoundingClientRect();
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true; host.interacting = true;
      host.orbit(ev.clientX - lx, ev.clientY - ly, pan ? 'pan' : 'orbit'); lx = ev.clientX; ly = ev.clientY;
    };
    const up = async ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      host.interacting = false;
      if (moved) { host.notify(); return; }
      const nx = (ev.clientX - r.left) / r.width, ny = (ev.clientY - r.top) / r.height;
      if (ev.altKey && host.vp) { const L = await host.vp.readLuminanceAt(nx, ny); setMeter({ x: ev.clientX - r.left, y: ev.clientY - r.top, L, ev: Math.log2(Math.max(L, 1e-6) * 100 / 12.5) }); return; }
      const p = host.pick(nx, ny);
      setPickInfo(p ? { x: ev.clientX - r.left, y: ev.clientY - r.top, p } : null);
      host.select(p ? (p.id ? '#' + p.id : `object ${p.index}`) : null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  useEffect(() => {
    const el = wrap.current;
    let tm: any = null;
    const wheel = e => { e.preventDefault(); host.interacting = true; host.orbit(0, e.deltaY, 'zoom'); clearTimeout(tm); tm = setTimeout(() => { host.interacting = false; }, 160); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, [host]);
  // the id pass as an overlay: a colour per (instance, face), redrawn when the view or the scene changes
  const idCanvas = useRef<any>(null);
  useEffect(() => {
    if (host.view.aov !== 'ids') return;
    let last = '', busy = false, alive = true;
    const draw = async () => {
      const v = host.vp; if (!alive || busy || !v || !v.compiled || !v.packed || host.rendering) return;
      const key = v.frameN + ':' + (v.backend && v.backend.w) + 'x' + (v.backend && v.backend.h);
      if (key === last || v.spp < 1) return; busy = true;
      try {
        const r = await v.idPass(); last = key;
        const c = idCanvas.current; if (!c) return; c.width = r.width; c.height = r.height;
        const g = c.getContext('2d'), img = g.createImageData(r.width, r.height);
        for (let i = 0; i < r.width * r.height; i++) {
          const inst = r.data[i * 4], face = r.data[i * 4 + 1];
          if (inst < 0) { img.data.set([24, 24, 26, 255], i * 4); continue; }
          let h = Math.imul((inst + 1) | 0, 73856093) ^ Math.imul((face + 2) | 0, 19349663); h = (h ^ (h >>> 13)) >>> 0;
          const hue = (h % 360) / 60, k = n => { const q = (n + hue) % 6; return 1 - Math.max(0, Math.min(q, 4 - q, 1)) * 0.6; };
          img.data.set([k(5) * 230, k(3) * 230, k(1) * 230, 255], i * 4);
        }
        g.putImageData(img, 0, 0);
      } catch (e) { /* a lost context or a rebuild in flight */ } finally { busy = false; }
    };
    const t = setInterval(draw, 300); draw();
    return () => { alive = false; clearInterval(t); };
  }, [host, host.view.aov]);
  const vp = host.vp, V = host.view, p = host.preset;
  const cam = vp && vp.cam, err = host.compileError, buildErr = host.result && !host.result.ok ? host.diags.find(d => d.severity === 'error') : null;
  const shot = async () => { try { const c = await host.screenshotViewport(4096); const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png')); await saveFile(host, `${p ? p.id : 'render'}-${vp ? vp.spp : 0}spp.png`, blob); } catch (e) { host.toast('Screenshot failed: ' + e.message, true); } };
  return <div className="tabbody col vpview">
    <div className="toolbar">
      <Seg small value={V.engine} options={ENGINES} onChange={v => host.setView('engine', v)} label="Engine" />
      <Seg small value={V.aov} options={AOVS} onChange={v => host.setView('aov', v)} label="Output" />
      <select value={V.tonemap || ''} onChange={e => host.setView('tonemap', e.target.value || null)} aria-label="Tone map" title="Tone map (scene-referred → display-referred)">{TMS.map(([v, l]) => <option key={v} value={v}>{v ? l : 'Tone map: scene'}</option>)}</select>
      <Tog on={V.falseColor ?? (vp && vp.post && vp.post.falseColor)} onClick={() => host.setView('falseColor', !(V.falseColor ?? (vp && vp.post && vp.post.falseColor)))} title="False colour: exposure in stops from middle grey">False colour</Tog>
      <Tog on={V.denoise ?? (vp && vp.post && vp.post.denoise)} onClick={() => host.setView('denoise', !(V.denoise ?? (vp && vp.post && vp.post.denoise)))} title="Edge-avoiding à-trous denoiser guided by albedo, normal and depth">Denoise</Tog>
      <span className="lbl">EV ±</span>
      <div className="tbslider"><Slider compact origin={0} value={V.evComp} min={-4} max={4} step={0.1} def={0} digits={1} onChange={v => host.setView('evComp', v)} label="Exposure compensation" /></div>
      <span className="sp" />
      <Tog on={!host.running} onClick={() => host.setRunning(!host.running)} title="Pause the clock (animations and behaviours)">Pause</Tog>
      <Tog on={!!host.remote} onClick={() => host.setRemote(!host.remote)} title="Render on the Spark: candela-rt serve (OptiX on the RT cores) streams the frames">OptiX</Tog>
      <button className="btn sm" onClick={() => host.resetCamera()} title="Back to the scene's camera (double-click the view)" disabled={!host.freeCam}>Scene camera</button>
      <button className="btn sm" onClick={shot} title="Save the image as PNG">Save PNG</button>
      <button className="btn sm" onClick={() => host.focus({ view: 'render' })} title="Stills, sequences and EXR passes at a fixed size">Render…</button>
    </div>
    <div className={'vpwrap' + (dropOn ? ' dragover' : '')} ref={wrap} onPointerDown={down} onContextMenu={e => e.preventDefault()} onDoubleClick={() => host.resetCamera()}
      onDragOver={e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); setDropOn(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn(false); }}
      onDrop={async e => { e.preventDefault(); setDropOn(false); for (const f of e.dataTransfer.files) { try { await host.addAssetFile(f); } catch (x) { host.toast(`${f.name}: ${x.message}`, true); } } }}>
      {V.aov === 'ids' && <canvas ref={idCanvas} className="vp-ids" aria-label="Instance and face ids" />}
      {host.remote && host.remote.live && <img className="vp-remote" src={host.remote.frameUrl!} alt="" draggable={false} />}
      <div className="chip-row">
        {host.remote && <RemoteChips host={host} />}
        <span className={'chip on' + (vp && vp.backend && vp.backend.name === 'WebGPU' ? ' gpu' : '')} title={vp && vp.backend ? vp.backend.info : 'starting'}>{vp && vp.backend ? vp.backend.name : '…'}</span>
        {vp && vp.compiled && <span className="chip ghost">{vp.spp} spp · {vp.backend.w}×{vp.backend.h}{vp.compiled.spectral ? ' · spectral' : ''}</span>}
        {(host.building || host.compiling) && <span className="chip busy">{host.compiling ? 'compiling shaders' : 'building'}</span>}
        {host.freeCam && <span className="chip ghost">free camera</span>}
        {vp && vp.compiled && vp.compiled.motionBlur && <span className="chip ghost" title="the scene is sampled across the shutter">motion blur · {vp.compiled.motionBlur.steps} steps</span>}
        {vp && vp.compiled && vp.compiled.stats.triangles > 0 && <span className="chip ghost">{vp.compiled.stats.triangles.toLocaleString()} triangles</span>}
        {host.rendering && <span className="chip busy">rendering {host.queue.running ? Math.round(host.queue.running.progress * 100) + '%' : ''}</span>}
      </div>
      {cam && <TitleBlock host={host} vp={vp} cam={cam} />}
      {pickInfo && <div className="pickcard" style={{ left: Math.min(pickInfo.x + 12, 9999), top: pickInfo.y + 12 }} onPointerDown={e => e.stopPropagation()}>
        <b>{pickInfo.p.id ? '#' + pickInfo.p.id : pickInfo.p.kind}</b><span>{pickInfo.p.kind} · {pickInfo.p.material}</span>
        {pickInfo.p.definition && <span>{pickInfo.p.definition} · instance {pickInfo.p.instance}{pickInfo.p.face != null ? <> · face <b>{pickInfo.p.face}</b></> : null}</span>}
        {pickInfo.p.faceMeta && Object.keys(pickInfo.p.faceMeta).length > 0 && <span className="dim">{Object.entries(pickInfo.p.faceMeta).filter(([k]) => k !== 'center').map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map(x => +(+x).toFixed(3)).join(' ') : v}`).join(' · ')}</span>}
        <span>{pickInfo.p.t.toFixed(2)} m from the lens</span>
        <div className="row"><button className="link" onClick={() => { host.focus({ view: 'scene' }); setPickInfo(null); }}>inspect</button>{pickInfo.p.id && <button className="link" onClick={() => { host.focus({ view: 'code', file: 'scene.js', find: `'${pickInfo.p.id}'` }); setPickInfo(null); }}>find in code</button>}<button className="link" onClick={() => setPickInfo(null)}>close</button></div>
      </div>}
      {meter && <div className="pickcard meter" style={{ left: meter.x + 12, top: meter.y + 12 }} onPointerDown={e => { e.stopPropagation(); setMeter(null); }}>
        <b>{fmt(meter.L)} nit</b><span>EV100 {meter.ev.toFixed(1)} (reflected, K = 12.5)</span><span>{(Math.log2(meter.L / (0.125 * Math.pow(2, vp!.exposureEV())))).toFixed(1)} stops from middle grey</span>
      </div>}
      {err && <button className="ovl-box failbanner" onClick={() => host.focus({ view: 'shader' })}><b>Shader compile failed.</b> {err.message.slice(0, 300)} — open the Shader view</button>}
      {!err && buildErr && <button className="ovl-box failbanner" onClick={() => buildErr.loc && host.focus({ view: 'code', file: buildErr.loc.file, line: buildErr.loc.line })}><b>{buildErr.code}</b> {buildErr.message}{buildErr.loc ? ` — ${buildErr.loc.file}:${buildErr.loc.line}` : ''}. The view keeps the last good build.</button>}
    </div>
    <div className="hint"><b>Viewport</b><span>drag to orbit · Shift-drag or right-drag to pan · wheel to zoom · click to select · Alt-click to meter · double-click for the scene camera</span></div>
  </div>;
}

function RemoteChips({ host }: { host: Host }) {
  const r = host.remote!, f = r.frame;
  const state = r.state === 'live' ? 'OptiX' : r.state === 'error' ? 'OptiX: ' + (r.message || 'error').slice(0, 80) : 'OptiX: ' + r.state + (r.message ? ' · ' + r.message.slice(0, 60) : '');
  return <>
    <span className={'chip on gpu' + (r.state === 'live' ? '' : ' busy')} title={r.server ? `candela-rt on ${r.server.gpu} · ${r.url}` : r.url}>{state}</span>
    {f && <span className="chip ghost">{f.spp} spp · {f.width}×{f.height} · {r.built ? r.built.target : ''}{r.built && r.built.motion ? ' +motion' : ''} · {r.fps.toFixed(0)} fps</span>}
    {r.mismatch && <span className="chip busy" title="the browser and candela-rt built different programs (different engine versions?)">program differs</span>}
  </>;
}

function TitleBlock({ host, vp, cam }) {
  const p = host.preset;
  return <div className="titleblock">
    <div><span>SHEET</span><b>{p ? p.id : '—'}</b></div>
    <div className="wide"><span>TITLE</span><b>{p ? p.title : '—'}</b></div>
    <div><span>LENS</span><b>{fmt(cam.focal * 1000, 0)} mm f/{fmt(cam.N, 1)}</b></div>
    <div><span>EV100</span><b>{vp.exposureEV().toFixed(1)}{cam.mode === 'auto' ? ' A' : ''}</b></div>
    <div><span>SAMPLES</span><b>{vp.spp}</b></div>
    <div><span>FRAME</span><b>{vp.lastMs ? vp.lastMs.toFixed(1) + ' ms' : '—'}</b></div>
  </div>;
}
