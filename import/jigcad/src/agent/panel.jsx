// The agent panel (guides/agent/components): threads, settings, off banner, log, composer.
// The shell mounts <AgentPanel host={host} /> in the Agent view. The model is the page's `sample` capability;
// its one tool is `eval` (evaltool.js); a whole turn is one sample() call (turn.js).
import { useEffect, useLayoutEffect, useReducer, useRef } from 'preact/hooks';
import css from './agent.css';
import reference from './reference.md';
import { runTurn, revertStep, newThread, load, save, trimThreads, OFF_TITLE, OFF_AT_LOAD, OFF_AT_SEND } from './turn.js';
import { highlight } from './highlight.js';
import { renderMarkdown } from './markdown.js';
import * as workbench from '../ui/markdown.js';
import { firstLine } from './prompt.js';
import { followLink } from './links.js';
import { httpSample } from '../host/sample-http.js';
import { prepareImage, imageFiles, MAX_ATTACH } from './images.js';

export { reference };

const MODES = [
  { value: 'auto', label: 'Auto', title: 'runs each step', meta: 'steps run as they come' },
  { value: 'ask', label: 'Ask', title: 'you approve each step', meta: 'you approve each step' },
  { value: 'read', label: 'Read-only', title: 'no edits', meta: 'read-only' },
];
const MODELS = [{ value: 'quick', label: 'Fast' }, { value: 'default', label: 'Balanced' }, { value: 'complex', label: 'Deep' }];
const THINKING = [{ value: '', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Med' }, { value: 'high', label: 'High' }];
export const DEFAULT_TRIES = [
  'Explain how this part is built, feature by feature, with the faces each one creates',
  'Make the walls 0.4 mm thicker and check the mass and every face that depends on them',
];
const PLACEHOLDER = 'Ask the agent: “make the walls 2.4 mm and check the mass”, “round the top edges”, “why is the sketch under-constrained?”';

// ── module state: threads, the active thread, settings (saved per browser) ────
const S = { threads: null, active: null, settings: null, busy: false, runningId: null, ctl: null, draft: '', off: null, images: [] };
const listeners = new Set();
const OPEN = new WeakSet();
const rerender = () => { for (const f of listeners) f(); };

function init() {
  if (S.threads) return;
  const th = load('agent.threads', null);
  S.threads = Array.isArray(th) && th.length ? th : [newThread()];
  const a = load('agent.thread', null);
  S.active = S.threads.some(t => t.id === a) ? a : S.threads[0].id;
  const st = load('agent.settings', null) || {};
  S.settings = {
    mode: MODES.some(m => m.value === st.mode) ? st.mode : 'auto',
    tier: MODELS.some(m => m.value === st.tier) ? st.tier : 'default',
    effort: THINKING.some(m => m.value === st.effort) ? st.effort : '',
  };
}
function persist() {
  save('agent.threads', trimThreads(S.threads));
  save('agent.thread', S.active);
  save('agent.settings', S.settings);
}
const activeThread = () => S.threads.find(t => t.id === S.active) || S.threads[0];

/** Put a question in the composer (a lab:ask link); it is never sent on its own. */
export function askAgent(q) { init(); S.draft = String(q || ''); rerender(); }

// ── the capability ────────────────────────────────────────────────────────────
let samplePromise = null;
export function getSample() {
  if (!samplePromise) samplePromise = (async () => {
    try {
      // claude.ai's runtime first; else the jigcad serve backend next to the page (Go, pi + lunaroute)
      const c = typeof window !== 'undefined' ? window.claude : null;
      if (c && typeof c.use === 'function') {
        const s = await c.use('sample');
        if (typeof s === 'function') return s;
      }
      if (typeof fetch !== 'function' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
      return await httpSample();
    } catch { return null; }
  })();
  return samplePromise;
}

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('jigcad-agent-css')) return;
  const el = document.createElement('style');
  el.id = 'jigcad-agent-css';
  el.textContent = css;
  document.head.appendChild(el);
}

function triesOf(preset) {
  // shell, round 2: the preset's agent suggestions (host.preset.agent.tries, which falls back to meta `tries`) first
  const t = preset && ((preset.agent && preset.agent.tries && preset.agent.tries.length) ? preset.agent.tries : preset.tries);
  const own = Array.isArray(t) ? t : typeof t === 'string' ? t.split('|') : [];
  const all = [...own.map(s => String(s).trim()).filter(Boolean), ...DEFAULT_TRIES];
  return [...new Set(all)].slice(0, 6);
}

// ── pieces ───────────────────────────────────────────────────────────────────
function Seg({ value, options, onChange, label }) {
  return (
    <div class="seg sm" role="group" aria-label={label}>
      {options.map(o => (
        <button class={o.value === value ? 'on' : ''} aria-pressed={o.value === value ? 'true' : 'false'} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Step({ step, onRevert, onCopy, onAnswer }) {
  const cls = 'tool' + (step.asking ? ' ask' : step.running ? ' run' : '') + (step.error && !step.asking ? ' err' : '') + (step.reverted ? ' reverted' : '');
  const ms = step.asking ? 'waiting for you' : step.running ? 'running…' : `${step.ms} ms`;
  return (
    <details class={cls} open={step.asking || OPEN.has(step)} onToggle={e => { if (e.currentTarget.open) OPEN.add(step); else OPEN.delete(step); }}>
      <summary><i class="dot" /><span class="nm">eval</span><span class="first">{firstLine(step.code)}</span><span class="ms">{ms}</span></summary>
      <div class="tb">
        <pre class="src" dangerouslySetInnerHTML={{ __html: highlight(step.code) }} />
        {step.result != null && <pre class={'res' + (step.error ? ' bad' : '')}>{step.result}</pre>}
        {step.asking && (
          <div class="row">
            <button class="btn primary sm" onClick={() => onAnswer(true)}>Run this step</button>
            <button class="btn sm" onClick={() => onAnswer(false)}>Decline</button>
          </div>
        )}
        <div class="row">
          {step.reverted ? <span class="dim">reverted</span>
            : step.changed && step.snapshot && !step.running ? <button class="link" onClick={onRevert}>revert files to before this step</button> : null}
          <button class="link" onClick={onCopy}>copy code</button>
        </div>
      </div>
    </details>
  );
}

// The answer is rendered by the workbench's own renderer (the one notes, docs and the book use); ours is the fallback.
function answerHtml(host, text) {
  try {
    const r = typeof host.renderMarkdown === 'function' ? host.renderMarkdown(text, { prefix: 'a-', toc: false })
      : typeof workbench.renderMarkdown === 'function' ? workbench.renderMarkdown(text, { prefix: 'a-', toc: false }) : null;
    const html = r && typeof r === 'object' ? r.html : r;
    if (typeof html === 'string') return html;
  } catch { /* fall back */ }
  return renderMarkdown(text);
}

function Answer({ host, text }) {
  const html = answerHtml(host, text);
  const onClick = e => {
    const a = e.target.closest && e.target.closest('a.lablink, a[data-lab]');
    if (!a) return;
    e.preventDefault();
    followLink(host, a.getAttribute('data-lab'), { ask: askAgent });
  };
  return <div class="md doc-inline" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

// The model's reasoning before a step or the answer: open and following the text while it streams, then folded to
// one line (the person can open it again).
function Thought({ thought, live }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (live && el) el.scrollTop = el.scrollHeight; });
  const words = (thought.text.match(/\S+/g) || []).length;
  return (
    <details class={'thought' + (live ? ' live' : '')} open={live || OPEN.has(thought)} onToggle={e => { if (live) return; if (e.currentTarget.open) OPEN.add(thought); else OPEN.delete(thought); }}>
      <summary><i class="dot" /><span class="nm">{live ? 'Thinking' : 'Thought'}</span><span class="ms">{words} word{words === 1 ? '' : 's'}</span></summary>
      <div class="tt" ref={ref}>{thought.text}</div>
    </details>
  );
}

function AgentTurn({ host, turn, onRevert, onCopy }) {
  const failed = !!turn.note && !turn.text;
  const steps = turn.steps || [];
  // reasoning, text and steps in the order they happened (blocks: turn.js addBlock); a turn without blocks (a
  // runtime that does not stream, a thread saved before blocks) shows its steps, then the whole answer
  const blocks = (turn.blocks || []).filter(x => x.text);
  const hasText = blocks.some(x => x.kind === 'text');
  const lastBlock = blocks[blocks.length - 1];
  const live = x => !!turn.pending && x === lastBlock && x.at === steps.length;
  const block = (x, key) => x.kind === 'thought'
    ? <Thought key={key} thought={x} live={live(x)} />
    : <Answer key={key} host={host} text={x.text} />;
  const before = i => blocks.map((x, j) => x.at === i ? block(x, 'b' + j) : null);
  const waiting = turn.pending && !(lastBlock && live(lastBlock));
  return (
    <div class={'msg agent' + (failed ? ' error' : '')}>
      <span class="who">Agent</span>
      {steps.map((s, i) => [
        before(i),
        <Step key={'s' + i} step={s} onRevert={() => onRevert(turn, i)} onCopy={() => onCopy(s.code)} onAnswer={ok => { if (s.resolve) s.resolve(ok); }} />,
      ])}
      {before(steps.length)}
      {!hasText && turn.text ? <Answer host={host} text={turn.text} /> : null}
      {waiting ? <span class="thinking">{steps.length ? 'Working' : 'Thinking'}</span> : null}
      {turn.note ? <span class="note">{turn.note}</span> : null}
    </div>
  );
}

// ── the panel ────────────────────────────────────────────────────────────────
export function AgentPanel({ host, sample: sampleProp }) {
  init();
  ensureCss();
  const [, force] = useReducer(x => x + 1, 0);
  const logRef = useRef(null);
  const fileRef = useRef(null);         // the hidden file input of the Image… button
  const sampleRef = useRef(undefined);   // undefined: not known yet; null: unavailable; function: Claude
  const re = () => force();

  useEffect(() => {
    listeners.add(re);
    const offs = [];
    if (host && typeof host.on === 'function') for (const ev of ['preset', 'ask', 'fragments']) {
      const u = host.on(ev, ev === 'ask' ? q => askAgent(q) : re);
      if (typeof u === 'function') offs.push(u);
    }
    let live = true;
    const p = sampleProp !== undefined ? Promise.resolve(sampleProp) : getSample();
    p.then(s => {
      if (!live) return;
      sampleRef.current = typeof s === 'function' ? s : null;
      if (!sampleRef.current) S.off = OFF_AT_LOAD;
      else if (S.off === OFF_AT_LOAD) S.off = null;
      re();
    });
    return () => { live = false; listeners.delete(re); offs.forEach(f => f()); };
  }, [host, sampleProp]);

  useLayoutEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; });

  const th = activeThread();
  const unavailable = sampleRef.current === null || !!S.off;
  const mode = MODES.find(m => m.value === S.settings.mode) || MODES[0];
  const brief = (host && host.preset && host.preset.agent) || { fragments: {} };
  const frNames = Object.keys(brief.fragments || {});
  const backend = sampleRef.current && sampleRef.current.info;   // set by the jigcad serve adapter only
  const tierModel = backend && backend.tiers ? backend.tiers[S.settings.tier || 'default'] || '' : '';

  async function send(text) {
    text = String(text ?? S.draft).trim();
    if (!text || S.busy) return;
    const sample = sampleRef.current === undefined ? await (sampleProp !== undefined ? Promise.resolve(sampleProp) : getSample()) : sampleRef.current;
    if (typeof sample !== 'function') { S.off = OFF_AT_SEND; re(); return; }
    const thread = activeThread();
    const ctl = new AbortController();
    const images = S.images.map(({ mimeType, data }) => ({ mimeType, data }));
    S.busy = true; S.runningId = thread.id; S.ctl = ctl; S.draft = ''; S.images = [];
    persist(); rerender();
    try {
      // shell, round 2: the Reference as the workbench shows it (the language reference, then this lab API)
      const ref = (host && typeof host.reference === 'function' && host.reference()) || reference;
      const r = await runTurn({ host, sample, thread, text, images, settings: S.settings, reference: ref, signal: ctl.signal, onUpdate: rerender });
      if (r.off) S.off = r.off;
    } finally {
      S.busy = false; S.runningId = null; S.ctl = null;
      persist(); rerender();
    }
  }
  const stop = () => { if (S.ctl) S.ctl.abort(); };
  const setSetting = (k, v) => { S.settings = { ...S.settings, [k]: v }; persist(); rerender(); };
  const selectThread = id => { S.active = id; persist(); rerender(); };
  const addThread = () => { if (S.busy) return; const t = newThread(); S.threads.push(t); S.active = t.id; persist(); rerender(); };
  const closeThread = id => {
    if (S.busy && S.runningId === id) return;
    const i = S.threads.findIndex(t => t.id === id);
    if (i < 0) return;
    S.threads.splice(i, 1);
    if (!S.threads.length) S.threads.push(newThread());
    if (S.active === id) S.active = S.threads[Math.min(i, S.threads.length - 1)].id;
    persist(); rerender();
  };
  const onRevert = async (turn, i) => { await revertStep(host, turn, i); persist(); rerender(); };
  const onCopy = code => {
    const done = () => host.toast && host.toast('Copied');
    const fail = () => host.toast && host.toast('Copying is not allowed here', 'error');
    try { navigator.clipboard.writeText(code).then(done, fail); } catch { fail(); }
  };
  // JIG-006: pasted or attached images go with the next message (at most MAX_ATTACH, re-encoded as JPEG)
  async function attach(files) {
    for (const f of files) {
      if (S.images.length >= MAX_ATTACH) { host.toast && host.toast(`At most ${MAX_ATTACH} images per message`, 'error'); break; }
      try { S.images.push(await prepareImage(f)); } catch { host.toast && host.toast('That image could not be read', 'error'); }
    }
    rerender();
  }
  const onPaste = e => { const fs = imageFiles(e.clipboardData && e.clipboardData.items); if (fs.length) { e.preventDefault(); attach(fs); } };
  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  };

  return (
    <div class="tabbody col agent-panel">
      <div class="threads">
        {S.threads.map(t => (
          <span class={'th' + (t.id === th.id ? ' on' : '')} key={t.id}>
            <button onClick={() => selectThread(t.id)} title={t.title}>{t.title}</button>
            <button class="x" aria-label="close thread" disabled={S.busy && S.runningId === t.id} onClick={() => closeThread(t.id)}>×</button>
          </span>
        ))}
        <button class="new" disabled={S.busy} onClick={addThread}>+ New</button>
      </div>
      <div class="agent-set">
        <span class="ctl-l">Mode</span>
        <Seg label="Mode" value={S.settings.mode} options={MODES} onChange={v => setSetting('mode', v)} />
        <span class="ctl-l">Model</span>
        <Seg label="Model" value={S.settings.tier} options={MODELS} onChange={v => setSetting('tier', v)} />
        {tierModel ? <span class="ctl-l agent-model" title="The model this tier uses on the jigcad serve backend">{tierModel}</span> : null}
        <span class="ctl-l">Thinking</span>
        <Seg label="Thinking" value={S.settings.effort} options={THINKING} onChange={v => setSetting('effort', v)} />
      </div>
      {S.off ? <div class="agent-off" role="status"><b>{OFF_TITLE}</b>{S.off}</div> : null}
      <div class="agent-log" ref={logRef}>
        {th.turns.length === 0 ? (
          <div class="agent-empty">
            <p>Ask for a change and the agent edits the script, recompiles, and checks the part with numbers. It works through one tool, <b>eval</b>, with the same API you see in the Reference.</p>
            {brief.role || brief.prompt ? <p>{brief.role ? `For ${host.preset.id} it works as ${brief.role.replace(/[.\s]+$/, '')}. ` : ''}{brief.prompt ? <>Its brief: {brief.prompt}</> : null}</p> : null}
            <div class="sugg">
              {triesOf(host && host.preset).map(s => <button disabled={S.busy || unavailable} onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        ) : th.turns.map((t, i) => t.role === 'user'
          ? <div class="msg user" key={i}><span class="who">You</span><div class="body">{t.text}{t.images ? <span class="imgs"> · {t.images} image{t.images > 1 ? 's' : ''}</span> : null}</div></div>
          : <AgentTurn key={i} host={host} turn={t} onRevert={onRevert} onCopy={onCopy} />)}
      </div>
      {frNames.length ? (
        // shell, round 2: the preset's agent fragments (meta.json agent.fragments), on or off per preset; the ones on
        // travel in the context block of every turn
        <div class="agent-frags" role="group" aria-label="Rules sent with every message">
          <span class="ctl-l">Rules</span>
          {frNames.map(k => {
            const on = !!(host.fragments && host.fragments.has(k));
            return <button key={k} class={'tog' + (on ? ' on' : '')} aria-pressed={on ? 'true' : 'false'} title={`${on ? 'Sent' : 'Not sent'} with each message: ${brief.fragments[k]}`}
              onClick={() => host.setFragment && host.setFragment(k)}>{k}</button>;
          })}
        </div>
      ) : null}
      <div class="composer">
        <textarea placeholder={PLACEHOLDER} aria-label="Message to the agent" value={S.draft}
          onInput={e => { S.draft = e.currentTarget.value; rerender(); }} onKeyDown={onKey} onPaste={onPaste} />
        {S.images.length ? (
          <div class="thumbs">
            {S.images.map((im, i) => (
              <span class="thumb" key={i}><img src={im.url} alt={`attached image ${i + 1}, ${im.width} × ${im.height}`} />
                <button class="x" aria-label={`Remove image ${i + 1}`} onClick={() => { S.images.splice(i, 1); rerender(); }}>×</button></span>
            ))}
          </div>
        ) : null}
        <div class="row">
          <button class="btn" title="Attach images (or paste them into the message)" disabled={S.busy || S.images.length >= MAX_ATTACH}
            onClick={() => fileRef.current && fileRef.current.click()}>Image…</button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={e => { const fs = [...(e.currentTarget.files || [])]; e.currentTarget.value = ''; attach(fs); }} />
          <span class="meta">Enter sends · Shift+Enter for a new line · {mode.meta}</span>
          {S.busy
            ? <button class="btn danger" onClick={stop}>Stop</button>
            : <button class="btn primary" disabled={!S.draft.trim() || unavailable} onClick={() => send()}>Send</button>}
        </div>
      </div>
    </div>
  );
}

export default AgentPanel;
