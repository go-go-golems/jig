// A thread as a Markdown transcript, for the panel's Download button: the person's messages, and for each agent
// turn its reasoning, text and steps (code and result) in the order they happened (turn.blocks, see turn.js
// addBlock). A turn without blocks (a runtime that does not stream, a thread saved before blocks) gives its steps,
// then its whole answer. Results of a reloaded thread are the stored ones (cut at RESULT_STORED characters).

const fence = (text, lang = '') => {
  const s = String(text ?? '');
  const ticks = '`'.repeat(Math.max(3, ...(s.match(/`+/g) || []).map(m => m.length + 1)));
  return `${ticks}${lang}\n${s}${s.endsWith('\n') ? '' : '\n'}${ticks}`;
};
const quote = text => String(text).split('\n').map(l => (l ? '> ' + l : '>')).join('\n');

function stepMd(s, i) {
  const tags = [s.error ? 'error' : '', s.changed ? 'changed files' : '', s.reverted ? 'reverted' : '', s.ms != null ? `${s.ms} ms` : '']
    .filter(Boolean).join(' · ');
  const out = [`**Step ${i + 1}**${tags ? ` (${tags})` : ''}`, '', fence(s.code, 'js')];
  if (s.result != null) out.push('', fence(s.result));
  return out.join('\n');
}

function agentMd(t) {
  const steps = t.steps || [];
  const blocks = (t.blocks || []).filter(b => b.text);
  const out = [];
  const before = i => {
    for (const b of blocks) if (b.at === i) out.push(b.kind === 'thought' ? `*Thinking*\n\n${quote(b.text)}` : b.text);
  };
  steps.forEach((s, i) => { before(i); out.push(stepMd(s, i)); });
  before(steps.length);
  if (!blocks.some(b => b.kind === 'text') && t.text) out.push(t.text);
  if (t.note) out.push(`*${t.note}*`);
  return out.join('\n\n');
}

/**
 * threadMarkdown(thread, { preset, settings, date }) → string
 * preset: { id, title }; settings: the panel's { mode, tier, effort }; date: a Date (default now).
 */
export function threadMarkdown(thread, meta = {}) {
  const date = meta.date || new Date();
  const head = [`# ${thread.title || 'Agent thread'}`, ''];
  const facts = [];
  if (meta.preset) facts.push(`Preset: ${[meta.preset.id, meta.preset.title].filter(Boolean).join(' · ')}`);
  const st = meta.settings || {};
  const set = [st.mode && `mode ${st.mode}`, st.tier && `tier ${st.tier}`, st.effort && `thinking ${st.effort}`].filter(Boolean).join(', ');
  if (set) facts.push(`Settings: ${set}`);
  const models = [...new Set((thread.turns || []).map(t => t.model).filter(Boolean))];
  if (models.length) facts.push(`Model: ${models.join(', ')}`);
  facts.push(`Downloaded: ${date.toISOString()}`);
  head.push(...facts.map(f => `- ${f}`), '');
  const body = (thread.turns || []).map(t => t.role === 'user'
    ? `## You\n\n${t.text}${t.images ? `\n\n*(${t.images} image${t.images === 1 ? '' : 's'} attached)*` : ''}`
    : `## Agent${t.model ? ` (${t.model})` : ''}\n\n${agentMd(t)}`);
  return head.join('\n') + '\n' + body.join('\n\n') + '\n';
}

/** A file name for the thread: jigcad-<preset>-<title>-<yyyy-mm-dd>.md */
export function transcriptFilename(thread, preset, date = new Date()) {
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return ['jigcad', slug(preset && preset.id), slug(thread.title) || 'thread', date.toISOString().slice(0, 10)].filter(Boolean).join('-') + '.md';
}
