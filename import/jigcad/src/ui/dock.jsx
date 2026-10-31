// The dock (DockTile, DragFeedback, TilePicker): tiles of tabbed views in nested splits. Tabs drag onto a strip
// (move), a tile's edge (split) or its middle (add as a tab); gutters drag to resize; × closes; + opens a closed view.
import { useEffect, useRef, useState } from 'preact/hooks';
import { VIEWS, VIEW, openViews, findTile, tileOf, findNode, replaceNode, moveView, normalise, clone } from './layouts.js';

const EDGE = 0.22, MIN = 0.06;

export function Dock({ tree, setTree, renderView, badge }) {
  const [drag, setDrag] = useState(null);       // { view, x, y, hint, label }
  const dragRef = useRef(null);
  const open = openViews(tree);
  const closed = VIEWS.filter(v => !open.includes(v.id));

  const activate = (tileId, view) => setTree(replaceNode(tree, tileId, t => ({ ...t, active: view })));
  const close = (tileId, view) => {
    const t = clone(tree), tl = findTile(t, tileId);
    const at = tl.views.indexOf(view);
    tl.views.splice(at, 1);
    if (tl.active === view) tl.active = tl.views[Math.max(0, at - 1)] ?? null;
    if (!tl.views.length) tl.keep = true;
    setTree(normalise(t, true));
  };
  const openIn = (tileId, view) => setTree(moveView(tree, view, { tile: tileId, zone: 'center' }));

  // ---------- dragging a tab ----------
  const hitTest = (x, y, view) => {
    const el = document.elementFromPoint(x, y);
    const strip = el?.closest?.('.dstrip');
    if (strip) {
      const tileId = strip.dataset.tile;
      const tabs = [...strip.querySelectorAll('.dtab')];
      let index = tabs.length, mx = tabs.length ? tabs[tabs.length - 1].getBoundingClientRect().right : strip.getBoundingClientRect().left + 4;
      for (let i = 0; i < tabs.length; i++) { const r = tabs[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { index = i; mx = r.left; break; } }
      const sr = strip.getBoundingClientRect();
      return { target: { tile: tileId, zone: 'center', index }, hint: { left: mx - 1, top: sr.top + 6, width: 2, height: sr.height - 12, marker: true }, label: 'move here' };
    }
    const tileEl = el?.closest?.('.tile');
    if (!tileEl) return { target: null, hint: null, label: 'drop on a tile' };
    const r = tileEl.getBoundingClientRect(), fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
    const zone = Object.entries(d).filter(([, v]) => v < EDGE).sort((a, b) => a[1] - b[1])[0]?.[0] || 'center';
    const tileId = tileEl.dataset.tile;
    const src = tileOf(tree, view);
    if (zone !== 'center' && src?.id === tileId && src.views.length === 1) return { target: null, hint: null, label: 'drop on another tile' };
    const hint = zone === 'center' ? { left: r.left, top: r.top, width: r.width, height: r.height }
      : zone === 'left' ? { left: r.left, top: r.top, width: r.width / 2, height: r.height }
      : zone === 'right' ? { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height }
      : zone === 'top' ? { left: r.left, top: r.top, width: r.width, height: r.height / 2 }
      : { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 };
    return { target: { tile: tileId, zone }, hint, label: zone === 'center' ? 'add as a tab' : `split ${zone}` };
  };
  const startTab = (e, tileId, view) => {
    if (e.button !== 0) return;
    const s = { view, tileId, x0: e.clientX, y0: e.clientY, started: false };
    dragRef.current = s;
    const move = ev => {
      const st = dragRef.current;
      if (!st) return;
      if (!st.started && Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0) < 5) return;
      st.started = true;
      document.body.classList.add('dragging-view');
      const h = hitTest(ev.clientX, ev.clientY, view);
      st.target = h.target;
      setDrag({ view, x: ev.clientX, y: ev.clientY, hint: h.hint, label: h.label });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const st = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove('dragging-view');
      setDrag(null);
      if (!st) return;
      if (!st.started) activate(tileId, view);
      else if (st.target) setTree(moveView(tree, view, st.target));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // ---------- gutters ----------
  const startGutter = (e, splitId, i) => {
    const node = findNode(tree, splitId);
    const box = e.currentTarget.parentElement.getBoundingClientRect();
    const row = node.dir === 'row', size = row ? box.width : box.height, p0 = row ? e.clientX : e.clientY;
    const s0 = [...node.sizes];
    document.body.classList.add(row ? 'resizing-x' : 'resizing-y');
    e.currentTarget.setPointerCapture?.(e.pointerId);
    let latest = tree;
    const move = ev => {
      const d = ((row ? ev.clientX : ev.clientY) - p0) / size;
      const a = Math.max(MIN, Math.min(s0[i] + s0[i + 1] - MIN, s0[i] + d));
      const sizes = [...s0];
      sizes[i] = a; sizes[i + 1] = s0[i] + s0[i + 1] - a;
      latest = replaceNode(tree, splitId, n => ({ ...n, sizes }));
      setTree(latest, { transient: true });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-x', 'resizing-y');
      setTree(latest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const keyGutter = (e, splitId, i) => {
    const node = findNode(tree, splitId);
    const back = node.dir === 'row' ? 'ArrowLeft' : 'ArrowUp', fwd = node.dir === 'row' ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== back && e.key !== fwd) return;
    e.preventDefault();
    const s = [...node.sizes], d = e.key === fwd ? 0.02 : -0.02;
    const a = Math.max(MIN, Math.min(s[i] + s[i + 1] - MIN, s[i] + d));
    s[i + 1] = s[i] + s[i + 1] - a; s[i] = a;
    setTree(replaceNode(tree, splitId, n => ({ ...n, sizes: s })));
  };

  const renderNode = node => {
    if (node.t === 'tile') return renderTile(node);
    const out = [];
    node.kids.forEach((k, i) => {
      if (i) out.push(<div key={'g' + i} class={`gutter ${node.dir}`} role="separator" tabindex="0" aria-orientation={node.dir === 'row' ? 'vertical' : 'horizontal'}
        title="Drag to resize" onPointerDown={e => startGutter(e, node.id, i - 1)} onKeyDown={e => keyGutter(e, node.id, i - 1)} />);
      out.push(<div key={k.id} class="dcell" style={{ flex: `${node.sizes[i]} 1 0` }}>{renderNode(k)}</div>);
    });
    return <div class={`dsplit ${node.dir}`}>{out}</div>;
  };

  const renderTile = tile => (
    <section key={tile.id} class="tile" data-tile={tile.id}>
      <div class="dstrip" data-tile={tile.id}>
        <div class="dtabs" role="tablist">
          {tile.views.map(v => {
            const b = badge?.(v);
            return (
              <div key={v} class={`dtab ${tile.active === v ? 'on' : ''}`} data-view={v}>
                <button class="lbl" role="tab" aria-selected={tile.active === v} title={VIEW[v].about}
                  onPointerDown={e => startTab(e, tile.id, v)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') activate(tile.id, v); }}>
                  {VIEW[v].title}{b != null && b.n != null && <span class={`count ${b.bad ? 'bad' : ''}`}>{b.n}</span>}
                </button>
                <button class="x" aria-label={`Close ${VIEW[v].title}`} title={`Close ${VIEW[v].title} (it stays in the + menu)`} onClick={() => close(tile.id, v)}>×</button>
              </div>
            );
          })}
        </div>
        <PlusMenu closed={closed} onPick={v => openIn(tile.id, v)} />
      </div>
      <div class="tilebody">
        {tile.active ? renderView(tile.active) : <Picker closed={closed} onPick={v => openIn(tile.id, v)} />}
      </div>
    </section>
  );

  return (
    <div class="dock">
      {renderNode(tree)}
      {drag?.hint && <div class={`drop-hint ${drag.hint.marker ? 'marker' : ''}`} style={{ left: drag.hint.left + 'px', top: drag.hint.top + 'px', width: drag.hint.width + 'px', height: drag.hint.height + 'px' }}>
        {!drag.hint.marker && <span>{drag.label}</span>}
      </div>}
      {drag && <div class="drag-ghost" style={{ left: Math.min(drag.x + 12, innerWidth - 190) + 'px', top: Math.min(drag.y + 10, innerHeight - 30) + 'px' }}>{VIEW[drag.view].title} <small>{drag.label}</small></div>}
    </div>
  );
}

function PlusMenu({ closed, onPick }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!pos) return;
    const down = e => { if (!e.target.closest('.menu.floating') && e.target !== ref.current) setPos(null); };
    const key = e => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
  }, [pos]);
  const toggle = () => {
    if (pos) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(r.left, innerWidth - 268)), top: r.bottom + 6 });
  };
  return (
    <div class="rel">
      <button ref={ref} class="tabact plus" title="Open a view in this tile" aria-label="Open a view in this tile" aria-expanded={!!pos} onClick={toggle}>+</button>
      {pos && <div class="menu floating" role="menu" style={{ left: pos.left + 'px', top: pos.top + 'px' }}>
        {closed.length ? closed.map(v => <button key={v.id} onClick={() => { setPos(null); onPick(v.id); }}><span class="t">{v.title}</span><small>{v.about}</small></button>)
          : <p class="note">Every view is open. Drag a tab here to move it.</p>}
      </div>}
    </div>
  );
}

function Picker({ closed, onPick }) {
  return (
    <div class="picker">
      <p class="lead">{closed.length ? 'An empty tile. Open a view:' : 'An empty tile. Every view is open: drag a tab here to move it.'}</p>
      <div class="pgrid">
        {closed.map(v => <button key={v.id} onClick={() => onPick(v.id)}><b>{v.title}</b><small>{v.about}</small></button>)}
      </div>
    </div>
  );
}
