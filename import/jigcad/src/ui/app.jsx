// The workbench: the header bar (HeaderBar), the dock of tiles, the toasts.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Menu, ThemeIcon, useHost, RUN_KEY, RUN_KEY_LONG } from './common.jsx';
import { Dock } from './dock.jsx';
import { LAYOUTS, VIEWS, RELATED, normalise, openViews, tileOf, tiles, replaceNode, moveView, clone } from './layouts.js';
import { store } from '../host/store.js';
import { qty, plural } from './format.js';
import { downloads, saveOrCopy, stlToASCII } from './save.js';
import { CodeView } from './views/code.jsx';
import { StageView } from './views/stage.jsx';
import { ParamsView } from './views/params.jsx';
import { GraphView } from './views/graph.jsx';
import { IRView } from './views/ir.jsx';
import { TraceView } from './views/trace.jsx';
import { NotesView } from './views/notes.jsx';
import { DocsView, ReferenceView } from './views/docs.jsx';
import { BookView } from './views/book.jsx';
import { ExperimentsView } from './views/experiments.jsx';
import { AgentView } from './views/agent.jsx';
import { PresetsView } from './views/presets.jsx';
import { shelf } from './presets.js';

const COMPONENTS = {
  notes: NotesView, code: CodeView, agent: AgentView, docs: DocsView, book: BookView, reference: ReferenceView,
  stage: StageView, params: ParamsView, graph: GraphView, ir: IRView, trace: TraceView, experiments: ExperimentsView,
  presets: PresetsView,
};

function initialLayout() {
  const saved = store.get('layout');
  return saved ? normalise(saved, true) : normalise(clone(LAYOUTS[0].tree));
}

export function App({ host }) {
  useHost(host, ['program', 'compiling', 'files', 'preset', 'theme', 'engine', 'overrides']);
  const [tree, setTreeState] = useState(initialLayout);
  const [layoutId, setLayoutId] = useState(() => store.get('layoutId', LAYOUTS[0].id));
  const [narrow, setNarrow] = useState(() => innerWidth < 640);
  const [narrowTree, setNarrowTree] = useState(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;

  const setTree = (t, opts) => {
    if (narrow) { setNarrowTree(t); return; }
    setTreeState(t);
    if (!opts?.transient) store.set('layout', t);
  };
  useEffect(() => {
    const onResize = () => setNarrow(innerWidth < 640);
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  const shown = useMemo(() => {
    if (!narrow) return tree;
    if (narrowTree) return narrowTree;
    const views = openViews(tree);
    return normalise({ t: 'tile', views: ['stage', ...views.filter(v => v !== 'stage')], active: 'stage' });
  }, [narrow, narrowTree, tree]);

  // links and actions bring views forward: activate them, or put them back next to related views
  useEffect(() => host.on('focus', ({ view }) => {
    const cur = narrow ? shown : treeRef.current;
    const t = tileOf(cur, view);
    if (t) { setTree(replaceNode(cur, t.id, n => ({ ...n, active: view }))); return; }
    const near = (RELATED[view] || []).map(v => tileOf(cur, v)).find(Boolean) || tiles(cur)[0];
    setTree(moveView(cur, view, { tile: near.id, zone: 'center' }));
  }), [narrow, shown]);

  // Run: ⌘↵ / Ctrl+↵ (and Ctrl+S) anywhere
  useEffect(() => {
    const key = e => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) { e.preventDefault(); host.compile(); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  const program = host.program, good = program?.ok !== false ? program : host.lastGood;
  const errors = program?.ok === false ? program.diagnostics.filter(d => d.level === 'error').length || 1 : (program?.diagnostics || []).filter(d => d.level === 'error').length;
  const badge = v => {
    if (v === 'code' && errors) return { n: errors, bad: true };
    if (v === 'params') { const n = Object.keys(host.overrides).length; return n ? { n } : null; }
    return null;
  };
  const renderView = id => { const C = COMPONENTS[id]; return C ? <C key={id} host={host} /> : null; };

  return (
    <div class="app">
      <Header host={host} layoutId={layoutId} errors={errors} good={good}
        chooseLayout={l => { const t = normalise(clone(l.tree)); setLayoutId(l.id); store.set('layoutId', l.id); setNarrowTree(null); setTreeState(t); store.set('layout', t); }} />
      <Dock tree={shown} setTree={setTree} renderView={renderView} badge={badge} />
      <Toasts host={host} />
    </div>
  );
}

function statusOf(host, errors) {
  const p = host.program, s = (p?.ok !== false ? p : host.lastGood)?.summary || {};
  const counts = [s.features != null && plural(s.features, 'feature'), s.dof != null && `${s.dof} DOF`, s.bodies != null && plural(s.bodies, 'body', 'bodies')].filter(Boolean).join(' · ');
  if (!p) return { b: host.engine.kind === 'probing' ? 'loading' : 'compiling', span: host.engine.kind === 'probing' ? 'starting the engine' : '', bad: false };
  if (p.ok === false) return { b: plural(Math.max(1, errors), 'error'), span: counts || 'does not compile', bad: true };
  const warn = (p.diagnostics || []).filter(d => d.level === 'warning').length;
  if (errors) return { b: plural(errors, 'error'), span: counts, bad: true };
  return { b: 'ok', span: counts + (warn ? ` · ${plural(warn, 'warning')}` : ''), bad: false };
}

function Header({ host, layoutId, chooseLayout, errors, good }) {
  const st = statusOf(host, errors);
  const m = good?.metrics || {};
  const edited = host.preset && host.isEdited();
  const engineLine = host.engine.kind === 'worker' ? `the OpenCascade worker${host.engine.version ? ' ' + host.engine.version : ''}` : host.engine.kind === 'mock' ? `the mock engine (${host.engine.note})` : 'the engine, starting';
  return (
    <header class="bar">
      <div class="brand">jig <i>workbench</i></div>
      <PresetMenu host={host} edited={edited} />
      <button class={`btn ${host.dirty ? 'primary' : ''}`} title={`Compile the files with the current overrides (${RUN_KEY_LONG})`} onClick={() => host.compile()}>
        Run<span class="long"> <kbd>{RUN_KEY}</kbd></span>
      </button>
      <span class="sp" />
      <button class={`pill ${st.bad ? 'bad' : ''} ${host.compiling ? 'busy' : ''}`}
        title={`${st.bad ? 'Open the code at the error' : 'Open the feature graph'} · compiled by ${engineLine}${host.program?.ms != null ? ` in ${host.program.ms.toFixed(1)} ms` : ''}`}
        onClick={() => host.focus(st.bad ? 'code' : 'graph')}>
        <b>{st.b}</b>{st.span && <span>{st.span}</span>}
      </button>
      {(m.volume || m.mass) && <span class="pill score metrics" title={[m.volume && `volume ${qty(m.volume.value, m.volume.unit)} (${m.volume.fidelity || 'exact'})`, m.mass && `mass ${qty(m.mass.value, m.mass.unit)}${m.mass.note ? ` (${m.mass.note})` : ''}`].filter(Boolean).join(' · ')}>
        <b>{[m.volume && qty(m.volume.value, m.volume.unit), m.mass && qty(m.mass.value, m.mass.unit)].filter(Boolean).join(' · ')}</b>
        <span>{[m.volume && 'volume', m.mass && 'mass'].filter(Boolean).join(' · ')}</span>
      </span>}
      <ExportMenu host={host} />
      <Menu btnClass="btn laymenu" menuClass="layouts" right title="Choose a layout of tiles"
        label={<span><span class="glyph">▦</span><span class="long"> Layout</span></span>}>
        {LAYOUTS.map(l => (
          <button key={l.id} class={l.id === layoutId ? 'on' : ''} title={l.about} onClick={() => chooseLayout(l)}>
            <span class="t">{l.title}</span><small>{plural(tiles(l.tree).length, 'tile')}</small>
          </button>
        ))}
        <p class="note">Drag a tab to move it; drop it on a tile’s edge to split. The layout is kept in this browser.</p>
      </Menu>
      <button class="ibtn" title={`Theme: ${host.theme} (click for ${{ system: 'light', light: 'dark', dark: 'system' }[host.theme] || 'system'})`} aria-label="Theme" onClick={() => host.cycleTheme()}>
        <ThemeIcon theme={host.theme} />
      </button>
    </header>
  );
}

function PresetMenu({ host, edited }) {
  const p = host.preset;
  return (
    <div class="proj">
      <Menu btnClass="projbtn" menuClass="presets" title="Choose a preset (filter, then ↑ ↓ and Enter)"
        label={<>{p && <span class="pcode">{p.id}</span>}<span class="ptitle">{p ? p.title : 'No preset'}</span>{edited && <span class="pcode">edited</span>}<span class="caret">▾</span></>}>
        {close => <PresetMenuBody host={host} edited={edited} close={close} />}
      </Menu>
    </div>
  );
}

/** The preset menu's body: a filter, the shelf's groups with ids, titles and abouts, and the keyboard: ↑ ↓ move,
 *  Enter loads, Esc closes (Menu). The open preset is bold; the active row (keyboard or pointer) is filled. */
function PresetMenuBody({ host, edited, close }) {
  const p = host.preset;
  const [q, setQ] = useState('');
  const groups = shelf(host.presets(), q);
  const flat = groups.flatMap(g => g.items);
  const [active, setActive] = useState(() => Math.max(0, flat.findIndex(x => x.id === p?.id)));
  const input = useRef(null), list = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { if (active >= flat.length) setActive(Math.max(0, flat.length - 1)); }, [flat.length]);
  useEffect(() => { list.current?.querySelector('button.act')?.scrollIntoView({ block: 'nearest' }); }, [active, q]);
  const load = x => { if (!x) return; close(); if (x.id !== p?.id) host.loadPreset(x.id); };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive(i => Math.min(flat.length - 1, i + 8)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive(i => Math.max(0, i - 8)); }
    else if (e.key === 'Home' && !q) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && !q) { e.preventDefault(); setActive(flat.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); load(flat[active]); }
  };
  const total = host.presets().length;
  let n = -1;
  return (
    <>
      <div class="pfilter" data-keep>
        <input ref={input} class="filter" placeholder="search the shelf: id, title, group, difficulty" aria-label="Filter presets" value={q}
          role="combobox" aria-expanded="true" aria-controls="preset-list" aria-activedescendant={flat[active] ? `preset-opt-${flat[active].id}` : undefined}
          onInput={e => { setQ(e.currentTarget.value); setActive(0); }} onKeyDown={onKey} />
        <span class="dim">{flat.length === total ? `${total} presets` : `${flat.length} of ${total}`}</span>
      </div>
      <div class="plist" ref={list} id="preset-list" role="listbox" aria-label="Presets">
        {groups.map(g => [
          <div class="grp" key={'g' + g.title}><span>{g.title}</span><span class="n">{g.items.length}</span></div>,
          ...g.items.map(x => {
            const i = ++n;
            return (
              <button key={x.id} id={`preset-opt-${x.id}`} role="option" aria-selected={i === active} tabIndex={-1}
                class={`${x.id === p?.id ? 'on' : ''} ${i === active ? 'act' : ''}`}
                onPointerMove={() => i !== active && setActive(i)} onClick={() => load(x)}>
                <span class="code">{x.id}</span><span class="t">{x.title}</span><span class="lvl">{x.difficulty || ''}</span>{x.about && <small>{x.about}</small>}
              </button>
            );
          }),
        ])}
        {!flat.length && <p class="note">{host.presets().length ? 'Nothing on the shelf matches.' : 'No presets. They live in content/presets/<id>/ with script.js and meta.json.'}</p>}
      </div>
      <hr />
      <button onClick={() => host.focus('presets')}>
        <span class="t">Every preset on the shelf</span><small>the Presets view: drawings, difficulty, size, print time</small>
      </button>
      <button disabled={!edited} onClick={() => { host.revertAll(); host.compile(); host.toast('Back to the preset as published'); }}>
        <span class="t">Revert all edits</span><small>{p ? `back to ${p.id} as published` : 'nothing to revert'}</small>
      </button>
      <p class="note">Type to filter; ↑ ↓ to move, Enter to load, Esc to close.</p>
    </>
  );
}

const EXPORTS = [
  { format: 'stl', title: 'STL', about: '.stl mesh of every body, for any slicer', text: true },
  { format: '3mf', title: '3MF', about: '.3mf with plates, settings and colours', text: false },
  { format: 'step', title: 'STEP', about: '.step B-rep, lossless (AP242)', text: true },
  { format: 'ir', title: 'IR bundle', about: 'L0–L6 as text in one .json', text: true },
  { format: 'script', title: 'Script', about: 'script.js with your edits', text: true },
];
function ExportMenu({ host }) {
  const [cap, setCap] = useState(undefined);
  const [busy, setBusy] = useState(null);
  useEffect(() => { const t = setTimeout(() => downloads().then(setCap), 0); return () => clearTimeout(t); }, []);
  const run = async (x) => {
    setBusy(x.format);
    try {
      const r = await host.export(x.format);
      const lossy = r.report?.approximated?.length ? ` (approximated: ${r.report.approximated.join(', ')})` : '';
      let data = r.data;
      // without file saving, a binary STL goes to the clipboard as ASCII STL
      if (x.format === 'stl' && typeof data !== 'string' && !(await downloads())) data = stlToASCII(data, host.program?.name);
      await saveOrCopy(host, r.filename, data, lossy);
    } catch (e) {
      host.toast(`Export failed: ${e?.message || e}`, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const noSave = cap === null;
  return (
    <Menu btnClass="btn" menuClass="bexport" right title="Export the part or the program" label={busy ? 'Exporting…' : <>Export <span class="caret">▾</span></>} disabled={!!busy}>
      {EXPORTS.map(x => (
        <button key={x.format} disabled={!host.program || (noSave && !x.text)} onClick={() => run(x)}>
          <span class="t">{noSave && x.text ? `Copy ${x.title}` : x.title}</span><small>{noSave && !x.text ? 'binary: needs file saving, which is not available here' : x.about}</small>
        </button>
      ))}
      <p class="note">{noSave ? 'Saving files is not available here: text formats are copied to the clipboard.' : 'You confirm each file before it is saved.'} Every export reports what it kept, approximated and dropped.</p>
    </Menu>
  );
}

function Toasts({ host }) {
  const [list, setList] = useState([]);
  useEffect(() => host.on('toast', t => {
    const id = Math.random();
    setList(l => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setList(l => l.filter(x => x.id !== id)), t.bad ? 5200 : 2600);
  }), []);
  return <div class="toasts" aria-live="polite">{list.map(t => <div key={t.id} class={`toast ${t.bad ? 'bad' : ''}`}>{t.text}</div>)}</div>;
}
