const { chromium } = require('playwright');
const { serve } = require('/home/claude/jigcad/test/ui/serve.cjs');
(async () => {
  const server = await serve(0);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.jigHost && window.jigHost.program, null, { timeout: 60000 });
  for (const [ch, at] of [[13, 'newton'], [19, null]]) {
    await page.evaluate(([c, a]) => jigHost.link(`lab:book/${c}${a ? '?at=' + a : ''}`), [ch, at]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/tmp/ft/book-${ch}.png` });
  }
  console.log('errors', errs.slice(0, 5));
  await b.close(); server.close();
})();
