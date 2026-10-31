// IR: the compiled program as text, one level at a time (L0 source … L6 products), in the code face; ids of
// features, params and faces are .nid buttons; a node filter asks the engine for ir(level, { node }).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Seg, useHost } from '../common.jsx';
import { plural } from '../format.js';

const LEVELS = [
  ['L0', 'source', 'What was asked, and by whom?'],
  ['L1', 'feature graph', 'What operations, on what references, in what order, with what stable ids?'],
  ['L2', 'resolved', 'What is every parameter and fit value, and why?'],
  ['L3', 'solved sketches', 'Is each sketch fully constrained? Which constraints conflict?'],
  ['L4', 'topology', 'What solid did each feature produce, and where did each face come from?'],
  ['L5', 'world', 'Where is every part, and how is it oriented on which plate?'],
  ['L6', 'products', 'What goes to the printer?'],
];
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function IRView({ host }) {
  useHost(host, ['program', 'node', 'selection']);
  const [level, setLevel] = useState('L1');
  const [filter, setFilter] = useState('');
  const [remote, setRemote] = useState(null);     // { key, text } from host.call('ir', level, { node })
  const program = host.program?.ok !== false ? host.program : host.lastGood;
  const full = program?.ir?.[level] ?? '';

  useEffect(() => {
    const apply = () => { const it = host.intents.ir; if (it && !it.done) { it.done = true; if (it.find) setFilter(it.find); if (it.level) setLevel(it.level); } };
    apply();
    return host.on('intent', ({ view }) => view === 'ir' && apply());
  }, []);
  useEffect(() => {
    const q = filter.trim();
    setRemote(null);
    if (!q || !program) return;
    let alive = true;
    const t = setTimeout(() => host.call('ir', level, { node: q }).then(text => alive && typeof text === 'string' && setRemote({ key: level + q, text }), () => {}), 180);
    return () => { alive = false; clearTimeout(t); };
  }, [filter, level, program?.hash]);

  const ids = useMemo(() => {
    const set = new Set();
    for (const n of program?.graph?.nodes || []) set.add(n.id);
    for (const b of program?.bodies || []) for (const f of b.faces || []) set.add(f.name);
    return [...set].filter(s => s && s.length > 1).sort((a, b) => b.length - a.length);
  }, [program]);
  const idRe = useMemo(() => (ids.length ? new RegExp(`(?<![\\w/.\\[])(${ids.map(reEsc).join('|')})(?![\\w\\[])`, 'g') : null), [ids]);
  const q = filter.trim();
  const text = remote?.key === level + q ? remote.text : full;
  const all = text.split('\n');
  const lines = q && !(remote?.key === level + q) ? all.filter(l => l.startsWith('#') || l.toLowerCase().includes(q.toLowerCase())) : all;
  const faceNames = new Set((program?.bodies || []).flatMap(b => (b.faces || []).map(f => f.name)));
  const pickId = id => { if (faceNames.has(id)) { host.select({ name: id }); host.focus('stage'); } else { host.selectNode(id); } };
  const sel = host.node || host.selection?.name;
  const info = LEVELS.find(l => l[0] === level);

  const renderLine = (l, i) => {
    if (l.startsWith('#')) return <div key={i} class="cm">{l}</div>;
    const parts = [];
    let last = 0, m;
    if (idRe) {
      idRe.lastIndex = 0;
      while ((m = idRe.exec(l))) {
        if (m.index > last) parts.push(l.slice(last, m.index));
        const id = m[1];
        parts.push(<button key={m.index} class={`nid ${id === sel ? 'on' : ''}`} onClick={() => pickId(id)}>{id}</button>);
        last = m.index + id.length;
      }
    }
    parts.push(l.slice(last));
    const hl = sel && l.includes(sel);
    return <div key={i} class={hl ? 'hl' : ''}>{parts}</div>;
  };

  return (
    <div class="tabbody col irview">
      <div class="toolbar">
        <Seg sm label="IR level" value={level} onChange={setLevel} options={LEVELS.map(([v, name]) => ({ value: v, label: v, title: `${v} ${name}` }))} />
        <input class="filter" placeholder="filter by node, e.g. shell" aria-label="Filter the IR by node" value={filter} onInput={e => setFilter(e.currentTarget.value)} />
        <span class="lbl">{info[0]} {info[1]}: {info[2]}{q ? ` · ${plural(lines.filter(l => !l.startsWith('#')).length, 'line')} with ${q}` : ''}</span>
      </div>
      <div class="scroll">
        {!program ? <p class="empty padded">Nothing compiled yet. Press Run to see the program at each level.</p>
          : !full ? <p class="empty padded">The engine wrote no {info[0]} text for this program.</p>
            : <pre class="irtext">{lines.map(renderLine)}</pre>}
      </div>
    </div>
  );
}
