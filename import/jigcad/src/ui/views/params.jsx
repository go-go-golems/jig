// Params: the exposed parameters as sliders (ParamRow), then every parameter with its value, expression, source
// and dependents. A change sets host.overrides and recompiles (debounced); the code keeps the defaults.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Tog, useHost } from '../common.jsx';
import { num } from '../format.js';

const defaults = new Map();   // `${preset}:${name}` → the value the code gives, seen when not overridden

// Round slider steps (1, 2 or 5 × 10ⁿ) so the code's value and the ends sit on the step grid.
const niceStep = x => {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e;
};
const snap = (x, step) => +(Math.round(x / step) * step).toFixed(6);
/** [min, max, step] for a slider. An explicit range wins; otherwise ¼× to 2½× the code's value (not the current
 *  override), so the range does not move while you drag. Counts (no unit, whole numbers) start at 1. */
function sliderRange(p, base) {
  if (p.exposed?.range) {
    const [lo, hi] = p.exposed.range;
    return [lo, hi, p.exposed.step || niceStep((hi - lo) / 200)];
  }
  const b = Math.abs(base ?? p.value ?? 1) || 1;
  const count = !p.unit && Number.isInteger(base ?? p.value);
  const step = p.exposed?.step || (count ? 1 : niceStep(b / 50));
  const lo = count ? 1 : Math.max(step, snap(b * 0.25, step));
  const hi = count ? Math.max(lo + 4, Math.ceil(b * 3)) : snap(b * 2.5, step);
  return [lo, hi, step];
}

const show = (v, unit) => (v == null ? '—' : typeof v === 'number' ? `${+(+v).toFixed(4)}${unit ? ' ' + unit : ''}` : String(v));

export function ParamsView({ host }) {
  useHost(host, ['program', 'overrides', 'preset']);
  const [filter, setFilter] = useState('');
  const [changed, setChanged] = useState(false);
  const [hl, setHl] = useState(null);
  const listRef = useRef(null);
  const program = host.program?.ok !== false ? host.program : host.lastGood;
  const params = program?.params || [];
  const pid = host.preset?.id;
  // The code's own value: not an override (the engine reports src 'compile.override' for those), or the value
  // the override shadows. Slider ranges hang off this, so they stay put while you drag (they used to be rebuilt
  // around the overridden value, which put the thumb back in the middle after every recompile).
  for (const p of params) {
    const key = `${pid}:${p.name}`;
    if (typeof p.value === 'number' && !String(p.src).includes('override')) defaults.set(key, p.value);
    else if (!defaults.has(key) && p.shadowed?.length) {
      const v = parseFloat(p.shadowed[p.shadowed.length - 1].value);
      if (Number.isFinite(v)) defaults.set(key, v);
    }
  }

  useEffect(() => {
    const apply = () => {
      const it = host.intents.params;
      if (!it || it.done) return;
      it.done = true;
      setHl(it.param);
      setFilter('');
      requestAnimationFrame(() => listRef.current?.querySelector(`[data-param="${CSS.escape(it.param)}"]`)?.scrollIntoView({ block: 'nearest' }));
    };
    apply();
    return host.on('intent', ({ view }) => view === 'params' && apply());
  }, []);

  const n = Object.keys(host.overrides).length;
  const q = filter.trim().toLowerCase();
  const keep = p => (!q || p.name.toLowerCase().includes(q) || (p.exposed?.label || '').toLowerCase().includes(q)) && (!changed || p.name in host.overrides);
  const exposed = params.filter(p => p.exposed && keep(p));
  const all = params.filter(keep);
  const valueOf = p => (p.name in host.overrides ? host.overrides[p.name] : p.value);

  return (
    <div class="tabbody col params">
      <div class="toolbar">
        <input class="filter" placeholder="filter" aria-label="Filter parameters" value={filter} onInput={e => setFilter(e.currentTarget.value)} />
        <Tog on={changed} onClick={() => setChanged(!changed)} title="Show only the parameters you changed here">Changed ({n})</Tog>
        <button class="btn sm" disabled={!n} title="Back to the values in the code" onClick={() => { host.resetOverrides(); host.toast('Back to the values in the code'); }}>Reset all</button>
        <span class="lbl">Live: a change recompiles the part. Edit the code to change a default.</span>
      </div>
      <div class="scroll paramlist" ref={listRef}>
        {!params.length ? (
          <p class="empty padded">{program ? <>This part has no parameters. Add <code>.params({'{'} w: mm(60) {'}'})</code> to it, then <code>.expose(['w'])</code> for a slider here.</> : 'Nothing compiled yet. Press Run.'}</p>
        ) : <>
          {exposed.length > 0 && <div class="psub">exposed</div>}
          {exposed.map(p => {
            const v = valueOf(p);
            const d = defaults.get(`${pid}:${p.name}`);
            const [lo, hi, step] = sliderRange(p, d);
            return (
              <div key={p.name} class={`prow ${hl === p.name ? 'hl' : ''}`} data-param={p.name}>
                <span class="pn" title={p.name}>{p.exposed.label && p.exposed.label !== p.name ? <>{p.exposed.label} <i>{p.name}</i></> : <i class="solo">{p.name}</i>}</span>
                <span class="pc"><input type="range" min={lo} max={hi} step={step} value={typeof v === 'number' ? v : p.value} aria-label={p.exposed.label || p.name}
                  onInput={e => { setHl(p.name); host.setOverride(p.name, +e.currentTarget.value); }} /></span>
                <span class="pv">{show(v, p.unit)}</span>
                <button class="tabact" disabled={!(p.name in host.overrides)} title={d != null ? `default ${show(d, p.unit)}` : 'back to the code’s value'} aria-label={`Reset ${p.name}`}
                  onClick={() => host.setOverride(p.name, null)}>{p.name in host.overrides ? '↺' : ''}</button>
              </div>
            );
          })}
          <div class="psub">every parameter</div>
          <table class="rt ptable">
            <thead><tr><th>name</th><th class="num">value</th><th>expression</th><th>source</th><th>dependents</th></tr></thead>
            <tbody>{all.map(p => (
              <tr key={p.name} class={hl === p.name ? 'sel' : ''} data-param={p.name}>
                <td class="nm"><button class="nid" onClick={() => { host.selectNode(p.name); setHl(p.name); }}>{p.name}</button></td>
                <td class="num"><ValueCell host={host} p={p} value={valueOf(p)} /></td>
                <td>{p.expr ? <code>{p.expr}</code> : <span class="dim">—</span>}</td>
                <td class={p.src === 'override' ? 'src-o' : 'dim'}>{p.src}{p.deps?.length ? <span class="dim"> · from {p.deps.join(', ')}</span> : ''}</td>
                <td>{(p.dependents || params.filter(x => x.deps?.includes(p.name)).map(x => x.name)).map(d => <button key={d} class="nid" onClick={() => setHl(d)}>{d}</button>)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!all.length && <p class="empty padded">No parameter matches.</p>}
        </>}
      </div>
    </div>
  );
}

function ValueCell({ host, p, value }) {
  const [edit, setEdit] = useState(null);
  if (p.expr && !(p.name in host.overrides) && edit == null) return <b title={`= ${p.expr}`}>{show(p.value, p.unit)}</b>;
  if (edit == null) return <button class="valbtn" title="Type a value to override it (Enter sets, Escape cancels)" onClick={() => setEdit(String(typeof value === 'number' ? num(value, 4) : value))}>{show(value, p.unit)}</button>;
  return <input class="valedit" autoFocus value={edit} aria-label={`Value of ${p.name}`} onInput={e => setEdit(e.currentTarget.value)}
    onBlur={() => setEdit(null)}
    onKeyDown={e => {
      if (e.key === 'Escape') setEdit(null);
      if (e.key === 'Enter') { const t = edit.trim(); host.setOverride(p.name, t === '' ? null : !isNaN(+t) ? +t : t); setEdit(null); }
    }} />;
}
