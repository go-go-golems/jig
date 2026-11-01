// Stage: the drafting sheet (createStage from src/stage, or the plain fallback sheet), its toolbar, its hint bar,
// and the Inspector: the selected face's persistent name, genealogy and why(), then the part's metrics.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Menu, Seg, useHost, RUN_KEY, pct } from '../common.jsx';
import { loadStage } from '../modules.js';
import { NAMED_VIEWS, OVERLAYS, squareView, isSketchPick } from '../../host/host.js';
import { qty, num, vec, metric, DASH, bare } from '../format.js';
import { SketchInspector, pickLabel } from './sketch-inspector.jsx';

/** A persistent name that wraps only after "/" and "[". */
export const Name = ({ text }) => String(text).split(/(?<=[/[])/).flatMap((part, i) => (i ? [<wbr key={i} />, part] : [part]));
const KEY_METRICS = ['volume', 'mass', 'area', 'bbox', 'height', 'printTime', 'filament', 'cost'];
const HIDDEN_METRICS = ['features', 'faces', 'bodies', 'sketchDOF', 'sketches'];

const VIEW_OPTS = [
  { value: 'axo', label: 'Axo', title: 'Axonometric' }, { value: 'front', label: 'Front', title: 'Front elevation' },
  { value: 'side', label: 'Side', title: 'Side elevation' }, { value: 'plan', label: 'Plan', title: 'Plan' },
];

export function StageView({ host }) {
  useHost(host, ['view', 'selection', 'program', 'compiling']);
  const el = useRef(null);
  const [fallback, setFallback] = useState(false);
  const [overlays, setOverlays] = useState(OVERLAYS);
  useEffect(() => {
    let stage = null, alive = true;
    loadStage().then(m => {
      if (!alive || !el.current) return;
      if (m.overlays) setOverlays(m.overlays);
      try { stage = m.createStage(el.current, host); setFallback(m.fallback); }
      catch (e) { console.error('createStage failed:', e); host.toast(`The stage failed to start: ${e.message}`, 'bad'); }
    });
    return () => { alive = false; try { stage?.dispose?.() ?? stage?.destroy?.(); } catch (e) { console.error(e); } };
  }, []);

  const v = host.view, p = host.program, good = p?.ok !== false ? p : host.lastGood;
  const named = NAMED_VIEWS[v.name];
  const squared = !v.yaw && !v.pitch && (v.zoom ?? 1) === 1 && !v.scale && !v.pan?.[0] && !v.pan?.[1] && !v.target;
  const err = p?.ok === false ? p.diagnostics.find(d => d.level === 'error') : null;
  const sketches = good?.sketches || [];
  const sk0 = v.name === 'sketch' ? sketches.find(x => x.id === v.sketch) || sketches[0] : null;
  // a failing compile keeps the last good part, but its sketch as it solved (an over-constrained one fails the compile)
  const sk = sk0 && p?.ok === false ? (p.sketches || []).find(x => x.id === sk0.id) || sk0 : sk0;
  // explicit or constrained: the compile records it as a decision (kind 'sketch.mode') per sketch
  const modeOf = id => (good?.decisions || []).find(d => d.kind === 'sketch.mode' && d.at === id)?.chose;
  const pick = sk && isSketchPick(host.selection) && host.selection.sketch === sk.id ? host.selection : null;

  return (
    <div class="tabbody stage">
      <div class="stagewrap">
        <div class="toolbar">
          <Seg label="View" options={VIEW_OPTS} value={v.name} onChange={name => host.setView({ name, ...squareView(), zoom: v.zoom ?? 1, sketch: null })} />
          {sketches.length > 0 && (
            <Menu btnClass={`btn sm ${v.name === 'sketch' ? 'on' : ''}`} menuClass="sketches" title="Draw one of the part's sketches in its own plane"
              label={<>{v.name === 'sketch' ? <>Sketch <b>{sk?.id}</b></> : 'Sketch'} <span class="dim">{sketches.length}</span> ▾</>}>
              {sketches.map(x => (
                <button key={x.id} class={v.name === 'sketch' && sk?.id === x.id ? 'on' : ''} onClick={() => openSketch(host, x.id)}>
                  <span class="t">{x.id}</span><small>{sketchStatus(x, modeOf(x.id))}</small>
                </button>
              ))}
              {v.name === 'sketch' && <button onClick={() => host.setView({ name: 'axo', ...squareView(), sketch: null })}><span class="t">Back to the part</span><small>the axonometric view</small></button>}
            </Menu>
          )}
          <Menu btnClass="btn sm" menuClass="overlays" label={<>Show <span class="dim">{v.overlays.size}</span> ▾</>} title="Overlays drawn on the sheet">
            {overlays.map(o => (
              <button key={o.key} data-keep class={v.overlays.has(o.key) ? 'on' : ''} onClick={() => host.toggleOverlay(o.key)}>
                <span class={`box ${v.overlays.has(o.key) ? 'on' : ''}`} /><span class="t">{o.label || o.title}</span><small>{o.about}</small>
              </button>
            ))}
          </Menu>
          <span class="lbl">Zoom</span>
          <input type="range" min="0.25" max="4" step="0.05" aria-label="Zoom" value={v.zoom ?? 1} style={pct(v.zoom ?? 1, 0.25, 4)} onInput={e => host.setView({ zoom: +e.currentTarget.value, scale: null })} />
          <button class="btn sm" disabled={squared} title={`Back to the ${named?.title.toLowerCase() || 'axonometric'} view at zoom 1, centred on the part`}
            onClick={() => host.setView({ name: named ? v.name : 'axo', ...squareView() })}>Square up</button>
        </div>
        <div class="sheet">
          <div class="sheethost" ref={el} />
          {!good && p?.ok !== false && <p class="empty padded sheetnote">{host.compiling ? 'Compiling…' : `Nothing compiled yet. Press Run (${RUN_KEY}).`}</p>}
          {p?.ok === false && <FailBanner host={host} program={p} />}
        </div>
        <div class="hint">
          {p?.ok === false && good ? <><b>Last good part</b><span>drawn until {err?.file || 'script.js'}{err?.line ? `:${err.line}` : ''} compiles again · the banner opens the line</span></>
            : sk && pick ? <><b>Selected</b><span>{pickLabel(sk, pick)} · click another mark, or empty paper or Esc to let go · drag a point to solve</span></>
            : sk ? <><b>Sketch {sk.id}</b><span>{sketchStatus(sk, modeOf(sk.id))} · click a glyph, a dimension or a line to select it · drag a point to solve · Square up refits</span></>
            : host.selection ? <><b>Selected</b><span>{host.selection.name}{host.selection.lost ? ' (lost in the last compile)' : ''} · Esc clears · drag to orbit · Shift-drag to pan · wheel to zoom</span></>
              : <><b>Click a face</b><span>drag to orbit · Shift-drag to pan · wheel to zoom · Square up resets{fallback ? ' · plain sheet until src/stage is built' : ''}</span></>}
        </div>
      </div>
      {sk ? <SketchInspector host={host} sketch={sk} program={good} mode={modeOf(sk.id)} status={sketchStatus(sk, modeOf(sk.id))} /> : <Inspector host={host} program={good} />}
    </div>
  );
}

/** The fail banner (Form Skate Stage, FailBanner), translated: what failed (the feature, or the script), the message,
 *  the place, and what to do; a click opens the line. The sheet under it keeps the last good part. */
export function FailBanner({ host, program }) {
  const d = (program.diagnostics || []).find(x => x.level === 'error') || program.error || {};
  const file = d.file || (program.error && program.error.file) || 'script.js';
  const at = d.at && d.at !== file && !/\.js$/.test(d.at) ? d.at : null;
  const node = at && (program.graph?.nodes || []).find(n => n.id === at);
  const kind = node?.kind ? ` (${node.kind})` : '';
  const who = at ? `${at}${kind} failed` : `${file} does not run`;
  const place = d.line ? `${file}:${d.line}` : at ? `feature ${at}` : file;
  const msg = bare(d.message || 'no message').replace(/[.\s]+$/, '');
  const shows = host.lastGood ? 'the sheet shows the last good part' : (program.bodies || []).length ? 'the sheet shows the part up to the failing feature' : 'nothing has compiled yet';
  const open = () => host.focus('code', d.line ? { file, line: d.line } : at ? { file: 'script.js', find: `'${at}'` } : { file });
  return (
    <button class="ovl-box failbanner" title={`Open ${place}`} onClick={open}>
      <b>{who}:</b> {msg} — {place}. {d.fix ? `Fix it (${d.fix}) and press Run` : 'Fix it and press Run'} ({RUN_KEY}); {shows}.
    </button>
  );
}

function Inspector({ host, program }) {
  const sel = host.selection;
  const [why, setWhy] = useState(null);
  useEffect(() => {
    setWhy(null);
    if (!sel?.name || sel.lost) return;
    let alive = true;
    host.call('why', sel.name).then(value => alive && setWhy({ value }), e => alive && setWhy({ error: e.message || String(e) }));
    return () => { alive = false; };
  }, [sel?.name, program?.hash]);

  const body = sel && program?.bodies?.[sel.body ?? 0];
  const face = body && sel.face != null ? (body.faces || []).find(f => f.index === sel.face) || body.faces?.[sel.face] : null;
  const edge = body && sel.edge != null ? (body.edges || []).find(e => e.index === sel.edge) || body.edges?.[sel.edge] : null;
  const edgeLen = edge ? polyLength(edge.points) : null;
  const faces = (program?.bodies || []).flatMap((b, bi) => (b.faces || []).map(f => ({ ...f, body: bi })));
  const m = program?.metrics || {}, s = program?.summary || {};
  const feature = sel?.name?.split('/')[0];

  return (
    <aside class="side" aria-label="Inspector">
      {sel ? (
        <div class="block">
          <header><h2>{edge ? 'Edge' : face ? 'Face' : 'Selection'}</h2><span class="sub">{edge ? `${edge.kind} · ${body?.name || 'body'}` : face ? `${face.kind} · ${body?.name || 'body'}` : sel.lost ? 'lost' : 'body'}</span></header>
          <div class="refs"><button class="nid on" title="The persistent name: it survives edits upstream" onClick={() => host.focus('ir', { find: sel.name })}><Name text={sel.name} /></button></div>
          {sel.lost && <p class="fail"><b>ref.lost:</b> no {sel.edge != null ? 'edge' : 'face'} is named {sel.name} after this compile; its genealogy did not resolve.</p>}
          {edge && <dl class="kv">
            <dt>length</dt><dd>{qty(edgeLen, 'mm')}</dd>
            {(edge.faces || []).length === 2 && <><dt>between faces</dt><dd>{edge.faces.map(i => body.faces?.[i]?.name ?? i).join(' · ')}</dd></>}
          </dl>}
          {face && <dl class="kv">
            <dt>area</dt><dd>{qty(face.area, 'mm²')}</dd>
            {face.center && <><dt>centre x · y · z</dt><dd>{vec(face.center, 1)} mm</dd></>}
            {face.normal && <><dt>normal</dt><dd>{vec(face.normal, 2)}</dd></>}
            {face.axis?.radius != null && <><dt>radius</dt><dd>{qty(face.axis.radius, 'mm')}</dd></>}
          </dl>}
          <div class="actions-row">
            {feature && <button class="link strong" onClick={() => { host.selectNode(feature); host.focus('graph'); }}>{feature} in the graph</button>}
            {feature && <button class="link" onClick={() => host.link(`lab:open?file=script.js&find=${encodeURIComponent(`'${feature}'`)}`)}>find in code</button>}
            <button class="link" onClick={() => host.select(null)}>clear</button>
          </div>
        </div>
      ) : (
        <div class="block">
          <header><h2>Selection</h2><span class="sub">none</span></header>
          <p class="empty">Click a face on the sheet, or pick one of the {faces.length || ''} faces below. Names are persistent: <code>feature/role[source]</code>.</p>
          <div class="refs facelist">{faces.map(f => <button key={f.body + ':' + f.index} class="nid" onClick={() => host.select({ body: f.body, face: f.index, name: f.name })}><Name text={f.name} /></button>)}</div>
        </div>
      )}
      {sel && !sel.lost && (
        <div class="block">
          <header><h2>Why</h2><span class="sub">genealogy, from why()</span></header>
          {!why ? <p class="empty">Asking the engine…</p> : why.error ? <p class="fail"><b>why({sel.name}) failed:</b> {why.error}</p> : <WhyValue host={host} value={why.value} />}
        </div>
      )}
      <div class="block">
        <header><h2>{program?.name || 'Part'}</h2><span class="sub">{[program?.kind, s.material].filter(Boolean).join(' · ') || 'not compiled'}</span></header>
        {program ? <dl class="kv">
          {Object.entries(m).filter(([k]) => !HIDDEN_METRICS.includes(k))
            .sort(([a], [b]) => ((KEY_METRICS.indexOf(a) + 1 || 99) - (KEY_METRICS.indexOf(b) + 1 || 99)))
            .slice(0, 10).map(([k, v]) => [
            <dt key={k + 't'} title={v?.fidelity ? `${v.fidelity}${v.note ? ': ' + v.note : ''}` : ''}>{k === 'bbox' ? 'bbox x · y · z' : k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>,
            <dd key={k + 'd'}>{k === 'bbox' && Array.isArray(v?.value) ? `${v.value.map(x => num(x, 1)).join(' · ')} mm` : metric(v)}</dd>,
          ])}
          <dt>features · faces</dt><dd>{s.features ?? DASH} · {s.faces ?? DASH}</dd>
          <dt>sketch DOF</dt><dd>{s.dof ?? DASH}</dd>
        </dl> : <p class="empty">Press Run to compile the part.</p>}
      </div>
    </aside>
  );
}

/** Open a sketch on the stage, in its own plane. */
export function openSketch(host, id) {
  host.select(null);
  host.setView({ name: 'sketch', sketch: id, yaw: 0, pitch: 0, pan: [0, 0], zoom: 1, scale: null, target: null });
  host.focus('stage');
}

/** 'fully constrained · 0 DOF', 'under-constrained · 3 DOF', 'over-constrained · 2 conflicts', 'explicit · fixed'. */
export function sketchStatus(x, mode) {
  if (!x) return DASH;
  mode = mode || x.mode?.mode || x.mode;
  const conflicts = (x.conflicts || []).length;
  if (x.status === 'over') return `over-constrained · ${conflicts || 1} conflict${conflicts === 1 ? '' : 's'}`;
  if (mode === 'explicit') return 'explicit coordinates · fixed';
  return `${x.status === 'fully' ? 'fully constrained' : 'under-constrained'} · ${x.dof ?? 0} DOF`;
}

/** The length of an edge's polyline (flat xyz), mm. */
function polyLength(pts) {
  if (!pts || pts.length < 6) return null;
  let L = 0;
  for (let i = 3; i + 2 < pts.length; i += 3) L += Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2], pts[i + 2] - pts[i - 1]);
  return L;
}

function WhyValue({ host, value }) {
  if (value == null) return <p class="empty">The engine has nothing to say about this face.</p>;
  if (typeof value === 'string') return <p class="note">{value}</p>;
  const chain = value.genealogy || value.chain || value.history;
  const rest = Object.entries(value).filter(([k, v]) => !['genealogy', 'chain', 'history', 'reason', 'target', 'resolved', 'candidates'].includes(k)
    && v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length));
  return (
    <>
      {Array.isArray(chain) && chain.length > 0 && (
        <ol class="chain">{chain.map((c, i) => {
          const text = String(typeof c === 'string' ? c : c.name || c.id || JSON.stringify(c));
          const id = text.split(/[ ·/[←:]/)[0];
          const node = host.program?.graph?.nodes?.some(n => n.id === id);
          return <li key={i}>{node ? <button class="nid" title={`${id} in the graph`} onClick={() => { host.selectNode(id); host.focus('graph'); }}>{id}</button> : null}<span class="step"><Name text={node ? text.slice(id.length) : text} /></span></li>;
        })}</ol>
      )}
      {value.reason && <p class="note">{value.reason}</p>}
      {Array.isArray(value.candidates) && value.candidates.length > 0 && (
        <table class="rt"><thead><tr><th>candidate</th><th>kept</th></tr></thead>
          <tbody>{value.candidates.map((c, i) => <tr key={i}><td>{c.name ?? String(c)}</td><td>{c.kept ? 'kept' : c.reason || 'dropped'}</td></tr>)}</tbody></table>
      )}
      {rest.length > 0 && <dl class="kv">{rest.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{typeof v === 'object' ? (Array.isArray(v) ? v.join(' · ') : JSON.stringify(v)) : String(v)}</dd>])}</dl>}
    </>
  );
}
