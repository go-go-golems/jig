// UI test for the jig workbench: serves dist/, loads it in Chromium at 1440 × 900, opens every layout and every
// view in both themes, compiles (clean, edited, failing: the stage keeps the last good part under the fail banner),
// follows lab: links, runs a search, drags a tab, exports, works the preset menu and the Presets shelf at about 50
// presets (fixtures.cjs fills the shelf), checks the agent's preset brief, the Code tab's open file, check() options
// and edge selections across a recompile, checks there are no console errors, and saves screenshots to test/ui/out/.
// Usage: node test/ui/shoot.cjs [--mock] [--quick]      (--mock forces the in-page mock engine with #mock)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const { serve } = require('./serve.cjs');
const { content } = require('./fixtures.cjs');

const OUT = path.join(__dirname, 'out');
const MOCK = process.argv.includes('--mock'), QUICK = process.argv.includes('--quick');
const LAYOUTS = ['Code beside the stage', 'Stage first', 'The program: code, graph, IR', 'Reading the notes', 'Experiments and traces', 'Reading the book', 'The shelf', 'Everything in one tile'];
const VIEWS = ['Notes', 'Code', 'Agent', 'Docs', 'Book', 'Reference', 'Stage', 'Params', 'Graph', 'IR', 'Trace', 'Experiments', 'Presets'];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const server = await serve(0);
  const url = `http://127.0.0.1:${server.address().port}/${MOCK ? '#mock' : ''}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  await context.addInitScript(c => { globalThis.__JIG_CONTENT__ = c; }, content);
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  let n = 0;
  const shot = async name => { const file = `${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(OUT, file) }); return file; };
  const settle = async (ms = 250) => {
    await page.waitForFunction(() => window.jigHost && window.jigHost.program && !window.jigHost.compiling, null, { timeout: 30000 });
    await page.waitForTimeout(ms);
  };
  const hash = () => page.evaluate(() => jigHost.program?.hash + ':' + jigHost.program?.ms);
  const afterCompile = async (fn) => { const h = await hash(); await fn(); await page.waitForFunction(h0 => !jigHost.compiling && (jigHost.program?.hash + ':' + jigHost.program?.ms) !== h0, h, { timeout: 30000 }); await page.waitForTimeout(200); };
  const layout = async title => { await page.click('.laymenu'); await page.click(`.menu.layouts button:has(.t:text-is("${title}"))`); await page.waitForTimeout(300); };
  const tab = async title => { await page.click(`.dtab .lbl:text-is("${title}")`); await page.waitForTimeout(250); };
  // how many pixels of a canvas differ from its corner pixel (the paper): a drawing, or a blank sheet
  const inked = sel => page.evaluate(q => {
    const c = document.querySelector(q); if (!c || !c.width) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, p = [d[0], d[1], d[2]];
    let n = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - p[0]) + Math.abs(d[i + 1] - p[1]) + Math.abs(d[i + 2] - p[2]) > 120) n++;
    return n;
  }, sel);
  const cycleTo = async theme => { for (let i = 0; i < 3; i++) { if (await page.evaluate(() => jigHost.theme) === theme) return; await page.click('.bar .ibtn[aria-label="Theme"]'); await page.waitForTimeout(120); } };

  try {
    await page.goto(url);
    await settle(800);
    const eng = await page.evaluate(() => ({ kind: jigHost.engine.kind, note: jigHost.engine.note, version: jigHost.engine.version }));
    check('engine answers', ['worker', 'mock'].includes(eng.kind), `${eng.kind}${eng.version ? ' ' + eng.version : ''}${eng.note ? ' · ' + eng.note : ''}`);
    const first = await page.evaluate(() => ({ ok: jigHost.program.ok, pill: document.querySelector('.bar .pill')?.innerText.replace(/\s+/g, ' '), preset: jigHost.preset?.id }));
    check('first preset compiles', first.ok !== false, `${first.preset}: ${first.pill}`);
    await cycleTo('light');
    await shot('default-light');

    // every layout
    for (const l of LAYOUTS) {
      await layout(l);
      const tiles = await page.locator('.tile').count();
      check(`layout ${l}`, tiles >= 1, `${tiles} tiles`);
      await shot(`layout-${slug(l)}`);
    }

    // every view, full size in one tile
    await layout('Everything in one tile');
    for (const v of VIEWS) {
      await tab(v);
      if (v === 'Book') await page.waitForSelector('canvas.figsheet, .jigfig .fail', { timeout: 20000 }).catch(() => {});
      const body = await page.locator('.tile .tilebody').first().innerText().catch(() => '');
      check(`view ${v}`, body.trim().length > 0 || v === 'Stage', `${body.trim().split('\n')[0].slice(0, 70)}`);
      await shot(`view-${slug(v)}`);
    }

    // dark theme
    await cycleTo('dark');
    check('dark theme', await page.evaluate(() => document.documentElement.dataset.theme === 'dark'));
    for (const v of ['Stage', 'Code', 'Book', 'Graph']) { await tab(v); if (v === 'Book') await page.waitForTimeout(400); await shot(`dark-${slug(v)}`); }
    await layout('Code beside the stage');
    await shot('default-dark');
    await cycleTo('light');

    // the header's preset menu at shelf size: groups, ids and titles, a filter, the keyboard
    await page.click('.projbtn');
    await page.waitForSelector('.menu.presets .plist');
    const pm = await page.evaluate(() => ({ rows: document.querySelectorAll('.menu.presets .plist button[role=option]').length, groups: document.querySelectorAll('.menu.presets .plist .grp').length, total: jigHost.presets().length, focus: document.activeElement?.classList.contains('filter'), open: document.querySelector('.menu.presets .plist button.on .code')?.textContent }));
    check('the preset menu lists the whole shelf by group', pm.rows === pm.total && pm.total >= 45 && pm.groups >= 5 && pm.focus && pm.open === 'A-01', JSON.stringify(pm));
    await shot('preset-menu');
    await page.keyboard.type('coaster');
    await page.waitForTimeout(120);
    const fm = await page.evaluate(() => [...document.querySelectorAll('.menu.presets .plist button[role=option] .code')].map(e => e.textContent));
    check('typing filters the preset menu', fm.length >= 1 && fm.length < 6 && fm.includes('S-03'), fm.join(' '));
    await shot('preset-menu-filtered');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('S-0');
    await page.keyboard.press('ArrowDown');
    const act = await page.evaluate(() => document.querySelector('.menu.presets .plist button.act .code')?.textContent);
    await afterCompile(() => page.keyboard.press('Enter'));
    const loaded = await page.evaluate(() => ({ id: jigHost.preset.id, menu: !!document.querySelector('.menu.presets') }));
    check('↓ and Enter load the active preset and close the menu', loaded.id === act && !loaded.menu, `${act} → ${loaded.id}`);
    await page.click('.projbtn');
    await page.keyboard.press('End');
    // the menu scrolls the active row into view in an effect, after the render: give it a frame or two
    await page.waitForFunction(() => { const b = document.querySelector('.menu.presets .plist button.act'); const l = b?.closest('.plist'); return !!l && b.getBoundingClientRect().bottom <= l.getBoundingClientRect().bottom + 1; }, null, { timeout: 2000 }).catch(() => {});
    const last = await page.evaluate(() => { const b = document.querySelector('.menu.presets .plist button.act'); const l = b?.closest('.plist'); return { code: b?.querySelector('.code')?.textContent, shown: !!l && b.getBoundingClientRect().bottom <= l.getBoundingClientRect().bottom + 1 }; });
    check('End moves to the last preset and keeps it in view', last.shown && !!last.code, JSON.stringify(last));
    await page.keyboard.press('Escape');
    await afterCompile(() => page.evaluate(() => jigHost.loadPreset('A-01')));

    // the Presets shelf: thumbnails compile as they come into view, the open preset is marked, a click opens one
    await layout('The shelf');
    await page.waitForFunction(() => document.querySelectorAll('.shelf-entry .shelf-thumb canvas').length > 0 && [...document.querySelectorAll('.shelf-entry')].slice(0, 3).every(e => !e.querySelector('.shelf-note')), null, { timeout: 60000 }).catch(() => {});
    const sh = await page.evaluate(() => ({ entries: document.querySelectorAll('.shelf-entry').length, groups: document.querySelectorAll('.shelf-head').length, sel: document.querySelector('.shelf-entry.sel .pcode')?.textContent, facts: document.querySelector('.shelf-entry .shelf-facts')?.textContent }));
    const thumbInk = await inked('.shelf-entry .shelf-thumb canvas');
    check('the Presets view shows the shelf with drawn thumbnails', sh.entries >= 45 && sh.groups >= 5 && sh.sel === 'A-01' && thumbInk > 50, `${sh.entries} entries · ${sh.groups} groups · open ${sh.sel} · ${thumbInk} ink samples · ${sh.facts}`);
    await shot('presets-shelf');
    await afterCompile(() => page.click('.shelf-entry:has(.pcode:text-is("S-03"))'));
    check('a click on the shelf opens the preset', await page.evaluate(() => jigHost.preset.id === 'S-03' && document.querySelector('.shelf-entry.sel .pcode')?.textContent === 'S-03'));
    await cycleTo('dark');
    await page.waitForTimeout(400);
    const darkPaper = await page.evaluate(() => { const c = document.querySelector('.shelf-entry .shelf-thumb canvas'); const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return d[0] + d[1] + d[2]; });
    check('thumbnails follow the theme', darkPaper < 150, `paper rgb sum ${darkPaper}`);
    await shot('presets-shelf-dark');
    await cycleTo('light');

    // your presets: Copy to Yours copies the open one with its edits, Rename in place, edits save into the preset,
    // a snapshot restores into the preset it came from, Delete asks once more
    await page.evaluate(() => jigHost.setFile('script.js', jigHost.files.get('script.js') + '\n// mine\n'));
    await afterCompile(() => page.click('.shelfview .toolbar button:text-is("Copy to Yours")'));
    const cp = await page.evaluate(() => ({ id: jigHost.preset.id, title: jigHost.preset.title, group: jigHost.preset.group, mine: jigHost.isMine(jigHost.preset.id), edit: jigHost.files.get('script.js').endsWith('// mine\n'), row: !!document.querySelector('.shelf-cell.mine .shelf-entry.sel') }));
    check('Copy to Yours makes U-01 with the edits and opens it', cp.id === 'U-01' && cp.group === 'Yours' && cp.mine && cp.edit && cp.row && /S-03|copy/.test(cp.title), JSON.stringify(cp));
    await page.click('.shelf-cell.mine:has(.pcode:text-is("U-01")) .shelf-acts button:text-is("Rename")');
    await page.fill('.shelf-rename', 'Wider cable clip');
    await page.press('.shelf-rename', 'Enter');
    await page.waitForTimeout(150);
    await page.evaluate(() => jigHost.setFile('notes.md', '# Mine\n'));
    const rn = await page.evaluate(() => ({ title: jigHost.preset.title, shelf: document.querySelector('.shelf-cell.mine:has(.shelf-entry.sel) .shelf-title b')?.textContent, saved: jigHost.presetFiles('U-01')['notes.md'] }));
    check('Rename retitles your preset; edits save into it', rn.title === 'Wider cable clip' && rn.shelf === 'Wider cable clip' && rn.saved === '# Mine\n', JSON.stringify(rn));
    await shot('presets-yours');
    const back = await page.evaluate(async () => { const s = jigHost.snapshot(); await jigHost.createPreset({ title: 'Agent try', files: { 'script.js': "return j.part('p').extrude(j.region.rect(20, 20), mm(5), { id: 'b' })\n" } }); const made = jigHost.preset.id; await jigHost.restore(s); return { made, now: jigHost.preset.id, list: jigHost.presets().filter(p => jigHost.isMine(p.id)).map(p => p.id) }; });
    check('a step’s snapshot restores into the preset it came from', back.made === 'U-02' && back.now === 'U-01' && back.list.includes('U-02'), JSON.stringify(back));
    const refused = await page.evaluate(() => { try { jigHost.renamePreset('A-01', 'x'); return null; } catch (e) { return e.message; } });
    check('shipped presets cannot be renamed', /ships with the workbench; copy it first/.test(refused || ''), refused);
    for (const id of ['U-02', 'U-01']) {
      await page.click(`.shelf-cell.mine:has(.pcode:text-is("${id}")) .shelf-acts button:text-is("Delete")`);
      await page.click(`.shelf-cell.mine:has(.pcode:text-is("${id}")) .shelf-acts button:text-is("Delete ${id}")`);
      await page.waitForTimeout(150);
    }
    await settle(300);
    const gone = await page.evaluate(() => ({ mine: jigHost.presets().filter(p => /^U-/.test(p.id)).length, open: jigHost.preset.id }));
    check('Delete removes your presets and opens another', gone.mine === 0 && !/^U-/.test(gone.open), JSON.stringify(gone));
    // back to a clean A-01 (S-03 keeps its test edit otherwise); the last compile may be a cache hit, so settle
    await page.evaluate(async () => { await jigHost.loadPreset('S-03'); jigHost.revertAll(); await jigHost.loadPreset('A-01'); });
    await settle(300);

    // the agent: the preset's brief, its rules as toggles, its suggestions
    const withAgent = await page.evaluate(() => jigHost.presets().find(p => p.agent && Object.keys(p.agent.fragments || {}).length && !/copy/.test(p.title))?.id);
    if (withAgent) {
      await afterCompile(() => page.evaluate(id => jigHost.loadPreset(id), withAgent));
      await layout('Code beside the stage');
      await tab('Agent');
      await page.evaluate(() => { const b = [...document.querySelectorAll('.agent-panel .threads .new')][0]; b && !b.disabled && b.click(); });
      await page.waitForTimeout(200);
      const ag = await page.evaluate(() => ({ togs: document.querySelectorAll('.agent-frags .tog').length, on: document.querySelectorAll('.agent-frags .tog.on').length, brief: /works as/.test(document.querySelector('.agent-empty')?.textContent || ''), sugg: [...document.querySelectorAll('.agent-empty .sugg button')].map(b => b.textContent), tries: jigHost.preset.agent.tries, frs: Object.keys(jigHost.preset.agent.fragments).length }));
      check('the agent shows the preset brief, rules and suggestions', ag.togs === ag.frs && ag.on >= 1 && ag.brief && ag.sugg[0] === ag.tries[0], `${withAgent}: ${ag.togs} rules (${ag.on} on) · ${ag.sugg.length} suggestions`);
      await page.click('.agent-frags .tog >> nth=0');
      const fr = await page.evaluate(() => [...jigHost.fragments]);
      check('a rule toggle turns a fragment off for this preset', fr.length === ag.on - 1, fr.join(', '));
      await shot('agent-brief');
      await page.click('.agent-frags .tog >> nth=0');
      await afterCompile(() => page.evaluate(() => jigHost.loadPreset('A-01')));
    } else check('the agent shows the preset brief, rules and suggestions', false, 'no preset has agent fragments');

    // compile after an edit, from the editor with Ctrl+Enter
    await layout('Code beside the stage');
    await tab('Code');
    const v0 = await page.evaluate(() => jigHost.program.summary.volume);
    await page.evaluate(() => jigHost.setFile('script.js', jigHost.files.get('script.js').replace('w: mm(60)', 'w: mm(72)')));
    await page.waitForTimeout(100);
    check('edit marks Run primary', await page.locator('.bar .btn.primary').count() === 1);
    await afterCompile(async () => { await page.click('.code textarea'); await page.keyboard.press('Control+Enter'); });
    const v1 = await page.evaluate(() => jigHost.program.summary.volume);
    check('Ctrl+Enter compiles the edit', v1 !== v0 && (await page.evaluate(() => !jigHost.dirty)), `volume ${v0} → ${v1} mm³`);
    await shot('code-compiled-edit');

    // a failing compile keeps the last good part and names the place
    await page.evaluate(() => jigHost.setFile('script.js', jigHost.files.get('script.js').replace("return j.part('box')", "return j.part('box'))")));
    await afterCompile(() => page.click('.bar .btn.primary'));
    const bad = await page.evaluate(() => ({ ok: jigHost.program.ok, good: !!jigHost.lastGood, pill: document.querySelector('.bar .pill')?.className, diag: document.querySelectorAll('.diags .diag.bad').length, foot: document.querySelector('.ed-foot .bad')?.textContent, line: document.querySelector('.egutter .err')?.textContent }));
    check('failing compile shows the error', bad.ok === false && bad.good && /bad/.test(bad.pill) && bad.diag >= 1, bad.foot || '');
    check('the error line is marked in the gutter', !!bad.line, `line ${bad.line}`);
    const banner = await page.evaluate(() => document.querySelector('.sheet .failbanner')?.innerText || '');
    const ink = await inked('.sheethost canvas');
    check('the stage keeps the last good part under the fail banner', /script\.js:\d+/.test(banner) && ink > 200, `${ink} ink samples · ${banner.slice(0, 90)}`);
    await shot('code-error');
    await page.click('.diags .diag');
    await shot('code-error-jump');
    // a feature that fails: the banner names it and its line; the sheet still shows the last good part
    await page.evaluate(() => { jigHost.revertAll(); });
    await afterCompile(() => page.evaluate(() => { jigHost.setFile('script.js', jigHost.files.get('script.js').trimEnd() + "\n  .fillet(j.feat('shell').edges(), mm(40), { id: 'huge' })\n"); jigHost.compile(); }));
    await layout('Stage first');
    const fb = await page.evaluate(() => document.querySelector('.sheet .failbanner')?.innerText || '');
    const ink2 = await inked('.sheethost canvas');
    if (!MOCK) check('a failing feature is named on the banner over the last good part', /^huge \(fillet\) failed: .*script\.js:\d+/.test(fb) && ink2 > 200, `${ink2} ink samples · ${fb.slice(0, 110)}`);
    await shot('stage-fail-banner');
    await layout('Code beside the stage');
    await page.evaluate(() => { jigHost.revertAll(); });
    await afterCompile(() => page.evaluate(() => jigHost.compile()));
    check('revert all recompiles clean', await page.evaluate(() => jigHost.program.ok !== false && !jigHost.isEdited()));

    // the Code tab's file is the agent's open file
    await tab('Code');
    await page.click('.filetabs button:has-text("notes.md"), .ftab:has-text("notes.md"), [role=tab]:has-text("notes.md")').catch(() => {});
    await page.waitForTimeout(150);
    const of1 = await page.evaluate(() => jigHost.openFile);
    await page.click('.filetabs button:has-text("script.js"), .ftab:has-text("script.js"), [role=tab]:has-text("script.js")').catch(() => {});
    await page.waitForTimeout(150);
    const of2 = await page.evaluate(() => jigHost.openFile);
    check('the Code tab sets host.openFile', of1 === 'notes.md' && of2 === 'script.js', `${of1} → ${of2}`);

    // check(files, options): options reach the compile; keep: false leaves the open program in the worker
    const ck = await page.evaluate(async () => {
      const v = await jigHost.check(null, { override: { w: '90 mm' } });
      const w = v.params?.find(p => p.name === 'w')?.value;
      const back = await jigHost.call('param', 'w');
      const b = back?.value ?? back;
      return { w, back: b?.value ?? b, ok: v.ok !== false };
    });
    check('check() passes its options and keeps the open program', ck.ok && Math.abs(ck.w - 90) < 1e-6 && Math.abs(ck.back - 60) < 1e-6, JSON.stringify(ck));

    // an edge selected by name follows its name across a recompile
    const edgeName = await page.evaluate(() => {
      const b = jigHost.program.bodies[0], i = b.edges.findIndex(e => / ∩ /.test(e.name || '') && e.faces?.[0] !== e.faces?.[1]);
      if (i < 0) return null;
      jigHost.select({ body: 0, edge: i, face: null, name: b.edges[i].name });
      return b.edges[i].name;
    });
    await afterCompile(() => page.evaluate(() => jigHost.setOverride('h', 34)));
    const es = await page.evaluate(() => jigHost.selection);
    if (!MOCK) check('an edge selection follows its name across a recompile', !!edgeName && es?.name === edgeName && es.edge != null && !es.lost, `${edgeName} → edge ${es?.edge}${es?.lost ? ' (lost)' : ''}`);
    await shot('stage-edge-selected');
    await page.evaluate(() => { jigHost.select(null); jigHost.resetOverrides(); });
    await settle(300);

    // lab: links from the notes
    await tab('Notes');
    await page.click('a.lablink:has-text("select the inside of the front wall")');
    await page.waitForTimeout(400);
    const sel = await page.evaluate(() => jigHost.selection?.name);
    check('lab:select selects a face', sel === 'shell/inner[body/side[base.outline.bottom]]', sel);
    await page.waitForSelector('.side .chain, .side .fail, .side .note', { timeout: 10000 }).catch(() => {});
    await shot('stage-selection-why');
    await afterCompile(() => page.click('a.lablink:has-text("make it 80 mm wide")'));
    const ov = await page.evaluate(() => ({ o: jigHost.overrides.w, w: jigHost.program.params.find(p => p.name === 'w')?.value }));
    check('lab:param overrides and recompiles', ov.o === 80 && ov.w === 80, JSON.stringify(ov));
    await shot('params-after-lab-link');
    await page.click('a.lablink:has-text("Look at it from the front")');
    await page.waitForTimeout(300);
    check('lab:view sets the stage view', await page.evaluate(() => jigHost.view.name === 'front'));
    await shot('stage-front');

    // params slider → debounced recompile
    await tab('Params');
    await afterCompile(() => page.evaluate(() => { const r = document.querySelector('.prow input[type=range]'); r.value = String(+r.max * 0.8); r.dispatchEvent(new Event('input', { bubbles: true })); }));
    check('a slider recompiles', await page.evaluate(() => Object.keys(jigHost.overrides).length >= 1));
    await page.click('button:has-text("Reset all")');
    await settle(300);
    check('Reset all clears overrides', await page.evaluate(() => Object.keys(jigHost.overrides).length === 0));

    // graph: click a node
    await tab('Graph');
    await page.click('.graph .node:has(text.nl:text-is("shell"))').catch(() => {});
    await page.waitForTimeout(250);
    check('graph selects a node', await page.evaluate(() => jigHost.node === 'shell'), await page.evaluate(() => jigHost.node));
    await shot('graph-selected');

    // export with the clipboard fallback
    await page.click('.bar button:has-text("Export")');
    await shot('export-menu');
    await page.click('.menu.bexport button:has(.t:has-text("STL"))');
    const toastEl = page.locator('.toast', { hasText: /\.stl|Export failed/ });
    await toastEl.first().waitFor({ timeout: 10000 });
    const toast = await toastEl.first().innerText();
    check('export reports with a toast', /Saved .*\.stl|copied to the clipboard/.test(toast), toast);
    await page.waitForTimeout(2800);

    // experiments: E-01's search.js, run and load a row
    await afterCompile(() => page.evaluate(() => jigHost.loadPreset('E-01')));
    await layout('Experiments and traces');
    await tab('Experiments');
    await page.click('.exprow button:has-text("Run")');
    await page.waitForSelector('.expres table tbody tr, .experiments .fail', { timeout: 60000 });
    const rows = await page.locator('.expres table tbody tr').count();
    check('search returns ranked rows', rows > 0, `${rows} rows`);
    if (rows) {
      await afterCompile(() => page.click('.expres table tbody tr >> nth=0'));
      check('a row loads its point', await page.evaluate(() => Object.keys(jigHost.overrides).length > 0), await page.evaluate(() => JSON.stringify(jigHost.overrides)));
    }
    await shot('experiments-run');
    await page.evaluate(() => jigHost.resetOverrides());
    await settle();

    // book: live figure and a sketch opened as a scratch preset
    await afterCompile(() => page.evaluate(() => jigHost.loadPreset('A-01')));
    await layout('Reading the book');
    await tab('Book');
    await page.waitForSelector('canvas.figsheet, .jigfig .fail', { timeout: 30000 });
    check('book figure compiles and draws', await page.locator('canvas.figsheet').count() >= 1);
    await shot('book-chapter');
    await page.click('.bcontents button:has(.bt:text-is("Searching designs"))');
    await page.waitForTimeout(300);
    await shot('book-part-opener');
    await page.click('.bcontents button:has(.bt:text-is("Solids from profiles"))');
    await page.waitForTimeout(400);
    await afterCompile(() => page.click('a.lablink[data-sketch]'));
    check('a sketch opens as a scratch preset', await page.evaluate(() => jigHost.preset.group === 'Scratch' && /^Z-\d+$/.test(jigHost.preset.id)), await page.evaluate(() => `${jigHost.preset.id} ${jigHost.preset.title}`));
    await shot('scratch-from-book');

    // the sketch inspector on A-03: constraints by where they come from; a row previews and selects (the sheet draws
    // it in the selection hue), a glyph clicked on the sheet selects its row, a row's line opens the Code view there
    if (!MOCK) {   // the mock engine solves no sketches
      await afterCompile(() => page.evaluate(() => jigHost.loadPreset('A-03')));
      await layout('Code beside the stage');
      await tab('Stage');
      await page.evaluate(() => jigHost.link('lab:sketch/outline'));
      await page.waitForSelector('.sketchside .cgroup .crow', { timeout: 10000 });
      await page.waitForTimeout(300);
      // reddish pixels on the sheet (layer 0) or the pointer layer (1): the selection hue, st-rec, in either theme
      const red = layer => page.evaluate(i => {
        const c = document.querySelectorAll('.sheethost canvas')[i]; if (!c) return -1;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
        for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 100 && d[k] > 150 && d[k] - d[k + 1] > 85 && d[k + 2] < 110) n++;
        return n;
      }, layer);
      const groups = await page.evaluate(() => [...document.querySelectorAll('.sketchside .cghead')].map(b => `${b.querySelector('b').textContent} ${b.querySelector('.n').textContent} ${b.getAttribute('aria-expanded')}`));
      const rowsYours = await page.evaluate(() => document.querySelectorAll('.sketchside .cgroup:first-of-type .crow').length);
      check('the sketch inspector groups constraints: Yours, Implied (folded)', groups[0] === 'Yours 12 true' && groups.some(g => /^Implied \d+ false$/.test(g)) && rowsYours === 12, groups.join(' · '));
      const red0 = await red(0);
      await page.hover('.sketchside .crow[data-id="dim(l1)"]');
      await page.waitForTimeout(150);
      const hv = await page.evaluate(() => jigHost.hover), redHover = await red(1);
      check('hovering a row previews its constraint on the sheet', hv?.constraint === 'dim(l1)' && redHover > 40, `hover ${hv?.constraint} · ${redHover} px on the pointer layer`);
      await page.click('.sketchside .crow[data-id="dim(l1)"]');
      await page.waitForTimeout(300);
      const s1 = await page.evaluate(() => ({ sel: jigHost.selection, row: document.querySelector('.sketchside .crow.sel')?.dataset.id, hint: document.querySelector('.stagewrap .hint')?.innerText }));
      const red1 = await red(0);
      check('a row selects its constraint, drawn on the sheet in the selection hue', s1.sel?.sketch === 'outline' && s1.sel?.constraint === 'dim(l1)' && s1.row === 'dim(l1)' && red1 > red0 + 80 && /length 80 mm = w/.test(s1.hint), `${red0} → ${red1} px · ${s1.hint?.replace(/\s+/g, ' ').slice(0, 60)}`);
      await shot('sketch-dimension-selected');
      // a glyph on the sheet: horizontal(l3)'s box, clicked where the stage drew it
      const g = await page.evaluate(() => {
        const el = document.querySelector('.sheethost'), st = el.jigStage._state(), r = el.getBoundingClientRect();
        const gl = st.sketchLayout.glyphs.find(x => x.ids.includes('horizontal(l3)'));
        return gl && { x: r.left + gl.x, y: r.top + gl.y };
      });
      if (g) await page.mouse.click(g.x, g.y);
      await page.waitForTimeout(400);
      const s2 = await page.evaluate(() => { const row = document.querySelector('.sketchside .crow.sel'), side = row?.closest('.side'), rb = row?.getBoundingClientRect(), sb = side?.getBoundingClientRect(); return { sel: jigHost.selection?.constraint, row: row?.dataset.id, inView: !!rb && rb.top >= sb.top - 1 && rb.bottom <= sb.bottom + 1 }; });
      check('clicking a glyph on the sheet selects its row and scrolls it into view', !!g && s2.sel === 'horizontal(l3)' && s2.row === 'horizontal(l3)' && s2.inView, JSON.stringify(s2));
      await shot('sketch-glyph-selected');
      await cycleTo('dark');
      await page.waitForTimeout(300);
      await shot('sketch-glyph-selected-dark');
      await cycleTo('light');
      // an entity: the line l2 picked on the sheet away from its marks
      const e = await page.evaluate(() => {
        const el = document.querySelector('.sheethost'), st = el.jigStage._state(), r = el.getBoundingClientRect(), p = st.sketchLayout.paths.find(x => x.id === 'l2').pts;
        return { x: r.left + p[0][0] + (p[1][0] - p[0][0]) * 0.2, y: r.top + p[0][1] + (p[1][1] - p[0][1]) * 0.2 };
      });
      await page.mouse.click(e.x, e.y);
      await page.waitForTimeout(300);
      const s3 = await page.evaluate(() => ({ sel: jigHost.selection, head: document.querySelector('.sketchside .entblock h2')?.textContent, rows: document.querySelectorAll('.sketchside .entblock .crow').length }));
      check('clicking a line selects the entity: kind, geometry and its constraints', s3.sel?.entity === 'l2' && s3.head === 'l2' && s3.rows >= 3, `${JSON.stringify(s3.sel)} · ${s3.rows} constraints on it`);
      // the selection survives a recompile by id
      await afterCompile(() => page.evaluate(() => jigHost.setOverride('w', 100)));
      check('a sketch selection survives a recompile', await page.evaluate(() => jigHost.selection?.entity === 'l2'));
      await page.evaluate(() => jigHost.resetOverrides());
      await settle(300);
      // the code link of a row opens script.js at that line
      await page.click('.sketchside .crow[data-id="dim(l1.start, h1.center)"] .cln');
      await page.waitForTimeout(500);
      const cl = await page.evaluate(() => {
        const t = document.querySelector('.code textarea'), v = t.value, line = v.slice(0, t.selectionStart).split('\n').length;
        return { link: document.querySelector('.sketchside .crow[data-id="dim(l1.start, h1.center)"] .cln')?.textContent, line, text: v.slice(t.selectionStart, t.selectionEnd).trim(), file: jigHost.openFile };
      });
      check('a row\'s code link opens script.js at its line', cl.link === `script.js:${cl.line}` && cl.text === ".dim({ h: ['l1.start', 'h1.center'] }, 'edge')" && cl.file === 'script.js', `${cl.link} → line ${cl.line}: ${cl.text}`);
      await shot('sketch-code-link');
      await page.evaluate(() => jigHost.setView({ name: 'axo', sketch: null }));
      check('leaving the sketch lets its selection go', await page.evaluate(() => jigHost.selection === null));
    }

    // docs and reference
    await afterCompile(() => page.evaluate(() => jigHost.loadPreset('A-01')));
    await layout('Reading the notes');
    await tab('Docs');
    await shot('docs');
    await tab('Reference');
    const refs = await page.evaluate(() => [...document.querySelectorAll('.refview > .doc')].map(d => d.querySelector('h1')?.textContent));
    check('the Reference shows the language and the lab API', refs.length === 2 && refs[1] === 'The lab API', refs.join(' · '));
    await page.evaluate(() => { const el = document.querySelector('.refview .refpart'); el?.closest('.scroll')?.scrollTo(0, el.offsetTop - 40); });
    await page.waitForTimeout(150);
    await shot('reference');

    // the dock: drag a tab onto a tile's edge to split it
    await layout('Code beside the stage');
    const before = await page.locator('.tile').count();
    const src = await page.locator('.dtab .lbl:text-is("Trace")').boundingBox();
    const stageTile = await page.locator('.tile:has(.dtab .lbl:text-is("Stage"))').boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 40, src.y + 10, { steps: 4 });
    await page.mouse.move(stageTile.x + stageTile.width - 30, stageTile.y + stageTile.height / 2, { steps: 8 });
    await page.waitForTimeout(150);
    await shot('dock-drag-hint');
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.locator('.tile').count();
    check('dragging a tab to an edge splits the tile', after === before + 1, `${before} → ${after} tiles`);
    await shot('dock-after-split');
    await page.click('.dtab:has(.lbl:text-is("Trace")) .x');
    await page.waitForTimeout(200);
    check('closing the last tab leaves a picker', await page.locator('.picker').count() >= 1);
    await shot('dock-picker');
    await layout('Code beside the stage');

    // kept in this browser: edited files per preset, the layout, the theme
    await layout('Stage first');
    await page.evaluate(() => jigHost.setFile('notes.md', jigHost.files.get('notes.md') + '\nKept across a reload.\n'));
    await page.reload();
    await settle(500);
    const kept = await page.evaluate(() => ({ edited: jigHost.isEdited('notes.md'), preset: jigHost.preset.id, tiles: document.querySelectorAll('.tile').length, first: document.querySelector('.tile .dtab.on .lbl')?.textContent }));
    check('edits and layout survive a reload', kept.edited && kept.preset === 'A-01' && kept.first === 'Stage', JSON.stringify(kept));
    await page.evaluate(() => { jigHost.revertAll(); });
    await layout('Code beside the stage');

    // narrow window: one tile, Stage first
    if (!QUICK) {
      await page.setViewportSize({ width: 600, height: 900 });
      await page.waitForTimeout(400);
      check('narrow window is one tile', await page.locator('.tile').count() === 1);
      await shot('narrow');
      await page.evaluate(() => jigHost.focus('presets'));         // brings the view into the one tile
      await page.waitForTimeout(500);
      const nw = await page.evaluate(() => { const t = document.querySelector('.shelf-entry .shelf-thumb'); return t ? Math.round(t.getBoundingClientRect().width) : 0; });
      check('the shelf narrows its sheets in a narrow tile', nw === 120, `thumbnail ${nw} px`);
      await shot('narrow-presets');
      await tab('Stage');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(300);
    }
  } catch (e) {
    check('test ran to the end', false, e.message.split('\n')[0]);
    await shot('failure').catch(() => {});
  }

  const real = errors.filter(e => !/Failed to load resource.*favicon/.test(e));
  check('no console errors', real.length === 0, real.slice(0, 5).join(' | '));
  if (warnings.length) console.log(`(${warnings.length} console warnings: ${[...new Set(warnings)].slice(0, 3).join(' | ')})`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), mock: MOCK, results, errors: real, warnings }, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed · screenshots in test/ui/out/`);
  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
})();
