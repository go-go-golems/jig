// Trace: what the last compile did, pass by pass (pass, level, ms, cached), and the decisions it took by default.
import { useState } from 'preact/hooks';
import { Tog, useHost } from '../common.jsx';
import { num, plural } from '../format.js';

export function TraceView({ host }) {
  useHost(host, ['program', 'node']);
  const [cached, setCached] = useState(true);
  const program = host.program;
  const trace = program?.trace || [], decisions = program?.decisions || [];
  const total = trace.reduce((a, t) => a + (+t.ms || 0), 0);
  const hits = trace.filter(t => t.cached).length;
  const rows = cached ? trace : trace.filter(t => !t.cached);
  const max = Math.max(1e-9, ...trace.map(t => +t.ms || 0));
  const nodeOf = pass => String(pass).split(':')[1];
  const sel = host.node;

  return (
    <div class="tabbody col traceview">
      <div class="toolbar">
        <Tog on={cached} onClick={() => setCached(!cached)} title="Show the passes the cache answered">Cached ({hits})</Tog>
        <span class="lbl">{program ? `${program.ok === false ? 'Failed' : 'Compiled'} in ${num(program.ms ?? total, 1)} ms · ${plural(trace.length, 'pass', 'passes')}, ${hits} cached${trace.length ? ` · cache hit rate ${Math.round(100 * hits / trace.length)} %` : ''}. A pass is cached when its inputs hash the same as last time.` : 'The trace of the last compile.'}</span>
      </div>
      <div class="scroll">
        {!program ? <p class="empty padded">Nothing compiled yet. Press Run: every pass of the compile is listed here with its time.</p> : <>
          {program.ok === false && <p class="fail padded"><b>{program.diagnostics[0]?.file || 'script.js'}{program.diagnostics[0]?.line ? ':' + program.diagnostics[0].line : ''} does not compile:</b> {program.diagnostics[0]?.message}</p>}
          <div class="block">
            <header><h2>Passes</h2><span class="sub">{num(total, 1)} ms in all</span></header>
            {rows.length ? (
              <table class="rt">
                <thead><tr><th>pass</th><th>level</th><th>note</th><th class="num">ms</th><th class="sharecol">share</th><th>cache</th></tr></thead>
                <tbody>{rows.map((t, i) => {
                  const id = nodeOf(t.pass);
                  return (
                    <tr key={i} class={`${t.cached ? 'dimrow' : ''} ${id ? 'clickable' : ''} ${id && id === sel ? 'sel' : ''}`} onClick={() => id && host.selectNode(id)}>
                      <td class="code-cell">{t.pass}</td><td>{t.level}</td><td class="dim">{t.note || ''}</td>
                      <td class="num">{num(t.ms, 2)}</td>
                      <td class="sharecol"><span class="meter cellmeter"><i style={{ width: `${Math.max(1, 100 * (+t.ms || 0) / max)}%` }} /></span></td>
                      <td>{t.cached ? 'cached' : 'computed'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            ) : <p class="empty">{trace.length ? 'Every pass was cached.' : 'The engine reported no passes.'}</p>}
          </div>
          <div class="block">
            <header><h2>Decisions</h2><span class="sub">{decisions.length ? 'defaults the compiler chose, with its reason' : 'none'}</span></header>
            {decisions.length ? (
              <table class="rt">
                <thead><tr><th>at</th><th>kind</th><th>chose</th><th>instead of</th><th class="reason">reason</th></tr></thead>
                <tbody>{decisions.map((d, i) => (
                  <tr key={i} class={`clickable ${d.at === sel ? 'sel' : ''}`} onClick={() => host.selectNode(d.at)}>
                    <td class="code-cell">{d.at}</td><td>{d.kind}</td><td class="nm">{String(d.chose)}</td>
                    <td class="dim">{(d.alternatives || []).join(', ') || '—'}</td><td class="reason">{d.reason}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p class="empty">No decisions: every choice was written in the code.</p>}
          </div>
        </>}
      </div>
    </div>
  );
}
