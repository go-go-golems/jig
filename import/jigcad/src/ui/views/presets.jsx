// Presets: every preset on the shelf, by group, each a row with a drafting-sheet thumbnail compiled lazily (a what-if
// compile through host.check, keep: false) as it scrolls into view, its id, title, about, difficulty and key metrics.
// Clicking a row opens the preset. The shelf order, filter and thumbnail queue live in ../presets.js.
//
// Your presets (Yours, Scratch) carry Rename and Delete; Delete asks once more in place. The toolbar copies the open
// preset into Yours, or starts a new one.
//
// Kiln rules: rows on bg split by rule lines (no cards), the open preset marked by the 2 px accent bar and a bold
// title, hover fills, numbers tabular. The thumbnail is sized by its box (CSS: 168 × 118 px, 120 × 84 px in a tile
// under 640 px), drawn in axonometric so the shelf reads as one set, and redrawn on resize and on a theme change.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useHost } from '../common.jsx';
import { loadStage } from '../modules.js';
import { shelf, keyMetrics, requestThumb, cancelThumb, thumbState, watchThumb, filesHash } from '../presets.js';

/** The thumbnail state of a preset as published: { status, program, error, ms } or null; follows the queue. */
function useThumb(host, id) {
  const [state, setState] = useState(null);
  useEffect(() => {
    const files = host.presetFiles(id);
    if (!files) return undefined;
    const key = `${id}:${filesHash(files)}`;
    setState(thumbState(key));
    return watchThumb(key, setState);
  }, [id]);
  return state;
}

function Thumb({ host, preset, state }) {
  const ref = useRef(null);
  // ask for the compile while the row is near the viewport; drop the request if it scrolls away before its turn
  useEffect(() => {
    const files = host.presetFiles(preset.id);
    if (!files || !ref.current) return undefined;
    const key = `${preset.id}:${filesHash(files)}`;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) { if (e.isIntersecting) requestThumb(host, preset.id, files); else cancelThumb(key); }
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelThumb(key); };     // a closed view or a hidden tab compiles nothing more
  }, [preset.id]);
  // draw at the box's size, again when the box changes size or the theme changes
  useEffect(() => {
    const box = ref.current, canvas = box?.querySelector('canvas');
    if (!canvas || !state?.program) return undefined;
    let live = true, st = null, w = 0, h = 0, t = 0;
    const draw = () => {
      if (!live || !st) return;
      const r = box.getBoundingClientRect();
      w = Math.round(r.width); h = Math.round(r.height);
      if (w < 8 || h < 8) return;
      try { st.renderSheet(canvas, state.program, { name: thumbView(state.program) }, { thumbnail: true, width: w, height: h }); }
      catch (e) { console.warn('thumbnail failed', preset.id, e.message); }
    };
    loadStage().then(m => { st = m; draw(); });
    const ro = new ResizeObserver(() => { const r = box.getBoundingClientRect(); if (Math.round(r.width) !== w || Math.round(r.height) !== h) draw(); });
    ro.observe(box);
    const off = host.on('theme', () => { clearTimeout(t); t = setTimeout(draw, 30); });
    return () => { live = false; ro.disconnect(); off(); clearTimeout(t); };
  }, [state]);
  const note = !state || state.status === 'queued' ? 'waiting'
    : state.status === 'compiling' ? 'compiling'
    : state.status === 'failed' && !state.program ? 'does not compile' : null;
  return (
    <span class="shelf-thumb" ref={ref} aria-hidden="true">
      <canvas />
      {note && <span class={`shelf-note ${state?.status === 'failed' ? 'bad' : ''}`}>{note}{state?.status === 'compiling' ? <i class="busy-sq" /> : null}</span>}
    </span>
  );
}

// thumbnails are axonometric whatever view the preset opens in, so the shelf reads as one set; a sketch stays flat
const thumbView = program => (program?.kind === 'sketch' && !(program.bodies || []).length ? 'sketch' : 'axo');

function Entry({ host, preset, open }) {
  const state = useThumb(host, preset.id);
  const m = state?.program ? keyMetrics(state.program) : null;
  const facts = [preset.difficulty, m?.size, m?.time, m?.filament].filter(x => x && x !== '—');
  const err = state?.status === 'failed' ? (state.error?.message || 'no message') : null;
  const mine = host.isMine?.(preset.id);
  const [mode, setMode] = useState(null);           // null, 'rename' or 'delete' (a second click confirms)
  const [draft, setDraft] = useState('');
  const input = useRef(null);
  useEffect(() => { if (mode === 'rename' && input.current) { input.current.focus(); input.current.select(); } }, [mode]);
  const save = () => {
    try { if (draft.trim() && draft.trim() !== preset.title) host.renamePreset(preset.id, draft); setMode(null); }
    catch (e) { host.toast?.(e.message, 'bad'); }
  };
  return (
    <div class={`shelf-cell ${mine ? 'mine' : ''}`}>
      <button class={`shelf-entry ${open ? 'sel' : ''}`} aria-current={open ? 'true' : undefined} onClick={() => !open && mode !== 'rename' && host.loadPreset(preset.id)}
        title={open ? `${preset.id} ${preset.title} is open` : `Open ${preset.id} ${preset.title}`}>
        <Thumb host={host} preset={preset} state={state} />
        <span class="shelf-text">
          <span class="shelf-title"><span class="pcode">{preset.id}</span> {mode === 'rename' ? null : <b>{preset.title}</b>}</span>
          {preset.about && <span class="shelf-about">{preset.about}</span>}
          {facts.length > 0 && <span class="shelf-facts">{facts.join(' · ')}</span>}
          {err && <span class="shelf-err">does not compile: {err}</span>}
        </span>
      </button>
      {mode === 'rename' && (
        <input class="shelf-rename" value={draft} aria-label={`New title for ${preset.id}`} ref={input}
          onInput={e => setDraft(e.currentTarget.value)} onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') setMode(null); }} />
      )}
      {mine && mode !== 'rename' && (
        <span class="shelf-acts">
          {mode === 'delete'
            ? <><button class="link bad" onClick={() => host.deletePreset(preset.id).catch(e => host.toast?.(e.message, 'bad'))}>Delete {preset.id}</button>
                <button class="link" onClick={() => setMode(null)}>Keep</button></>
            : <><button class="link" title="Rename this preset" onClick={() => { setDraft(preset.title); setMode('rename'); }}>Rename</button>
                <button class="link" title="Delete this preset from this browser" onClick={() => setMode('delete')}>Delete</button></>}
        </span>
      )}
    </div>
  );
}

export function PresetsView({ host }) {
  useHost(host, ['preset', 'presets']);
  const [q, setQ] = useState('');
  const all = host.presets();
  const groups = shelf(all, q);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div class="tabbody col shelfview">
      <div class="toolbar">
        <input class="filter" placeholder="search the shelf" aria-label="Filter presets" value={q}
          title="Filter by id, title, about, group or difficulty; Enter opens the first match, Esc clears"
          onInput={e => setQ(e.currentTarget.value)} onKeyDown={e => {
            if (e.key === 'Escape') setQ('');
            else if (e.key === 'Enter' && q.trim()) { const first = groups[0]?.items[0]; if (first && first.id !== host.preset?.id) host.loadPreset(first.id); }
          }} />
        {host.createPreset && <>
          <button class="btn sm" disabled={!host.preset} title={host.preset ? `Copy ${host.preset.id} ${host.preset.title}, with your edits, into Yours` : 'Open a preset first'}
            onClick={() => host.createPreset({ from: host.preset.id }).catch(e => host.toast?.(e.message, 'bad'))}>Copy to Yours</button>
          <button class="btn sm" title="Start a new preset of yours from a plain part"
            onClick={() => host.createPreset({}).then(() => host.focus?.('code')).catch(e => host.toast?.(e.message, 'bad'))}>New</button>
        </>}
        <span class="lbl">{count === all.length ? `${all.length} presets` : `${count} of ${all.length} presets`}, by group. Click one to open it; each sheet compiles as it scrolls into view.</span>
      </div>
      <div class="scroll pshelf">
        {!count && <p class="empty padded">{all.length ? 'Nothing on the shelf matches. Clear the filter to see every preset.' : 'No presets. They live in content/presets/<id>/ with script.js and meta.json.'}</p>}
        {groups.map(g => (
          <section class="shelf-group" key={g.title} aria-label={g.title}>
            <h3 class="shelf-head"><span>{g.title}</span><span class="n">{g.items.length}</span></h3>
            <div class="shelf-grid">
              {g.items.map(p => <Entry key={p.id} host={host} preset={p} open={host.preset?.id === p.id} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
