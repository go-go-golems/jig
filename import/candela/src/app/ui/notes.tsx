// notes.jsx — the preset's notes, the docs (the API's design and the physics under it), and the reference.
// Markdown with KaTeX; lab: links open files, set params, switch views and load presets.
import React from 'react';
import type { Host } from '../host';
const { useState, useEffect, useRef, useMemo } = React;
import { useHost, useFocus, Tog } from './common';
import { render } from '../markdown';
import { highlight } from '../highlight';

const cache = new Map();
function rendered(md, prefix) {
  const k = prefix + '\u0001' + md; if (cache.has(k)) return cache.get(k);
  const r = render(md, { highlight, idPrefix: prefix, trusted: prefix === 'd-' || prefix === 'r-' }); if (cache.size > 80) cache.clear(); cache.set(k, r); return r;
}
export function Doc({ host, md, prefix = '', scrollRef }) {
  const r = rendered(md, prefix);
  const onClick = e => {
    const a = e.target.closest('a'); if (!a) return;
    if (a.dataset.lab) { e.preventDefault(); host.link(a.dataset.lab); return; }
    if (a.dataset.anchor) { e.preventDefault(); const el = (scrollRef && scrollRef.current || document).querySelector('#' + CSS.escape(a.dataset.anchor)); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  };
  return <article className="doc" onClick={onClick} dangerouslySetInnerHTML={{ __html: r.html }} />;
}

export function NotesView({ host }: { host: Host }) {
  useHost(host, 2);
  const [edit, setEdit] = useState(false), sc = useRef<any>(null);
  const p = host.preset;
  useEffect(() => { if (sc.current) sc.current.scrollTop = 0; }, [p && p.id]);
  if (!p) return null;
  return <div className="tabbody col notes">
    <div className="toolbar">
      <span className="ntitle"><span className="pcode">{p.id}</span> <b>{p.title}</b> <span className="pcode">· {p.group}</span></span>
      <span className="sp" />
      {host.notesDirty() && <button className="link" onClick={() => host.setNotes(p.notes || '')}>revert notes</button>}
      <Tog on={edit} onClick={() => setEdit(!edit)} title="Edit these notes (markdown, $math$, lab: links)">Edit</Tog>
    </div>
    {edit ? <div className="notes-edit"><textarea value={host.notes} spellCheck={false} onChange={e => host.setNotes(e.target.value)} aria-label="Notes markdown" />
      <div className="ed-foot"><span>Markdown with <code>$…$</code> and <code>$$…$$</code> math, <code>&gt; **Try it**</code> callouts and links like <code>[open](lab:open?file=main.js&amp;line=20)</code>. Saved in this browser.</span></div></div>
      : <div className="scroll" ref={sc}><Doc host={host} md={host.notes || '*No notes for this preset.*'} prefix="n-" scrollRef={sc} />{p.docs && p.docs.length > 0 && <div className="doc related"><h4>Further reading in the docs</h4><ul>{p.docs.map(id => { const d = host.docs.find(x => x.id === id); return d ? <li key={id}><a href="#" className="lablink" onClick={e => { e.preventDefault(); host.link('lab:doc?id=' + id); }}>{d.title}</a> <span className="dim">— {d.about}</span></li> : null; })}</ul></div>}</div>}
  </div>;
}

let lastDoc: any = null;
export function DocsView({ host }: { host: Host }) {
  useHost(host, 1);
  const [id, setId] = useState(lastDoc || (host.docs[0] && host.docs[0].id)), [q, setQ] = useState(''), [nav, setNav] = useState(0), sc = useRef<any>(null), pendingAnchor = useRef<any>(null);
  useFocus(host, 'docs', r => { if (r.doc) { setId(r.doc); lastDoc = r.doc; pendingAnchor.current = r.anchor || null; setNav(k => k + 1); } });
  useEffect(() => {
    if (!sc.current) return;
    if (pendingAnchor.current) { const el = sc.current.querySelector('#' + CSS.escape('d-' + pendingAnchor.current)); pendingAnchor.current = null; if (el) { el.scrollIntoView({ block: 'start' }); return; } }
    sc.current.scrollTop = 0;
  }, [id, nav]);
  const doc = host.docs.find(d => d.id === id) || host.docs[0];
  const groups: any[] = []; for (const d of host.docs) { if (q && !(d.title + ' ' + d.about + ' ' + d.body).toLowerCase().includes(q.toLowerCase())) continue; let g = groups.find(x => x.name === d.group); if (!g) groups.push(g = { name: d.group, docs: ([] as any[]) }); g.docs.push(d); }
  const uses = doc ? host.allPresets().filter(p => (p.docs || []).includes(doc.id)) : ([] as any[]);
  return <div className="tabbody docsview">
    <nav className="shelf">
      <input className="filter" placeholder="search the docs" value={q} onChange={e => setQ(e.target.value)} />
      {groups.map(g => <div key={g.name} className="shelfgrp"><div className="grp">{g.name}</div>{g.docs.map(d => <button key={d.id} className={d.id === (doc && doc.id) ? 'on' : ''} onClick={() => { setId(d.id); lastDoc = d.id; }}><b>{d.title}</b><small>{d.about}</small></button>)}</div>)}
    </nav>
    <div className="scroll" ref={sc}>
      {doc ? <><Doc host={host} md={doc.body} prefix="d-" scrollRef={sc} />
        {uses.length > 0 && <div className="doc related"><h4>Presets that use this</h4><ul>{uses.map(p => <li key={p.id}><a href="#" className="lablink" onClick={e => { e.preventDefault(); host.loadPreset(p.id); }}>{p.id} {p.title}</a> <span className="dim">— {p.about}</span></li>)}</ul></div>}</> : <p className="empty padded">No doc matches.</p>}
    </div>
  </div>;
}

export function ReferenceView({ host }: { host: Host }) {
  const sc = useRef<any>(null);
  return <div className="tabbody col"><div className="scroll" ref={sc}><Doc host={host} md={host.reference} prefix="r-" scrollRef={sc} /></div></div>;
}
