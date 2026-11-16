// Mechanism: what the solver found for an assembly (assembly spec v0.1). Mobility by rank beside the Kutzbach count,
// each joint with its solved value (a slider sets it as an override, which drives it), the conflicting set when the
// joints cannot hold, the free motions, the reports, and one plot per study measure with its extremes, its events and
// a cursor at the drive's current value. A click on a plot moves the drive there.
import { useState } from 'preact/hooks';
import { useHost } from '../common.jsx';
import { num } from '../format.js';
import { endFromSelection, jointCode, insertJoint, nextJointId, JOINT_KINDS } from '../joint-insert.js';

const fmt = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : +v.toFixed(d) + '');
const unitText = (u) => (u === '°' ? 'deg' : u || '');

export function MechanismView({ host }) {
  useHost(host, ['program', 'overrides', 'selection']);
  // a compile that fails on the joints (a conflict) still carries its assembly, and the conflict is what to show;
  // the last good program only stands in when the compile failed before an assembly was solved
  const program = host.program?.ok !== false || host.program?.assembly ? host.program : host.lastGood ?? host.program;
  const A = program?.assembly;
  if (!A) {
    return (
      <div class="tabbody col mechview">
        <p class="empty padded">{program ? <>This is a {program.kind}, not an assembly. Return <code>j.assembly(name)</code> with joints between ports to see its mobility, drives and studies here.</> : 'Nothing compiled yet. Press Run.'}</p>
      </div>
    );
  }
  const M = A.mobility || {};
  const conflicts = new Set(A.conflicts || []), redundant = new Set(M.redundantJoints || []);
  const status = !A.assembled ? 'conflict' : M.left > 0 ? `${M.left} free` : M.drives ? 'determinate' : 'placed';
  const pill = (label, value, bad) => <span class={`pill ${bad ? 'bad' : ''}`}><span>{label}</span><b>{value}</b></span>;
  const asmDiags = (program.diagnostics || []).filter((d) => /^(asm|joint)\./.test(d.kind));
  const setJoint = (j, v) => host.setOverride(j.id, v == null ? null : `${v} ${j.unit === 'mm' ? 'mm' : 'deg'}`);

  return (
    <div class="tabbody col mechview">
      <div class="toolbar mechpills">
        {pill('M', A.assembled ? M.dof : '—', !A.assembled)}
        {pill('Kutzbach', M.kutzbach)}
        {pill('rank J', A.assembled ? `${M.rank} / ${M.coords}` : `— / ${M.coords}`)}
        {pill('redundant', A.assembled ? M.redundant : '—')}
        {M.drives ? pill('drives', M.drives) : null}
        {pill('', status, !A.assembled)}
      </div>
      <div class="scroll">
        {asmDiags.length > 0 && (
          <div class="block">
            <header><h2>Diagnostics</h2><span class="sub">what the joints say</span></header>
            {asmDiags.map((d, i) => <p key={i} class={d.level === 'error' ? 'fail' : 'dim'}><b>{d.kind}</b> {d.message}{d.fix ? <> · <i>{d.fix}</i></> : null}</p>)}
          </div>
        )}
        <div class="block">
          <header><h2>Joints</h2><span class="sub">{(A.joints || []).length} joints; a value set here drives its joint (an override named by the joint's id)</span></header>
          <table class="rt">
            <thead><tr><th>joint</th><th>kind</th><th>ports</th><th class="num">eq.</th><th class="num">value</th><th>set</th><th></th></tr></thead>
            <tbody>{(A.joints || []).map((j) => {
              const has = j.value != null && j.unit, angular = j.unit === '°';
              const [lo, hi] = j.limits ? j.limits.map((x) => (angular ? x * 180 / Math.PI : x)) : angular ? [-180, 180] : [-100, 100];
              const over = j.id in host.overrides;
              return (
                <tr key={j.id} class={conflicts.has(j.id) ? 'failrow' : ''}>
                  <td class="code-cell">{j.id}{redundant.has(j.id) ? <span class="dim" title="takes part in a redundancy: its axis must stay exactly aligned"> ·r</span> : null}</td>
                  <td>{j.kind}</td>
                  <td class="dim">{j.a} → {j.b}</td>
                  <td class="num">{j.equations}</td>
                  <td class="num">{has ? `${fmt(j.value, angular ? 2 : 3)} ${j.unit}` : '—'}{j.slide != null ? <span class="dim">{` · slide ${fmt(j.slide, 3)} mm`}</span> : null}{j.driven ? <span class="dim"> driven</span> : null}{j.limits ? <span class="dim" title="limits">{` [${j.limits.map((x) => fmt(angular ? x * 180 / Math.PI : x, 1)).join(', ')}]`}</span> : null}</td>
                  <td>{has ? <input type="range" min={lo} max={hi} step={angular ? 1 : 0.5} value={j.value} aria-label={`Value of ${j.id}`} onInput={(e) => setJoint(j, +e.currentTarget.value)} /> : null}</td>
                  <td><button class="tabact" disabled={!over} title="back to the code's value" aria-label={`Reset ${j.id}`} onClick={() => setJoint(j, null)}>{over ? '↺' : ''}</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <PickJoint host={host} program={program} />
        {(A.couples || []).length > 0 && (
          <div class="block">
            <header><h2>Couplings</h2><span class="sub">one equation each: value(b) = ratio · value(a) + offset; for gears the ratio comes from the teeth and its sign from the axes</span></header>
            <table class="rt">
              <thead><tr><th>coupling</th><th>kind</th><th>equation</th></tr></thead>
              <tbody>{A.couples.map((c) => {
                const ja = (A.joints || []).find((j) => j.id === c.a), jb = (A.joints || []).find((j) => j.id === c.b);
                const ru = jb?.unit === 'mm' && ja?.unit !== 'mm' ? ' mm/rad' : '', off = jb?.unit === 'mm' ? `${fmt(c.offset, 3)} mm` : `${fmt(c.offset * 180 / Math.PI, 3)}°`;
                return <tr key={c.id}><td class="code-cell">{c.id}</td><td>{c.kind}</td><td class="code-cell">{c.b} = {fmt(c.ratio, 6)}{ru} · {c.a}{c.offset ? ` + ${off}` : ''}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {(A.reports || []).length > 0 && (
          <div class="block">
            <header><h2>Reports</h2><span class="sub">numbers computed from the studies</span></header>
            <table class="rt"><tbody>{A.reports.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td class="num">{r.error ? <span class="fail">{r.error}</span> : typeof r.value === 'number' ? `${num(r.value, r.digits ?? 3)} ${r.unit || ''}` : String(r.value)}</td></tr>
            ))}</tbody></table>
          </div>
        )}
        {Object.values(A.studies || {}).map((st) => <StudyBlock key={st.name} st={st} A={A} host={host} />)}
        {M.free?.length > 0 && (
          <div class="block">
            <header><h2>Free motions</h2><span class="sub">the null space of the joint equations: one twist (ω, v) per moving component</span></header>
            <table class="rt">
              <thead><tr><th>#</th><th>component</th><th>ω (rad)</th><th>v (mm, at the component origin)</th></tr></thead>
              <tbody>{M.free.flatMap((tw, k) => tw.filter((t) => Math.hypot(...t.w, ...t.v) > 1e-6).map((t, i) => (
                <tr key={`${k}-${i}`}><td>{i ? '' : k + 1}</td><td>{t.body}</td><td class="code-cell">{t.w.map((x) => fmt(x, 3)).join(', ')}</td><td class="code-cell">{t.v.map((x) => fmt(x, 3)).join(', ')}</td></tr>
              )))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StudyBlock({ st, A, host }) {
  const keys = (st.keys || []).filter((k) => st.rows.some((r) => typeof r[k] === 'number'));
  const drive = (A.joints || []).find((j) => j.id === st.drive);
  const cursor = drive?.value;
  const W = 560, H = 96, x0 = 44, x1 = W - 10;
  const X = (x) => x0 + (x - st.from) / ((st.to - st.from) || 1) * (x1 - x0);
  const go = (e) => {
    if (!drive) return;
    const b = e.currentTarget.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * W;
    const v = st.from + (x - x0) / (x1 - x0) * (st.to - st.from);
    host.setOverride(drive.id, `${+v.toFixed(st.unit === '°' ? 1 : 3)} ${unitText(st.unit)}`);
  };
  return (
    <div class="block">
      <header><h2>Study {st.name}</h2><span class="sub">{st.drive} from {fmt(st.from, 1)} to {fmt(st.to, 1)}{st.unit}, {st.rows.length} poses{st.gaps?.length ? `, ${st.gaps.length} unreachable` : ''}{st.limited?.length ? `, ${st.limited.length} past a limit` : ''}{st.events?.length ? `, ${st.events.length} event(s)` : ''}</span></header>
      {keys.map((k) => {
        const ok = st.rows.filter((r) => r.ok && typeof r[k] === 'number');
        let lo = Math.min(...ok.map((r) => r[k])), hi = Math.max(...ok.map((r) => r[k]));
        if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
        const Y = (v) => H - 16 - (v - lo) / (hi - lo) * (H - 28);
        // join the numbers across poses that were not sampled; break at an unreachable pose or a reading out of reach (null)
        let last = -1;
        const path = st.rows.map((r, i) => {
          if (!(r.ok && typeof r[k] === 'number')) { if (!r.ok || r[k] === null) last = -1; return ''; }
          const cmd = last >= 0 ? 'L' : 'M'; last = i;
          return `${cmd}${X(r.x).toFixed(1)} ${Y(r[k]).toFixed(1)}`;
        }).join('');
        const e = st.extrema?.[k];
        const pair = (st.clearance || []).find((c) => c.key === k || c.volumeKey === k);
        const step = (x1 - x0) / Math.max(1, st.rows.length - 1) * (pair?.every || 1);
        return (
          <svg key={k} class="studyplot" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${k} against ${st.drive}`} onClick={go}>
            <rect x={x0} y={12} width={x1 - x0} height={H - 28} fill="none" stroke="var(--rule, #ccc)" />
            {(st.gaps || []).map((g, i) => <rect key={i} x={X(g) - (x1 - x0) / st.rows.length / 2} y={12} width={(x1 - x0) / st.rows.length} height={H - 28} fill="var(--accent)" opacity="0.12" />)}
            {(st.limited || []).map((l, i) => <rect key={`l${i}`} x={X(l.at) - (x1 - x0) / st.rows.length / 2} y={12} width={(x1 - x0) / st.rows.length} height={H - 28} fill="var(--ink-2, #666)" opacity="0.10"><title>{`${l.ids} past its limit at ${fmt(l.at, 1)}${st.unit}`}</title></rect>)}
            {(pair?.overlaps || []).map(([a, b], i) => <rect key={`o${i}`} x={Math.max(x0, X(a) - step / 2)} y={12} width={Math.min(x1, X(b) + step / 2) - Math.max(x0, X(a) - step / 2)} height={H - 28} fill="var(--accent)" opacity="0.16"><title>{`${pair.a} and ${pair.b} overlap from ${fmt(a, 1)} to ${fmt(b, 1)}${st.unit}`}</title></rect>)}
            {(st.events || []).map((ev, i) => <line key={i} x1={X(ev.at)} x2={X(ev.at)} y1={12} y2={H - 16} stroke="var(--accent)" stroke-width="1"><title>{`${ev.name} ${ev.rising ? '↑' : '↓'} at ${fmt(ev.at, 3)}${st.unit}`}</title></line>)}
            <path d={path} fill="none" stroke="var(--ink)" stroke-width="1.4" />
            {e && <><circle cx={X(e.min.at)} cy={Y(e.min.value)} r="2.6" fill="var(--ink)" /><circle cx={X(e.max.at)} cy={Y(e.max.value)} r="2.6" fill="var(--ink)" /></>}
            {cursor != null && <line x1={X(cursor)} x2={X(cursor)} y1={10} y2={H - 14} stroke="var(--accent)" stroke-width="1.6" />}
            <text x={x0 + 4} y={24} font-size="11" font-weight="600" fill="var(--ink)">{k}</text>
            {e && <text x={x1 - 4} y={24} font-size="10.5" text-anchor="end" fill="var(--ink-2, #666)">{`min ${fmt(e.min.value)} at ${fmt(e.min.at, 1)}${st.unit} · max ${fmt(e.max.value)} at ${fmt(e.max.at, 1)}${st.unit}`}</text>}
            <text x={x0 - 4} y={16} font-size="10" text-anchor="end" fill="var(--ink-2, #666)">{fmt(hi, 2)}</text>
            <text x={x0 - 4} y={H - 16} font-size="10" text-anchor="end" fill="var(--ink-2, #666)">{fmt(lo, 2)}</text>
            <text x={x0} y={H - 3} font-size="10" fill="var(--ink-2, #666)">{fmt(st.from, 1)}{st.unit}</text>
            <text x={x1} y={H - 3} font-size="10" text-anchor="end" fill="var(--ink-2, #666)">{fmt(st.to, 1)}{st.unit}</text>
          </svg>
        );
      })}
      {st.clearance?.length > 0 && (
        <table class="rt">
          <thead><tr><th>pair</th><th>closest</th><th>at</th><th>overlap</th><th>worst</th></tr></thead>
          <tbody>{st.clearance.map((c) => (
            <tr key={c.key} class={c.overlaps.length ? 'failrow' : ''}>
              <td>{c.a} – {c.b}</td>
              <td class="num">{c.min ? `${fmt(c.min.value, 3)} mm` : `≥ ${fmt(c.within, 1)} mm`}</td>
              <td class="num">{c.min ? `${fmt(c.min.at, 1)}${st.unit}` : ''}</td>
              <td>{c.overlaps.length ? c.overlaps.map(([a, b]) => (a === b ? `${fmt(a, 1)}${st.unit}` : `${fmt(a, 1)}–${fmt(b, 1)}${st.unit}`)).join(', ') : 'none'}</td>
              <td class="num">{c.worst ? `${fmt(c.worst.volume, 2)} mm³ at ${fmt(c.worst.at, 1)}${st.unit}` : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

// a joint from two picks on the sheet: select a face or an edge, set it as an end, pick the kind, insert the line
function PickJoint({ host, program }) {
  const [ends, setEnds] = useState({ a: null, b: null });
  const [kind, setKind] = useState('revolute');
  const [asBuilt, setAsBuilt] = useState(false);
  const [note, setNote] = useState('');
  const cur = endFromSelection(host.selection, program);
  const id = nextJointId(program);
  const line = ends.a && ends.b ? jointCode({ id, kind, a: ends.a, b: ends.b, asBuilt }) : null;
  const use = (side) => { setEnds({ ...ends, [side]: cur }); setNote(''); };
  const insert = () => {
    const src = host.files.get('script.js') ?? '';
    const out = insertJoint(src, line);
    if (out == null) { setNote('no .joint( or .add( call in script.js to put it after: copy the line instead'); return; }
    host.setFile('script.js', out); setEnds({ a: null, b: null }); setNote(`inserted ${id}; compiling`);
    if (host.scheduleCompile) host.scheduleCompile(0); else host.compile?.();     // as Run would
  };
  const copy = () => { try { navigator.clipboard.writeText(line); setNote('copied'); } catch { setNote('the clipboard is not available here'); } };
  const endRow = (side, label) => (
    <tr key={side}><td>{label}</td><td class="code-cell">{ends[side] ? `${ends[side].comp} · ${ends[side].name}` : <span class="dim">—</span>}</td>
      <td><button class="tabact" disabled={!cur} title={cur ? `use ${cur.comp} · ${cur.name}` : 'select a face or an edge of a component on the sheet first'} onClick={() => use(side)}>use selection</button></td></tr>
  );
  return (
    <div class="block">
      <header><h2>Joint from the sheet</h2><span class="sub">select a face or an edge on the sheet (a bore or a pin gives its axis, a circular edge its centre, a planar face its centre and normal) and set it as an end</span></header>
      <table class="rt"><tbody>{endRow('a', 'end a')}{endRow('b', 'end b')}</tbody></table>
      <p class="mechpills">
        <label>kind <select value={kind} onChange={(e) => setKind(e.currentTarget.value)}>{JOINT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <label title="keep both components where their `at` puts them: the joint frame is read from end a"><input type="checkbox" checked={asBuilt} onChange={(e) => setAsBuilt(e.currentTarget.checked)} /> as built</label>
      </p>
      {line && <pre class="code-cell pickline">{line}</pre>}
      <p class="mechpills">
        <button class="tabact" disabled={!line} onClick={insert}>insert into script.js</button>
        <button class="tabact" disabled={!line} onClick={copy}>copy</button>
        {note && <span class="dim">{note}</span>}
      </p>
    </div>
  );
}
