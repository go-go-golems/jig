// slider.jsx — a slider in the drafting-sheet idiom: a hairline rule with tick marks, a short ink bar for the
// value, a notch at the default, and a numeric readout you can type into. Shift drags finely; double-click
// the rule resets to the default; arrow keys step; the wheel nudges when focused.
import React from 'react';
const { useState, useRef, useEffect } = React;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const toT = (v, min, max, log) => log && min > 0 ? Math.log(v / min) / Math.log(max / min) : (v - min) / ((max - min) || 1);
const fromT = (t, min, max, log) => log && min > 0 ? min * Math.pow(max / min, t) : min + t * (max - min);
const nice = (v, step) => { if (step) { const k = Math.round(v / step) * step; return +k.toFixed(Math.max(0, -Math.floor(Math.log10(step)) + 1)); } const a = Math.abs(v); return +v.toPrecision(a >= 100 ? 5 : 4); };
export const fmt = (v, d?) => { if (!Number.isFinite(v)) return '—'; const a = Math.abs(v); if (d != null) return v.toFixed(d); return a >= 1000 ? Math.round(v).toLocaleString() : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(3); };

export function Slider({ value, min = 0, max = 1, step, def, log, unit, onChange, onCommit, label, disabled, ticks = 4, compact, digits, title, origin }) {
  const ref = useRef<any>(null), [edit, setEdit] = useState<any>(null), [active, setActive] = useState(false);
  const t = clamp(toT(value, min, max, log), 0, 1), td = def != null ? clamp(toT(def, min, max, log), 0, 1) : null;
  const setT = (tt, fine?) => { const v = fromT(clamp(tt, 0, 1), min, max, log); onChange(nice(v, step)); };
  const down = e => {
    if (disabled || e.button !== 0) return;
    e.preventDefault(); ref.current.focus();
    const r = ref.current.getBoundingClientRect();
    const x0 = e.clientX, t0 = t; let fine = e.shiftKey;
    const at = ev => (ev.clientX - r.left) / r.width;
    if (!fine) setT(at(e));
    setActive(true);
    const move = ev => { fine = ev.shiftKey; setT(fine ? t0 + (ev.clientX - x0) / r.width * 0.1 : at(ev), fine); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setActive(false); onCommit && onCommit(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const key = e => {
    const k = e.shiftKey ? 0.1 : 1, st = step ? step / ((max - min) || 1) : 0.01;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setT(t + st * k); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setT(t - st * k); }
    else if (e.key === 'Home') { e.preventDefault(); setT(0); } else if (e.key === 'End') { e.preventDefault(); setT(1); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && def != null) { e.preventDefault(); onChange(def); }
  };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const wheel = e => { if (document.activeElement !== el) return; e.preventDefault(); const st = step ? step / ((max - min) || 1) : 0.01; setT(t - Math.sign(e.deltaY) * st * (e.shiftKey ? 0.1 : 1)); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  });
  const commitEdit = () => { const n = parseFloat(edit); if (Number.isFinite(n)) onChange(clamp(n, Math.min(min, max), Math.max(min, max))); setEdit(null); onCommit && onCommit(); };
  const T = [...Array(ticks + 1)].map((_, i) => i / ticks);
  return <div className={'sl2' + (compact ? ' compact' : '') + (disabled ? ' dis' : '') + (active ? ' act' : '')} title={title}>
    <div ref={ref} className="rule" role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      onPointerDown={down} onKeyDown={key} onDoubleClick={() => def != null && onChange(def)}>
      <span className="base" />
      {T.map(x => <span key={x} className={'tick' + (x === 0 || x === 1 ? ' end' : '')} style={{ left: x * 100 + '%' }} />)}
      {origin != null ? (() => { const to = clamp(toT(origin, min, max, log), 0, 1); return <span className="fill" style={{ left: Math.min(t, to) * 100 + '%', width: Math.abs(t - to) * 100 + '%' }} />; })() : <span className="fill" style={{ width: t * 100 + '%' }} />}
      {td != null && <span className="def" style={{ left: td * 100 + '%' }} title={'default ' + def} />}
      <span className="thumb" style={{ left: t * 100 + '%' }} />
    </div>
    {edit != null ? <input className="num" autoFocus value={edit} onChange={e => setEdit(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEdit(null); }} />
      : <button className="num" onClick={() => !disabled && setEdit(String(value))} title="Click to type a value">{fmt(value, digits)}{unit ? <em>{unit}</em> : null}</button>}
  </div>;
}

// a colour swatch: the native picker, framed like everything else
export function Swatch({ hex, onChange, label }) {
  return <label className="swatch" title={label}>
    <span className="chip" style={{ background: hex }} />
    <code>{hex}</code>
    <input type="color" value={hex} onChange={e => onChange(e.target.value)} aria-label={label} />
  </label>;
}
