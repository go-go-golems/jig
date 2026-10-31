// Notes: the preset's notes.md as a Doc, with lab: links that act in the workbench; Edit turns it into Markdown.
import { useState } from 'preact/hooks';
import { Tog, useHost } from '../common.jsx';
import { Doc, Related } from '../doc.jsx';

export function NotesView({ host }) {
  useHost(host, ['preset', 'files']);
  const [edit, setEdit] = useState(false);
  const p = host.preset;
  const md = host.files.get('notes.md');
  const docs = String(p?.docs || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(id => host.content.docs.find(d => d.id === id || d.key === id)).filter(Boolean);
  const chapters = host.content.chapters.filter(c => p && c.presets.includes(p.id) && !c.draft);

  return (
    <div class="tabbody col notes">
      <div class="toolbar">
        <span class="ntitle">{p ? <><span class="pcode">{p.id}</span> <b>{p.title}</b> <span class="pcode">· {p.group || 'Presets'}</span></> : <b>No preset</b>}</span>
        <span class="sp" />
        {host.isEdited('notes.md') && <button class="link" onClick={() => { host.revertFile('notes.md'); host.toast('Notes are back as published'); }}>revert notes</button>}
        <Tog on={edit} onClick={() => setEdit(!edit)} title="Edit the notes as Markdown (kept in this browser)">Edit</Tog>
      </div>
      {edit ? (
        <div class="notes-edit">
          <textarea spellcheck={true} aria-label="Notes in Markdown" value={md ?? ''} placeholder="# Title&#10;&#10;What is on the screen and what the preset is for."
            onInput={e => host.setFile('notes.md', e.currentTarget.value)} />
          <div class="ed-foot"><span>Markdown with <code>$…$</code> maths, <code>&gt; **Try it.**</code> callouts and links like <code>[the front](lab:view/stage?view=front)</code>. Saved in this browser.</span></div>
        </div>
      ) : (
        <div class="scroll">
          {md?.trim() ? <>
            <Doc host={host} md={md} prefix="n-" source={`the notes of ${p?.id}`} />
            <Related host={host} groups={[
              { title: 'Further reading on the shelf', items: docs.map(d => ({ href: `lab:doc?id=${d.id}`, label: d.title, about: d.about })) },
              { title: 'In the book', items: chapters.map(c => ({ href: `lab:book?ch=${c.n}`, label: `Chapter ${c.n} ${c.title}`, about: c.about })) },
            ]} />
          </> : <p class="empty padded">This preset has no notes. Press Edit to write them, or add <code>notes.md</code> from Files ▾ in Code.</p>}
        </div>
      )}
    </div>
  );
}
