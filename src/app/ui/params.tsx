// params.jsx — every param the scene declares, as a control: sliders with units for numbers, swatches for
// colours, toggles for switches, segments for choices. Dynamic params write a uniform; static ones rebuild.
import React from 'react';
const { useState } = React;
import { useHost, useFocus, Seg, Tog } from './common';
import { Slider, Swatch } from './slider';

const hexOf = v => '#' + v.map(c => Math.round(Math.max(0, Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)) * 255).toString(16).padStart(2, '0')).join('');

export function ParamControl({ h, host }) {
  const v = h.value;
  if (h.kind === 'color') return <Swatch hex={hexOf(v)} label={h.label} onChange={x => h.set(x)} />;
  if (h.kind === 'bool') return <Tog on={!!v} onClick={() => h.set(!v)}>{v ? 'on' : 'off'}</Tog>;
  // a few short choices as a segmented control; many (or long) ones as a menu
  if (h.kind === 'choice') return h.options.length > 4 || h.options.join('').length > 40
    ? <select className="prm-select" value={v} onChange={e => h.set(e.target.value)} aria-label={h.label}>{h.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
    : <Seg small value={v} options={h.options} onChange={x => h.set(x)} label={h.label} />;
  const disp = h.disp(v), lo = h.disp(h.min), hi = h.disp(h.max), def = h.disp(h.default);
  return <Slider value={disp} min={lo} max={hi} def={def} step={h.step ? h.disp(h.step) : (h.int ? 1 : null)} log={h.scale === 'log'} unit={h.unit} label={h.label}
    onChange={x => h.set(h.undisp(x))} digits={h.int ? 0 : undefined} />;
}

export function ParamsView({ host }) {
  useHost(host, 8);
  const [q, setQ] = useState(''), [changed, setChanged] = useState(false), [flash, setFlash] = useState(null);
  useFocus(host, 'params', r => { if (r.id) { setFlash(r.id); setTimeout(() => setFlash(null), 1600); } });
  const all = host.params();
  const list = all.filter(h => (!q || (h.id + ' ' + h.label + ' ' + h.about).toLowerCase().includes(q.toLowerCase())) && (!changed || h.isChanged()));
  const groups = []; for (const h of list) { const g = h.group || (h.isStatic ? 'Static — rebuilds the kernel' : 'Live'); let x = groups.find(y => y.name === g); if (!x) groups.push(x = { name: g, items: [] }); x.items.push(h); }
  const nChanged = all.filter(h => h.isChanged()).length;
  return <div className="tabbody col paramsview">
    <div className="toolbar">
      <input className="filter" placeholder="filter params" value={q} onChange={e => setQ(e.target.value)} />
      <Tog on={changed} onClick={() => setChanged(!changed)}>Changed <span className="dim">{nChanged}</span></Tog>
      <span className="sp" />
      {nChanged > 0 && <button className="btn sm" onClick={() => { for (const h of all) if (h.isChanged()) h.reset(); }}>Reset all</button>}
    </div>
    <div className="scroll">
      {!all.length && <div className="empty padded"><p>This scene declares no params.</p><p className="note">Add some in scene.js: <code>const P = params(&#123; gloss: param.float(0.6).range(0, 1) &#125;)</code> and use <code>P.gloss</code> wherever a value goes — <code>.roughness(P.gloss.map(g =&gt; 1 - g))</code>. Each becomes a slider here.</p></div>}
      {groups.map(g => <section key={g.name} className="pgroup">
        <h3>{g.name}</h3>
        {g.items.map(h => <div key={h.id} className={'prm' + (h.isChanged() ? ' changed' : '') + (flash === h.id ? ' flash' : '')}>
          <div className="prm-h">
            <label title={h.about || h.id}>{h.label}</label>
            <code className="pid">{h.id}</code>
            {h.isStatic && <span className="tag" title="a specialisation constant: changing it rebuilds the kernel (cached by source)">static</span>}
            <span className="sp" />
            {h.isChanged() && <button className="link" onClick={() => h.reset()} title={'back to ' + h.display()}>reset</button>}
          </div>
          <ParamControl h={h} host={host} />
          {h.about && <p className="note">{h.about}</p>}
        </div>)}
      </section>)}
    </div>
    <div className="ed-foot"><span>Live params are uniforms: moving one rewrites a buffer and restarts the accumulation. Static ones re-run the build; their kernels are cached.</span></div>
  </div>;
}
