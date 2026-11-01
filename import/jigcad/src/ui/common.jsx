// Shared controls (Menu, Seg, Tog, the theme icon) and the hook that re-renders a view on host events.
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';

/** Re-render when any of the host's events fire. */
export function useHost(host, events) {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const offs = events.map(e => host.on(e, () => force()));
    return () => offs.forEach(off => off());
  }, [host, events.join(' ')]);
  return host;
}

/** A dropdown: the button and, when open, `.menu` under it. Items close it unless they carry data-keep. */
export function Menu({ label, title, btnClass = 'btn', menuClass = '', right = false, disabled, children, onOpen, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
  }, [open]);
  const click = e => {
    const b = e.target.closest('button');
    if (b && !b.closest('[data-keep]') && !b.hasAttribute('data-keep') && !b.disabled) setOpen(false);
  };
  return (
    <div class="rel" ref={ref}>
      <button class={btnClass} title={title} aria-label={ariaLabel} aria-expanded={open} aria-haspopup="menu" disabled={disabled}
        onClick={() => { setOpen(!open); if (!open) onOpen?.(); }}>{label}</button>
      {open && <div class={`menu ${menuClass} ${right ? 'right' : ''}`} role="menu" onClick={click}>{typeof children === 'function' ? children(() => setOpen(false)) : children}</div>}
    </div>
  );
}

/** Segmented choice: one of two to six short options. */
export function Seg({ options, value, onChange, sm = false, label, disabled }) {
  return (
    <div class={`seg ${sm ? 'sm' : ''} ${disabled ? 'dis' : ''}`} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} class={o.value === value ? 'on' : ''} aria-pressed={o.value === value} title={o.title} disabled={disabled}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Tog({ on, onClick, title, children }) {
  return <button class={`tog ${on ? 'on' : ''}`} aria-pressed={!!on} title={title} onClick={onClick}>{children}</button>;
}

/** The theme switch's drawing: half disc (system), sun (light), moon (dark); 16 px, stroked at 1.4. */
export function ThemeIcon({ theme }) {
  if (theme === 'light') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
    </svg>
  );
  if (theme === 'dark') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" />
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" /><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Platform shortcut label: ⌘↵ on Apple, Ctrl+↵ elsewhere. */
/** The share of a slider's range up to its value, as the `--p` the hairline slider fills to (jig.css). */
export const pct = (v, lo, hi) => ({ '--p': `${Math.max(0, Math.min(100, ((v - lo) / ((hi - lo) || 1)) * 100))}%` });

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const RUN_KEY = isMac ? '⌘↵' : 'Ctrl+↵';
export const RUN_KEY_LONG = isMac ? '⌘ Enter' : 'Ctrl+Enter';

/** Draw-time theme colours for canvases (README: read them from getComputedStyle at draw time). */
export function themeColors(el = document.documentElement) {
  const cs = getComputedStyle(el);
  const v = n => cs.getPropertyValue(n).trim();
  return { bg: v('--bg'), ink: v('--ink'), ink2: v('--ink-2'), hair: v('--hair'), rule: v('--rule'), fill: v('--fill'), accent: v('--accent'), sel: v('--sel'), stage: v('--stage') || v('--bg') };
}
