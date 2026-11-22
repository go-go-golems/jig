// code.jsx — the scene's files in an editor. Ctrl+Enter runs: the files re-run, the scene recompiles, and only
// changed shaders are rebuilt. Diagnostics mark their lines; click one to jump to it.
import React from 'react';
const { useState, useEffect, useRef, useMemo, useLayoutEffect } = React;
import { useHost, useFocus, Menu } from './common';
import { highlightLines } from '../highlight';

const ORDER = ['scene.js'];
export const fileOrder = files => Object.keys(files).sort((a, b) => { const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
const LH = 18;
const ui = { open: ['scene.js'], active: 'scene.js' };   // survives the view being closed and reopened

export function CodeView({ host }) {
  useHost(host, 4);
  const [, force] = useState(0); const rerender = () => force(x => x + 1);
  const [text, setText] = useState(host.files[ui.active] ?? '');
  const ta = useRef<any>(null), pre = useRef<any>(null), gut = useRef<any>(null), sent = useRef(text), pendingLine = useRef<any>(null);
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const path = ui.active;
  if (host.files[path] == null) { ui.active = 'scene.js'; if (!ui.open.includes('scene.js')) ui.open.unshift('scene.js'); }
  // pick up changes made elsewhere (the agent, a revert, a preset)
  if (host.files[ui.active] !== sent.current && host.files[ui.active] != null) { sent.current = host.files[ui.active]; if (text !== sent.current) setTimeout(() => setText(sent.current), 0); }
  const open = (p, line?, find?) => {
    if (host.files[p] == null) return;
    if (!ui.open.includes(p)) ui.open.push(p);
    ui.active = p; sent.current = host.files[p]; setText(host.files[p]); pendingLine.current = { line, find }; rerender();
  };
  useFocus(host, 'code', r => { if (r.file) open(r.file, r.line, r.find); });
  useLayoutEffect(() => {
    const pl = pendingLine.current; if (!pl || !ta.current) return; pendingLine.current = null;
    const el = ta.current, src = el.value, line = Math.max(1, pl.line || 1);
    let a = 0; for (let i = 1; i < line; i++) { const n = src.indexOf('\n', a); if (n < 0) break; a = n + 1; }
    let b = src.indexOf('\n', a); if (b < 0) b = src.length;
    if (pl.find) { const k = src.indexOf(pl.find); if (k >= 0) { a = k; b = k + pl.find.length; } }
    el.focus({ preventScroll: true }); el.setSelectionRange(a, b);
    { const v = src.slice(0, a).split('\n'); setCursor({ ln: v.length, col: v[v.length - 1].length + 1 }); }
    el.scrollTop = Math.max(0, (line - 1) * LH - el.clientHeight / 3); sync();
  });
  const sync = () => { const el = ta.current; if (!el) return; if (pre.current) pre.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`; if (gut.current) gut.current.style.transform = `translateY(${-el.scrollTop}px)`; };
  const change = v => { setText(v); sent.current = v; host.setFile(ui.active, v); };
  const run = async () => { const r = await host.build({}); if (!r.ok) { const e = r.diags.find(d => d.severity === 'error'); if (e && e.loc && e.loc.file && host.files[e.loc.file] != null) open(e.loc.file, e.loc.line); } };
  const insert = (s, a, b) => { const el = ta.current; el.focus(); el.setSelectionRange(a, b); if (!document.execCommand || !document.execCommand('insertText', false, s)) { const v = el.value.slice(0, a) + s + el.value.slice(b); el.value = v; el.setSelectionRange(a + s.length, a + s.length); change(v); } };
  const onKey = e => {
    const el = e.target, v = el.value, a = el.selectionStart, b = el.selectionEnd;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) { e.preventDefault(); run(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault(); const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', b) < 0 ? v.length : v.indexOf('\n', b);
      const lines = v.slice(ls, le).split('\n'), all = lines.every(l => /^\s*\/\//.test(l) || !l.trim());
      insert(lines.map(l => all ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.replace(/^(\s*)/, '$1// ')).join('\n'), ls, le); return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (a === b && !e.shiftKey) { insert('  ', a, b); return; }
      const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', b - (b > a && v[b - 1] === '\n' ? 1 : 0)) < 0 ? v.length : v.indexOf('\n', b - (b > a && v[b - 1] === '\n' ? 1 : 0));
      const lines = v.slice(ls, le).split('\n');
      insert(lines.map(l => e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l).join('\n'), ls, le); return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const ls = v.lastIndexOf('\n', a - 1) + 1, ind = (v.slice(ls, a).match(/^\s*/) || [''])[0], prev = v.slice(ls, a).trimEnd();
      const extra = /[{([]$/.test(prev) ? '  ' : '';
      e.preventDefault(); insert('\n' + ind + extra, a, b); return;
    }
  };
  const lines = useMemo(() => highlightLines(text), [text]);
  const diags = host.diags.filter(d => d.loc && d.loc.file === path && d.severity !== 'info');
  const errLines = new Map(diags.map(d => [d.loc.line, d.severity]));
  const bi = host.buildInfo, dirty = host.isDirty(path);
  const allDiags = host.diags.filter(d => d.severity !== 'info');
  const infos = host.diags.filter(d => d.severity === 'info');
  const files = fileOrder(host.files);
  const [newName, setNewName] = useState('');
  return <div className="tabbody col codeview">
    <div className="toolbar filebar">
      <div className="filetabs">
        {ui.open.filter(p => host.files[p] != null).map(p => <span key={p} className={'ftab' + (p === path ? ' on' : '')}>
          <button onClick={() => open(p)}>{p}{host.isDirty(p) ? ' •' : ''}</button>
          {ui.open.length > 1 && <button className="x" aria-label={'close ' + p} onClick={() => { ui.open = ui.open.filter(x => x !== p); if (ui.active === p) open(ui.open[0]); else rerender(); }}>×</button>}
        </span>)}
      </div>
      <span className="sp" />
      <Menu label="Files ▾" align="right" className="files">
        {close => <>
          <div className="mh">Project files — scene.js is the entry</div>
          {files.map(p => <button key={p} className={p === path ? 'on' : ''} onClick={() => open(p)}><span className="t">{p}</span><small>{host.files[p].split('\n').length} lines{host.isDirty(p) ? ' · edited' : ''}</small></button>)}
          <hr />
          <div className="newfile" data-keep><input placeholder="new file, e.g. lib/materials.js" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { const n = newName.trim().replace(/^\/+/, ''); const p = /\.js$/.test(n) ? n : n + '.js'; if (host.newFile(p, `// ${p} — import it from scene.js: import { … } from './${p.replace(/\.js$/, '')}'\nimport { material, bsdf, fx, param } from 'candela';\n\n`)) { open(p); setNewName(''); close(); } else host.toast(p + ' already exists', true); } }} /></div>
          {dirty && <button onClick={() => { host.revertFile(path); sent.current = null; }}>Revert {path} to the preset</button>}
          {path !== 'scene.js' && <button className="danger" data-keep onClick={() => { if (host.deleteFile(path)) { ui.open = ui.open.filter(x => x !== path); open('scene.js'); close(); } }}>Delete {path}</button>}
        </>}
      </Menu>
      <button className={'btn' + (host.isDirty() ? ' primary' : '')} onClick={run} title="Re-run the files and recompile (Ctrl+Enter). Shaders are cached by source">Run <kbd>⌘↵</kbd></button>
    </div>
    <div className="ed">
      <div className="egutter"><div className="gutter-in" ref={gut}>{lines.map((_, i) => {
        const ln = i + 1, e = errLines.get(ln);
        return <div key={i} className={e === 'error' ? 'err' : e === 'warning' ? 'warn' : ''}>{e ? <span className="gl">{e === 'error' ? '×' : '!'}</span> : null}{ln}</div>;
      })}</div></div>
      <div className="code">
        <pre ref={pre} aria-hidden="true">{lines.map((h, i) => <div key={i} className={errLines.has(i + 1) ? 'ln-err' : ''} dangerouslySetInnerHTML={{ __html: h || ' ' }} />)}</pre>
        <textarea ref={ta} value={text} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" wrap="off" aria-label={'Source of ' + path}
          onChange={e => change(e.target.value)} onKeyDown={onKey} onScroll={sync}
          onSelect={e => { const v = e.target.value.slice(0, e.target.selectionStart).split('\n'); setCursor({ ln: v.length, col: v[v.length - 1].length + 1 }); }} />
      </div>
    </div>
    {allDiags.length > 0 && <div className="diags">{allDiags.map((d, i) => <button key={i} className={'diag' + (d.severity === 'error' ? ' bad' : '')} onClick={() => d.loc && host.files[d.loc.file] != null && open(d.loc.file, d.loc.line)}><b>{d.severity === 'error' ? '×' : '!'}</b><span className="ln">{d.code}{d.loc ? ` ${d.loc.file}:${d.loc.line}` : ''}</span><span>{d.message}{d.suggest && d.suggest.length ? ` Did you mean ${d.suggest.map(x => `'${x}'`).join(' or ')}?` : ''}</span></button>)}</div>}
    <div className="ed-foot">
      {bi ? (bi.ok ? <span><b>built</b> in {bi.ms.toFixed(1)} ms{host.result && host.result.compiled ? ` · ${host.result.compiled.stats.objects} objects · ${host.result.compiled.stats.materials} material kernels · ${host.result.compiled.stats.lines} lines of WGSL` : ''}{host.vp && host.vp.compileMs ? ` · shaders ${host.vp.compileMs.toFixed(0)} ms` : ''}</span> : <span className="bad">does not build: {bi.message}</span>) : <span>not built</span>}
      {infos.length > 0 && <span title={infos.map(d => d.message).join('\n')}>{infos.length} note{infos.length > 1 ? 's' : ''}</span>}
      <span className="sp" />
      <span>Ln {cursor.ln}, Col {cursor.col}</span>
      {dirty && <button className="link" onClick={() => { host.revertFile(path); sent.current = null; }}>revert file</button>}
    </div>
  </div>;
}
