// Numbers as the workbench writes them: a unit after a space, tabular, "—" when missing (ui-copy.md, Numbers).
export const DASH = '—';

export function num(v, digits = 2) {
  if (v == null || Number.isNaN(+v)) return DASH;
  const r = +(+v).toFixed(digits);
  return Math.abs(r) >= 10000 ? r.toLocaleString('en-GB', { maximumFractionDigits: digits }) : String(r);
}

/** A quantity in the unit people read: mm³ above 1,000 becomes cm³, g stays g, angles in degrees. */
export function qty(value, unit = '', digits) {
  if (value == null) return DASH;
  if (Array.isArray(value)) return value.map(v => num(v, digits ?? 1)).join(' × ') + (unit ? ` ${unit}` : '');
  if (typeof value !== 'number') return String(value) + (unit ? ` ${unit}` : '');
  if (unit === 'count' || unit === 'ratio' && Math.abs(value) > 1) unit = '';
  if (unit === 'mm³' && Math.abs(value) >= 1000) return `${num(value / 1000, digits ?? 1)} cm³`;
  if (unit === 'mm²' && Math.abs(value) >= 10000) return `${num(value / 100, digits ?? 1)} cm²`;
  if (unit === 'g') return `${num(value, digits ?? (Math.abs(value) < 10 ? 1 : 0))} g`;
  if (unit === 'min' && value >= 90) return `${Math.floor(value / 60)} h ${Math.round(value % 60)} min`;
  if (unit === 'rad') return `${num(value * 180 / Math.PI, digits ?? 1)}°`;
  if (unit === 'deg' || unit === '°') return `${num(value, digits ?? 1)}°`;
  return unit ? `${num(value, digits ?? 2)} ${unit}` : num(value, digits ?? 2);
}

export const metric = m => (m == null ? DASH : typeof m === 'object' && 'value' in m ? qty(m.value, m.unit) : String(m));
export const ms = v => (v == null ? DASH : `${num(v, v < 10 ? 2 : 1)} ms`);
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const vec = (v, digits = 2) => (Array.isArray(v) ? v.map(x => num(x, digits)).join(' · ') : DASH);

/** An engine message without the place it already carries at its end ("… (script.js:3:7)"): the UI shows the place itself. */
export const bare = m => String(m ?? '').replace(/\s*\((?:[\w./-]+\.js):\d+(?::\d+)?\)\s*$/, '');
