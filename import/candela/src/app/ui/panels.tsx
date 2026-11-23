// panels.jsx — the build's other faces: the console (diagnostics, logs, explain), the IR as text and as a DAG,
// the generated shaders, the scene outline with live handles, and the lab (physical tests, readings).
import React from 'react';
import type { Host } from '../host';
const { useState, useMemo, useRef, useEffect } = React;
import { useHost, useFocus, Seg, Tog, copyText } from './common';
import { highlight } from '../highlight';
import { formatDiag, test, API } from '../host';
import { Slider, fmt } from './slider';

// ---------- console ----------
export function ConsoleView({ host }: { host: Host }) {
  useHost(host, 3);
  const [tab, setTab] = useState('diags');
  const d = host.diags, logs = host.logs || [];
  const errs = d.filter(x => x.severity === 'error').length, warns = d.filter(x => x.severity === 'warning').length;
  return <div className="tabbody col consoleview">
    <div className="toolbar">
      <Seg small value={tab} onChange={setTab} options={[{ value: 'diags', label: `Diagnostics ${d.length || ''}` }, { value: 'logs', label: `Logs ${logs.length || ''}` }, { value: 'explain', label: 'Explain' }, { value: 'patches', label: `Patches ${host.history.length || ''}` }]} />
      <span className="sp" />
      <span className="dim">{errs} errors · {warns} warnings</span>
      <button className="btn sm" onClick={() => copyText(d.map(formatDiag).join('\n\n'), host)}>Copy</button>
    </div>
    <div className="scroll">
      {tab === 'diags' && (d.length ? <div className="diaglist">{d.map((x, i) => <button key={i} className={'dg ' + x.severity} onClick={() => x.loc && host.files[x.loc.file] != null && host.focus({ view: 'code', file: x.loc.file, line: x.loc.line })}>
        <span className="sev">{x.severity === 'error' ? '✖' : x.severity === 'warning' ? '⚠' : 'ⓘ'}</span><code className="code">{x.code}</code>
        <span className="msg">{x.message}{x.suggest && x.suggest.length ? <em> Did you mean {x.suggest.map(s => `'${s}'`).join(' or ')}?</em> : null}{x.hint ? <pre className="hint">{([] as any[]).concat(x.hint).join('\n')}</pre> : null}</span>
        <span className="loc">{x.loc ? `${x.loc.file}:${x.loc.line}` : ''}</span>
      </button>)}</div> : <p className="empty padded">No diagnostics. Builders check units, ranges and energy as you write; stage errors (JS arithmetic on a field) are caught while tracing.</p>)}
      {tab === 'logs' && (logs.length ? <pre className="logs big">{logs.join('\n')}</pre> : <p className="empty padded">console.log from the scene files shows here.</p>)}
      {tab === 'explain' && <pre className="logs big">{host.explain() || '—'}</pre>}
      {tab === 'patches' && (host.history.length ? <table className="rt"><thead><tr><th>patch</th><th>cost</th></tr></thead><tbody>{host.history.slice().reverse().map((h, i) => <tr key={i}><td><code>{h.label}</code></td><td>{h.cost === 'value' ? 'value · buffer write' : 'structure · shader swap'}</td></tr>)}</tbody></table> : <p className="empty padded">Live edits — from the Scene view or the agent's <code>world.$('#id').power = …</code> — appear here with what they cost.</p>)}
    </div>
  </div>;
}

// ---------- IR ----------
export function IRView({ host }: { host: Host }) {
  useHost(host, 2);
  const txt = host.irText();
  return <div className="tabbody col">
    <div className="toolbar"><span className="lbl">The scene as built: every builder, materials lowered to the BSDF algebra, fields printed</span><span className="sp" /><button className="btn sm" onClick={() => copyText(txt, host)}>Copy</button></div>
    <div className="scroll"><pre className="irtext">{txt || 'No scene.'}</pre></div>
  </div>;
}

// ---------- the DAG ----------
const KIND_ORDER = ['scene', 'group', 'shape', 'light', 'camera', 'material', 'bsdf'];
export function GraphView({ host }: { host: Host }) {
  useHost(host, 1);
  const g = useMemo(() => host.irGraph(), [host.result]);
  const [hov, setHov] = useState<any>(null);
  if (!g.nodes.length) return <div className="tabbody col"><p className="empty padded">No scene.</p></div>;
  // layers by longest path from the root
  const depth = new Array(g.nodes.length).fill(0);
  for (let it = 0; it < g.nodes.length; it++) for (const [a, b] of g.edges) depth[b] = Math.max(depth[b], depth[a] + 1);
  const layers: any[] = []; g.nodes.forEach(n => { (layers[depth[n.id]] = layers[depth[n.id]] || []).push(n); });
  const W = 150, H = 26, GX = 60, GY = 10;
  const pos = new Map();
  layers.forEach((L, i) => L.forEach((n, j) => pos.set(n.id, { x: 20 + i * (W + GX), y: 20 + j * (H + GY) })));
  const width = 40 + layers.length * (W + GX), height = 40 + Math.max(...layers.map(L => L.length)) * (H + GY);
  const shared = new Map(); for (const [, b] of g.edges) shared.set(b, (shared.get(b) || 0) + 1);
  return <div className="tabbody col">
    <div className="toolbar"><span className="lbl">The scene DAG: a node reached by two edges is shared — one IR node, one kernel, many instances</span><span className="sp" /><span className="dim">{g.nodes.length} nodes · {g.edges.length} edges · {[...shared.values()].filter(v => v > 1).length} shared</span></div>
    <div className="scroll graphscroll">
      <svg width={width} height={height} className="dag">
        {g.edges.map(([a, b], i) => { const p = pos.get(a), q = pos.get(b); const x1 = p.x + W, y1 = p.y + H / 2, x2 = q.x, y2 = q.y + H / 2; const on = hov === a || hov === b; return <path key={i} d={`M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}`} className={'edge' + (on ? ' on' : '')} />; })}
        {g.nodes.map(n => { const p = pos.get(n.id); const sh = (shared.get(n.id) || 0) > 1; return <g key={n.id} transform={`translate(${p.x},${p.y})`} className={'gnode k-' + n.kind + (sh ? ' shared' : '') + (hov === n.id ? ' on' : '')} onMouseEnter={() => setHov(n.id)} onMouseLeave={() => setHov(null)}>
          <rect width={W} height={H} /><text x={8} y={17}>{n.label.slice(0, 22)}</text>{n.sub ? <text x={W - 6} y={17} textAnchor="end" className="sub">{n.sub}</text> : null}{sh ? <text x={W - 6} y={-3} textAnchor="end" className="shr">×{shared.get(n.id)}</text> : null}
        </g>; })}
      </svg>
    </div>
  </div>;
}

// ---------- shaders ----------
export function ShaderView({ host }: { host: Host }) {
  useHost(host, 1);
  const [lang, setLang] = useState('wgsl'), [q, setQ] = useState('');
  const c = host.result && host.result.compiled, vp = host.vp, err = host.compileError;
  const src = useMemo(() => {
    if (!c) return '';
    if (lang === 'wgsl') return c.shared;
    if (lang === 'backend') return vp && vp.backend && vp.backend.source || '';
    try { return API && require_glsl(c.shared); } catch (e) { return '// ' + e.message; }
  }, [c, lang, vp && vp.backend && vp.backend.source]);
  const lines = src.split('\n');
  const errLines = new Set((err && err.errors || []).map(e => e.line));
  const shown = q ? lines.map((l, i) => [l, i]).filter(([l]) => l.toLowerCase().includes(q.toLowerCase())).slice(0, 400) : lines.map((l, i) => [l, i]);
  return <div className="tabbody col shaderview">
    <div className="toolbar">
      <Seg small value={lang} onChange={setLang} options={[{ value: 'wgsl', label: 'WGSL (generated)' }, { value: 'glsl', label: 'GLSL (translated)' }, { value: 'backend', label: `Running on ${vp && vp.backend ? vp.backend.name : '…'}` }]} />
      <input className="filter" placeholder="find (e.g. mat_0, evalLobe, sdf_)" value={q} onChange={e => setQ(e.target.value)} />
      <span className="sp" /><span className="dim">{lines.length} lines{c ? ` · ${c.stats.materials} materials · ${c.stats.params} uniforms` : ''}{vp && vp.compileMs ? ` · compiled in ${vp.compileMs.toFixed(0)} ms` : ''}</span>
      <button className="btn sm" onClick={() => copyText(src, host)}>Copy</button>
    </div>
    {err && <div className="agent-off"><b>Compile error</b>{err.message}</div>}
    <div className="scroll"><pre className="shadersrc">{shown.map(([l, i]) => <div key={i} className={errLines.has(i + 1) ? 'ln-err' : ''}><span className="lnum">{i + 1}</span><span dangerouslySetInnerHTML={{ __html: highlight(l) }} /></div>)}</pre></div>
  </div>;
}
import { wgslToGlsl } from '../../engine/wgsl2glsl';
const require_glsl = s => wgslToGlsl(s);

// ---------- scene outline: live handles ----------
export function SceneView({ host }: { host: Host }) {
  useHost(host, 4);
  const c = host.result && host.result.compiled;
  if (!c) return <div className="tabbody col"><p className="empty padded">No scene.</p></div>;
  const w: any = host.world();
  const sel = host.selection;
  const objs = c.objects.filter(o => !o.mediumBox && !o.bulb);
  const lights = c.lightsMeta.filter(l => l.kind !== 'emit');
  const setL = async (id, k, v) => { try { const r = await host.patch('#' + id, b => b[k](v), `#${id}.${k} = ${v}`); } catch (e) { host.toast(e.message, true); } };
  return <div className="tabbody col sceneview">
    <div className="toolbar"><span className="lbl">Objects, lights and the camera. Give a node an .id() to edit it here; each edit is a patch.</span><span className="sp" /><span className="dim">{objs.length} objects · {c.lightsMeta.length} lights</span></div>
    <div className="scroll">
      <table className="rt outline"><thead><tr><th>node</th><th>kind</th><th>material</th></tr></thead><tbody>
        {objs.map((o, i) => { const key = o.id ? '#' + o.id : `object ${c.objects.indexOf(o)}`; return <tr key={i} className={sel === key ? 'on' : ''} onClick={() => host.select(key)}><td>{o.id ? <b>#{o.id}</b> : <span className="dim">—</span>}</td><td>{o.comp.kind.replace('shape.', '')}{o.lightIdx >= 0 ? ' · emitter' : ''}</td><td>{(c.materials[o.mat] || {}).label}</td></tr>; })}
      </tbody></table>
      {lights.length > 0 && <div className="block"><header><h2>Lights</h2><span className="sub">photometric units; edits are patches</span></header>
        {lights.map((l, i) => { const p = l.comp.props, id = p.id; const pw = typeof p.power === 'number' ? p.power : null, T = typeof p.temperature === 'number' ? p.temperature : null; return <div key={i} className="lightrow">
          <div className="prm-h"><b>{id ? '#' + id : l.kind}</b><span className="dim">{l.kind}</span></div>
          {id && pw != null && <div className="kv2"><span>power</span><Slider value={pw} min={0} max={Math.max(5000, pw * 2)} def={pw} unit="lm" log={false} onChange={v => setL(id, 'power', v)} /></div>}
          {id && T != null && <div className="kv2"><span>temperature</span><Slider value={T} min={1500} max={12000} def={T} unit="K" step={50} onChange={v => setL(id, 'temperature', v)} /></div>}
          {!id && <p className="note">Give it an id — <code>light.point().id('key')</code> — to edit it live.</p>}
        </div>; })}
      </div>}
      {c.sun && <div className="block"><header><h2>Sun</h2></header><dl className="kv"><dt>elevation</dt><dd>{typeof c.sun.props.elevation === 'number' ? (c.sun.props.elevation * 180 / Math.PI).toFixed(1) + '°' : 'param'}</dd><dt>illuminance</dt><dd>{c.sun.props.illuminance != null ? (typeof c.sun.props.illuminance === 'number' ? Math.round(c.sun.props.illuminance).toLocaleString() + ' lx' : 'param') : 'from air mass'}</dd></dl></div>}
      {c.stats.triangles > 0 && <div className="block"><header><h2>Meshes</h2><span className="sub">{c.stats.meshes} definition{c.stats.meshes === 1 ? '' : 's'} · {c.stats.triangles.toLocaleString()} triangles across instances · {(c.stats.sceneData / 1048576).toFixed(1)} MB scene data</span></header>
        <table className="rt"><thead><tr><th>definition</th><th>triangles</th><th>faces</th><th>instances</th></tr></thead><tbody>
          {[...new Set<any>(c.objects.filter(o => o.def).map(o => o.def))].map((d, i) => <tr key={i}><td><b>{d.name}</b>{d.meta && d.meta.material ? <span className="dim"> · {d.meta.material}{d.meta.finish ? ' · ' + d.meta.finish : ''}</span> : null}</td><td>{d.count.toLocaleString()}</td><td title={d.faces.map(f => f.id).join(', ')}>{d.faces.length}</td><td>{c.objects.filter(o => o.def === d).length}</td></tr>)}
        </tbody></table>
        <p className="note">Click a part in the viewport to see its definition, instance and face, with the face's metadata.</p>
      </div>}
      <div className="block"><header><h2>Assets</h2><span className="sub">images for light.env.hdri('name') — or drop them on the viewport</span></header>
        {host.assetList().map(a => <div key={a.name} className="row"><b>{a.name}</b><span className="dim">{a.width}×{a.height}</span><code>light.env.hdri('{a.name}')</code></div>)}
        {!host.assetList().length && <p className="note">None yet. Radiance .hdr files keep their range; .png and .jpg are read as sRGB and are only as bright as white.</p>}
        <div className="row"><label className="btn sm">Add image…<input type="file" accept=".hdr,.pic,.png,.jpg,.jpeg,.webp" hidden onChange={async e => { for (const f of e.target.files || []) { try { await host.addAssetFile(f); } catch (x) { host.toast(`${f.name}: ${x.message}`, true); } } e.target.value = ''; }} /></label></div>
      </div>
      {sel && <div className="block"><header><h2>Selected {sel}</h2></header><pre className="logs">{(() => { try { return sel.startsWith('#') ? JSON.stringify(w.$(sel).props, null, 1) : 'Give the node an .id() to read its handle.'; } catch (e) { return e.message; } })()}</pre></div>}
    </div>
  </div>;
}

// ---------- lab: physical tests and readings ----------
export function LabView({ host }: { host: Host }) {
  useHost(host, 2);
  const [rows, setRows] = useState<any>(null), [busy, setBusy] = useState(false), [ms, setMs] = useState(true);
  const run = () => { setBusy(true); setTimeout(() => { const r = test.sweep(x => API.bsdf.conductor.schlick({ f0: 1, roughness: x, multiscatter: ms }), { roughness: [0.25, 0.5, 0.75, 1], angles: [0, 45, 75, 85], spp: 1 << 15, multiscatter: ms }); setRows(r); setBusy(false); }, 30); };
  const vp = host.vp, c = host.result && host.result.compiled;
  return <div className="tabbody col labview">
    <div className="scroll">
      <div className="block"><header><h2>White furnace</h2><span className="sub">GGX conductor, F0 = 1, height-correlated Smith: directional albedo E(θo) by Monte Carlo on the CPU</span></header>
        <div className="row"><Tog on={ms} onClick={() => setMs(!ms)}>Multiple-scattering compensation</Tog><button className="btn sm primary" onClick={run} disabled={busy}>{busy ? 'running…' : 'Run'}</button></div>
        {rows && <table className="rt"><thead><tr><th>roughness</th>{Object.keys(rows[0]).filter(k => k !== 'roughness').map(k => <th key={k}>θo = {k}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.roughness}</td>{Object.entries<any>(r).filter(([k]) => k !== 'roughness').map(([k, v]) => <td key={k} className={v < 0.95 ? 'badcell' : ''}>{v.toFixed(3)}</td>)}</tr>)}</tbody></table>}
        <p className="note">Without compensation a rough metal loses up to 69 % of its energy: at α = 1 and normal incidence it keeps exactly 1 − ln 2 ≈ 0.307. With it on, single scattering is multiplied by 1 + F0 (1/E − 1), as the kernel does.</p>
      </div>
      <div className="block"><header><h2>Readings</h2></header>
        <dl className="kv">
          <dt>backend</dt><dd>{vp && vp.backend ? `${vp.backend.name} · ${vp.backend.info || ''}` : '—'}</dd>
          <dt>exposure</dt><dd>{vp ? `EV100 ${vp.exposureEV().toFixed(2)} · L_max ${fmt(1.2 * Math.pow(2, vp.exposureEV()))} nit` : '—'}</dd>
          <dt>metered</dt><dd>{vp && vp.lastMeter ? `${fmt(vp.lastMeter.Lavg)} nit (log-average of block means)` : '—'}</dd>
          <dt>samples</dt><dd>{vp ? `${vp.spp} spp · ${vp.lastMs.toFixed(1)} ms/frame` : '—'}</dd>
          <dt>kernel</dt><dd>{c ? `${c.stats.lines} lines · ${c.stats.materials} materials · ${c.stats.objects} objects · ${c.stats.sdfs} SDFs · ${c.stats.media} media` : '—'}</dd>
          <dt>shader compile</dt><dd>{vp && vp.compileMs ? `${vp.compileMs.toFixed(0)} ms (cached by source thereafter)` : '—'}</dd>
        </dl>
        <p className="note">Alt-click the viewport to meter any point: luminance in nit and its EV100 (reflected meter, K = 12.5).</p>
      </div>
    </div>
  </div>;
}
