// Docs (the shelf: one topic each) and Reference (the API, one page): Markdown from content/docs/*.md.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useHost } from '../common.jsx';
import { Doc, Related, scrollToAnchor } from '../doc.jsx';
import { store } from '../../host/store.js';
import { isReferenceDoc as isReference } from '../../host/host.js';

export function DocsView({ host }) {
  useHost(host, ['preset']);
  const shelf = host.content.docs.filter(d => !isReference(d));
  const [open, setOpen] = useState(() => store.get('docs.open') || shelf[0]?.id);
  const [at, setAt] = useState(null);
  const [q, setQ] = useState('');
  const scroll = useRef(null);
  const pick = (id, anchor) => { setOpen(id); setAt(anchor || null); store.set('docs.open', id); if (!anchor && scroll.current) scroll.current.scrollTop = 0; };
  useEffect(() => {
    const apply = () => { const it = host.intents.docs; if (it && !it.done) { it.done = true; pick(it.id, it.at); } };
    apply();
    return host.on('intent', ({ view }) => view === 'docs' && apply());
  }, []);

  if (!shelf.length) return (
    <div class="tabbody col"><div class="scroll"><p class="empty padded">No docs on the shelf yet. They are written in <code>content/docs/*.md</code>, one topic each, with an <code>id</code>, <code>title</code>, <code>group</code> and <code>about</code> in the frontmatter.</p></div></div>
  );
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = shelf.filter(d => words.every(w => (d.title + ' ' + d.about + ' ' + d.text).toLowerCase().includes(w)));
  const groups = [];
  for (const d of hits) { let g = groups.find(x => x.title === d.group); if (!g) groups.push(g = { title: d.group, items: [] }); g.items.push(d); }
  const doc = shelf.find(d => d.id === open || d.key === open) || shelf[0];
  const presets = host.presets().filter(p => String(p.docs || '').split(',').map(s => s.trim()).includes(doc.id));
  const chapters = host.content.chapters.filter(c => c.docs.includes(doc.id) && !c.draft);

  return (
    <div class="tabbody docsview">
      <nav class="shelf" aria-label="The shelf">
        <input class="filter" placeholder="search the shelf" aria-label="Search the shelf" value={q} onInput={e => setQ(e.currentTarget.value)} />
        {groups.map(g => (
          <div class="shelfgrp" key={g.title}>
            <div class="grp">{g.title}</div>
            {g.items.map(d => <button key={d.id} class={d === doc ? 'on' : ''} onClick={() => pick(d.id)}><b>{d.title}</b>{d.about && <small>{d.about}</small>}</button>)}
          </div>
        ))}
        {!hits.length && <p class="empty padded">Nothing on the shelf matches.</p>}
      </nav>
      <div class="scroll" ref={scroll}>
        <Doc host={host} md={doc.text} prefix="d-" source={`the doc ${doc.title}`} at={at} />
        <Related host={host} groups={[
          { title: 'Presets that use this', items: presets.map(p => ({ href: `lab:preset?id=${p.id}`, label: `${p.id} ${p.title}`, about: p.about })) },
          { title: 'In the book', items: chapters.map(c => ({ href: `lab:book?ch=${c.n}`, label: `Chapter ${c.n} ${c.title}`, about: c.about })) },
        ]} />
      </div>
    </div>
  );
}

/** The Reference page: the language reference (content/docs/reference.md) and then the lab API the agent's eval code
 *  uses (src/agent/reference.md), each its own document with its own contents, one scroll; host.referenceDocs()
 *  gives whichever exist, and the agent reads the same two (host.reference()). */
export function referenceText(host) {
  const docs = host.referenceDocs ? host.referenceDocs() : [];
  return docs.length ? { md: docs.map(d => d.md).join('\n\n'), both: docs.length > 1, docs } : null;
}
const REF_PREFIX = { language: 'r-', lab: 'l-' };

export function ReferenceView({ host }) {
  const ref0 = referenceText(host);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  // a lab:reference?at=… link: the anchor in the language reference first, then in the lab API
  useEffect(() => {
    const go = at => requestAnimationFrame(() => {
      if (!at) return;
      const root = ref.current;
      const ok = Object.values(REF_PREFIX).some(p => scrollToAnchor(root, at.startsWith(p) ? at : p + at));
      if (!ok) host.toast(`the reference has no section ${at}`, 'bad');
    });
    const apply = () => { const it = host.intents.reference; if (it && !it.done) { it.done = true; go(it.at); } };
    apply();
    return host.on('intent', ({ view }) => view === 'reference' && apply());
  }, []);
  const jump = () => {
    const root = ref.current, w = q.trim().toLowerCase();
    if (!root || !w) return;
    const h = [...root.querySelectorAll('h1, h2, h3, h4, code')].find(el => el.textContent.toLowerCase().includes(w));
    if (!h) { host.toast(`the reference does not mention ${q.trim()}`, 'bad'); return; }
    const target = h.closest('h1, h2, h3, h4') || h;
    if (target.id) scrollToAnchor(root, target.id); else target.scrollIntoView({ block: 'center' });
  };
  return (
    <div class="tabbody col">
      <div class="toolbar">
        <input class="filter" placeholder="jump to a name, e.g. extrude" aria-label="Jump to a name in the reference" value={q}
          onInput={e => setQ(e.currentTarget.value)} onKeyDown={e => e.key === 'Enter' && jump()} />
        <span class="lbl">{ref0?.both ? 'The language, then the lab API; the agent reads both.' : 'The API on one page; the agent reads the same page.'} Enter jumps to the first heading or code that names it.</span>
      </div>
      <div class="scroll refview" ref={ref}>
        {ref0 ? ref0.docs.map((d, i) => (
          <Doc key={d.id} host={host} md={d.md} prefix={REF_PREFIX[d.id] || `r${i}-`} className={`doc${i ? ' refpart' : ''}`} source="the reference" />
        )) : <p class="empty padded">The reference is not written yet: it lives in <code>content/docs/reference.md</code>.</p>}
      </div>
    </div>
  );
}
