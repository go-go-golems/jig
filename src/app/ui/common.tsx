// common.jsx — hooks and small controls shared by every view.
import React from 'react';
const { useState, useEffect, useRef, useCallback } = React;

// re-render when the host changes, at most `hz` times a second
export function useHost(host, hz = 8) {
  const [, setV] = useState(0);
  useEffect(() => {
    let pending = null, last = 0;
    const off = host.subscribe(() => {
      const now = performance.now(), wait = Math.max(0, 1000 / hz - (now - last));
      if (pending) return;
      pending = setTimeout(() => { pending = null; last = performance.now(); setV(v => v + 1); }, wait);
    });
    return () => { off(); if (pending) clearTimeout(pending); };
  }, [host, hz]);
  return host;
}
// react to focus requests aimed at a view
export function useFocus(host, view, fn) {
  // a request is consumed once: a view that mounts because of the request (its tab was hidden) still gets it
  useEffect(() => {
    const check = () => { const r = host.focusReq; if (r && r.view === view && !r.done) { r.done = true; fn(r); } };
    check(); return host.subscribe(check);
  }, [host, view]);
}
export function useOutside(ref, onOut, active) {
  useEffect(() => {
    if (!active) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    const k = e => { if (e.key === 'Escape') onOut(); };
    document.addEventListener('pointerdown', h, true); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', h, true); document.removeEventListener('keydown', k); };
  }, [active]);
}
export function Seg({ value, options, onChange, small, label }) {
  return <div className={'seg' + (small ? ' sm' : '')} role="group" aria-label={label}>
    {options.map(o => { const v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label; return <button key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} title={o.title || ''} onClick={() => onChange(v)}>{l}</button>; })}
  </div>;
}
export function Tog({ on, onClick, children, title }) { return <button className={'tog' + (on ? ' on' : '')} aria-pressed={!!on} title={title} onClick={onClick}>{children}</button>; }
export function Menu({ label, className, btnClass, children, align, title }) {
  const [open, setOpen] = useState(false), ref = useRef(null);
  useOutside(ref, () => setOpen(false), open);
  return <div className="rel" ref={ref}>
    <button className={btnClass || 'btn'} onClick={() => setOpen(!open)} aria-expanded={open} title={title}>{label}</button>
    {open && <div className={'menu ' + (align === 'right' ? 'right ' : '') + (className || '')} onClick={e => { if (e.target.closest('button') && !e.target.closest('[data-keep]')) setOpen(false); }}>{typeof children === 'function' ? children(() => setOpen(false)) : children}</div>}
  </div>;
}
export const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };
// copy text with a fallback to selection
export async function copyText(text, host) {
  try { await navigator.clipboard.writeText(text); host && host.toast('Copied'); return true; }
  catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); host && host.toast('Copied'); } catch (e2) { host && host.toast('Copy failed: select the text and copy it', true); } ta.remove(); return false; }
}
let downloadsNS;
// offer a file to the viewer: the page's downloads capability when it has one; a plain download link when the page
// runs outside claude.ai; otherwise text is copied to the clipboard
export async function saveFile(host, filename, data) {
  const ext = (filename.match(/\.(\w+)$/) || [])[1] || '';
  let ns = null;
  try { if (downloadsNS === undefined) downloadsNS = window.claude && window.claude.use ? await window.claude.use('downloads') : null; ns = downloadsNS; } catch (e) { ns = null; }
  if (ns) {
    try { await ns.save({ filename, data }); return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined' || code === 'cancelled') return false;
      if (code === 'rate_limited') { host.toast('A save is already waiting for an answer: try again in a moment', true); return false; }
      if (code === 'rejected_extension' || code === 'extension_not_enabled') { host.toast(`Saving .${ext} files is not available here`, true); return false; }
      if (code === 'too_large') { host.toast(`${filename} is too large to save here`, true); return false; }
    }
  }
  if (!window.claude) {
    try { const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return true; } catch (e) { /* fall through */ }
  }
  if (typeof data !== 'string') { host.toast(`Saving files is not available here, so ${filename} could not be saved`, true); return false; }
  if (data.length > 2e6) { host.toast(`Saving files is not available here, and ${filename} is too large to copy`, true); return false; }
  await copyText(data, null); host.toast(`Saving files is not available here: ${filename} was copied to the clipboard instead`);
  return false;
}
