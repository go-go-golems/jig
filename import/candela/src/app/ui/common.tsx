// common.jsx — hooks and small controls shared by every view.
import React from 'react';
const { useState, useEffect, useRef, useCallback } = React;

// re-render when the host changes, at most `hz` times a second
export function useHost(host, hz = 8) {
  const [, setV] = useState(0);
  useEffect(() => {
    let pending: any = null, last = 0;
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
export interface SegOption { value: any; label: React.ReactNode; title?: string }
export function Seg({ value, options, onChange, small, label }: { value: any; options: SegOption[]; onChange: (v: any) => void; small?: boolean; label?: string }) {
  return <div className={'seg' + (small ? ' sm' : '')} role="group" aria-label={label}>
    {options.map(o => { const v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label; return <button key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} title={o.title || ''} onClick={() => onChange(v)}>{l}</button>; })}
  </div>;
}
export function Tog({ on, onClick, children, title }: { on: boolean; onClick: () => void; children?: React.ReactNode; title?: string }) { return <button className={'tog' + (on ? ' on' : '')} aria-pressed={!!on} title={title} onClick={onClick}>{children}</button>; }
export function Menu({ label, className, btnClass, children, align, title }: { label: React.ReactNode; className?: string; btnClass?: string; children: React.ReactNode | ((close: () => void) => React.ReactNode); align?: string; title?: string }) {
  const [open, setOpen] = useState(false), ref = useRef<any>(null);
  useOutside(ref, () => setOpen(false), open);
  return <div className="rel" ref={ref}>
    <button className={btnClass || 'btn'} onClick={() => setOpen(!open)} aria-expanded={open} title={title}>{label}</button>
    {open && <div className={'menu ' + (align === 'right' ? 'right ' : '') + (className || '')} onClick={e => { const t = e.target as HTMLElement; if (t.closest('button') && !t.closest('[data-keep]')) setOpen(false); }}>{typeof children === 'function' ? children(() => setOpen(false)) : children}</div>}
  </div>;
}
export const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };
// copy text with a fallback to selection
export async function copyText(text, host) {
  try { await navigator.clipboard.writeText(text); host && host.toast('Copied'); return true; }
  catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); host && host.toast('Copied'); } catch (e2) { host && host.toast('Copy failed: select the text and copy it', true); } ta.remove(); return false; }
}
// offer a file to the viewer as a download (standalone: no claude.ai downloads capability, so always a link)
export async function saveFile(host, filename: string, data: Blob | string) {
  try {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    host.toast(`Could not save ${filename}: ${e.message}`, true);
    return false;
  }
}
