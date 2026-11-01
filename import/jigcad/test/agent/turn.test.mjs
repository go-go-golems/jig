// A whole turn against a scripted sample(): two eval rounds, then a streamed answer.
// node --test test/agent/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runTurn, revertStep, newThread, explainError, trimThreads, NOTES, OFF_CODES, OFF_AT_SEND } from '../../src/agent/turn.js';
import { context, stepLine } from '../../src/agent/prompt.js';
import { createMockHost } from './mock-host.js';

const reference = readFileSync(new URL('../../src/agent/reference.md', import.meta.url), 'utf8');

export const STEP1 = "return files.grep('wall', 'script.js');";
export const STEP2 = "const before = program.metrics('mass').mass.value;\nfiles.edit('script.js', 'wall: mm(2)', 'wall: mm(2.4)');\nconst r = await run();\nreturn { ok: r.ok, errors: r.errors, before, after: program.metrics('mass').mass.value };";
export const ANSWER = 'I changed the wall from 2 to 2.4 mm at [script.js:2](lab:open?file=script.js&line=2) and recompiled.';

// The scripted model: records what it receives, calls eval twice, streams the answer.
export function scriptedSample(log) {
  return async (messages, opts) => {
    log.push({ messages: structuredClone(messages), opts: { ...opts, tools: opts.tools.map(t => t.name) } });
    const [tool] = opts.tools;
    const r1 = await tool.execute({ code: STEP1 }, { signal: opts.signal });
    const r2 = await tool.execute({ code: STEP2 }, { signal: opts.signal });
    log.push({ results: [r1, r2] });
    let text = '';
    for (const w of ANSWER.split(/(?<= )/)) { text += w; opts.onText({ text, delta: w }); }
    return { text, truncated: false };
  };
}

test('a two-step turn: instructions once, context every time, earlier steps as one line', async () => {
  const host = createMockHost();
  await host.compile();
  const thread = newThread();
  const log = [];
  const sample = scriptedSample(log);
  let updates = 0;
  const settings = { mode: 'auto', tier: 'complex', effort: 'high' };
  const r = await runTurn({ host, sample, thread, text: 'Make the walls 2.4 mm and check the mass', settings, reference, onUpdate: () => updates++ });
  assert.deepEqual(r, { ok: true, off: null });
  assert.equal(thread.title, 'Make the walls 2.4 mm and check ');
  const turn = thread.turns[1];
  assert.equal(turn.pending, false);
  assert.equal(turn.text, ANSWER);
  assert.equal(turn.steps.length, 2);
  assert.equal(turn.steps[0].result, "- \"script.js:2  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })\"\n- \"script.js:4  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })\"");
  assert.equal(turn.steps[0].changed, false);
  assert.equal(turn.steps[1].changed, true);
  assert.match(turn.steps[1].result, /^ok: true\nerrors: \[\]\nbefore: 19\.28448\nafter: 22\.7814$/);
  assert.ok(updates > 6);

  // what the model received on the first call
  const first = log[0];
  assert.deepEqual(first.opts.tools, ['eval']);
  assert.equal(first.opts.modelTier, 'complex');
  assert.equal(first.opts.effort, 'high');
  assert.equal(first.opts.cache, false);
  assert.equal(first.messages.length, 1);
  const m0 = first.messages[0];
  assert.equal(m0.role, 'user');
  assert.ok(m0.content.startsWith('[context]\npreset: A-01 Open box (Basics) — a shelled box'));
  assert.ok(m0.content.includes('[/context]\n\nYou are the coding agent inside jigcad'));
  assert.ok(m0.content.includes("## The agent's eval scope"));
  assert.ok(m0.content.endsWith('\n---\nMake the walls 2.4 mm and check the mass'));

  // a second turn: instructions stay on the first user turn, context moves to the latest, steps come back as lines
  const log2 = [];
  await runTurn({ host, sample: scriptedSample(log2), thread, text: 'Now check the rim', settings: { mode: 'auto', tier: 'default', effort: '' }, reference });
  const msgs = log2[0].messages;
  assert.equal(log2[0].opts.effort, undefined);
  assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant', 'user']);
  assert.ok(!msgs[0].content.startsWith('[context]'));
  assert.ok(msgs[0].content.startsWith('You are the coding agent inside jigcad'));
  assert.equal(msgs[1].content.split('\n')[0], `[eval] return files.grep('wall', 'script.js'); → - "script.js:2 .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })" - "script.js:4 .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })"`);
  assert.match(msgs[1].content.split('\n')[1], /^\[eval\] const before = program\.metrics\('mass'\)\.mass\.value; → ok: true errors: \[\] before: 19\.28448 after: 22\.7814$/);
  assert.ok(msgs[1].content.endsWith(ANSWER));
  assert.ok(msgs[2].content.startsWith('[context]'));
  assert.ok(msgs[2].content.includes('files: notes.md, script.js* (* edited)'));
  assert.ok(msgs[2].content.endsWith('Now check the rim'));
  for (const m of msgs) assert.equal((m.content.match(/You are the coding agent/g) || []).length, m === msgs[0] ? 1 : 0);
});

test('revert restores the files to before a step and marks later steps', async () => {
  const host = createMockHost();
  await host.compile();
  const thread = newThread();
  await runTurn({ host, sample: scriptedSample([]), thread, text: 'go', settings: { mode: 'auto', tier: 'default', effort: '' }, reference });
  const turn = thread.turns[1];
  assert.match(host.files.get('script.js'), /wall: mm\(2\.4\)/);
  assert.equal(await revertStep(host, turn, 1), true);
  assert.match(host.files.get('script.js'), /wall: mm\(2\) \}/);
  assert.deepEqual(turn.steps.map(s => !!s.reverted), [false, true]);
  assert.deepEqual(host.toasts, ['Reverted the files to before that step and recompiled']);
  assert.match(stepLine(turn.steps[1]), /^\[eval, later reverted\] /);
  const stored = trimThreads([thread])[0].turns[1].steps[1];
  assert.equal(stored.snapshot, undefined);
  assert.equal(stored.reverted, true);
});

test('Ask mode: the turn waits for the person; Decline tells the model', async () => {
  const host = createMockHost();
  await host.compile();
  const thread = newThread();
  let turnRef = null;
  const p = runTurn({ host, sample: scriptedSample([]), thread, text: 'go', settings: { mode: 'ask', tier: 'default', effort: '' }, reference, onUpdate: () => { turnRef = thread.turns[1]; } });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(turnRef.steps[0].asking, true);
  turnRef.steps[0].resolve(true);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(turnRef.steps[1].asking, true);
  turnRef.steps[1].resolve(false);
  await p;
  assert.equal(turnRef.steps[1].result, 'The person declined this step.');
  assert.match(host.files.get('script.js'), /wall: mm\(2\) \}/);
});

test('rejections become one plain sentence; refused clears the text; off codes raise the banner', async () => {
  const host = createMockHost();
  for (const [code, note] of Object.entries(NOTES)) if (code !== 'truncated') assert.equal(explainError({ code }).note, note);
  for (const [code, sentence] of Object.entries(OFF_CODES)) assert.deepEqual(explainError({ code }), { note: sentence, off: sentence });
  assert.equal(explainError(new Error('socket closed')).note, 'Interrupted: socket closed');

  const thread = newThread();
  const refuse = async (m, o) => { o.onText({ text: 'partial', delta: 'partial' }); throw { code: 'refused', message: 'no' }; };
  await runTurn({ host, sample: refuse, thread, text: 'x', settings: { mode: 'auto', tier: 'default' }, reference });
  assert.equal(thread.turns[1].text, '');
  assert.equal(thread.turns[1].note, 'Claude declined this request.');

  const t2 = newThread();
  const r = await runTurn({ host, sample: async () => { throw { code: 'not_granted' }; }, thread: t2, text: 'x', settings: { mode: 'auto', tier: 'default' }, reference });
  assert.equal(r.off, OFF_CODES.not_granted);

  const t3 = newThread();
  assert.deepEqual(await runTurn({ host, sample: null, thread: t3, text: 'x', settings: {}, reference }), { ok: false, off: OFF_AT_SEND });
  assert.equal(t3.turns.length, 0);

  const t4 = newThread();
  await runTurn({ host, sample: async () => ({ text: 'long', truncated: true }), thread: t4, text: 'x', settings: { mode: 'auto', tier: 'default' }, reference });
  assert.equal(t4.turns[1].note, 'The answer hit the length limit.');
});

test('Stop aborts a running step and the call', async () => {
  const host = createMockHost();
  const thread = newThread();
  const ctl = new AbortController();
  const sample = async (m, o) => {
    const p = o.tools[0].execute({ code: 'await new Promise(() => {});' }, { signal: o.signal });
    setTimeout(() => ctl.abort(), 20);
    const res = await p;
    if (o.signal.aborted) throw { code: 'cancelled' };
    return { text: res };
  };
  await runTurn({ host, sample, thread, text: 'x', settings: { mode: 'auto', tier: 'default' }, reference, signal: ctl.signal });
  assert.equal(thread.turns[1].note, 'Stopped.');
  assert.equal(thread.turns[1].steps[0].result, 'Error: stopped by the person (line 1)'.replace(' (line 1)', ''));
});

test('the context block shows live state, each line only when it applies', async () => {
  const host = createMockHost();
  assert.equal(context(host), '[context]\npreset: A-01 Open box (Basics) — a shelled box: one sketch, an extrude and a shell\nfiles: notes.md, script.js (* edited)\ncompile: none yet\nview: axo · overlays: shadows, grid, dims\n[/context]');
  await host.compile();
  host.overrides = { wall: 0.8 };
  await host.compile();
  host.select({ body: 0, face: 5, name: 'body/end' });
  host.openFile = 'script.js';
  const c = context(host);
  assert.equal(c, [
    '[context]',
    'preset: A-01 Open box (Basics) — a shelled box: one sketch, an extrude and a shell',
    'open file: script.js',
    'files: notes.md, script.js (* edited)',
    'compile: ok (part box · 3 features · 1 body · 1 sketch · 11 faces)',
    'diagnostics:\n  warning print.thinWall at shell script.js:2 — walls of 0.8 mm are under two line widths (0.9 mm)',
    'dof: 0 — base fully',
    'metrics: volume 6517.248 mm³ · mass 8.081 g · bbox 60 × 40 × 30 mm',
    'overrides (Params view): wall = 0.8',
    'selection: body/end on box/body1',
    'view: axo · overlays: shadows, grid, dims',
    '[/context]',
  ].join('\n'));
  host.files.set('script.js', 'return (;');
  await host.compile();
  assert.match(context(host), /\ncompile: FAILS — .* \(the view shows the last good compile\)\n/);
});

test('JIG-006: images go to the sample call; the thread keeps their count only', async () => {
  const { runTurn, newThread, trimThreads } = await import('../../src/agent/turn.js');
  const { createMockHost } = await import('./mock-host.js');
  const host = createMockHost(), thread = newThread();
  let seen = null;
  const sample = async (turns, opts) => { seen = opts.images; return { text: 'a box' }; };
  const images = [{ mimeType: 'image/jpeg', data: '/9j/' }];
  await runTurn({ host, sample, thread, text: 'what is this?', images, settings: { mode: 'auto' } });
  assert.deepEqual(seen, images);
  assert.equal(thread.turns[0].images, 1);
  assert.equal(JSON.stringify(trimThreads([thread])).includes('/9j/'), false, 'no image bytes are stored');
  await runTurn({ host, sample, thread, text: 'and now?', settings: { mode: 'auto' } });
  assert.equal(seen, undefined, 'a message without images sends none');
});

test('reasoning, text and steps keep their order (blocks), and are stored', async () => {
  const host = createMockHost();
  await host.compile();
  const thread = newThread();
  // the server's streams are cumulative over the call, rounds joined by a blank line
  const sample = async (messages, opts) => {
    const [tool] = opts.tools;
    opts.onThinking({ text: 'Find the wall', delta: 'Find the wall' });
    opts.onThinking({ text: 'Find the wall first.', delta: ' first.' });
    opts.onText({ text: 'Looking.', delta: 'Looking.' });
    await tool.execute({ code: STEP1 }, { signal: opts.signal });
    opts.onThinking({ text: 'Find the wall first.\n\nIt is on line 2.', delta: '\n\nIt is on line 2.' });
    await tool.execute({ code: STEP2 }, { signal: opts.signal });
    opts.onText({ text: 'Looking.\n\nDone.', delta: '\n\nDone.' });
    return { text: 'Looking.\n\nDone.', truncated: false };
  };
  await runTurn({ host, sample, thread, text: 'walls 2.4', settings: { mode: 'auto' }, reference });
  const turn = thread.turns[1];
  assert.equal(turn.text, 'Looking.\n\nDone.', 'the whole text stays for the history');
  assert.deepEqual(turn.blocks.map(b => [b.kind, b.at, b.text]), [
    ['thought', 0, 'Find the wall first.'],
    ['text', 0, 'Looking.'],
    ['thought', 1, 'It is on line 2.'],
    ['text', 2, 'Done.'],
  ]);
  const stored = trimThreads([thread])[0].turns[1];
  assert.deepEqual(stored.blocks, [
    { kind: 'thought', at: 0, text: 'Find the wall first.' }, { kind: 'text', at: 0, text: 'Looking.' },
    { kind: 'thought', at: 1, text: 'It is on line 2.' }, { kind: 'text', at: 2, text: 'Done.' },
  ]);
});

test('closed threads go to the archive: newest first, empty ones dropped, at most ARCHIVE_MAX', async () => {
  const { archiveThread, ARCHIVE_MAX } = await import('../../src/agent/turn.js');
  const t = (id, n = 1) => ({ id, title: id, turns: Array.from({ length: n }, () => ({ role: 'user', text: 'x' })) });
  let a = archiveThread([], t('a'), 1);
  a = archiveThread(a, t('empty', 0), 2);
  a = archiveThread(a, t('b'), 3);
  assert.deepEqual(a.map(x => [x.id, x.closed]), [['b', 3], ['a', 1]]);
  a = archiveThread(a, t('a'), 4);
  assert.deepEqual(a.map(x => x.id), ['a', 'b'], 'closing again moves it to the front, once');
  for (let i = 0; i < ARCHIVE_MAX + 5; i++) a = archiveThread(a, t('n' + i), 10 + i);
  assert.equal(a.length, ARCHIVE_MAX);
  assert.equal(a[0].id, 'n' + (ARCHIVE_MAX + 4));
  const stored = trimThreads([{ ...t('s'), created: 1, updated: 2, closed: 3, preset: 'A-01' }])[0];
  assert.deepEqual([stored.created, stored.updated, stored.closed, stored.preset], [1, 2, 3, 'A-01']);
});

test('a turn stamps the thread: updated, preset, model', async () => {
  const host = createMockHost();
  await host.compile();
  const thread = newThread();
  assert.ok(thread.created > 0);
  await runTurn({ host, sample: async () => ({ text: 'ok', truncated: false, modelApplied: 'lunaroute/x' }), thread, text: 'hi', settings: { mode: 'auto' }, reference });
  assert.ok(thread.updated >= thread.created);
  assert.equal(thread.preset, host.preset && host.preset.id);
  assert.equal(thread.turns[1].model, 'lunaroute/x');
});
