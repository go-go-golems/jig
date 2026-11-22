// dock.jsx — tiles of tabbed views, split by draggable gutters. Drag a tab onto another tile's tabs to move it,
// onto a tile's edge to split it, or into its middle to join it. The layout is a small tree kept per viewer.
const { useState, useEffect, useRef, useCallback } = React;
import { useOutside } from './common.jsx';

const nid = p => p + Math.random().toString(36).slice(2, 8);
export const tile = (views, active) => ({ t: 'tile', id: nid('t'), views: [...views], active: active ?? views[0] ?? null });
export const split = (dir, kids, sizes) => ({ t: 'split', id: nid('s'), dir, kids, sizes: sizes || kids.map(() => 1 / kids.length) });
const clone = x => JSON.parse(JSON.stringify(x));
function walk(n, fn, parent = null) { if (!n) return; fn(n, parent); if (n.t === 'split') for (const k of n.kids) walk(k, fn, n); }
export function tilesOf(n) { const out = []; walk(n, x => { if (x.t === 'tile') out.push(x); }); return out; }
const findNode = (n, id) => { let r = null; walk(n, x => { if (x.id === id) r = x; }); return r; };
export const tileOf = (n, view) => tilesOf(n).find(t => t.views.includes(view)) || null;
export const openViews = n => tilesOf(n).flatMap(t => t.views);

// clean up: drop unknown and duplicate views, empty tiles, single-child splits; merge splits in the same direction
export function normalize(n, known) {
  const seen = new Set();
  const fix = x => {
    if (!x || typeof x !== 'object') return null;
    if (x.t === 'tile') {
      if (x.dead) return null;
      const views = (x.views || []).filter(v => known.includes(v) && !seen.has(v) && seen.add(v));
      return { t: 'tile', id: x.id || nid('t'), views, active: views.includes(x.active) ? x.active : views[0] ?? null };
    }
    if (x.t === 'split') {
      const dir = x.dir === 'col' ? 'col' : 'row', kids = [], sizes = [];
      (x.kids || []).forEach((k, i) => {
        const f = fix(k); if (!f) return;
        const sz = Number(x.sizes && x.sizes[i]) > 0 ? Number(x.sizes[i]) : 1 / (x.kids.length || 1);
        if (f.t === 'tile' && !f.views.length && x.kids.length > 1) return;
        if (f.t === 'split' && f.dir === dir) f.kids.forEach((kk, j) => { kids.push(kk); sizes.push(sz * f.sizes[j]); });
        else { kids.push(f); sizes.push(sz); }
      });
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      const tot = sizes.reduce((a, b) => a + b, 0) || 1;
      return { t: 'split', id: x.id || nid('s'), dir, kids, sizes: sizes.map(s => s / tot) };
    }
    return null;
  };
  return fix(n) || tile([]);
}
function takeOut(root, view, keepId) {
  const t = tileOf(root, view); if (!t) return;
  const i = t.views.indexOf(view); t.views.splice(i, 1);
  if (t.active === view) t.active = t.views[Math.min(i, t.views.length - 1)] ?? null;
  if (!t.views.length && t.id !== keepId) t.dead = true;
}
export function moveView(layout, view, tileId, index, known) {
  const r = clone(layout), dst = findNode(r, tileId); if (!dst || dst.t !== 'tile') return layout;
  const src = tileOf(r, view);
  if (src && src.id === dst.id) { const i = dst.views.indexOf(view); dst.views.splice(i, 1); const j = index == null ? dst.views.length : index > i ? index - 1 : index; dst.views.splice(Math.max(0, Math.min(j, dst.views.length)), 0, view); }
  else { takeOut(r, view, dst.id); dst.views.splice(index == null ? dst.views.length : Math.max(0, Math.min(index, dst.views.length)), 0, view); }
  dst.active = view;
  return normalize(r, known);
}
export function splitWith(layout, view, tileId, side, known) {
  const r = clone(layout), dst = findNode(r, tileId); if (!dst || dst.t !== 'tile') return layout;
  const src = tileOf(r, view);
  if (src && src.id === dst.id && dst.views.length === 1) return layout;
  takeOut(r, view, null);
  const nt = tile([view]), dir = side === 'left' || side === 'right' ? 'row' : 'col', first = side === 'left' || side === 'top';
  const copy = Object.assign({}, dst);
  const sp = split(dir, first ? [nt, copy] : [copy, nt], [0.5, 0.5]);
  // replace dst in place
  Object.keys(dst).forEach(k => delete dst[k]); Object.assign(dst, sp);
  return normalize(r, known);
}
// a whole tile, dragged by its grip: onto another tile's tabs (merge), its middle (swap) or an edge (split)
export function moveTile(layout, srcId, dstId, zone, known, index) {
  if (srcId === dstId) return layout;
  const r = clone(layout), src = findNode(r, srcId), dst = findNode(r, dstId);
  if (!src || !dst || src.t !== 'tile' || dst.t !== 'tile') return layout;
  if (zone === 'center') { const v = src.views, a = src.active; src.views = dst.views; src.active = dst.active; dst.views = v; dst.active = a; return normalize(r, known); }
  if (zone === 'tabs') { const at = index == null ? dst.views.length : index; dst.views.splice(at, 0, ...src.views); dst.active = src.active; src.dead = true; return normalize(r, known); }
  const nt = tile(src.views, src.active); src.dead = true;
  const dir = zone === 'left' || zone === 'right' ? 'row' : 'col', first = zone === 'left' || zone === 'top';
  const copy = Object.assign({}, dst);
  const sp = split(dir, first ? [nt, copy] : [copy, nt], [0.5, 0.5]);
  Object.keys(dst).forEach(k => delete dst[k]); Object.assign(dst, sp);
  return normalize(r, known);
}
export function closeTile(layout, tileId, known) { const r = clone(layout), t = findNode(r, tileId); if (!t || t.t !== 'tile') return layout; t.dead = true; return normalize(r, known); }
export function splitTile(layout, tileId, dir, known) {
  const r = clone(layout), t = findNode(r, tileId); if (!t || t.t !== 'tile' || t.views.length < 2) return layout;
  const v = t.active; const rest = tile(t.views.filter(x => x !== v)); const mine = tile([v]);
  Object.keys(t).forEach(k => delete t[k]); Object.assign(t, split(dir, [rest, mine], [0.5, 0.5]));
  return normalize(r, known);
}
export function closeView(layout, view, known) { const r = clone(layout); takeOut(r, view, null); return normalize(r, known); }
export function activate(layout, tileId, view) { const r = clone(layout), t = findNode(r, tileId); if (t) t.active = view; return r; }
export function addView(layout, view, known, nearViews = []) {
  const r = clone(layout), ts = tilesOf(r);
  if (!ts.length) return tile([view]);
  let t = ts.find(x => x.views.some(v => nearViews.includes(v))) || ts.reduce((a, b) => (b.views.length > a.views.length ? b : a), ts[0]);
  t.views.push(view); t.active = view; return normalize(r, known);
}

// ---------- the component ----------
export function Dock({ layout, setLayout, views, known, render, max, setMax }) {
  const [drag, setDrag] = useState(null);        // { view | tile, x, y, target }
  const byId = Object.fromEntries(views.map(v => [v.id, v]));
  const tiles = tilesOf(layout);
  const maxed = max && tiles.some(t => t.id === max) ? max : null;
  const startDrag = (e, view, tileId, whole) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY; let moved = false;
    const label = whole ? (tiles.find(t => t.id === tileId) || { views: [] }).views.map(v => (byId[v] || {}).title || v).join(' · ') : (byId[view] || {}).title || view;
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!moved) { moved = true; document.body.classList.add('dragging-view'); }
      setDrag({ view, whole, label, x: ev.clientX, y: ev.clientY, target: dropTarget(ev.clientX, ev.clientY, view, tileId, whole) });
    };
    const up = ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging-view');
      if (!moved) { if (!whole) setLayout(activate(layout, tileId, view)); return; }
      const t = dropTarget(ev.clientX, ev.clientY, view, tileId, whole); setDrag(null);
      if (!t) return;
      if (whole) setLayout(moveTile(layout, tileId, t.tile, t.zone, known, t.index));
      else if (t.zone === 'tabs' || t.zone === 'center') setLayout(moveView(layout, view, t.tile, t.index, known));
      else setLayout(splitWith(layout, view, t.tile, t.zone, known));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  return <div className={'dock' + (maxed ? ' has-max' : '')}>
    <DNode node={layout} layout={layout} setLayout={setLayout} byId={byId} known={known} render={render} startDrag={startDrag} maxed={maxed} setMax={setMax} single={tiles.length === 1} />
    {drag && drag.target && <div className={'drop-hint' + (drag.target.marker ? ' marker' : '')} style={drag.target.rect}>{!drag.target.marker && <span>{drag.target.label}</span>}</div>}
    {drag && <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 10 }}>{drag.whole ? <span className="grip-g">⠿</span> : null}{drag.label} <small>{drag.target ? drag.target.label : 'drop on a tile'}</small></div>}
  </div>;
}
function dropTarget(x, y, view, fromTile, whole) {
  const el = document.elementFromPoint(x, y); if (!el) return null;
  const tileEl = el.closest('[data-tile]'); if (!tileEl) return null;
  const tileId = tileEl.getAttribute('data-tile');
  const tabs = el.closest('.dtabs') || (el.closest('.dstrip') ? tileEl.querySelector('.dtabs') : null);
  if (tabs) {
    const items = [...tabs.querySelectorAll('.dtab')]; let index = items.length, rx = null;
    for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { index = i; rx = r.left; break; } }
    const tr = tabs.getBoundingClientRect(); if (rx == null) { const last = items[items.length - 1]; rx = last ? last.getBoundingClientRect().right : tr.left + 4; }
    if (whole && tileId === fromTile) return null;
    return { tile: tileId, zone: 'tabs', index, marker: true, rect: { left: rx - 1, top: tr.top + 6, width: 2, height: tr.height - 12 }, label: whole ? 'merge tabs here' : 'move here' };
  }
  const body = tileEl.querySelector('.tilebody') || tileEl, r = body.getBoundingClientRect();
  const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  let zone = 'center';
  const d = Math.min(fx, 1 - fx, fy, 1 - fy);
  if (d < 0.22) zone = d === fx ? 'left' : d === 1 - fx ? 'right' : d === fy ? 'top' : 'bottom';
  if (tileId === fromTile && (zone === 'center' || whole)) return null;
  const rect = zone === 'center' ? { left: r.left, top: r.top, width: r.width, height: r.height }
    : zone === 'left' ? { left: r.left, top: r.top, width: r.width / 2, height: r.height } : zone === 'right' ? { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height }
      : zone === 'top' ? { left: r.left, top: r.top, width: r.width, height: r.height / 2 } : { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 };
  return { tile: tileId, zone, rect, label: zone === 'center' ? (whole ? 'swap tiles' : 'add as a tab') : (whole ? 'dock ' : 'split ') + zone };
}
function DNode(props) {
  return props.node.t === 'tile' ? <Tile key={props.node.id} t={props.node} {...props} /> : <Split key={props.node.id} {...props} />;
}
function Split({ node, layout, setLayout, byId, known, render, startDrag, maxed, setMax, single }) {
  const ref = useRef(null);
  const onGutter = (e, i) => {
    e.preventDefault();
    const el = ref.current, box = el.getBoundingClientRect(), total = node.dir === 'row' ? box.width : box.height;
    const start = node.dir === 'row' ? e.clientX : e.clientY, s0 = node.sizes.slice();
    document.body.classList.add(node.dir === 'row' ? 'resizing-x' : 'resizing-y');
    const move = ev => {
      const d = ((node.dir === 'row' ? ev.clientX : ev.clientY) - start) / total, pair = s0[i] + s0[i + 1];
      const a = Math.max(0.06, Math.min(pair - 0.06, s0[i] + d));
      const r = clone(layout), n = findNode(r, node.id); n.sizes[i] = a; n.sizes[i + 1] = pair - a; setLayout(r);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing-x', 'resizing-y'); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const out = [];
  node.kids.forEach((k, i) => {
    if (i) out.push(<div key={'g' + i} className={'gutter ' + node.dir} role="separator" tabIndex={0} onPointerDown={e => onGutter(e, i - 1)} />);
    out.push(<div key={k.id} className="dcell" style={{ flex: `${node.sizes[i]} 1 0` }}><DNode node={k} layout={layout} setLayout={setLayout} byId={byId} known={known} render={render} startDrag={startDrag} maxed={maxed} setMax={setMax} single={single} /></div>);
  });
  return <div ref={ref} className={'dsplit ' + node.dir}>{out}</div>;
}
function Tile({ t, layout, setLayout, byId, known, render, startDrag, maxed, setMax, single }) {
  const [pick, setPick] = useState(false), ref = useRef(null);
  useOutside(ref, () => setPick(false), pick);
  const closed = known.filter(v => !openViews(layout).includes(v));
  const isMax = maxed === t.id;
  return <section className={'tile' + (isMax ? ' maxed' : '') + (maxed && !isMax ? ' under' : '')} data-tile={t.id}>
    <div className="dstrip" onDoubleClick={e => { if (e.target === e.currentTarget || e.target.classList.contains('dfill')) setMax(isMax ? null : t.id); }}>
      {!single && <button className="grip" title="Drag the whole tile: onto another tile's tabs to merge, its middle to swap, an edge to dock" aria-label="Move tile" onPointerDown={e => startDrag(e, null, t.id, true)}>⠿</button>}
      <div className="dtabs" role="tablist">
        {t.views.map(v => { const d = byId[v] || { title: v }; const badge = d.badge ? d.badge() : null; return <div key={v} className={'dtab' + (t.active === v ? ' on' : '')}>
          <button className="lbl" role="tab" aria-selected={t.active === v} onPointerDown={e => startDrag(e, v, t.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setLayout(activate(layout, t.id, v)); }} title={d.about ? `${d.title}: ${d.about}. Drag to move or split` : 'Drag to move or split'}>{d.title}{badge != null && badge !== '' && <span className={'count' + (badge.bad ? ' bad' : '')}>{badge.text ?? badge}</span>}</button>
          <button className="x" aria-label={'Close ' + d.title} onClick={() => setLayout(closeView(layout, v, known))}>×</button>
        </div>; })}
      </div>
      <span className="dfill" />
      <div className="tile-acts">
        {t.views.length > 1 && <button className="tabact" title="Split the active view into its own tile" onClick={() => setLayout(splitTile(layout, t.id, 'row', known))}>⫿</button>}
        <button className="tabact" title={isMax ? 'Restore the layout (double-click the strip)' : 'Maximise this tile (double-click the strip)'} onClick={() => setMax(isMax ? null : t.id)}>{isMax ? '⤡' : '⤢'}</button>
        <div className="rel" ref={ref}>
          <button className="tabact plus" title="Open a view in this tile" onClick={() => setPick(!pick)}>+</button>
          {pick && <div className="menu right">
            {closed.length ? closed.map(v => <button key={v} onClick={() => { setPick(false); setLayout(moveView(layout, v, t.id, null, known)); }}><span className="t">{byId[v].title}</span><small>{byId[v].about}</small></button>) : <p className="note">Every view is open. Drag a tab here to move it.</p>}
            {!single && <><hr /><button onClick={() => { setPick(false); if (isMax) setMax(null); setLayout(closeTile(layout, t.id, known)); }}><span className="t bad">Close tile</span><small>its views close too; reopen them from any + menu</small></button></>}
          </div>}
        </div>
      </div>
    </div>
    <div className="tilebody">{t.active ? render(t.active) : <div className="picker"><p className="lead">An empty tile. Open a view:</p><div className="pgrid">{closed.map(v => <button key={v} onClick={() => setLayout(moveView(layout, v, t.id, null, known))}><b>{byId[v].title}</b><small>{byId[v].about}</small></button>)}</div></div>}</div>
  </section>;
}
