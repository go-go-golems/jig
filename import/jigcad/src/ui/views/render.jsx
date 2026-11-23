// Render: the model photographed by Candela (JIG-016 §6.5). A path-traced view of the open program with the
// project's look.js (materials, light, camera; a default look until a material is chosen). Drag orbits, shift- or
// right-drag pans, the wheel zooms; a click picks a face and names it as jig does (component#face), and a material
// from the library writes one .meta() line to look.js. The controller is src/render/host.js.
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { useHost } from '../common.jsx';
import { renderHostOf, LIBRARY, LOOK_FILE, defaultLook } from '../../render/host.js';
import { Name } from './stage.jsx';
import { saveOrCopy } from '../save.js';

function useRender(rh) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => rh.on(() => force()), [rh]);
  return rh;
}

const STATUS = { idle: 'idle', loading: 'starting Candela', building: 'building', compiling: 'compiling shaders', ready: 'rendering', error: 'error' };

export function RenderView({ host }) {
  useHost(host, ['program', 'files']);
  const rh = useRender(renderHostOf(host));
  const wrap = useRef(null), canvas = useRef(null), drag = useRef(null);
  const [whole, setWhole] = useState(false);

  useEffect(() => {
    if (canvas.current) rh.attach(canvas.current);
    return () => rh.detach();
  }, []);

  const down = (e) => {
    if (e.button > 2) return;
    wrap.current?.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, mode: e.shiftKey || e.button === 2 ? 'pan' : 'orbit' };
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true; d.x = e.clientX; d.y = e.clientY;
    rh.orbit(dx, dy, d.mode);
  };
  const up = (e) => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved && e.button === 0) {
      const r = wrap.current.getBoundingClientRect();
      const hit = rh.pick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (hit) host.select({ body: hit.body, name: hit.face });
    }
  };
  const wheel = (e) => { e.preventDefault(); rh.orbit(0, e.deltaY, 'zoom'); };

  const openLook = () => {
    if (!host.files.has(LOOK_FILE)) host.addFile(LOOK_FILE, defaultLook({ view: host.view?.name ?? 'axo' }));
    host.setOpenFile(LOOK_FILE);
    host.focus('code', 'look');
  };
  const choose = (patch) => {
    const p = rh.picked; if (!p) return;
    try { rh.applyMeta(whole ? p.component : p.address, patch); }
    catch (e) { host.toast(e.message, 'bad'); }
  };

  const job = async (o, mime) => {
    try {
      const files = await rh.renderJob(o);
      for (const f of files ?? []) await saveOrCopy(host, f.name, f.data, '', mime);
    } catch (e) { if (e?.name !== 'AbortError' && !/abort/i.test(e?.message ?? '')) host.toast(`The render failed: ${e.message}`, 'bad'); }
  };
  const p = rh.picked, vp = rh.vp, dur = rh.duration();
  const errors = rh.diags.filter((d) => d.severity === 'error'), warnings = rh.diags.filter((d) => d.severity === 'warning');
  return (
    <div class="tabbody col renderview">
      <div class="toolbar">
        <span class={`pill ${rh.status === 'error' ? 'bad' : ''}`}><span>Candela</span><b>{STATUS[rh.status] ?? rh.status}</b></span>
        {rh.backend && <span class="pill"><span>backend</span><b>{rh.backend}</b></span>}
        {vp?.compiled && <span class="pill"><span>spp</span><b>{vp.spp | 0}</b></span>}
        <button class="btn sm" onClick={() => rh.resetCamera()} title="back to the look's camera">Reset camera</button>
        <button class="btn sm" onClick={openLook} title="materials, light and camera as a Candela scene file">{host.files.has(LOOK_FILE) ? 'Edit look.js' : 'Make look.js'}</button>
        {rh.rendering ? (
          <>
            <span class="pill"><span>render</span><b>{Math.round((rh.progress ?? 0) * 100)}% {rh.progressNote}</b></span>
            <button class="btn sm" onClick={() => rh.cancelJob()}>Cancel</button>
          </>
        ) : vp?.compiled && (
          <>
            <button class="btn sm" title="1920 × 1080, 256 samples per pixel, PNG" onClick={() => job({ kind: 'still', width: 1920, height: 1080, spp: 256, format: 'png' }, 'image/png')}>Render PNG</button>
            {dur > 0 && <button class="btn sm" title={`the timeline (${dur} s) at 24 fps, 1280 × 720, 32 samples per pixel`} onClick={() => job({ kind: 'sequence', start: 0, end: dur, fps: 24, width: 1280, height: 720, spp: 32, format: 'mp4' }, 'video/mp4')}>Render video</button>}
          </>
        )}
      </div>
      {dur > 0 && (
        <div class="toolbar rendertime">
          <button class="btn sm" onClick={() => rh.play()} aria-label={rh.playing ? 'Pause' : 'Play'}>{rh.playing ? '❚❚' : '▶'}</button>
          <input type="range" min="0" max={dur} step="0.01" value={rh.time} onInput={(e) => { rh.play(false); rh.setTime(+e.currentTarget.value); }} aria-label="time" />
          <span class="small">{rh.time.toFixed(2)} / {dur} s · {rh.result?.compiled?.animation?.study ?? ''}</span>
          <label class="small" title="motion blur in the view and in renders: as the look's camera says, none, or a 180° shutter at 24 fps">blur{' '}
            <select value={rh.motion} onChange={(e) => rh.setMotion(e.currentTarget.value)} aria-label="motion blur">
              <option value="look">as the look</option>
              <option value="off">off</option>
              <option value="180">180° at 24 fps</option>
            </select>
          </label>
        </div>
      )}
      <div class="renderbody">
        <div class="renderwrap" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} onContextMenu={(e) => e.preventDefault()}>
          <canvas ref={canvas} />
          {rh.status === 'error' && (
            <div class="rendermsg bad">{rh.message}{' '}
              {rh.vp && <><button class="btn sm" onClick={() => rh.restart()}>Restart</button>{' '}<button class="btn sm" onClick={() => { try { localStorage.setItem('jig.render.backend', 'webgl2'); } catch { /* */ } rh.restart('webgl2'); }}>Use WebGL2</button></>}
            </div>
          )}
          {rh.status === 'loading' && <div class="rendermsg">Starting Candela…</div>}
        </div>
        <div class="renderside">
          {p ? (
            <>
              <div class="kv"><span>component</span><b>{p.component}</b></div>
              <div class="kv"><span>face</span><b><Name text={p.face} /></b></div>
              <div class="kv small"><span>made by</span><b>{p.meta?.featureType ?? '—'} {p.meta?.feature ?? ''}</b></div>
              <div class="kv small"><span>now</span><b>{[p.meta?.material, p.meta?.process, p.meta?.finish].filter(Boolean).join(', ') || 'default'}</b></div>
              <label class="small"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.currentTarget.checked)} /> the whole component</label>
              {LIBRARY.map((g) => (
                <div class="matgroup" key={g.group}>
                  <div class="matgroup-title">{g.group}</div>
                  {g.items.map(([label, patch]) => <button class="btn sm" key={label} onClick={() => choose(patch)} title={JSON.stringify(patch)}>{label}</button>)}
                </div>
              ))}
            </>
          ) : (
            <p class="empty">Click a face to name it and choose its material. Materials go to <code>look.js</code> as <code>.meta()</code> lines, so a turned face keeps its axis.</p>
          )}
          {errors.length + warnings.length > 0 && (
            <ul class="diags">
              {[...errors, ...warnings].slice(0, 8).map((d, i) => <li key={i} class={d.severity === 'error' ? 'bad' : 'warn'}>{d.code ? <code>{d.code}</code> : null} {d.message}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
