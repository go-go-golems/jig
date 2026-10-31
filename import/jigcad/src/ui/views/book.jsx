// Book: the textbook reader (BookContents, BookChapter, BookPartOpener): contents by part on the left, one chapter
// at the book's measure, its live figures compiled through the worker, its sketches openable as scratch presets.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Menu, useHost } from '../common.jsx';
import { Doc, Related } from '../doc.jsx';
import { store } from '../../host/store.js';
import { saveOrCopy } from '../save.js';

const partOf = s => { const m = /^\s*([IVXLC]+|[A-Z])\s*[·.:-]\s*(.+)$/.exec(s || ''); return m ? { num: m[1], title: m[2].trim() } : { num: '', title: (s || '').trim() }; };
const label = c => (/^[A-Z]$/.test(c.n) ? `Appendix ${c.n}` : `Chapter ${c.n}`);

function search(chapters, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return chapters.map(c => {
    const low = c.text.toLowerCase();
    if (!words.every(w => low.includes(w))) return null;
    const hits = words.reduce((a, w) => a + low.split(w).length - 1, 0);
    const at = low.indexOf(words[0]);
    const before = c.text.slice(0, at), sec = [...before.matchAll(/^##\s+(.+)$/gm)].pop()?.[1] || '';
    const snip = c.text.slice(Math.max(0, at - 70), at + 100).replace(/\s+/g, ' ').replace(/[#*`[\]]/g, '').trim();
    return { c, hits, sec, snip };
  }).filter(Boolean).sort((a, b) => b.hits - a.hits);
}

export function BookView({ host }) {
  useHost(host, ['preset']);
  const chapters = host.content.chapters;
  const [n, setN] = useState(() => { const s = store.get('book.ch'); return chapters.some(c => c.n === s) ? s : chapters[0]?.n; });
  const [at, setAt] = useState(null);
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const scroll = useRef(null);
  const open = (ch, anchor) => {
    setN(ch); setAt(anchor || null); setDrawer(false); store.set('book.ch', ch);
    if (!anchor && scroll.current) scroll.current.scrollTop = 0;
  };
  useEffect(() => {
    const apply = () => { const it = host.intents.book; if (it && !it.done) { it.done = true; if (it.ch) open(it.ch, it.at); } };
    apply();
    return host.on('intent', ({ view }) => view === 'book' && apply());
  }, []);

  if (!chapters.length) return (
    <div class="tabbody col"><div class="scroll"><p class="empty padded">The book has no chapters yet. Chapters are <code>content/book/*.md</code>, one per file, with <code>part</code> and <code>presets</code> in the frontmatter.</p></div></div>
  );
  const i = Math.max(0, chapters.findIndex(c => c.n === n));
  const ch = chapters[i], prev = chapters[i - 1], next = chapters[i + 1];
  const written = chapters.filter(c => !c.draft).length;
  const parts = [];
  for (const c of chapters) { const p = c.part || 'Chapters'; let g = parts[parts.length - 1]; if (!g || g.part !== p) parts.push(g = { part: p, items: [] }); g.items.push(c); }
  const opener = ch.part && ch.part !== prev?.part ? partOf(ch.part) : null;
  const results = search(chapters, q);
  const presets = ch.presets.map(id => host.presets().find(p => p.id === id)).filter(Boolean);
  const docs = ch.docs.map(id => host.content.docs.find(d => d.id === id)).filter(Boolean);

  return (
    <div class="tabbody bookview">
      <nav class={`bcontents ${drawer ? 'open' : ''}`} aria-label="Contents of the book">
        <div class="btitle"><b>{host.content.bookTitle}</b><small>{written === chapters.length ? `${chapters.length} chapters` : `${written} of ${chapters.length} chapters written`}</small></div>
        <input class="filter" placeholder="search the book" aria-label="Search the book" value={q} onInput={e => setQ(e.currentTarget.value)} />
        {q.trim() ? (
          <div class="bresults">
            {results.map(({ c, sec, snip }) => (
              <button key={c.file} onClick={() => open(c.n)}><span class="bn">{c.n}</span><span><b>{c.title}</b>{sec && <em>{sec}</em>}<small>…{snip}…</small></span></button>
            ))}
            {!results.length && <p class="empty">No chapter mentions that.</p>}
          </div>
        ) : parts.map(g => (
          <div class="bpart" key={g.part}>
            <div class="grp">{partOf(g.part).num ? `Part ${partOf(g.part).num} · ${partOf(g.part).title}` : g.part}</div>
            {g.items.map(c => <button key={c.file} class={`${c === ch ? 'on' : ''} ${c.draft ? 'draft' : ''}`} onClick={() => open(c.n)}><span class="bn">{c.n}</span><span class="bt">{c.title}</span></button>)}
          </div>
        ))}
      </nav>
      {drawer && <div class="bscrim" onClick={() => setDrawer(false)} />}
      <div class="bmain">
        <div class="toolbar">
          <button class="btn sm bcbtn" onClick={() => setDrawer(!drawer)} aria-expanded={drawer}>Contents</button>
          <span class="ntitle"><span class="pcode">{label(ch)}</span> <b>{ch.title}</b></span>
          <span class="sp" />
          <button class="ibtn" disabled={!prev} title={prev ? `${label(prev)}: ${prev.title}` : 'This is the first chapter'} aria-label="Previous chapter" onClick={() => open(prev.n)}>‹</button>
          <button class="ibtn" disabled={!next} title={next ? `${label(next)}: ${next.title}` : 'This is the last chapter'} aria-label="Next chapter" onClick={() => open(next.n)}>›</button>
          <Menu btnClass="btn sm" menuClass="bexport" right label={<>Export <span class="caret">▾</span></>} title="Export the chapter or the book">
            <button onClick={() => saveOrCopy(host, ch.file, ch.text)}><span class="t">This chapter as Markdown</span><small>{label(ch)}: {ch.title}</small></button>
            <button onClick={() => saveOrCopy(host, 'jig-book.md', chapters.map(c => c.text).join('\n\n---\n\n'))}><span class="t">The whole book as Markdown</span><small>one .md file; figures stay as their scripts</small></button>
            <p class="note">Links that drive the workbench become plain text outside it.</p>
          </Menu>
        </div>
        <div class="scroll" ref={scroll}>
          {opener && <div class="doc bpartopen">{opener.num && <div class="lbl">Part {opener.num}</div>}<h2>{opener.title}</h2>{ch.partAbout && <p>{ch.partAbout}</p>}</div>}
          <div class="doc bchlabel"><span>{label(ch)}{ch.draft && <em> · not written yet</em>}</span></div>
          {ch.draft ? <div class="doc"><h1>{ch.title}</h1><p class="empty">{ch.about || 'This chapter is planned but not written yet.'}</p></div>
            : <Doc host={host} md={ch.text} prefix="b-" source={`${label(ch)}`} at={at} />}
          <div class="bpairs">
            <Related host={host} groups={[
              { title: 'In the workbench', items: presets.map(p => ({ href: `lab:preset?id=${p.id}`, label: `${p.id} ${p.title}`, about: p.about })) },
              { title: 'On the shelf', items: docs.map(d => ({ href: `lab:doc?id=${d.id}`, label: d.title, about: d.about })) },
            ]} />
          </div>
          <div class="doc bnav">
            {prev && <button onClick={() => open(prev.n)}><small>‹ {label(prev)}</small><b>{prev.title}</b></button>}
            {next && <button class="nx" onClick={() => open(next.n)}><small>{label(next)} ›</small><b>{next.title}</b></button>}
          </div>
        </div>
      </div>
    </div>
  );
}
