// The thread → Markdown transcript of the panel's Download button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threadMarkdown, transcriptFilename } from '../../src/agent/transcript.js';

const date = new Date('2026-11-01T12:00:00Z');
const thread = {
  title: 'Make the walls 2.4 mm',
  turns: [
    { role: 'user', text: 'Make the walls 2.4 mm', images: 1 },
    { role: 'agent', text: 'Looking.\n\nDone.', model: 'lunaroute/glm-5.3-flash',
      steps: [{ code: "return files.grep('wall');", result: 'script.js:2', ms: 3 }, { code: 'await run()', result: 'ok: true', ms: 40, changed: true }],
      blocks: [{ kind: 'thought', at: 0, text: 'Find the wall.' }, { kind: 'text', at: 0, text: 'Looking.' },
        { kind: 'thought', at: 1, text: 'Line 2.\nEdit it.' }, { kind: 'text', at: 2, text: 'Done.' }] },
    { role: 'user', text: 'Thanks' },
    { role: 'agent', text: 'You are welcome.', steps: [{ code: 'x', result: 'has ``` inside', error: true }] },
  ],
};

test('a thread in order: thinking, text, steps, answers', () => {
  const md = threadMarkdown(thread, { preset: { id: 'A-01', title: 'Open box' }, settings: { mode: 'auto', tier: 'default', effort: 'medium' }, date });
  assert.ok(md.startsWith('# Make the walls 2.4 mm\n\n- Preset: A-01 · Open box\n- Settings: mode auto, tier default, thinking medium\n- Model: lunaroute/glm-5.3-flash\n- Downloaded: 2026-11-01T12:00:00.000Z\n'));
  const order = ['## You', '*(1 image attached)*', '## Agent (lunaroute/glm-5.3-flash)', '> Find the wall.', 'Looking.', '**Step 1** (3 ms)',
    "return files.grep('wall');", '> Line 2.\n> Edit it.', '**Step 2** (changed files · 40 ms)', 'Done.', '## You\n\nThanks', 'You are welcome.'];
  let at = 0;
  for (const s of order) { const i = md.indexOf(s, at); assert.ok(i >= 0, `${s} after ${at}`); at = i + s.length; }
  assert.ok(md.includes('````\nhas ``` inside\n````'), 'a fence longer than any backtick run in the result');
  assert.ok(md.indexOf('**Step 1** (error)', md.indexOf('## You\n\nThanks')) > 0);
  assert.ok(md.indexOf('You are welcome.') > md.indexOf('**Step 1** (error)'), 'a turn without blocks: steps, then the answer');
});

test('file name', () => {
  assert.equal(transcriptFilename(thread, { id: 'A-01' }, date), 'jigcad-a-01-make-the-walls-2-4-mm-2026-11-01.md');
  assert.equal(transcriptFilename({ title: '' }, null, date), 'jigcad-thread-2026-11-01.md');
});
