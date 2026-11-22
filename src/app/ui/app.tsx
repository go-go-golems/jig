// app.jsx — the workbench: a header (presets, build, status, layouts) over a dock of tiled, draggable views.
import React from 'react';
const { useState, useEffect, useRef, useMemo } = React;
import { useHost, Menu, saveFile } from './common';
import { Dock, tile, split, normalize, tileOf, tilesOf, addView, activate, openViews } from './dock';
import { store } from '../host';
import { ViewportView } from './viewport';
import { CodeView } from './code';
import { ParamsView } from './params';
import { ConsoleView, IRView, GraphView, ShaderView, SceneView, LabView } from './panels';
import { NotesView, DocsView, ReferenceView } from './notes';
import { AgentView } from './agent';
import { RenderView } from './render';

const GROUPS = ['Basics', 'Light', 'Materials', 'Algebra', 'Fields', 'Geometry', 'Media', 'Spectral', 'Camera', 'Engines', 'GPU', 'Live', 'Scenes', 'Machines', 'Diagnostics', 'Mine'];
const KNOWN = ['viewport', 'code', 'params', 'notes', 'agent', 'console', 'scene', 'render', 'ir', 'graph', 'shader', 'lab', 'docs', 'reference'];
export const LAYOUTS = [
  { id: 'default', label: 'Code beside the render', make: () => split('row', [tile(['code', 'notes', 'agent', 'docs', 'reference']), split('col', [split('row', [tile(['viewport']), tile(['params', 'scene', 'render', 'lab'])], [0.72, 0.28]), tile(['console', 'ir', 'graph', 'shader'])], [0.7, 0.3])], [0.34, 0.66]) },
  { id: 'render', label: 'The render first', make: () => split('row', [split('col', [tile(['viewport']), tile(['console', 'ir', 'graph', 'shader'])], [0.78, 0.22]), tile(['params', 'agent', 'code', 'notes', 'scene', 'render', 'lab', 'docs', 'reference'])], [0.7, 0.3]) },
  { id: 'agent', label: 'Working with the agent', make: () => split('row', [tile(['agent', 'notes', 'docs']), split('col', [tile(['viewport']), tile(['code', 'params', 'console', 'scene', 'render', 'ir', 'graph', 'shader', 'lab', 'reference'])], [0.62, 0.38])], [0.36, 0.64]) },
  { id: 'compiler', label: 'The compiler: code, IR, shaders', make: () => split('row', [tile(['code', 'notes', 'agent']), tile(['ir', 'graph']), split('col', [tile(['viewport']), tile(['shader', 'console', 'params', 'scene', 'render', 'lab', 'docs', 'reference'])], [0.5, 0.5])], [0.32, 0.32, 0.36]) },
  { id: 'reading', label: 'Reading the docs', make: () => split('row', [tile(['docs', 'notes', 'reference']), split('col', [tile(['viewport']), tile(['code', 'params', 'agent', 'console', 'scene', 'render', 'ir', 'graph', 'shader', 'lab'])], [0.6, 0.4])], [0.46, 0.54]) },
  { id: 'one', label: 'Everything in one tile', make: () => tile(KNOWN, 'viewport') },
];
const NEAR = { viewport: ([] as any[]), code: ['notes', 'agent'], params: ['scene', 'lab'], notes: ['code', 'docs'], agent: ['code', 'notes'], console: ['ir', 'shader'], scene: ['params'], render: ['params', 'scene'], ir: ['graph', 'console'], graph: ['ir'], shader: ['console', 'ir'], lab: ['params'], docs: ['notes', 'reference'], reference: ['docs', 'notes'] };

export function App({ host }) {
  useHost(host, 4);
  const [layout, setLayoutRaw] = useState(() => normalize(store.get('layout', null) || LAYOUTS[0].make(), KNOWN));
  const setLayout = l => { setLayoutRaw(l); store.set('layout', l); };
  const [max, setMax] = useState<any>(null);
  const [phone, setPhone] = useState(() => window.innerWidth < 700);
  const [phoneLayout, setPhoneLayout] = useState(() => tile(['viewport', 'params', 'notes', 'code', 'agent', 'console', 'scene', 'render', 'docs', 'ir', 'graph', 'shader', 'lab', 'reference'], 'viewport'));
  useEffect(() => { const h = () => setPhone(window.innerWidth < 700); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  const seen = useRef(0);
  useEffect(() => {
    const r = host.focusReq; if (!r || r.n === seen.current || !r.view) return; seen.current = r.n;
    const L = phone ? phoneLayout : layout, set = phone ? setPhoneLayout : setLayout;
    const t = tileOf(L, r.view);
    if (t) { if (t.active !== r.view) set(activate(L, t.id, r.view)); }
    else set(addView(L, r.view, KNOWN, NEAR[r.view] || []));
  });
  useEffect(() => {
    const k = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.defaultPrevented) { if (e.target.closest && e.target.closest('.composer')) return; e.preventDefault(); host.build({}); }
      if (e.key === 'Escape' && max) setMax(null);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [host, max]);
  const views = useMemo(() => [
    { id: 'viewport', title: 'Viewport', about: 'the render: a progressive path tracer on the GPU' },
    { id: 'code', title: 'Code', about: 'the scene, editable', badge: () => { const n = host.diags.filter(d => d.severity === 'error').length; return n ? { text: n, bad: true } : null; } },
    { id: 'params', title: 'Params', about: 'every param as a control', badge: () => { const n = host.params().filter(h => h.isChanged()).length; return n || null; } },
    { id: 'notes', title: 'Notes', about: 'what this preset is about' },
    { id: 'agent', title: 'Agent', about: 'a chat agent with eval and screenshots' },
    { id: 'console', title: 'Console', about: 'diagnostics, logs, explain', badge: () => { const n = host.diags.filter(d => d.severity !== 'info').length; return n ? { text: n, bad: host.diags.some(d => d.severity === 'error') } : null; } },
    { id: 'scene', title: 'Scene', about: 'objects, lights, assets, live handles' },
    { id: 'render', title: 'Render', about: 'stills, sequences and EXR passes; the queue', badge: () => (host.queue.running ? { text: Math.round(host.queue.running.progress * 100) + '%' } : null) },
    { id: 'ir', title: 'IR', about: 'the scene as built, materials lowered' },
    { id: 'graph', title: 'Graph', about: 'the scene DAG; shared nodes once' },
    { id: 'shader', title: 'Shader', about: 'generated WGSL and its GLSL translation' },
    { id: 'lab', title: 'Lab', about: 'furnace tests and readings' },
    { id: 'docs', title: 'Docs', about: 'the design and the physics' },
    { id: 'reference', title: 'Reference', about: 'the API, one page' },
  ], [host]);
  const render = id => {
    switch (id) {
      case 'viewport': return <ViewportView host={host} />; case 'code': return <CodeView host={host} />; case 'params': return <ParamsView host={host} />;
      case 'notes': return <NotesView host={host} />; case 'agent': return <AgentView host={host} />; case 'console': return <ConsoleView host={host} />;
      case 'scene': return <SceneView host={host} />; case 'render': return <RenderView host={host} />; case 'ir': return <IRView host={host} />; case 'graph': return <GraphView host={host} />;
      case 'shader': return <ShaderView host={host} />; case 'lab': return <LabView host={host} />; case 'docs': return <DocsView host={host} />; case 'reference': return <ReferenceView host={host} />;
      default: return null;
    }
  };
  return <div id="app">
    <Header host={host} setLayout={l => { setMax(null); phone ? setPhoneLayout(l) : setLayout(l); }} />
    <main id="work">{phone ? <Dock layout={phoneLayout} setLayout={setPhoneLayout} views={views} known={KNOWN} render={render} max={null} setMax={() => {}} /> : <Dock layout={layout} setLayout={setLayout} views={views} known={KNOWN} render={render} max={max} setMax={setMax} />}</main>
    <div className="toasts" aria-live="polite">{host.toasts.slice(-3).map(t => <div key={t.id} className={'toast' + (t.bad ? ' bad' : '')}>{t.msg}</div>)}</div>
  </div>;
}

function Header({ host, setLayout }) {
  const r = host.result, vp = host.vp;
  const errs = host.diags.filter(d => d.severity === 'error').length, warns = host.diags.filter(d => d.severity === 'warning').length;
  const [theme, setTheme] = useState(() => store.get('theme', 'system'));
  useEffect(() => { if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; store.set('theme', theme); }, [theme]);
  return <header className="bar">
    <div className="brand">Candela <i>workbench</i></div>
    <PresetMenu host={host} />
    <button className={'btn' + (host.isDirty() ? ' primary' : '')} onClick={() => host.build({})} title="Re-run the scene files and recompile (Ctrl+Enter)">Run<span className="long"> <kbd>⌘↵</kbd></span></button>
    <span className="sp" />
    {r && <button className={'pill' + (errs || host.compileError ? ' bad' : '') + (host.building || host.compiling ? ' busy' : '')} onClick={() => host.focus({ view: errs ? 'code' : 'console' })} title={r.ok ? 'built' : (r.error && r.error.message)}>
      <b>{host.compileError ? 'shader error' : errs ? `${errs} error${errs > 1 ? 's' : ''}` : host.compiling ? 'compiling' : 'ok'}</b><span>{r.ok && r.compiled ? `${r.compiled.stats.objects} objects · ${r.compiled.stats.materials} kernels · ${r.compiled.stats.params} uniforms${warns ? ` · ${warns} warning${warns > 1 ? 's' : ''}` : ''}` : ''}</span>
    </button>}
    {vp && vp.backend && <span className="pill gpu" title={vp.backend.info}><b>{vp.backend.name}</b><span>{vp.spp} spp · EV {vp.exposureEV().toFixed(1)}</span></span>}
    <Menu label={<span><span className="glyph">▦</span><span className="long"> Layout</span></span>} align="right" className="layouts" btnClass="btn laymenu" title="Layouts">
      {LAYOUTS.map(l => <button key={l.id} onClick={() => setLayout(l.make())}><span>{l.label}</span></button>)}
      <p className="note">Drag a tab to move it; drag a tile by its ⠿ grip to swap or dock the whole tile; drop on an edge to split. Double-click a tile's strip to maximise it. The layout is kept in this browser.</p>
    </Menu>
    <button className="ibtn" title={'Theme: ' + theme} aria-label="Theme" onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}><ThemeGlyph theme={theme} /></button>
  </header>;
}

function PresetMenu({ host }) {
  const p = host.preset; const [title, setTitle] = useState(''), [q, setQ] = useState(''); const fileRef = useRef<any>(null);
  if (!p) return null;
  const all = host.allPresets().filter(x => !q || (x.id + ' ' + x.title + ' ' + x.about + ' ' + x.group).toLowerCase().includes(q.toLowerCase()));
  const doImport = async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { host.importProject(JSON.parse(await f.text())); host.toast('Imported ' + f.name); } catch (err) { host.toast('Import failed: ' + err.message, true); } e.target.value = ''; };
  return <div className="proj">
    <Menu btnClass="projbtn" className="presets" label={<><span className="pcode">{p.id}</span><span className="ptitle">{p.title}</span>{host.isDirty() || host.notesDirty() ? <span className="pcode">edited</span> : null}<span className="caret">▾</span></>}>
      {close => <>
        <div className="newfile" data-keep><input placeholder={`search ${host.allPresets().length} presets`} value={q} onChange={e => setQ(e.target.value)} autoFocus /></div>
        {GROUPS.map(g => { const list = all.filter(x => x.group === g); if (!list.length) return null; return <React.Fragment key={g}>
          <div className="grp">{g} <span className="dim">{list.length}</span></div>
          {list.map(x => <button key={x.id} className={x.id === p.id ? 'on' : ''} onClick={() => host.loadPreset(x.id)}><span className="code">{x.id}</span><span className="t">{x.title}</span><small>{x.about}</small></button>)}
        </React.Fragment>; })}
        <hr />
        <div className="mh">This project</div>
        <div className="newfile" data-keep><input placeholder="save as my preset: title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { host.saveAsMine(title.trim()); setTitle(''); close(); } }} /><button className="btn sm" onClick={() => { host.saveAsMine(title.trim()); setTitle(''); close(); }}>Save</button></div>
        {(host.isDirty() || host.notesDirty()) && <button onClick={() => host.revertAll()}><span className="t">Revert all edits</span><small>back to {p.id} as published</small></button>}
        <button onClick={() => saveFile(host, `${p.id}-${p.title.replace(/\W+/g, '-').toLowerCase()}.json`, JSON.stringify(host.exportProject(), null, 1))}><span className="t">Export project</span><small>files, notes and param values as .json</small></button>
        <button data-keep onClick={() => fileRef.current && fileRef.current.click()}><span className="t">Import project…</span><small>a .json exported from here</small></button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={doImport} />
        {p.group === 'Mine' && <button onClick={() => host.deleteMine(p.id)}><span className="t bad">Delete {p.id}</span><small>removes your saved preset</small></button>}
      </>}
    </Menu>
  </div>;
}
function ThemeGlyph({ theme }) {
  const p = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true };
  if (theme === 'light') return <svg {...p}><circle cx="8" cy="8" r="3" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return <line key={a} x1={8 + 5 * c} y1={8 + 5 * s} x2={8 + 6.8 * c} y2={8 + 6.8 * s} />; })}</svg>;
  if (theme === 'dark') return <svg {...p}><path d="M10.5 2.2A6 6 0 1 0 13.8 10 4.8 4.8 0 0 1 10.5 2.2z" /></svg>;
  return <svg {...p}><circle cx="8" cy="8" r="5.6" /><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" stroke="none" /></svg>;
}
