// Experiments: a design search defined by the preset, run headless in the worker (`run` op), shown as a ranked
// table and a scatter (ExperimentRow, Table). Clicking a row loads that point as param overrides.
// Sources: a `search.js` file (an async function body with j, compile, files and the units in scope, returning
// { name?, objective?, rows: [{ params: {…}, metrics: {…}, feasible? }] } or the rows alone), or a script that
// returns j.design(…), searched with j.search.lhs(design, { budget: 16, seed: 1 }).
import { useEffect, useRef, useState } from 'preact/hooks';
import { useHost } from '../common.jsx';
import { num, plural } from '../format.js';

const results = new Map();          // preset id → { name, rows, objective, ms, at }
const val = v => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const unitOf = v => (v && typeof v === 'object' && v.unit) || '';

export function normaliseRows(value, paramNames = []) {
  const raw = Array.isArray(value) ? value : value?.rows || value?.table || value?.results || [];
  return raw.map((r, i) => {
    if (r && (r.params || r.metrics || r.point)) return { i, rank: r.rank, params: r.params || r.point || {}, metrics: r.metrics || {}, feasible: r.feasible !== false && r.feasible !== 'no' };
    const params = {}, metrics = {};
    for (const [k, v] of Object.entries(r || {})) {
      if (['rank', 'feasible'].includes(k)) continue;
      (paramNames.includes(k) ? params : metrics)[k] = v;
    }
    return { i, rank: r?.rank, params, metrics, feasible: r?.feasible !== false && r?.feasible !== 'no' };
  });
}
function objectiveOf(o) {
  if (!o) return null;
  if (typeof o === 'string') return { dir: 'min', key: o };
  if (o.minimize || o.minimise || o.min) return { dir: 'min', key: o.minimize || o.minimise || o.min, require: o.require };
  if (o.maximize || o.maximise || o.max) return { dir: 'max', key: o.maximize || o.maximise || o.max, require: o.require };
  return null;
}
function rank(rows, obj) {
  if (rows.some(r => r.rank != null)) return [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  if (!obj) return rows;
  const s = obj.dir === 'max' ? -1 : 1;
  return [...rows].sort((a, b) => (b.feasible - a.feasible) || s * ((+val(a.metrics[obj.key]) || 0) - (+val(b.metrics[obj.key]) || 0)));
}

export function ExperimentsView({ host }) {
  useHost(host, ['program', 'files', 'preset', 'overrides']);
  const pid = host.preset?.id;
  const [state, setState] = useState(() => results.get(pid) || null);
  const [running, setRunning] = useState(null);
  const [error, setError] = useState(null);
  const [axes, setAxes] = useState({ x: null, y: null });
  const [picked, setPicked] = useState(null);
  const current = useRef(null);
  useEffect(() => { setState(results.get(pid) || null); setError(null); setPicked(null); }, [pid]);

  const program = host.program?.ok !== false ? host.program : host.lastGood;
  const searchJs = host.files.get('search.js');
  const exps = [];
  if (searchJs != null) exps.push({ id: 'search.js', name: (/^\/\/\s*(.+)$/m.exec(searchJs)?.[1] || 'Search').replace(/[.:]\s*$/, ''), source: 'search.js' });
  if (program?.kind === 'design') exps.push({ id: 'design', name: `Search the design space of ${program.name || 'the script'}`, source: 'script.js' });

  const run = async (x) => {
    const token = { t0: performance.now() };
    current.current = token;
    setRunning({ id: x.id });
    setError(null);
    try {
      // `files` is put in scope by a wrapper (one line above the file's first, taken off error lines)
      const files = Object.fromEntries(host.files);
      let code = `return await (async (files) => {\n${searchJs}\n})(${JSON.stringify(files)});`;
      if (x.id === 'design') {
        code = `const design = await (async () => {\n${host.files.get('script.js')}\n})();\nconst r = await j.search.lhs(design, { budget: 16, seed: 1 });\nreturn r && (r.rows || r.table || r);`;
      }
      const value = await host.run(code);
      if (current.current !== token) return;            // stopped, or another run started
      const rows = normaliseRows(value, (program?.params || []).map(p => p.name));
      if (!rows.length) throw new Error(`${x.source} returned no rows: return { rows: [{ params, metrics }] }`);
      const res = { name: value?.name || x.name, objective: value?.objective || null, rows, ms: performance.now() - token.t0, at: Date.now(), source: x.source };
      results.set(pid, res);
      setState(res);
      setPicked(null);
    } catch (e) {
      if (current.current === token) setError({ source: x.source, message: (e?.message || String(e)).replace(/ \(run\.js:\d+(:\d+)?\)$/, ''), line: e?.line ? Math.max(1, e.line - 1) : undefined });
    } finally {
      if (current.current === token) { current.current = null; setRunning(null); }
    }
  };
  useEffect(() => {
    const apply = () => { const it = host.intents.experiments; if (it && !it.done && exps.length) { it.done = true; run(exps[0]); } };
    apply();
    return host.on('intent', ({ view }) => view === 'experiments' && apply());
  }, [exps.length]);

  const load = (r, rank) => {
    setPicked(r.i);
    const names = new Set((program?.params || []).map(p => p.name));
    const entries = Object.entries(r.params).filter(([k]) => names.has(k) || !program);
    for (const [k, v] of entries) host.overrides[k] = val(v);
    host.overrides = { ...host.overrides };
    host.emit('overrides', host.overrides);
    host.compile();
    host.toast(`Loaded ${rank ? `rank ${rank}` : `run ${r.i + 1}`}: ${entries.map(([k, v]) => `${k} ${num(val(v), 3)}`).join(' · ') || 'no params of this part'}`);
  };

  const obj = objectiveOf(state?.objective);
  const rows = state ? rank(state.rows, obj) : [];
  const pkeys = [...new Set(rows.flatMap(r => Object.keys(r.params)))], mkeys = [...new Set(rows.flatMap(r => Object.keys(r.metrics)))];
  const units = k => unitOf(rows.find(r => r.metrics[k] != null)?.metrics[k]) || program?.params?.find(p => p.name === k)?.unit || program?.metrics?.[k]?.unit || '';
  const xk = axes.x && pkeys.concat(mkeys).includes(axes.x) ? axes.x : pkeys[0];
  const yk = axes.y && pkeys.concat(mkeys).includes(axes.y) ? axes.y : obj?.key || mkeys[0];
  const feasible = rows.filter(r => r.feasible).length;
  const get = (r, k) => +val(k in r.params ? r.params[k] : r.metrics[k]);

  return (
    <div class="tabbody col experiments">
      <div class="toolbar"><span class="lbl">Searches run headless in the engine, each point a fresh compile. They come from <button class="link" onClick={() => host.focus('code', { file: 'search.js' })}>search.js</button> or a script that returns <code>j.design(…)</code>.</span></div>
      <div class="scroll">
        {!exps.length ? <p class="empty padded">This preset has no search. Add <code>search.js</code> returning <code>{'{'} rows: [{'{'} params, metrics {'}'}] {'}'}</code>, or return <code>j.design(…)</code> from <code>script.js</code>.</p> : <>
          <div class="explist">
            {exps.map(x => (
              <div key={x.id} class={`exprow ${state?.source === x.source ? 'on' : ''}`}>
                <button class="linkhd" onClick={() => host.focus('code', { file: x.source })}><b>{x.name}</b></button>
                <span class="sub">{x.source}{state?.source === x.source ? ` · ${plural(state.rows.length, 'run')} · last run ${num(state.ms / 1000, 2)} s` : ''}</span>
                <span class="sp" />
                {running?.id === x.id ? <><span class="busy-sq" aria-label="running" /><span class="sub">running</span><button class="btn sm" title="Stop waiting; the worker finishes the run and its result is dropped" onClick={() => { current.current = null; setRunning(null); }}>Stop</button></>
                  : <button class="btn sm primary" disabled={!!running} onClick={() => run(x)}>Run</button>}
              </div>
            ))}
          </div>
          {error && <p class="fail padded"><b>{error.source}{error.line ? `:${error.line}` : ''} stopped:</b> {error.message}. Fix it and press Run.</p>}
          {state && <>
            <div class="reshd"><b>{state.name}</b><span class="sub">{plural(rows.length, 'run')} · {feasible} feasible{obj ? ` · ranked by ${obj.dir === 'max' ? 'largest' : 'smallest'} ${obj.key}${obj.require ? `, requiring ${obj.require}` : ''}` : ''}</span></div>
            <div class="expres">
              <div class="toolbar">
                <span class="lbl">x</span><select aria-label="x" value={xk} onChange={e => setAxes({ ...axes, x: e.currentTarget.value })}>{pkeys.concat(mkeys).map(k => <option key={k}>{k}</option>)}</select>
                <span class="lbl">y</span><select aria-label="y" value={yk} onChange={e => setAxes({ ...axes, y: e.currentTarget.value })}>{pkeys.concat(mkeys).map(k => <option key={k}>{k}</option>)}</select>
                <span class="lbl">circle: feasible · grey square: not feasible</span>
              </div>
              <Scatter rows={rows} x={xk} y={yk} get={get} picked={picked} onPick={load} unit={units} />
              <div class="tablewrap-x">
                <table class="rt">
                  <thead><tr><th>rank</th>{pkeys.map(k => <th key={k} class="num">{k}{units(k) ? ` (${units(k)})` : ''}</th>)}{mkeys.map(k => <th key={k} class="num">{k}{units(k) ? ` (${units(k)})` : ''}</th>)}<th>feasible</th></tr></thead>
                  <tbody>{rows.map((r, k) => (
                    <tr key={r.i} class={`clickable ${r.feasible ? '' : 'dimrow'} ${picked === r.i ? 'sel' : ''}`} onClick={() => load(r, r.rank ?? k + 1)} title="Load this point as overrides">
                      <td>{r.rank ?? k + 1}</td>
                      {pkeys.map(p => <td key={p} class="num">{num(val(r.params[p]), 3)}</td>)}
                      {mkeys.map(m => <td key={m} class="num">{typeof val(r.metrics[m]) === 'number' ? num(val(r.metrics[m]), 3) : String(val(r.metrics[m]) ?? '—')}</td>)}
                      <td>{r.feasible ? 'yes' : 'no'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>}
          {!state && !error && !running && <p class="empty padded">Not run yet. Press Run: the table ranks every point, and a click loads one.</p>}
        </>}
      </div>
    </div>
  );
}

function ticks(lo, hi, n = 5) {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function Scatter({ rows, x, y, get, picked, onPick, unit }) {
  if (!x || !y || !rows.length) return null;
  const W = 520, H = 260, L = 48, R = 508, T = 12, B = 223;
  const xs = rows.map(r => get(r, x)).filter(Number.isFinite), ys = rows.map(r => get(r, y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return <p class="empty">{x} or {y} has no numbers to plot.</p>;
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const py = (y1 - y0) * 0.08; y0 -= py; y1 += py;
  const X = v => L + (v - x0) / (x1 - x0) * (R - L), Y = v => B - (v - y0) / (y1 - y0) * (B - T);
  return (
    <svg class="roof scatter" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${y} against ${x}`}>
      {ticks(y0, y1).map(t => <g key={'y' + t}><line class="gl" x1={L} x2={R} y1={Y(t)} y2={Y(t)} /><text class="ax" x={L - 6} y={Y(t) + 3} text-anchor="end">{num(t, 3)}</text></g>)}
      {ticks(x0, x1).map(t => <text key={'x' + t} class="ax" x={X(t)} y="240" text-anchor="middle">{num(t, 3)}</text>)}
      <text class="ax" x={(L + R) / 2} y="256" text-anchor="middle">{x}{unit(x) ? ` (${unit(x)})` : ''}</text>
      <text class="ax" x="12" y="10" text-anchor="start">{y}{unit(y) ? ` (${unit(y)})` : ''}</text>
      <g class="series s0">{rows.filter(r => r.feasible).map(r => (
        <g key={r.i} class={`pt ${picked === r.i ? 'on' : ''}`} onClick={() => onPick(r)}><circle cx={X(get(r, x))} cy={Y(get(r, y))} r="3.6" /><title>{`run ${r.i + 1}\n${x} ${num(get(r, x), 3)}\n${y} ${num(get(r, y), 3)}`}</title></g>
      ))}</g>
      <g class="series s1">{rows.filter(r => !r.feasible).map(r => (
        <g key={r.i} class={`pt ${picked === r.i ? 'on' : ''}`} onClick={() => onPick(r)}><rect x={X(get(r, x)) - 3.2} y={Y(get(r, y)) - 3.2} width="6.4" height="6.4" /><title>{`run ${r.i + 1} (not feasible)\n${x} ${num(get(r, x), 3)}\n${y} ${num(get(r, y), 3)}`}</title></g>
      ))}</g>
    </svg>
  );
}
