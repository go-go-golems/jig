// The sketch inspector, beside a sketch on the stage: the sketch (plane, status, counts), the selected entity (its
// kind, solved geometry, free parameters and the constraints on it), Problems, Still free, and every constraint
// grouped by where it comes from: Yours (.constrain and .dim), From helpers (rect, slot, fillet…), Implied (shared
// points and the shape helpers keep; collapsed). A row says the kind, what it applies to in the code face, the value
// with its unit and expression, a chip when it is redundant or conflicts, and its line as a link that opens the
// Code view there. Rows preview on the sheet while the pointer is over them and select on click (the selected row
// has the 2 px accent bar); a mark picked on the sheet scrolls its row into view.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useHost } from '../common.jsx';
import { squareView, isSketchPick } from '../../host/host.js';
import { qty, num, vec, plural, DASH } from '../format.js';

const GROUPS = [
  { key: 'user', title: 'Yours', about: '.constrain() and .dim()' },
  { key: 'helper', title: 'From helpers', about: 'sizes and places helpers add' },
  { key: 'implicit', title: 'Implied', about: 'shared points, helper shapes, copies' },
];
const LITERAL = /^[-+]?[\d.]+\s*(mm|cm|m|in|inch|deg|°)?$/;
const exprOf = c => (c.expr && !LITERAL.test(String(c.expr).trim()) ? String(c.expr) : null);
const lineLink = line => `lab:open?file=script.js&line=${line}`;
const kindText = c => (c.kind === 'coord' && c.axis ? `coord ${c.axis}` : c.kind);

/** A constraint's value as the inspector writes it: '80 mm', 'Ø4.5 mm', '30°'; null when it has none. */
export function consValue(c) {
  if (c.value == null) return null;
  const v = c.unit === 'deg' || c.kind === 'angle' ? qty(c.value, 'deg') : qty(c.value, 'mm', 3);
  return (c.kind === 'diameter' ? 'Ø' : c.kind === 'radius' ? 'R' : '') + v;
}
/** 'horizontal l1', 'distanceX 12 mm = edge', 'line l1 · 80 mm': the words the sheet writes beside a selection. */
export function pickLabel(sk, sel) {
  if (!sk || !sel) return '';
  if (sel.constraint != null) {
    const c = (sk.constraints || []).find(k => k.id === sel.constraint); if (!c) return sel.constraint;
    const x = exprOf(c);
    return c.value != null ? `${kindText(c)} ${consValue(c).replace(/^[ØR]/, '')}${x ? ` = ${x}` : ''}` : `${kindText(c)} ${refsText(c.refs)}`;
  }
  const e = (sk.entities || []).find(k => k.id === sel.entity); if (!e) return sel.entity;
  return `${e.kind} ${e.id}${e.kind === 'line' && e.a && e.b ? ` · ${qty(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 'mm', 3)}` : e.kind === 'circle' ? ` · Ø${qty(2 * e.r, 'mm', 3)}` : e.kind === 'arc' ? ` · R${qty(e.r, 'mm', 3)}` : ''}`;
}
const refsText = refs => (refs || []).map(r => (Array.isArray(r) ? `(${r.map(v => num(v, 3)).join(', ')})` : r)).join(', ');
// the entity a ref names: the longest entity id it starts with (`outline.bl.center` → `outline.bl`)
function ownerOf(ids, ref) {
  if (typeof ref !== 'string') return null;
  if (ids.has(ref)) return ref;
  const h = ref.indexOf('#'); if (h > 0 && ids.has(ref.slice(0, h))) return ref.slice(0, h);
  const i = ref.lastIndexOf('.'); return i > 0 && ids.has(ref.slice(0, i)) ? ref.slice(0, i) : null;
}

export function SketchInspector({ host, sketch, program, mode, status }) {
  useHost(host, ['hover']);
  const aside = useRef(null);
  const cons = sketch.constraints || [], ents = sketch.entities || [];
  const sel = isSketchPick(host.selection) && host.selection.sketch === sketch.id ? host.selection : null;
  const hov = isSketchPick(host.hover) && host.hover.sketch === sketch.id ? host.hover : null;
  const selC = sel?.constraint != null ? cons.find(c => c.id === sel.constraint) : null;
  const selE = sel?.entity != null ? ents.find(e => e.id === sel.entity) : null;
  const [open, setOpen] = useState({ user: true, helper: true, implicit: false });
  const groupOf = c => (c.src === 'user' || c.src === 'helper' ? c.src : 'implicit');
  const bad = cons.filter(c => c.status && c.status !== 'ok');
  const free = ents.filter(e => (e.dofFree || []).length);
  const kinds = {};
  for (const e of ents) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  const pl = sketch.plane || {};

  // a selection in a closed group opens it; a selection made on the sheet scrolls its row (or the entity) into view
  const selKey = sel ? `${sel.constraint ?? ''}|${sel.entity ?? ''}` : '';
  useEffect(() => { if (selC && !open[groupOf(selC)]) setOpen(o => ({ ...o, [groupOf(selC)]: true })); }, [selKey]);
  useEffect(() => {
    if (!sel || !aside.current) return;
    const el = aside.current.querySelector(sel.constraint != null ? '.cgroups .crow.sel' : '.entblock');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [selKey, open.user, open.helper, open.implicit]);
  // Escape lets the pick go (not while typing)
  useEffect(() => {
    const key = e => { if (e.key === 'Escape' && isSketchPick(host.selection) && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) host.select(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [host]);

  const row = (c, extra) => <ConsRow key={c.id + (extra || '')} host={host} sk={sketch} c={c} on={selC?.id === c.id} hov={hov?.constraint === c.id} />;
  return (
    <aside class="side sketchside" aria-label="Sketch inspector" ref={aside}>
      <div class="block">
        <header><h2>Sketch {sketch.id}</h2><span class="sub">{status}</span></header>
        <dl class="kv">
          <dt>entities</dt><dd>{Object.entries(kinds).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).join(' · ') || DASH}</dd>
          <dt>constraints</dt><dd>{cons.length}{bad.length ? ` · ${bad.length} not ok` : ''}</dd>
          <dt>profiles</dt><dd>{(sketch.profiles || []).length}{(sketch.profiles || []).length ? ` · ${(sketch.profiles || []).map(f => qty(f.area, 'mm²')).join(', ')}` : ''}</dd>
          {pl.origin && <><dt>plane origin</dt><dd>{vec(pl.origin, 1)} mm</dd></>}
          {pl.normal && <><dt>plane normal</dt><dd>{vec(pl.normal, 2)}</dd></>}
        </dl>
        <div class="actions-row">
          <button class="link strong" onClick={() => host.link(`lab:open?file=script.js&find=${encodeURIComponent(`'${sketch.id}'`)}`)}>find in code</button>
          {program?.graph?.nodes?.some(n => n.id === sketch.id) && <button class="link" onClick={() => { host.selectNode(sketch.id); host.focus('graph'); }}>in the graph</button>}
          <button class="link" onClick={() => host.setView({ name: 'axo', ...squareView(), sketch: null })}>back to the part</button>
        </div>
      </div>
      {selE && <EntityBlock host={host} sk={sketch} e={selE} row={row} />}
      {bad.length > 0 && (
        <div class="block">
          <header><h2>Problems</h2><span class="sub">{bad.length}</span></header>
          <div class="crows" role="listbox" aria-label="Constraints with problems">{bad.map(c => row(c, ':bad'))}</div>
          {(sketch.conflicts || []).length > 0 && <p class="note">Minimal conflicting set: {sketch.conflicts.map(set => set.join(' + ')).join('; ')}. Remove or change one of them.</p>}
        </div>
      )}
      {free.length > 0 && (
        <div class="block">
          <header><h2>Still free</h2><span class="sub">{sketch.dof} DOF</span></header>
          <p class="note">Drag these on the sheet, or add a constraint or a dimension to fix them.</p>
          <dl class="kv">{free.map(e => [
            <dt key={e.id}><button class={`nid${selE?.id === e.id ? ' on' : ''}`} onClick={() => host.select({ sketch: sketch.id, entity: e.id })}
              onMouseEnter={() => host.setHover({ sketch: sketch.id, entity: e.id })} onMouseLeave={() => host.setHover(null)}>{e.id}</button></dt>,
            <dd key={e.id + 'v'}>{e.dofFree.join(' · ')}</dd>])}</dl>
        </div>
      )}
      <div class="block cgroups">
        <header><h2>Constraints</h2><span class="sub">{cons.length ? `${cons.length} · click one to see it on the sheet` : 'none'}</span></header>
        {cons.length ? GROUPS.map(g => {
          const list = cons.filter(c => groupOf(c) === g.key);
          if (!list.length) return null;
          const isOpen = open[g.key];
          return (
            <div class="cgroup" key={g.key}>
              <button class="cghead" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}
                title={isOpen ? `Fold ${g.title.toLowerCase()}` : `Show ${g.title.toLowerCase()}`}>
                <span class="tw">{isOpen ? '▾' : '▸'}</span><b>{g.title}</b><span class="n">{list.length}</span><span class="about">{g.about}</span>
              </button>
              {isOpen && <div class="crows" role="listbox" aria-label={g.title}>{list.map(c => row(c))}</div>}
            </div>
          );
        }) : <p class="empty">{mode === 'explicit' ? 'None: the coordinates in the code are fixed as written. Add a constraint or a dimension to solve the sketch instead.' : 'None.'}</p>}
      </div>
    </aside>
  );
}

/** One constraint: kind and value on top; what it applies to and its line in script.js under them. */
function ConsRow({ host, sk, c, on, hov }) {
  const pick = { sketch: sk.id, constraint: c.id };
  const val = consValue(c), x = exprOf(c);
  const go = () => host.select(on ? null : pick);
  return (
    <div class={`crow${on ? ' sel' : ''}${hov ? ' hov' : ''}`} role="option" aria-selected={on} tabIndex={0} data-id={c.id}
      title={c.text || c.id}
      onMouseEnter={() => host.setHover(pick)} onMouseLeave={() => host.setHover(null)} onClick={go}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
      <span class="ck">{kindText(c)}{c.driven ? <span class="dim"> driven</span> : null}
        {c.status === 'conflict' && <span class="chip bad">conflict</span>}
        {c.status === 'redundant' && <span class="chip">redundant</span>}
      </span>
      <span class="cv">{val ? <>{c.driven ? `(${val})` : val}{x ? <span class="cx"> · {x}</span> : null}</> : null}</span>
      <code class="con">{(c.refs || []).map((r, i) => <span key={i}>{i ? ' · ' : ''}{Array.isArray(r) ? `(${r.map(v => num(v, 3)).join(', ')})` : r}</span>)}
        {c.status === 'redundant' && c.impliedBy?.length ? <span class="impl"> implied by {c.impliedBy.join(' + ')}</span> : null}</code>
      {c.line ? <button class="link cln" title={`Open script.js at line ${c.line}`} onClick={e => { e.stopPropagation(); host.link(lineLink(c.line)); }}>script.js:{c.line}</button> : <span />}
    </div>
  );
}

/** The selected entity: kind, solved geometry, what is still free, and the constraints that touch it. */
function EntityBlock({ host, sk, e, row }) {
  const ids = new Set((sk.entities || []).map(x => x.id));
  const on = (sk.constraints || []).filter(c => (c.refs || []).some(r => ownerOf(ids, r) === e.id));
  const mm = (v, d = 3) => qty(v, 'mm', d), deg = r => qty(r, 'rad');
  let rows = [];
  if (e.kind === 'point') rows = [['x · y', `${vec(e.p, 3)} mm`]];
  else if (e.kind === 'line') {
    const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    rows = [['start x · y', `${vec(e.a, 3)} mm`], ['end x · y', `${vec(e.b, 3)} mm`], ['length', mm(Math.hypot(d[0], d[1]))], ['angle', deg(Math.atan2(d[1], d[0]))]];
  } else if (e.kind === 'circle') rows = [['centre x · y', `${vec(e.c, 3)} mm`], ['diameter', mm(2 * e.r)], ['radius', mm(e.r)]];
  else if (e.kind === 'arc') rows = [['centre x · y', `${vec(e.c, 3)} mm`], ['radius', mm(e.r)], ['start · end', `${num(e.a0 * 180 / Math.PI, 1)}° · ${num(e.a1 * 180 / Math.PI, 1)}°`], ['sweep', deg(e.a1 - e.a0)]];
  else rows = [['points', String((e.ctrl || e.pts || []).length)]];
  const freeText = (e.dofFree || []).length ? e.dofFree.join(' · ') : 'none';
  return (
    <div class="block entblock">
      <header><h2>{e.id}</h2><span class="sub">{[e.shape || e.kind, e.construction ? 'construction' : null, e.external ? 'external' : null, plural(e.dof ?? (e.dofFree || []).length, 'DOF', 'DOF') + ' free'].filter(Boolean).join(' · ')}</span></header>
      <dl class="kv">
        {rows.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{v}</dd>])}
        <dt>free</dt><dd class={(e.dofFree || []).length ? '' : 'dim'}>{freeText}</dd>
      </dl>
      <p class="note">{on.length ? `${plural(on.length, 'constraint')} on ${e.id}:` : `No constraint names ${e.id}.`}</p>
      {on.length > 0 && <div class="crows" role="listbox" aria-label={`Constraints on ${e.id}`}>{on.map(c => row(c, ':ent'))}</div>}
      <div class="actions-row">
        {e.line ? <button class="link strong" onClick={() => host.link(lineLink(e.line))}>script.js:{e.line}</button> : null}
        <button class="link" onClick={() => host.select(null)}>clear</button>
      </div>
    </div>
  );
}
