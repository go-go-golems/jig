// Code: the preset's files in an editor (CodeEditor, FileTabs): a transparent textarea over highlighted lines,
// a gutter of line numbers and declaration glyphs, diagnostics under an accent rule, a build footer.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Menu, useHost, RUN_KEY, RUN_KEY_LONG, isMac } from '../common.jsx';
import { highlightLines, langOf } from '../highlight.js';
import { store } from '../../host/store.js';
import { plural, ms as fmtMs, bare } from '../format.js';

const LINE = 18;
const caret = new Map();     // file → { start, end, scroll } kept while the tab is closed

/** Declarations worth a gutter glyph: ▢ sketch, ■ feature, △ part, ◇ param, ◎ metric, λ design space. */
export function declarations(text) {
  const out = new Map();
  const lines = text.split('\n');
  const put = (i, g) => { if (!out.has(i)) out.set(i, g); };
  lines.forEach((l, i) => {
    let m;
    if ((m = /j\.sketch\(\s*'([^']+)'/.exec(l))) put(i, { glyph: '▢', kind: 'sketch', id: m[1] });
    if ((m = /\b(?:id:\s*'([^']+)'|\.feature\(\s*'([^']+)')/.exec(l))) put(i, { glyph: '■', kind: 'feature', id: m[1] || m[2] });
    if ((m = /j\.(part|assembly|print)\(\s*'([^']+)'/.exec(l))) put(i, { glyph: '△', kind: m[1], id: m[2] });
    if ((m = /j\.metric\(\s*'([^']+)'/.exec(l))) put(i, { glyph: '◎', kind: 'metric', id: m[1] });
    if (/j\.design\(/.test(l)) put(i, { glyph: 'λ', kind: 'design', id: 'design' });
  });
  // params: the keys inside .params({ … })
  const re = /\.params\(\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let k = re.lastIndex, depth = 1;
    const start = k;
    while (k < text.length && depth) { const c = text[k++]; if (c === '{') depth++; else if (c === '}') depth--; }
    const body = text.slice(start, k - 1), base = text.slice(0, start).split('\n').length - 1;
    body.split('\n').forEach((l, j) => {
      const keys = [...l.matchAll(/(?:^|[{,]\s*)(\w+)\s*:/g)].map(x => x[1]);
      if (keys.length) put(base + j, { glyph: '◇', kind: 'param', id: keys[0], ids: keys });
    });
  }
  return out;
}

function insert(ta, text) {
  ta.focus();
  if (!document.execCommand?.('insertText', false, text)) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function CodeView({ host }) {
  useHost(host, ['files', 'program', 'compiling', 'preset']);
  const pid = host.preset?.id || 'none';
  const ORDER = ['script.js', 'notes.md', 'search.js'];
  const all = [...host.files.keys()].sort((a, b) => ((ORDER.indexOf(a) + 1 || 9) - (ORDER.indexOf(b) + 1 || 9)) || a.localeCompare(b));
  const [file, setFileState] = useState(() => { const f = store.get(`code.file.${pid}`); return f && host.files.has(f) ? f : 'script.js'; });
  const [hidden, setHidden] = useState([]);
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const [find, setFind] = useState('');
  const [newName, setNewName] = useState('');
  const ta = useRef(null), pre = useRef(null), gut = useRef(null), findRef = useRef(null);

  const tabs = all.filter(f => !hidden.includes(f) || f === file);
  const cur = host.files.has(file) ? file : 'script.js';
  const text = host.files.get(cur) ?? '';
  const setFile = f => { if (ta.current) caret.set(cur, { start: ta.current.selectionStart, end: ta.current.selectionEnd, scroll: ta.current.scrollTop }); setFileState(f); store.set(`code.file.${pid}`, f); setHidden(h => h.filter(x => x !== f)); };

  useEffect(() => { if (!host.files.has(file)) setFileState('script.js'); }, [pid]);
  useEffect(() => { host.setOpenFile?.(cur); }, [cur, pid]);      // the agent's context names the open file
  const program = host.program;
  const diags = useMemo(() => {
    const list = (program?.diagnostics || []).filter(d => d.level !== 'info').map(d => ({ ...d, file: d.file || 'script.js' }));
    return list.sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1));
  }, [program]);
  const notes = (program?.diagnostics || []).filter(d => d.level === 'info');
  const errLines = new Set(diags.filter(d => d.level === 'error' && d.file === cur && d.line).map(d => d.line));
  const warnLines = new Set(diags.filter(d => d.level === 'warning' && d.file === cur && d.line).map(d => d.line));
  const lang = langOf(cur);
  const lines = useMemo(() => highlightLines(text, lang), [text, lang]);
  const decl = useMemo(() => (lang === 'js' ? declarations(text) : new Map()), [text, lang]);
  const html = useMemo(() => lines.map((l, i) => `<div${errLines.has(i + 1) ? ' class="ln-err"' : ''}>${l || ' '}</div>`).join(''), [lines, [...errLines].join()]);

  // restore the caret when a file opens; follow lab:open intents
  useEffect(() => {
    const c = caret.get(cur), t = ta.current;
    if (c && t) { t.setSelectionRange(c.start, c.end); t.scrollTop = c.scroll; sync(); }
  }, [cur]);
  const goTo = (line, f = cur) => {
    if (f !== cur) { setFile(f); requestAnimationFrame(() => goTo(line, f)); return; }
    const t = ta.current;
    if (!t) return;
    const ls = (host.files.get(f) ?? '').split('\n');
    const n = Math.max(1, Math.min(ls.length, line || 1));
    const off = ls.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
    t.focus({ preventScroll: true });
    t.setSelectionRange(off, off + ls[n - 1].length);
    t.scrollTop = Math.max(0, (n - 1) * LINE - t.clientHeight / 3);
    sync(); track();
  };
  useEffect(() => {
    const apply = () => {
      const it = host.intents.code;
      if (!it || it.done) return;
      it.done = true;
      const f = it.file && host.files.has(it.file) ? it.file : cur;
      let line = it.line;
      if (it.find) { const i = (host.files.get(f) ?? '').split('\n').findIndex(l => l.includes(it.find)); line = i >= 0 ? i + 1 : 1; }
      requestAnimationFrame(() => goTo(line || 1, f));
    };
    apply();
    return host.on('intent', ({ view }) => view === 'code' && apply());
  }, [cur]);

  const sync = () => {
    const t = ta.current;
    if (!t) return;
    if (pre.current) pre.current.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
    if (gut.current) gut.current.style.transform = `translateY(${-t.scrollTop}px)`;
  };
  const track = () => {
    const t = ta.current;
    if (!t) return;
    const before = t.value.slice(0, t.selectionStart).split('\n');
    setPos({ ln: before.length, col: before[before.length - 1].length + 1 });
  };
  useEffect(sync);

  const onKey = e => {
    const t = e.currentTarget, mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'f') { e.preventDefault(); findRef.current?.focus(); findRef.current?.select(); return; }
    if (mod && e.key === '/') {
      e.preventDefault();
      const v = t.value, s = v.lastIndexOf('\n', t.selectionStart - 1) + 1, eIdx = v.indexOf('\n', Math.max(t.selectionStart, t.selectionEnd - 1));
      const end = eIdx < 0 ? v.length : eIdx, block = v.slice(s, end).split('\n');
      const on = block.every(l => /^\s*\/\//.test(l) || !l.trim());
      const out = block.map(l => (on ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
      t.setSelectionRange(s, end); insert(t, out); t.setSelectionRange(s, s + out.length);
      return;
    }
    if (e.key === 'Tab' && !mod) {
      e.preventDefault();
      const v = t.value, a = t.selectionStart, b = t.selectionEnd;
      if (a === b && !e.shiftKey) { insert(t, '  '); return; }
      const s = v.lastIndexOf('\n', a - 1) + 1, eIdx = v.indexOf('\n', Math.max(a, b - 1)), end = eIdx < 0 ? v.length : eIdx;
      const out = v.slice(s, end).split('\n').map(l => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n');
      t.setSelectionRange(s, end); insert(t, out); t.setSelectionRange(s, s + out.length);
      return;
    }
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const v = t.value, a = t.selectionStart, s = v.lastIndexOf('\n', a - 1) + 1;
      const indent = /^\s*/.exec(v.slice(s, a))[0], open = /[([{]\s*$/.test(v.slice(s, a));
      insert(t, '\n' + indent + (open ? '  ' : ''));
    }
  };

  const findNext = back => {
    const t = ta.current;
    if (!t || !find) return;
    const v = t.value.toLowerCase(), q = find.toLowerCase();
    let i = back ? v.lastIndexOf(q, t.selectionStart - 1) : v.indexOf(q, t.selectionEnd);
    if (i < 0) i = back ? v.lastIndexOf(q) : v.indexOf(q);
    if (i < 0) { host.toast(`no “${find}” in ${cur}`, 'bad'); return; }
    t.focus({ preventScroll: true });
    t.setSelectionRange(i, i + q.length);
    const ln = t.value.slice(0, i).split('\n').length;
    if ((ln - 1) * LINE < t.scrollTop || (ln + 1) * LINE > t.scrollTop + t.clientHeight) t.scrollTop = Math.max(0, (ln - 1) * LINE - t.clientHeight / 3);
    sync(); track();
  };
  const hits = find ? text.toLowerCase().split(find.toLowerCase()).length - 1 : 0;

  const glyphClick = d => {
    if (d.kind === 'param') host.focus('params', { param: d.id });
    else if (d.kind === 'sketch' || d.kind === 'feature') { host.selectNode(d.id); host.focus('graph'); }
    else host.focus('stage');
  };
  const failed = program?.ok === false;
  const err = failed ? program.diagnostics.find(d => d.level === 'error') : null;
  const s = (program?.ok !== false ? program : host.lastGood)?.summary || {};
  const engine = host.engine.kind === 'mock' ? ' · mock engine' : '';

  return (
    <div class="tabbody col codeview">
      <div class="toolbar filebar">
        <div class="filetabs" role="tablist">
          {tabs.map(f => (
            <span key={f} class={`ftab ${f === cur ? 'on' : ''}`}>
              <button role="tab" aria-selected={f === cur} onClick={() => setFile(f)}>{f}{host.isEdited(f) ? ' •' : ''}</button>
              {tabs.length > 1 && <button class="x" aria-label={`close ${f}`} title={`Close ${f} (Files ▾ opens it again)`} onClick={() => { setHidden(h => [...h, f]); if (f === cur) setFile(tabs.find(x => x !== f)); }}>×</button>}
            </span>
          ))}
        </div>
        <span class="sp" />
        <input ref={findRef} class="filter findfield" placeholder="find in file" aria-label={`Find in ${cur}`} value={find}
          title={`Find (${isMac ? '⌘' : 'Ctrl+'}F); Enter for the next match, Shift+Enter for the previous`}
          onInput={e => setFind(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey); } if (e.key === 'Escape') { setFind(''); ta.current?.focus(); } }} />
        {find && <span class="lbl">{hits ? plural(hits, 'match', 'matches') : 'no match'}</span>}
        <Menu btnClass="btn" menuClass="files" right label="Files ▾" title="Every file of the preset">
          <div class="mh">Files of {host.preset?.id || 'this preset'}: every file is editable</div>
          {all.map(f => (
            <button key={f} class={f === cur ? 'on' : ''} onClick={() => setFile(f)}>
              <span class="t">{f}</span><small>{plural((host.files.get(f) || '').split('\n').length, 'line')}{host.isEdited(f) ? ' · edited' : ''}</small>
            </button>
          ))}
          <div class="newfile" data-keep>
            <input placeholder="new file, e.g. holes.csv" aria-label="New file name" value={newName} onInput={e => setNewName(e.currentTarget.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { const n = newName.trim(); if (host.addFile(n, '')) { setNewName(''); setFile(n); } else host.toast(`${n} exists already`, 'bad'); } }} />
          </div>
          <hr />
          <button disabled={!host.isEdited(cur)} onClick={() => { host.revertFile(cur); host.toast(`${cur} is back as published`); }}><span class="t">Revert {cur}</span><small>back to the published file</small></button>
          <button disabled={!host.isEdited()} onClick={() => { host.revertAll(); host.toast('Back to the preset as published'); }}><span class="t">Revert all edits</span><small>every file as published</small></button>
          {cur !== 'script.js' && <button class="danger" onClick={() => { host.deleteFile(cur); setFile('script.js'); host.toast(`Deleted ${cur}`); }}><span class="t">Delete {cur}</span><small>{cur in host.published ? 'Revert all edits brings it back' : 'removes your new file'}</small></button>}
        </Menu>
        <button class={`btn ${host.dirty ? 'primary' : ''}`} title={`Compile the files (${RUN_KEY_LONG})`} onClick={() => host.compile()}>Run <kbd>{RUN_KEY}</kbd></button>
      </div>
      <div class="ed">
        <div class="egutter" aria-hidden="true">
          <div class="gutter-in" ref={gut}>
            {lines.map((_, i) => {
              const d = decl.get(i);
              const cls = errLines.has(i + 1) ? 'err' : warnLines.has(i + 1) ? 'warn' : pos.ln === i + 1 ? 'cur' : '';
              return <div key={i} class={cls}>{d && <button class="gl" tabIndex={-1} title={`${d.kind} ${d.ids ? d.ids.join(', ') : d.id}`} onClick={() => glyphClick(d)}>{d.glyph}</button>}{i + 1}</div>;
            })}
          </div>
        </div>
        <div class="code">
          <pre ref={pre} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
          <textarea ref={ta} spellcheck={false} autocapitalize="off" autocomplete="off" wrap="off" aria-label={`Source of ${cur}`} value={text}
            onInput={e => { host.setFile(cur, e.currentTarget.value); track(); }} onScroll={sync} onKeyDown={onKey} onKeyUp={track} onClick={track} onSelect={track} />
        </div>
      </div>
      {diags.length > 0 && (
        <div class="diags">
          {diags.map((d, i) => (
            <button key={i} class={`diag ${d.level === 'error' ? 'bad' : ''}`} title={d.fix ? `fix: ${d.fix}` : d.kind} onClick={() => {
              const f = host.files.has(d.file) ? d.file : host.files.has(d.at) ? d.at : null;
              if (d.line || f) goTo(d.line || 1, f || 'script.js');
              else if (d.at) host.link(`lab:select/${d.at}`);
            }}>
              <b>{d.level === 'error' ? '×' : '!'}</b><span class="ln">{d.file}{d.line ? `:${d.line}` : ''}</span><span>{bare(d.message)}{d.fix ? ` · fix: ${d.fix}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      <div class="ed-foot">
        {host.compiling ? <span>compiling…</span>
          : failed ? <span class="bad">does not compile: {bare(err?.message)}{err?.line ? ` (${err.file || 'script.js'}:${err.line})` : ''}</span>
            : program ? <span><b>compiled</b> in {fmtMs(program.ms ?? s.ms)} · {[s.features != null && plural(s.features, 'feature'), s.sketches != null && plural(s.sketches, 'sketch', 'sketches'), s.bodies != null && plural(s.bodies, 'body', 'bodies'), s.faces != null && plural(s.faces, 'face')].filter(Boolean).join(', ')}{engine}{host.dirty ? ' · edited since' : ''}</span>
              : <span>not compiled yet: press Run</span>}
        {notes.length > 0 && <span title={notes.map(n => n.message).join('\n')}>{plural(notes.length, 'note')}</span>}
        <span class="sp" />
        <span>Ln {pos.ln}, Col {pos.col}</span>
        {host.isEdited(cur) && <button class="link" onClick={() => host.revertFile(cur)}>revert file</button>}
      </div>
    </div>
  );
}
