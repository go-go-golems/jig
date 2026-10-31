// The shelf of presets, as the header's preset menu and the Presets view show it: groups in the shelf's order,
// presets by `order` then id, a filter over id, title, about, group and difficulty; and the thumbnails' compiles
// (one at a time, only while the open preset is not compiling, cached in memory by id and files hash).
import { qty, DASH } from './format.js';

export const GROUP_ORDER = ['Foundations', 'First prints', 'Around the house', 'Desk and storage', 'Workshop and repair', 'Electronics', 'Mechanisms', 'Calibration', 'Design process'];
const LETTER = { A: 'Foundations', E: 'Design process', S: 'First prints', H: 'Around the house', D: 'Desk and storage', W: 'Workshop and repair', X: 'Electronics', M: 'Mechanisms', C: 'Calibration', Z: 'Scratch', U: 'Yours' };
export const groupOf = p => p.group || LETTER[String(p.id)[0]] || 'Presets';
export const DIFFICULTY_ORDER = ['first print', 'easy', 'medium', 'advanced'];

export function matches(p, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [p.id, p.title, p.about, groupOf(p), p.difficulty].filter(Boolean).join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}

/** [{ title, items }] in the shelf's order; groups not in GROUP_ORDER (Scratch, Yours, new ones) follow, A–Z. */
export function shelf(list, q = '') {
  const by = new Map();
  for (const p of list) if (matches(p, q)) { const g = groupOf(p); if (!by.has(g)) by.set(g, []); by.get(g).push(p); }
  const rank = g => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? GROUP_ORDER.length + (g === 'Scratch' || g === 'Yours' ? 1 : 0) : i; };
  const num = p => (Number.isFinite(p.order) ? p.order : 9999);
  return [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([title, items]) => ({ title, items: items.sort((a, b) => num(a) - num(b) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true })) }));
}

/** The key metrics of a compiled preset: size, print time, filament (or the part's mass when it is not a print job). */
export function keyMetrics(program) {
  const m = program?.metrics || {};
  const bbox = m.bbox?.value;
  const size = Array.isArray(bbox) ? `${bbox.map(v => +(+v).toFixed(v < 10 ? 1 : 0)).join(' × ')} mm` : DASH;
  const time = m.printTime ? qty(m.printTime.value, 'min', 0) : DASH;
  const fil = m.filamentMass ? `${qty(m.filamentMass.value, 'g')}${m.filament ? ` · ${qty(m.filament.value, 'm', 1)}` : ''}` : m.mass ? `${qty(m.mass.value, 'g')} solid` : DASH;
  return { size, time, filament: fil };
}

// ---- thumbnails: compile a preset's files as a what-if (keep: false, the files alone) and keep what drawing needs
const FNV = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
export const filesHash = files => FNV(Object.keys(files || {}).sort().map(k => `${k}\u0000${files[k]}`).join('\u0001'));

const cache = new Map();          // `${id}:${hash}` → { status: 'queued' | 'compiling' | 'ok' | 'failed', program, error, ms }
const subs = new Map();           // key → Set(fn)
let queue = [], running = false;

const lite = p => ({
  ok: p.ok, kind: p.kind, name: p.name, hash: p.hash, metrics: p.metrics, summary: p.summary, print: p.print ? { ...p.print, layers: null } : null,
  bodies: p.bodies, sketches: p.kind === 'sketch' ? p.sketches : [], diagnostics: (p.diagnostics || []).filter(d => d.level === 'error').slice(0, 3),
});
const notify = key => { for (const fn of subs.get(key) || []) try { fn(cache.get(key)); } catch (e) { console.error(e); } };

export function thumbState(key) { return cache.get(key) || null; }
export function watchThumb(key, fn) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => subs.get(key)?.delete(fn);
}
/** Ask for a thumbnail's program; it compiles when its turn comes. Returns the key. */
export function requestThumb(host, id, files) {
  const key = `${id}:${filesHash(files)}`;
  if (cache.has(key)) return key;
  // the open preset as published, without overrides, is already compiled: its program is the thumbnail's
  const p = host.program;
  if (host.preset?.id === id && p && p.ok !== false && !host.compiling && !host.isEdited() && !Object.keys(host.overrides || {}).length) {
    cache.set(key, { status: 'ok', program: lite(p), ms: 0 });
    notify(key);
    return key;
  }
  cache.set(key, { status: 'queued' });
  queue.push({ key, id, files, host });
  notify(key);
  pump();
  return key;
}
/** Drop a queued (not yet compiling) thumbnail: it scrolled out of view before its turn. */
export function cancelThumb(key) {
  const i = queue.findIndex(j => j.key === key);
  if (i < 0) return;
  queue.splice(i, 1);
  if (cache.get(key)?.status === 'queued') cache.delete(key);
}
async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue[0];
      // the open preset's compile goes first: wait while it runs
      while (job.host.compiling) await new Promise(r => setTimeout(r, 120));
      if (queue[0] !== job) continue;             // cancelled while waiting
      queue.shift();
      cache.set(job.key, { status: 'compiling' });
      notify(job.key);
      const t0 = performance.now();
      let program = null;
      try { program = await job.host.check(job.files, { keep: false, merge: false }); } catch (e) { program = { ok: false, diagnostics: [{ level: 'error', message: e.message || String(e) }] }; }
      const ms = performance.now() - t0;
      const failed = !program || program.ok === false;
      const err = failed ? ((program?.diagnostics || []).find(d => d.level === 'error') || program?.error || {}) : null;
      cache.set(job.key, failed ? { status: 'failed', error: err, ms, program: program && (program.bodies || []).length ? lite(program) : null } : { status: 'ok', program: lite(program), ms });
      notify(job.key);
    }
  } finally {
    running = false;
  }
}
