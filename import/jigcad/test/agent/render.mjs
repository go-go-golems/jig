// Render the agent panel in Chromium, in both themes, drive real turns with a scripted sample, check the DOM and
// save screenshots to test/agent/out/. Usage: node test/agent/render.mjs
import { build } from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const OUT = join(HERE, 'out');
const V = p => join(ROOT, 'vendor', p);
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [join(HERE, 'page/main.jsx')], outfile: join(OUT, 'page.js'), bundle: true, format: 'iife', target: 'es2022',
  alias: { 'preact': V('preact/src/index.js'), 'preact/hooks': V('preact/hooks/src/index.js'), 'preact/jsx-runtime': V('preact/jsx-runtime/src/index.js') },
  jsx: 'automatic', jsxImportSource: 'preact', loader: { '.md': 'text', '.css': 'text' }, logLevel: 'warning',
});
await build({
  entryPoints: [join(HERE, 'page/real.jsx')], outfile: join(OUT, 'real.js'), bundle: true, format: 'iife', target: 'es2022',
  alias: { 'preact': V('preact/src/index.js'), 'preact/hooks': V('preact/hooks/src/index.js'), 'preact/jsx-runtime': V('preact/jsx-runtime/src/index.js') },
  jsx: 'automatic', jsxImportSource: 'preact', loader: { '.md': 'text', '.css': 'text' }, logLevel: 'error',
});
writeFileSync(join(OUT, 'real.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>agent on the real host</title></head><body><div id="tile"></div><script src="real.js"></script></body></html>');
writeFileSync(join(OUT, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>agent panel</title></head><body><div id="tile"></div><script src="page.js"></script></body></html>');

const url = (s, theme) => `file://${join(OUT, 'index.html')}?s=${s}#${theme}`;
const browser = await chromium.launch();
const results = [];
const check = (name, fn) => results.push([name, fn]);

async function open(page, s, theme) {
  await page.goto(url(s, theme));
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(50);
}
const idle = page => page.waitForFunction(() => !document.querySelector('.agent-panel .btn.danger'), null, { timeout: 15000 });
const shot = (page, name) => page.locator('#tile').screenshot({ path: join(OUT, name + '.png') });

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 518, height: 848 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // 1. a new thread: the empty state with the preset's tries
  await open(page, 'empty', theme);
  const sugg = await page.locator('.sugg button').allTextContents();
  assert.deepEqual(sugg, ['Make the walls 2.4 mm and check the mass', 'Why is the rim face called body/end?',
    'Explain how this part is built, feature by feature, with the faces each one creates',
    'Make the walls 0.4 mm thicker and check the mass and every face that depends on them']);
  assert.equal(await page.locator('.composer .btn.primary').isDisabled(), true);
  assert.equal(await page.locator('.threads .th.on button').first().textContent(), 'New thread');
  assert.equal(await page.locator('.seg button[aria-pressed="true"]').allTextContents().then(a => a.join(',')), 'Auto,Balanced,Auto');
  await shot(page, `agent-empty-${theme}`);

  // 2. a whole turn: four steps, then the answer with lab: links
  await open(page, 'thread', theme);
  await page.locator('.sugg button').first().click();
  await page.waitForSelector('.msg.agent .doc-inline');
  await idle(page);
  const steps = page.locator('details.tool');
  assert.equal(await steps.count(), 4);
  assert.equal(await page.locator('details.tool.err').count(), 0);
  assert.equal(await page.locator('.threads .th.on button').first().textContent(), 'Make the walls 2.4 mm and check ');
  assert.equal(await page.locator('.doc-inline a.lablink').count(), 4);
  assert.match(await page.locator('details.tool .ms').first().textContent(), /^\d+ ms$/);
  const calls = await page.evaluate(() => window.__calls.map(c => ({ n: c.messages.length, first: c.messages[0].content.slice(0, 9), tier: c.opts.modelTier, effort: c.opts.effort, cache: c.opts.cache, tools: c.opts.tools.map(t => t.name) })));
  assert.deepEqual(calls, [{ n: 1, first: '[context]', tier: 'default', effort: undefined, cache: false, tools: ['eval'] }]);
  await shot(page, `agent-thread-${theme}`);
  // open the step that edited the file: code, YAML result, revert link
  await steps.nth(2).locator('summary').click();
  await steps.nth(3).locator('summary').click();
  assert.equal(await steps.nth(2).locator('button.link', { hasText: 'revert files to before this step' }).count(), 1);
  assert.equal(await steps.nth(3).locator('button.link', { hasText: 'revert files to before this step' }).count(), 0);
  assert.match(await steps.nth(3).locator('pre.res').textContent(), /^reads:\n  - body → shell body\nmass: 22\.7814\nrim: 456\.96\nfloor: 1943\.04\nwall: 2\.4\nsize: \[60, 40, 30\]$/);
  await page.locator('.agent-log').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await shot(page, `agent-steps-open-${theme}`);
  // a lab: link in the answer goes through the host
  await page.locator('.doc-inline a.lablink', { hasText: 'script.js:2' }).click();
  const focus = await page.evaluate(() => window.__host.log.filter(x => x[0] === 'focus').at(-1));
  assert.deepEqual([focus[0], focus[1], focus[2].file, focus[2].line], ['focus', 'code', 'script.js', 2]);
  // threads persist: + New makes a second tab; the first keeps its title
  await page.locator('.threads .new').click();
  assert.equal(await page.locator('.threads .th').count(), 2);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('jigcad.v1.agent.threads')));
  assert.equal(stored.length, 2);
  assert.equal(stored[0].turns[1].steps.length, 4);
  assert.equal(stored[0].turns[1].steps[0].snapshot, undefined);

  // 3. Ask mode with Deep and High: the first step waits for the person
  await open(page, 'ask', theme);
  await page.locator('.composer textarea').fill('Make the walls 2.4 mm and check the mass');
  await page.locator('.composer textarea').press('Enter');
  await page.waitForSelector('details.tool.ask[open]');
  assert.equal(await page.locator('details.tool.ask .ms').textContent(), 'waiting for you');
  assert.equal(await page.locator('.composer .btn.danger').textContent(), 'Stop');
  assert.equal(await page.locator('.thinking').textContent(), 'Working');
  assert.equal(await page.locator('.composer .meta').textContent(), 'Enter sends · Shift+Enter for a new line · you approve each step');
  assert.equal(await page.locator('.seg button[aria-pressed="true"]').allTextContents().then(a => a.join(',')), 'Ask,Deep,High');
  await shot(page, `agent-ask-${theme}`);
  await page.locator('details.tool.ask button', { hasText: 'Run this step' }).click();
  await page.waitForFunction(() => document.querySelectorAll('details.tool').length === 2 && document.querySelector('details.tool.ask'));
  await page.locator('details.tool.ask button', { hasText: 'Decline' }).click();
  await page.waitForFunction(() => document.querySelectorAll('details.tool').length === 3 && document.querySelector('details.tool.ask'));
  await page.locator('.composer .btn.danger').click();
  await idle(page);
  assert.equal(await page.locator('.msg.agent .note').textContent(), 'Stopped.');
  assert.equal(await page.locator('.msg.agent.error .who').count(), 1);
  assert.match(await page.locator('details.tool').nth(1).locator('pre.res').textContent(), /^The person declined this step\.$/);
  const askCalls = await page.evaluate(() => window.__calls.map(c => [c.opts.modelTier, c.opts.effort]));
  assert.deepEqual(askCalls, [['complex', 'high']]);

  // 4. Claude unavailable: the off banner, Send and the suggestions disabled
  await open(page, 'off', theme);
  assert.equal(await page.locator('.agent-off').textContent(), 'The agent is off here.Claude is not available in this view, so the agent cannot run. Everything else in the workbench works.');
  assert.equal(await page.locator('.sugg button').first().isDisabled(), true);
  await page.locator('.composer textarea').fill('hello');
  assert.equal(await page.locator('.composer .btn.primary').isDisabled(), true);
  await shot(page, `agent-off-${theme}`);

  // 5. trouble: a failed step, a reverted step, a rate-limited turn
  await open(page, 'trouble', theme);
  await page.locator('.composer textarea').fill('Make the walls 1.6 mm');
  await page.locator('.composer textarea').press('Enter');
  await page.waitForSelector('.msg.agent .doc-inline');
  await idle(page);
  assert.equal(await page.locator('details.tool.err').count(), 1);
  await page.locator('details.tool').nth(0).locator('summary').click();
  assert.equal(await page.locator('details.tool.err pre.res.bad').textContent(), 'Error: edit: text not found in script.js (it must match exactly, including spaces) (line 1)');
  await page.locator('details.tool').nth(1).locator('summary').click();
  await page.locator('details.tool').nth(1).locator('button.link', { hasText: 'revert files to before this step' }).click();
  await page.waitForSelector('details.tool.reverted');
  assert.equal(await page.locator('details.tool.reverted .dim').textContent(), 'reverted');
  assert.match(await page.evaluate(() => window.__host.files.get('script.js')), /wall: mm\(2\) \}/);
  assert.deepEqual(await page.evaluate(() => window.__host.toasts), ['Reverted the files to before that step and recompiled']);
  await page.locator('.composer textarea').fill('Try again');
  await page.locator('.composer textarea').press('Enter');
  await page.waitForSelector('.msg.agent.error');
  await idle(page);
  assert.equal(await page.locator('.msg.agent.error .note').textContent(), 'Too many requests just now; try again in a little while.');
  await page.locator('.agent-log').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await shot(page, `agent-trouble-${theme}`);

  assert.deepEqual(errors, [], `console errors in ${theme}`);
  await page.close();
  console.log(`ok ${theme}: empty, thread, steps open, ask, off, trouble`);
}

// the shell's real Host with its mock engine: every scope family runs without an internal error
{
  const page = await browser.newPage({ viewport: { width: 518, height: 848 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`file://${join(OUT, 'real.html')}#light`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await page.locator('.composer textarea').fill('Check the box on the real host');
  await page.locator('.composer textarea').press('Enter');
  await page.waitForSelector('.msg.agent .doc-inline', { timeout: 20000 });
  await idle(page);
  const res = await page.locator('details.tool pre.res').allTextContents();
  const n = await page.locator('details.tool').count();
  for (let i = 0; i < n; i++) await page.locator('details.tool').nth(i).locator('summary').click();
  const results = await page.locator('details.tool pre.res').allTextContents();
  assert.equal(results.length, 7);
  for (const r of results) assert.doesNotMatch(r, /TypeError|ReferenceError|is not a function|undefined is not/, r);
  assert.match(results[1], /^ok: true\nerrors: \[\]\nfaces: \d+$|^ok: false\nerrors:\n  - level: error\n/);
  const realOk = /^ok: true/.test(results[1]);
  const ctx = await page.evaluate(() => window.__messages[0].content.split('[/context]')[0]);
  assert.match(ctx, /^\[context\]\npreset: A-01 Open box \(Basics\)/);
  assert.match(ctx, realOk ? /\ncompile: ok \(/ : /\ncompile: FAILS — /);
  await page.locator('.doc-inline a.lablink', { hasText: 'front' }).click();
  await page.locator('.doc-inline a.lablink', { hasText: 'script.js:2' }).click();
  const ev = await page.evaluate(() => window.__events);
  assert.ok(ev.some(e => e[0] === 'focus' && e[1] === 'code'), JSON.stringify(ev));
  if (realOk) assert.ok(ev.some(e => e[0] === 'selection' && e[1]), JSON.stringify(ev));
  await page.locator('.agent-log').evaluate(el => { el.scrollTop = 0; });
  await shot(page, 'agent-real-host-light');
  writeFileSync(join(OUT, 'real-host-results.txt'), results.map((r, i) => `── step ${i + 1}\n${r}`).join('\n') + '\n\n── context\n' + ctx + '\n');
  assert.deepEqual(errors, []);
  await page.close();
  console.log(`ok real host: ${results.length} steps, context and links (the shell's mock engine compiles ${realOk ? 'ok' : 'with errors'})`);
}

// the guide's previews, for side-by-side comparison
const prev = await browser.newPage({ viewport: { width: 518, height: 848 } });
for (const [comp, theme] of [['AgentPanel', 'light'], ['Step', 'light'], ['Approval', 'dark']]) {
  await prev.goto(`file://${join(ROOT, 'guides/agent/components', comp, 'standalone.html')}#${theme}`);
  await prev.waitForTimeout(150);
  await prev.screenshot({ path: join(OUT, `guide-${comp}-${theme}.png`) });
}
await browser.close();
console.log(`screenshots in ${OUT}`);
