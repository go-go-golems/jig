const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [name, w, h, scheme, y] of [['desk', 1280, 900, 'light', 0], ['phone', 390, 844, 'dark', 0], ['phone-ex', 390, 844, 'light', 1]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    await p.goto('file:///home/claude/jig-page.html');
    await p.waitForTimeout(400);
    if (y) await p.evaluate(() => document.getElementById('ex-06').scrollIntoView());
    await p.screenshot({ path: `/home/claude/shot-${name}.png` });
  }
  await b.close();
})();
