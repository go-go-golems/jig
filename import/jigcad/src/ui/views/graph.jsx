// Graph: the feature DAG of program.graph drawn as the GraphDiagram: one column per level (the longest path from
// an input), nodes as 168 × 40 text boxes, hairline edges with arrowheads, the selected node and its edges in accent.
import { openSketch } from './stage.jsx';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Tog, useHost } from '../common.jsx';
import { ms as fmtMs, plural } from '../format.js';

const BW = 168, BH = 40, CX = 232, RY = 54, X0 = 16, Y0 = 34;
const CLASS = { param: 'signals', sketch: 'watch', part: 'group', assembly: 'group', print: 'group', design: 'group', body: 'group' };

/** Lay the graph out by level. Node ids may repeat across kinds (a sketch and its extrude both called `back`), so
 *  nodes get unique keys and an edge end that names a shared id picks the sketch as a source of a profile and the
 *  feature otherwise. */
export function layoutGraph(graph, showParams = true) {
  const all = (graph?.nodes || []).map((n, i) => ({ ...n, key: n.id }));
  const count = new Map();
  for (const n of all) count.set(n.id, (count.get(n.id) || 0) + 1);
  for (const n of all) if (count.get(n.id) > 1) n.key = `${n.kind}:${n.id}`;
  const nodes = all.filter(n => showParams || n.kind !== 'param');
  const byId = id => nodes.filter(n => n.id === id);
  const end = (id, role, kind) => {
    const c = byId(id);
    if (c.length < 2) return c[0]?.key;
    const sketchy = role === 'from' && (kind === 'profile' || kind === 'sketch' || kind === 'plane');
    return (c.find(n => (n.kind === 'sketch') === sketchy) || c[0]).key;
  };
  const edges = (graph?.edges || []).map(e => ({ ...e, a: end(e.from, 'from', e.kind), b: end(e.to, 'to', e.kind) })).filter(e => e.a && e.b && e.a !== e.b);
  const level = new Map();
  const lv = (key, seen = new Set()) => {
    if (level.has(key)) return level.get(key);
    if (seen.has(key)) return 0;
    seen.add(key);
    const ps = edges.filter(e => e.b === key).map(e => e.a);
    const l = ps.length ? 1 + Math.max(...ps.map(p => lv(p, seen))) : 0;
    level.set(key, l);
    return l;
  };
  nodes.forEach(n => lv(n.key));
  const cols = [];
  for (const n of nodes) (cols[level.get(n.key)] ||= []).push(n);
  const pos = new Map();
  cols.forEach((col, c) => (col || []).forEach((n, r) => pos.set(n.key, { x: X0 + c * CX, y: Y0 + r * RY, n })));
  const heads = cols.map((col, c) => {
    const kinds = [...new Set((col || []).map(n => n.kind))];
    return `${c + 1}. ${kinds.slice(0, 3).join(' · ')}${kinds.length > 3 ? ' …' : ''}`;
  });
  const W = X0 + Math.max(1, cols.length) * CX - (CX - BW) + 16, H = Y0 + Math.max(1, ...cols.map(c => c?.length || 0)) * RY + 8;
  return { nodes, edges, pos, heads, W, H };
}

export function GraphView({ host }) {
  useHost(host, ['program', 'node']);
  const [params, setParams] = useState(true);
  const program = host.program?.ok !== false ? host.program : host.lastGood;
  const L = useMemo(() => layoutGraph(program?.graph, params), [program, params]);
  const sel = host.node;
  const failed = host.program?.ok === false;

  return (
    <div class="tabbody col graphview">
      <div class="toolbar">
        <Tog on={params} onClick={() => setParams(!params)} title="Show the parameters as inputs of the graph">Params</Tog>
        <span class="lbl">Features by level: each column is one step further from the inputs; edges carry a profile, a body or a value. {failed ? 'Showing the last good compile.' : ''}</span>
      </div>
      <div class="page">
        <div class="diagram graphscroll" onClick={e => { if (!e.target.closest('.node')) host.selectNode(null); }}>
          {!L.nodes.length ? <p class="empty padded">{program ? 'This program has no feature graph.' : 'Nothing compiled yet. Press Run to see the features and what feeds them.'}</p> : (
            <svg class="graph" width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} role="img" aria-label="Feature graph">
              <defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="ahead" /></marker>
                <marker id="ahs" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="ahead-sel" /></marker></defs>
              {L.heads.map((h, c) => <text key={c} class="colhd" x={X0 + c * CX} y="18">{h}</text>)}
              {L.edges.map((e, i) => {
                const a = L.pos.get(e.a), b = L.pos.get(e.b);
                const x1 = a.x + BW, y1 = a.y + BH / 2, x2 = b.x, y2 = b.y + BH / 2, mx = (x1 + x2) / 2;
                const on = sel && (e.from === sel || e.to === sel);
                return (
                  <g key={i} class={`edge ${on ? 'sel' : ''} ${e.kind === 'expr' ? 'dash' : ''}`} onClick={ev => { ev.stopPropagation(); host.selectNode(e.from === sel ? e.to : e.from); }}>
                    <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} marker-end={on ? 'url(#ahs)' : 'url(#ah)'} />
                    <title>{`${e.from} → ${e.to}\n${e.kind || ''}`}</title>
                    {on && e.kind && <g class="elabel"><text x={mx} y={(y1 + y2) / 2 - 4}>{e.kind}</text></g>}
                  </g>
                );
              })}
              {[...L.pos.values()].map(({ x, y, n }) => {
                const cls = CLASS[n.kind] || 'system', bad = failed && program?.diagnostics?.some(d => d.level === 'error' && d.at === n.id);
                return (
                  <g key={n.key} class={`node ${cls} ${sel === n.id ? 'sel' : ''} ${bad ? 'bad' : ''}`} transform={`translate(${x},${y})`} tabindex="0" role="button"
                    aria-label={`${n.id}, ${n.kind}`} onClick={ev => { ev.stopPropagation(); host.selectNode(n.id); }} onKeyDown={ev => ev.key === 'Enter' && host.selectNode(n.id)}>
                    <rect width={BW} height={BH} rx={cls === 'signals' ? 10 : 0} />
                    {cls === 'watch' && <path class="corner" d={`M${BW - 10},1 L${BW - 1},1 L${BW - 1},10`} />}
                    <text class="nl" x="8" y="16">{clip(n.id, 22)}</text>
                    <text class="ns" x="8" y="31">{clip(n.label && n.label !== n.id ? n.label.replace(`${n.id} · `, '') : n.kind, 26)} · {n.level || n.kind}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        <NodeInspector host={host} program={program} id={sel} />
      </div>
    </div>
  );
}
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

function NodeInspector({ host, program, id }) {
  const [info, setInfo] = useState(null);
  const node = program?.graph?.nodes?.find(n => n.id === id);
  useEffect(() => {
    setInfo(null);
    if (!node || node.kind === 'param') return;
    let alive = true;
    host.call('feature', id).then(v => alive && setInfo(v), () => {});
    return () => { alive = false; };
  }, [id, program?.hash]);
  if (!node) return (
    <aside class="side" aria-label="Inspector">
      <div class="block"><header><h2>Node</h2><span class="sub">none</span></header>
        <p class="empty">Select a node in the graph, a glyph in the code gutter, or follow a <code>lab:select</code> link.</p></div>
      {program && <div class="block"><header><h2>Graph</h2><span class="sub">{plural(program.graph?.nodes?.length || 0, 'node')}</span></header>
        <dl class="kv">{Object.entries(countKinds(program.graph)).map(([k, n]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{n}</dd>])}</dl></div>}
    </aside>
  );
  const ins = program.graph.edges.filter(e => e.to === id), outs = program.graph.edges.filter(e => e.from === id);
  const decisions = (program.decisions || []).filter(d => d.at === id);
  const passes = (program.trace || []).filter(t => t.pass === id || t.pass.endsWith(':' + id));
  const param = program.params?.find(p => p.name === id);
  const extra = info && typeof info === 'object' ? Object.entries(info).filter(([k, v]) => !['id', 'kind', 'label', 'level', 'decisions', 'trace', 'line'].includes(k) && (typeof v !== 'object' || v === null)) : [];
  return (
    <aside class="side" aria-label="Inspector">
      <div class="block">
        <header><h2>{node.id}</h2><span class="sub">{node.kind} · {node.level || '—'}</span></header>
        {node.label && node.label !== node.id && <p class="note">{node.label}</p>}
        <div class="actions-row">
          <button class="link strong" onClick={() => host.link(node.line ? `lab:open?file=script.js&line=${node.line}` : `lab:open?file=script.js&find=${encodeURIComponent(`'${id}'`)}`)}>{node.line ? `script.js:${node.line}` : 'find in script.js'}</button>
          <button class="link" onClick={() => host.focus('ir', { find: id })}>in the IR</button>
          {node.kind === 'sketch' && (program.sketches || []).some(x => x.id === id) && <button class="link" onClick={() => openSketch(host, id)}>draw on the stage</button>}
          {param && <button class="link" onClick={() => host.focus('params', { param: id })}>open in Params</button>}
        </div>
      </div>
      <div class="block"><header><h2>Inputs</h2><span class="sub">{ins.length}</span></header>
        {ins.length ? <div class="refs">{ins.map((e, i) => <button key={i} class="nid" onClick={() => host.selectNode(e.from)}>{e.from}{e.kind ? ` (${e.kind})` : ''}</button>)}</div> : <p class="empty">None: an input of the program.</p>}
      </div>
      <div class="block"><header><h2>Outputs</h2><span class="sub">{outs.length}</span></header>
        {outs.length ? <div class="refs">{outs.map((e, i) => <button key={i} class="nid" onClick={() => host.selectNode(e.to)}>{e.to}{e.kind ? ` (${e.kind})` : ''}</button>)}</div> : <p class="empty">None: nothing reads it.</p>}
      </div>
      {param && <div class="block"><header><h2>Value</h2><span class="sub">{param.src}</span></header>
        <dl class="kv"><dt>value</dt><dd>{param.text}</dd>{param.expr && <><dt>expression</dt><dd><code>{param.expr}</code></dd></>}</dl></div>}
      {decisions.length > 0 && <div class="block"><header><h2>Decisions</h2><span class="sub">{decisions.length}</span></header>
        {decisions.map((d, i) => <p key={i} class="note"><b class="ink">{d.kind} → {String(d.chose)}</b> {d.reason}{d.alternatives?.length ? ` (not ${d.alternatives.join(', ')})` : ''}</p>)}</div>}
      {(passes.length > 0 || extra.length > 0) && <div class="block"><header><h2>Compile</h2><span class="sub">{passes.length ? plural(passes.length, 'pass', 'passes') : 'feature()'}</span></header>
        <dl class="kv">
          {passes.map((t, i) => [<dt key={i}>{t.pass}</dt>, <dd key={i + 'v'}>{t.cached ? 'cached' : fmtMs(t.ms)}</dd>])}
          {extra.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{String(v)}</dd>])}
        </dl></div>}
    </aside>
  );
}
function countKinds(graph) {
  const out = {};
  for (const n of graph?.nodes || []) out[n.kind] = (out[n.kind] || 0) + 1;
  return out;
}
