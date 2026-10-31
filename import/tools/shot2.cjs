const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await p.goto('file:///home/claude/jig/jig-spec.html#ex-70');
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/home/claude/shot-final-desk.png' });
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  await q.goto('file:///home/claude/jig/jig-spec.html#1-modules');
  await q.waitForTimeout(500);
  await q.screenshot({ path: '/home/claude/shot-final-phone.png' });
  const w = await q.evaluate(() => document.documentElement.scrollWidth);
  console.log('phone scrollWidth', w);
  await b.close();
})();
